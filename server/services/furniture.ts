import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { database } from '../db';
import {
  orders,
  workspaces,
  stockReservations,
  stockBalances,
  stockLocations,
  stockMovements,
  products,
  suppliers,
  purchaseOrders,
  purchaseItems,
  deliveryJobs,
  assemblyJobs,
  auditLogs,
  orderCostSheets,
} from '../db/schema';
import { AppError, authorize, hasPermission, type Staff } from '../permissions';
import { digest } from '../auth';
import { isPaid, hasAssembly, type OrderCase } from '../../lib/operations';
import { blankDetails } from '../../lib/business-modules';
import { parseSavedCommerce } from '../../lib/commerce';
import { stockUnit } from '../../lib/stock-units';
import { projectCommerce, workspaceId } from './commerce';
import { canSeeCosts } from './catalogue';
import { saveRecord } from './operational';
import { businessOptions } from './business-options';
import { businessDate } from '../../lib/business-date';
type Tx = Parameters<
  Parameters<ReturnType<typeof database>['transaction']>[0]
>[0];
function furniture(order?: OrderCase): asserts order is OrderCase {
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
  if (order.flooringLeadId)
    throw new AppError(
      422,
      'FLOORING_WORKFLOW',
      'Use the linked fitting workflow for this order.',
    );
}
const token = (order: OrderCase) => digest(JSON.stringify(order));
async function state(tx: Tx, order: OrderCase) {
  const reservations = await tx
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.orderId, order.id));
  const purchases = await tx
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.orderId, order.id));
  const live = purchases.filter((p) => p.status !== 'Cancelled');
  const items = live.length
    ? await tx
        .select()
        .from(purchaseItems)
        .where(
          and(
            inArray(
              purchaseItems.purchaseOrderId,
              live.map((p) => p.id),
            ),
            eq(purchaseItems.active, true),
          ),
        )
    : [];
  // A purchase quantity covers demand once across all routes for this order.
  const incoming = new Map<string, number>();
  for (const item of items)
    incoming.set(
      item.productId,
      (incoming.get(item.productId) ?? 0) +
        Math.max(0, item.quantity - item.receivedQuantity),
    );
  const groups = order.groups.map((group) => {
    const demand = new Map<
      string,
      { productId: string; name: string; sku: string; quantity: number }
    >();
    for (const line of order.lines.filter((l) => l.groupId === group.id)) {
      const key = line.productId ?? line.id;
      const prior = demand.get(key);
      demand.set(key, {
        productId: line.productId ?? '',
        name: line.name,
        sku: line.sku,
        quantity: (prior?.quantity ?? 0) + line.quantity,
      });
    }
    const materials = [...demand.values()].map((m) => {
      const matching = reservations.filter(
        (r) => r.groupId === group.id && r.productId === m.productId,
      );
      const allocated = matching
        .filter((r) => r.status === 'Active')
        .reduce((n, r) => n + r.quantity, 0);
      const delivered = matching
        .filter((r) => ['Delivered', 'Returned'].includes(r.status))
        .reduce((n, r) => n + r.quantity, 0);
      const needed = Math.max(0, m.quantity - allocated - delivered);
      const arriving = Math.min(needed, incoming.get(m.productId) ?? 0);
      incoming.set(
        m.productId,
        Math.max(0, (incoming.get(m.productId) ?? 0) - arriving),
      );
      return {
        ...m,
        allocated,
        delivered,
        incoming: arriving,
        shortage: Math.max(0, needed - arriving),
      };
    });
    return {
      id: group.id,
      supplier: group.supplier,
      route: group.route,
      assemblyRequired: hasAssembly(group),
      delivered: group.delivery,
      assemblyComplete: group.assembly === 'Complete',
      materials,
      ready:
        materials.length > 0 &&
        materials.every((m) => !!m.productId && m.allocated >= m.quantity),
    };
  });
  return { groups, purchases, reservations };
}
export async function furnitureProject(staff: Staff, id: string) {
  authorize(staff, 'commerce.read');
  return database().transaction(async (tx) => {
    const [record] = await tx.select().from(orders).where(eq(orders.id, id));
    furniture(record?.data);
    const order = record.data;
    const s = await state(tx, order);
    const delivery = await tx
      .select()
      .from(deliveryJobs)
      .where(eq(deliveryJobs.orderId, id));
    const assembly = await tx
      .select()
      .from(assemblyJobs)
      .where(eq(assemblyJobs.orderId, id));
    const job = (j: (typeof delivery)[number]) => ({
      id: j.id,
      number: j.number,
      status: j.status,
      groupId: String(j.details.groupId),
      date: String(j.details.scheduledDate ?? ''),
      slot: String(j.details.timeSlot ?? ''),
      evidence: String(j.details.proof ?? j.details.customerSignoff ?? ''),
    });
    const [costs] = canSeeCosts(staff)
      ? await tx
          .select()
          .from(orderCostSheets)
          .where(eq(orderCostSheets.orderId, id))
      : [];
    return {
      orderId: id,
      token: token(order),
      paid: isPaid(order),
      invoiceId: order.invoice,
      canPrepare:
        hasPermission(staff, 'inventory.write') &&
        hasPermission(staff, 'approvals.write'),
      canManage: hasPermission(staff, 'orders.write'),
      canSeeCosts: canSeeCosts(staff),
      costsReviewed: costs?.reviewed ?? false,
      groups: s.groups,
      purchases: s.purchases.map((p) => ({
        id: p.id,
        number: p.number,
        status: p.status,
        expectedDate: p.expectedDate,
      })),
      deliveries: delivery.map(job),
      assemblies: assembly.map(job),
      lines: order.lines.map((l) => ({
        id: l.id,
        name: l.name,
        quantity: l.quantity,
        groupId: l.groupId,
      })),
      issues: order.issues,
    };
  });
}
const actionInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), token: z.string() }).strict(),
  z
    .object({
      action: z.literal('split'),
      token: z.string(),
      groupId: z.string(),
      reason: z.string().trim().min(5).max(2000),
      lines: z
        .array(
          z
            .object({
              id: z.string(),
              quantity: z.number().int().min(0).max(10000),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal('delivery'),
      token: z.string(),
      groupId: z.string(),
    })
    .strict(),
]);
export async function actOnFurniture(staff: Staff, id: string, raw: unknown) {
  authorize(staff, 'orders.write');
  const input = actionInput.parse(raw);
  if (input.action === 'delivery') {
    const [record] = await database()
      .select()
      .from(orders)
      .where(eq(orders.id, id));
    furniture(record?.data);
    const order = record.data;
    if (input.token !== token(order))
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'This order changed. Refresh before continuing.',
      );
    const group = order.groups.find((g) => g.id === input.groupId);
    if (!group || group.delivery)
      throw new AppError(
        422,
        'GROUP_LOCKED',
        'Select an undelivered shipment group.',
      );
    // saveRecord performs its own locked group, customer and duplicate-job checks.
    await saveRecord(staff, 'deliveries', {
      title: order.customer + ' · ' + group.supplier,
      orderId: id,
      customerId: order.customerId,
      details: {
        ...blankDetails('deliveries'),
        groupId: group.id,
        address: order.address,
        postcode: order.postcode,
        phone: order.phone,
        courier: group.route,
        assemblyRequired: hasAssembly(group),
      },
    });
  } else {
    if (input.action === 'prepare') {
      authorize(staff, 'inventory.write');
      authorize(staff, 'approvals.write');
    }
    const rules = await businessOptions();
    await database().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(10204)`);
      await tx.execute(sql`select pg_advisory_xact_lock(10203)`);
      const [ledger] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .for('update');
      const data = structuredClone(ledger?.data);
      const order = data?.operations.cases.find((o) => o.id === id);
      furniture(order);
      if (input.token !== token(order))
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'This order changed. Refresh before continuing.',
        );
      if (input.action === 'split') {
        const group = order.groups.find((g) => g.id === input.groupId);
        const deliveries = await tx
          .select()
          .from(deliveryJobs)
          .where(eq(deliveryJobs.orderId, id));
        const assemblies = await tx
          .select()
          .from(assemblyJobs)
          .where(eq(assemblyJobs.orderId, id));
        if (
          !group ||
          group.delivery ||
          [...deliveries, ...assemblies].some(
            (j) => j.details.groupId === group.id && j.status !== 'Cancelled',
          )
        )
          throw new AppError(
            422,
            'GROUP_LOCKED',
            'Split shipments before creating delivery or assembly jobs.',
          );
        const source = order.lines.filter((l) => l.groupId === group.id);
        if (
          new Set(input.lines.map((l) => l.id)).size !== input.lines.length ||
          input.lines.some((l) => !source.some((s) => s.id === l.id))
        )
          throw new AppError(
            422,
            'LINES',
            'Choose lines from this shipment only.',
          );
        const selected = new Map(input.lines.map((l) => [l.id, l.quantity]));
        if (
          source.some(
            (l) =>
              !Number.isInteger(l.quantity) ||
              (selected.get(l.id) ?? 0) > l.quantity,
          )
        )
          throw new AppError(
            422,
            'QUANTITY',
            'Choose whole quantities within the original shipment.',
          );
        const moved = input.lines.reduce((n, l) => n + l.quantity, 0),
          total = source.reduce((n, l) => n + l.quantity, 0);
        if (!moved || moved >= total)
          throw new AppError(
            422,
            'QUANTITY',
            'Leave at least one item in each shipment.',
          );
        const newId = 'G-' + randomUUID();
        const additions: typeof order.lines = [];
        for (const line of source) {
          const quantity = selected.get(line.id) ?? 0;
          if (quantity)
            additions.push({
              ...line,
              id: 'L-' + randomUUID(),
              groupId: newId,
              quantity,
            });
          line.quantity -= quantity;
        }
        order.lines = [
          ...order.lines.filter((l) => l.quantity > 0),
          ...additions,
        ];
        order.groups.push({
          ...structuredClone(group),
          id: newId,
          receipt: false,
          released: false,
          delivery: false,
          assembly: hasAssembly(group) ? 'Awaiting booking' : 'Not required',
          jobs: [],
        });
        group.receipt = false;
        group.released = false;
        const reservations = await tx
          .select()
          .from(stockReservations)
          .where(
            and(
              eq(stockReservations.orderId, id),
              eq(stockReservations.groupId, group.id),
            ),
          )
          .for('update');
        if (
          reservations.some((r) => ['Delivered', 'Returned'].includes(r.status))
        )
          throw new AppError(
            422,
            'GROUP_LOCKED',
            'Dispatched stock cannot be split.',
          );
        const keep = new Map<string, number>();
        for (const line of order.lines.filter((l) => l.groupId === group.id))
          keep.set(
            line.productId ?? '',
            (keep.get(line.productId ?? '') ?? 0) + line.quantity,
          );
        for (const r of reservations.filter((r) => r.status === 'Active')) {
          const retained = Math.min(r.quantity, keep.get(r.productId) ?? 0);
          keep.set(
            r.productId,
            Math.max(0, (keep.get(r.productId) ?? 0) - retained),
          );
          if (retained === r.quantity) continue;
          if (!retained)
            await tx
              .update(stockReservations)
              .set({ groupId: newId, updatedAt: new Date() })
              .where(eq(stockReservations.id, r.id));
          else {
            await tx
              .update(stockReservations)
              .set({ quantity: retained, updatedAt: new Date() })
              .where(eq(stockReservations.id, r.id));
            await tx
              .insert(stockReservations)
              .values({
                ...r,
                id: randomUUID(),
                groupId: newId,
                quantity: r.quantity - retained,
                createdBy: staff.id,
                updatedAt: new Date(),
              });
          }
        }
        // The commercial invoice is unchanged: only fulfilment quantities are regrouped.
        order.pack = undefined;
        order.events.unshift({
          id: randomUUID(),
          title: 'Shipment split',
          source: staff.name,
          detail: input.reason,
          at: Date.now(),
        });
        if (!parseSavedCommerce(JSON.stringify(data)))
          throw new AppError(
            422,
            'INTEGRITY',
            'Shipment split would change the commercial ledger.',
          );
        await tx
          .update(workspaces)
          .set({ data, version: ledger.version + 1, updatedAt: new Date() })
          .where(eq(workspaces.id, workspaceId));
        await projectCommerce(tx, data);
        await tx
          .insert(auditLogs)
          .values({
            userId: staff.id,
            entity: 'order',
            entityId: id,
            action: 'shipment-split',
            after: {
              from: group.id,
              to: newId,
              lines: input.lines,
              reason: input.reason,
            },
          });
      } else {
        if (!isPaid(order))
          throw new AppError(
            422,
            'PAYMENT_REQUIRED',
            'Verify full payment before allocating or ordering stock.',
          );
        const s = await state(tx, order);
        if (s.groups.some((g) => g.materials.some((m) => !m.productId)))
          throw new AppError(
            422,
            'PRODUCT_REQUIRED',
            'Link every order line to a catalogue product before preparing stock.',
          );
        const locations = await tx
          .select()
          .from(stockLocations)
          .where(
            and(
              eq(stockLocations.active, true),
              eq(stockLocations.type, 'Physical'),
            ),
          );
        for (const group of s.groups.filter((g) => !g.delivered))
          for (const m of group.materials) {
            let needed = Math.max(0, m.quantity - m.allocated - m.delivered);
            const balances = locations.length
              ? await tx
                  .select()
                  .from(stockBalances)
                  .where(
                    and(
                      eq(stockBalances.productId, m.productId),
                      inArray(
                        stockBalances.locationId,
                        locations.map((l) => l.id),
                      ),
                    ),
                  )
                  .orderBy(stockBalances.id)
                  .for('update')
              : [];
            for (const before of balances) {
              const quantity = Math.min(
                needed,
                Math.max(0, before.physical - before.reserved - before.display),
              );
              if (!quantity) continue;
              const after = { ...before, reserved: before.reserved + quantity };
              const reservationId = randomUUID(),
                requestId = 'furniture-reserve:' + reservationId;
              await tx
                .update(stockBalances)
                .set({ reserved: after.reserved })
                .where(eq(stockBalances.id, before.id));
              await tx
                .insert(stockReservations)
                .values({
                  id: reservationId,
                  productId: m.productId,
                  locationId: before.locationId,
                  orderId: id,
                  groupId: group.id,
                  quantity,
                  createdBy: staff.id,
                });
              await tx
                .insert(stockMovements)
                .values({
                  id: randomUUID(),
                  type: 'Reservation',
                  productId: m.productId,
                  locationId: before.locationId,
                  orderId: id,
                  quantity,
                  reason: 'Furniture order allocation',
                  createdBy: staff.id,
                  before,
                  after,
                  requestId,
                  requestDigest: digest(requestId),
                });
              needed -= quantity;
            }
          }
        const refreshed = await state(tx, order);
        const demand = new Map<string, number>();
        for (const g of refreshed.groups.filter((g) => !g.delivered))
          for (const m of g.materials)
            if (m.shortage)
              demand.set(
                m.productId,
                (demand.get(m.productId) ?? 0) + m.shortage,
              );
        const bySupplier = new Map<
          string,
          { product: typeof products.$inferSelect; quantity: number }[]
        >();
        for (const [productId, quantity] of demand) {
          const [product] = await tx
            .select()
            .from(products)
            .where(eq(products.id, productId));
          const [supplier] = product
            ? await tx
                .select()
                .from(suppliers)
                .where(eq(suppliers.id, product.supplierId))
            : [];
          if (
            !product ||
            product.status !== 'Active' ||
            !supplier?.active ||
            !['Each', 'Pack'].includes(stockUnit(product.details))
          )
            throw new AppError(
              422,
              'PRODUCT_CHANGED',
              'Review the active furniture product, stock unit and supplier before purchasing.',
            );
          const items = bySupplier.get(product.supplierId) ?? [];
          items.push({ product, quantity });
          bySupplier.set(product.supplierId, items);
        }
        const created: string[] = [];
        for (const [supplierId, items] of bySupplier) {
          const poId = randomUUID();
          await tx
            .insert(purchaseOrders)
            .values({
              id: poId,
              number:
                'PO-' +
                new Date().getFullYear() +
                '-' +
                poId.slice(0, 8).toUpperCase(),
              supplierId,
              orderId: id,
              customerId: order.customerId,
              buyerId: staff.id,
              date: businessDate(Date.now(), rules.timeZone),
              notes:
                'Furniture order shortage. Review costs and quantities before sending.',
            });
          await tx
            .insert(purchaseItems)
            .values(
              items.map(({ product, quantity }) => ({
                id: randomUUID(),
                purchaseOrderId: poId,
                productId: product.id,
                supplierSku: product.supplierSku,
                description: product.name,
                quantity,
                unitCostPence: product.supplierCostPence,
                customerId: order.customerId,
              })),
            );
          await tx
            .insert(auditLogs)
            .values({
              userId: staff.id,
              entity: 'purchase-order',
              entityId: poId,
              action: 'furniture-draft-created',
              after: { orderId: id },
            });
          created.push(poId);
        }
        await tx
          .insert(auditLogs)
          .values({
            userId: staff.id,
            entity: 'order',
            entityId: id,
            action: 'stock-prepared',
            after: { purchaseOrderIds: created },
          });
      }
    });
  }
  return furnitureProject(staff, id);
}
