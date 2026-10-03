import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { database } from '../db';
import {
  flooringLeads,
  flooringFulfilments,
  workspaces,
  orders,
  products,
  suppliers,
  users,
  auditLogs,
  stockReservations,
  stockBalances,
  stockLocations,
  stockMovements,
  purchaseOrders,
  purchaseItems,
  serviceCases,
  attachments,
  deliveryJobs,
  assemblyJobs,
  notifications,
  orderCostSheets,
} from '../db/schema';
import { AppError, authorize, hasPermission, type Staff } from '../permissions';
import { canUseModule, blankDetails } from '../../lib/business-modules';
import {
  applyCommerce,
  parseSavedCommerce,
  invoiceTotals,
  type NewOrderLine,
} from '../../lib/commerce';
import { projectCommerce, workspaceId } from './commerce';
import { marginSettings, canSeeCosts } from './catalogue';
import { calculateMargin, emptyCosts } from '../../lib/margin';
import { stockUnit, quantityValid, quantityRound } from '../../lib/stock-units';
import {
  flooringCharges,
  flooringTotal,
  type FlooringQuote,
  type FlooringMaterial,
  type FlooringSnapshot,
} from '../../lib/flooring-workflow';
import type { SalesUnit } from '../../lib/sales-quantity';
import { quoteInput, roomInput } from './operational-validation';
import { flooringRoom } from '../../lib/flooring';
import { isPaid } from '../../lib/operations';
import { slotRange, slotsOverlap } from '../../lib/scheduling';
import { businessDate } from '../../lib/business-date';
import { businessOptions } from './business-options';
import { updateOrderProgress } from './order-progress';
import { digest } from '../auth';
type Tx = Parameters<
  Parameters<ReturnType<typeof database>['transaction']>[0]
>[0];
function access(staff: Staff) {
  if (!staff.active || !canUseModule(staff.role, 'flooring'))
    throw new AppError(403, 'FORBIDDEN', 'Flooring access is required.');
}
async function audit(
  tx: Tx,
  staff: Staff,
  leadId: string,
  action: string,
  after: unknown,
) {
  await tx
    .insert(auditLogs)
    .values({
      userId: staff.id,
      entity: 'flooring',
      entityId: leadId,
      action,
      after,
    });
}
export async function acceptFlooring(
  staff: Staff,
  leadId: string,
  raw: unknown,
) {
  access(staff);
  authorize(staff, 'orders.write');
  const input = z
    .object({
      version: z.number().int().positive(),
      evidence: z.string().trim().min(1).max(2000),
    })
    .strict()
    .parse(raw);
  const rules = await marginSettings();
  return database().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10204)`);
    const [lead] = await tx
      .select()
      .from(flooringLeads)
      .where(eq(flooringLeads.id, leadId))
      .for('update');
    if (!lead) throw new AppError(404, 'NOT_FOUND', 'Flooring lead not found.');
    const [existing] = await tx
      .select()
      .from(flooringFulfilments)
      .where(eq(flooringFulfilments.leadId, leadId));
    if (existing) return { orderId: existing.orderId };
    if (lead.version !== input.version)
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'Quote changed. Reload and review before accepting.',
      );
    if (!['Quote', 'Follow-up', 'Won'].includes(lead.status) || lead.orderId)
      throw new AppError(
        422,
        'QUOTE_STAGE',
        'Review a quoted lead without an existing order before acceptance.',
      );
    if (!lead.customerId || !lead.assignedUserId)
      throw new AppError(
        422,
        'OWNER_REQUIRED',
        'Select the customer and quote owner.',
      );
    const quote = quoteInput.parse(lead.details.quote) as FlooringQuote;
    const rooms = z.array(roomInput).min(1).parse(lead.details.rooms);
    rooms.forEach(flooringRoom);
    if (!quote.lines.length || flooringTotal(quote) <= 0)
      throw new AppError(
        422,
        'QUOTE_REQUIRED',
        'Add materials and a positive quote total.',
      );
    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update');
    if (!workspace)
      throw new AppError(503, 'WORKSPACE', 'The sales ledger is unavailable.');
    const customer = workspace.data.customers.find(
      (c) => c.id === lead.customerId,
    );
    if (!customer?.address || !customer.postcode)
      throw new AppError(
        422,
        'ADDRESS_REQUIRED',
        'Complete the customer site address and postcode first.',
      );
    const materialMap = new Map<string, FlooringMaterial>();
    const lines: NewOrderLine[] = [];
    for (const line of quote.lines) {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, line.productId));
      if (!product || product.status !== 'Active')
        throw new AppError(
          422,
          'PRODUCT_REQUIRED',
          'Every quote line needs an active catalogue product.',
        );
      const [supplier] = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, product.supplierId));
      if (!supplier?.active)
        throw new AppError(
          422,
          'SUPPLIER_REQUIRED',
          'Every material needs an active supplier.',
        );
      const unit = stockUnit(product.details);
      if (line.quantity > 10000 || !quantityValid(line.quantity, unit))
        throw new AppError(
          422,
          'UNIT_QUANTITY',
          product.name +
            ': use whole Each/Pack quantities or up to three decimals for measured stock.',
        );
      lines.push({
        productId: product.id,
        name: product.name,
        supplier: supplier.name,
        article: product.supplierSku,
        quantity: line.quantity,
        unit: unit as SalesUnit,
        unitPence: line.unitPricePence,
        options: unit + ' · ' + lead.number,
        route: 'AH flooring',
      });
      const before = materialMap.get(product.id);
      const quantity = quantityRound((before?.quantity ?? 0) + line.quantity);
      if (quantity > 10000)
        throw new AppError(
          422,
          'QUANTITY_LIMIT',
          'A material requirement cannot exceed 10,000 units.',
        );
      materialMap.set(product.id, {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierSku: product.supplierSku,
        unit,
        quantity,
        unitCostPence: product.supplierCostPence,
        groupId: '',
      });
    }
    const materials = [...materialMap.values()];
    const productCost = quote.lines.reduce(
      (n, l) =>
        n +
        Math.round(l.quantity * materialMap.get(l.productId)!.unitCostPence),
      0,
    );
    const estimatedExtra = Math.max(0, quote.costPence - productCost);
    const profit = calculateMargin(
      {
        revenuePence: flooringTotal(quote) + quote.discountPence,
        discountPence: quote.discountPence,
        supplierCostPence: productCost,
        vatBps: rules.vatBps,
        vatTreatment: 'Standard',
        costs: { ...emptyCosts, otherPence: estimatedExtra },
      },
      rules.marginThresholds,
    );
    if (profit.approvalRequired && staff.role !== 'Management')
      throw new AppError(
        422,
        'MARGIN_APPROVAL',
        'This quote needs manager review. Ask a manager to accept it with an approval reason.',
      );
    const result = applyCommerce(workspace.data, {
      type: 'create-order',
      input: {
        requestId: 'flooring:' + leadId,
        customerId: lead.customerId,
        channel: 'Flooring',
        sourceRef: lead.number,
        lines,
        deliveryPence: flooringCharges.reduce((n, k) => n + quote[k], 0),
        discountPence: quote.discountPence,
        note: 'Accepted flooring quote ' + lead.number + '. ' + input.evidence,
        now: Date.now(),
      },
    });
    if (result.error || !result.id)
      throw new AppError(
        422,
        'ORDER_FAILED',
        result.error ?? 'Could not create flooring order.',
      );
    const order = result.state.operations.cases.find(
      (o) => o.id === result.id,
    )!;
    order.flooringLeadId = leadId;
    for (const line of order.lines) {
      const m = materialMap.get(line.productId!)!;
      line.cost = m.unitCostPence / 100;
      line.costVerified = true;
      line.sku = m.sku;
      line.matched = true;
      m.groupId = line.groupId;
    }
    const invoice = result.state.invoices.find((i) => i.orderId === order.id)!;
    invoice.lines = order.lines.map((l) => ({
      id: l.id,
      description: l.name + ' · ' + l.unit,
      quantity: l.quantity,
      unit: l.unit,
      unitPence: Math.round(l.unitPrice * 100),
    }));
    const labels = {
      underlayPence: 'Underlay charge',
      accessoriesPence: 'Accessories charge',
      fittingPence: 'Fitting',
      removalPence: 'Removal and preparation',
      deliveryPence: 'Delivery',
    };
    for (const k of flooringCharges)
      if (quote[k])
        invoice.lines.push({
          id: k,
          description: labels[k],
          quantity: 1,
          unitPence: quote[k],
        });
    invoice.notes =
      'Accepted flooring quote ' +
      lead.number +
      '. Prices include customer charges; accounts must confirm VAT before issuing. Material products must appear as quote lines; extra charges do not create stock requirements.';
    if (
      invoiceTotals(invoice).total !== flooringTotal(quote) ||
      !parseSavedCommerce(JSON.stringify(result.state))
    )
      throw new AppError(
        422,
        'LEDGER_INTEGRITY',
        'The accepted quote does not reconcile with its invoice.',
      );
    const snapshot: FlooringSnapshot = {
      quote,
      rooms,
      materials,
      totalPence: flooringTotal(quote),
      acceptedBy: staff.name,
      acceptedAt: new Date().toISOString(),
      evidence: input.evidence,
      address: customer.address,
      postcode: customer.postcode,
      phone: customer.phone,
      customerName: customer.name,
      calculationVersion: 1,
      rules: { vatBps: rules.vatBps, marginThresholds: rules.marginThresholds },
      profit,
    };
    await projectCommerce(tx, result.state);
    await tx
      .update(workspaces)
      .set({
        data: result.state,
        version: workspace.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
    await tx
      .insert(flooringFulfilments)
      .values({ leadId, orderId: order.id, snapshot });
    await tx
      .insert(orderCostSheets)
      .values({
        orderId: order.id,
        costs: { ...emptyCosts, otherPence: estimatedExtra },
        notes:
          'Accepted quote additional cost estimate. Replace with actual categorized costs before marking reviewed.',
        reviewed: false,
        updatedBy: staff.id,
      });
    await tx
      .update(flooringLeads)
      .set({
        orderId: order.id,
        status: 'Won',
        version: lead.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(flooringLeads.id, leadId));
    await audit(tx, staff, leadId, 'quote-accepted', {
      orderId: order.id,
      totalPence: snapshot.totalPence,
      evidence: input.evidence,
      marginOverride: profit.approvalRequired,
    });
    return { orderId: order.id };
  });
}
async function materialState(
  tx: Tx | ReturnType<typeof database>,
  project: typeof flooringFulfilments.$inferSelect,
) {
  const reservations = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.orderId, project.orderId),
        inArray(stockReservations.status, ['Active', 'Delivered']),
      ),
    );
  const purchases = await tx
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.orderId, project.orderId));
  const items = purchases.length
    ? await tx
        .select()
        .from(purchaseItems)
        .where(
          and(
            inArray(
              purchaseItems.purchaseOrderId,
              purchases
                .filter((p) => p.status !== 'Cancelled')
                .map((p) => p.id),
            ),
            eq(purchaseItems.active, true),
          ),
        )
    : [];
  return project.snapshot.materials.map((m) => {
    const allocated = quantityRound(
      reservations
        .filter((r) => r.productId === m.productId && r.groupId === m.groupId)
        .reduce((n, r) => n + r.quantity, 0),
    );
    const incoming = quantityRound(
      items
        .filter((i) => i.productId === m.productId)
        .reduce((n, i) => n + Math.max(0, i.quantity - i.receivedQuantity), 0),
    );
    return {
      ...m,
      allocated,
      incoming,
      shortage: quantityRound(Math.max(0, m.quantity - allocated - incoming)),
      ready: allocated >= m.quantity,
    };
  });
}
export async function flooringProject(staff: Staff, leadId: string) {
  const db = database();
  const [p] = await db
    .select()
    .from(flooringFulfilments)
    .where(eq(flooringFulfilments.leadId, leadId));
  if (staff.role === 'Installer') {
    if (!staff.active || !p || p.fitterId !== staff.id)
      throw new AppError(
        403,
        'FORBIDDEN',
        'This fitting job is not assigned to you.',
      );
  } else access(staff);
  if (!p) return null;
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, p.orderId));
  const materials = await materialState(db, p);
  const purchases = await db
    .select({
      id: purchaseOrders.id,
      number: purchaseOrders.number,
      status: purchaseOrders.status,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.orderId, p.orderId));
  const fitters =
    staff.role === 'Installer'
      ? []
      : await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(
            and(
              eq(users.active, true),
              inArray(users.role, ['Installer', 'Management', 'Team Lead']),
            ),
          );
  const { snapshot, ...row } = p;
  return {
    ...row,
    customerName: snapshot.customerName,
    address: snapshot.address,
    postcode: snapshot.postcode,
    phone: snapshot.phone,
    rooms: snapshot.rooms,
    materials: materials.map(({ unitCostPence, ...m }) => m),
    ready: materials.every((m) => m.ready),
    paid: !!order && isPaid(order.data),
    invoiceId: staff.role === 'Installer' ? undefined : order?.data.invoice,
    purchases: hasPermission(staff, 'approvals.write') ? purchases : [],
    fitters,
    acceptedAt: snapshot.acceptedAt,
    acceptedBy: snapshot.acceptedBy,
    evidence: staff.role === 'Installer' ? '' : snapshot.evidence,
    ...(staff.role === 'Installer' ? {} : { totalPence: snapshot.totalPence }),
    ...(canSeeCosts(staff) ? { profit: snapshot.profit } : {}),
    canPrepare:
      hasPermission(staff, 'inventory.write') &&
      hasPermission(staff, 'approvals.write'),
    canSchedule: staff.role !== 'Installer',
    canWork:
      staff.role === 'Installer' ||
      ['Management', 'Team Lead'].includes(staff.role),
  };
}
export async function listFittings(staff: Staff) {
  if (staff.role !== 'Installer') access(staff);
  else if (!staff.active)
    throw new AppError(403, 'FORBIDDEN', 'Active staff required.');
  const rows = await database()
    .select({ leadId: flooringFulfilments.leadId })
    .from(flooringFulfilments)
    .where(
      staff.role === 'Installer'
        ? eq(flooringFulfilments.fitterId, staff.id)
        : undefined,
    )
    .orderBy(flooringFulfilments.scheduledDate);
  return Promise.all(rows.map((r) => flooringProject(staff, r.leadId)));
}

const actionInput = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('prepare'),
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal('book'),
      version: z.number().int().positive(),
      fitterId: z.string().min(1),
      scheduledDate: z.iso.date(),
      timeSlot: z.string().trim().min(1).max(50),
      customerConfirmed: z.boolean(),
      notes: z.string().trim().max(2000),
    })
    .strict(),
  z
    .object({
      action: z.enum(['start', 'complete', 'issue']),
      version: z.number().int().positive(),
      evidence: z.string().trim().max(2000),
    })
    .strict(),
]);
async function bookCheck(
  tx: Tx,
  leadId: string,
  fitterId: string,
  date: string,
  slot: string,
) {
  if (!slotRange(slot))
    throw new AppError(
      422,
      'TIME_SLOT',
      'Use a window such as 09:00–12:00, AM, PM or All day.',
    );
  const [fitter] = await tx
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, fitterId),
        eq(users.active, true),
        inArray(users.role, ['Installer', 'Management', 'Team Lead']),
      ),
    );
  if (!fitter)
    throw new AppError(
      422,
      'FITTER_REQUIRED',
      'Choose an active installer or fitting manager.',
    );
  const jobs = await tx
    .select()
    .from(flooringFulfilments)
    .where(eq(flooringFulfilments.fitterId, fitterId));
  if (
    jobs.some(
      (j) =>
        j.leadId !== leadId &&
        ['Booked', 'In Progress', 'Issue'].includes(j.status) &&
        j.scheduledDate === date &&
        slotsOverlap(j.timeSlot, slot),
    )
  )
    throw new AppError(
      409,
      'SCHEDULE_CONFLICT',
      'This fitter already has a flooring job in that window.',
    );
  for (const table of [deliveryJobs, assemblyJobs]) {
    const existing = await tx
      .select()
      .from(table)
      .where(eq(table.assignedUserId, fitterId));
    if (
      existing.some(
        (j) =>
          ['Booked', 'Confirmed', 'Out for Delivery', 'In Progress'].includes(
            j.status,
          ) &&
          j.details.scheduledDate === date &&
          slotsOverlap(String(j.details.timeSlot), slot),
      )
    )
      throw new AppError(
        409,
        'SCHEDULE_CONFLICT',
        'This fitter already has a delivery or assembly job in that window.',
      );
  }
}
export async function actOnFlooring(
  staff: Staff,
  leadId: string,
  raw: unknown,
) {
  const input = actionInput.parse(raw);
  const rules = await businessOptions();
  await database().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10204)`);
    const [p] = await tx
      .select()
      .from(flooringFulfilments)
      .where(eq(flooringFulfilments.leadId, leadId))
      .for('update');
    if (!p)
      throw new AppError(
        404,
        'NOT_FOUND',
        'Accept the quote before preparing materials or fitting.',
      );
    if (staff.role === 'Installer') {
      if (
        !staff.active ||
        p.fitterId !== staff.id ||
        !['start', 'complete', 'issue'].includes(input.action)
      )
        throw new AppError(
          403,
          'FORBIDDEN',
          'You may update only your assigned fitting progress.',
        );
    } else access(staff);
    if (p.version !== input.version)
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'This job changed. Reload before continuing.',
      );
    if (p.status === 'Completed')
      throw new AppError(
        422,
        'LOCKED',
        'Completed fitting records are locked. Create a service case for further work.',
      );
    const patch: Partial<typeof flooringFulfilments.$inferInsert> = {
      version: p.version + 1,
      updatedAt: new Date(),
    };
    let leadStatus: string | undefined;
    if (input.action === 'prepare') {
      authorize(staff, 'inventory.write');
      authorize(staff, 'approvals.write');
      if (['In Progress', 'Issue'].includes(p.status))
        throw new AppError(
          422,
          'STARTED',
          'Materials have already been dispatched. Use the service case for additional requirements.',
        );
      await tx.execute(sql`select pg_advisory_xact_lock(10203)`);
      const state = await materialState(tx, p);
      const locations = await tx
        .select()
        .from(stockLocations)
        .where(
          and(
            eq(stockLocations.active, true),
            eq(stockLocations.type, 'Physical'),
          ),
        );
      const bySupplier = new Map<
        string,
        { m: FlooringMaterial; quantity: number; cost: number }[]
      >();
      for (const m of state) {
        let needed = quantityRound(Math.max(0, m.quantity - m.allocated));
        if (needed && locations.length) {
          const balances = await tx
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
            .for('update');
          for (const before of balances) {
            const quantity = quantityRound(
              Math.min(
                needed,
                Math.max(0, before.physical - before.reserved - before.display),
              ),
            );
            if (quantity <= 0) continue;
            const after = {
              ...before,
              reserved: quantityRound(before.reserved + quantity),
            };
            const reservationId = randomUUID();
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
                orderId: p.orderId,
                groupId: m.groupId,
                quantity,
                createdBy: staff.id,
              });
            const requestId = 'flooring-reserve:' + reservationId;
            await tx
              .insert(stockMovements)
              .values({
                id: randomUUID(),
                type: 'Reservation',
                productId: m.productId,
                locationId: before.locationId,
                orderId: p.orderId,
                quantity,
                reason: 'Accepted flooring quote ' + leadId,
                createdBy: staff.id,
                before,
                after,
                requestId,
                requestDigest: digest(requestId),
              });
            needed = quantityRound(needed - quantity);
          }
        }
        const shortage = quantityRound(Math.max(0, needed - m.incoming));
        if (shortage <= 0) continue;
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, m.productId));
        const [supplier] = await tx
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, m.supplierId));
        if (
          !product ||
          product.status !== 'Active' ||
          product.supplierId !== m.supplierId ||
          !supplier?.active
        )
          throw new AppError(
            422,
            'MATERIAL_CHANGED',
            'A material or supplier changed. Review the accepted material before purchasing.',
          );
        const group = bySupplier.get(m.supplierId) ?? [];
        group.push({ m, quantity: shortage, cost: product.supplierCostPence });
        bySupplier.set(m.supplierId, group);
      }
      const created: string[] = [];
      for (const [supplierId, items] of bySupplier) {
        const id = randomUUID();
        const number =
          'PO-' + new Date().getFullYear() + '-' + id.slice(0, 8).toUpperCase();
        await tx
          .insert(purchaseOrders)
          .values({
            id,
            number,
            supplierId,
            orderId: p.orderId,
            customerId: (
              await tx
                .select()
                .from(flooringLeads)
                .where(eq(flooringLeads.id, leadId))
            )[0].customerId,
            buyerId: staff.id,
            date: businessDate(Date.now(), rules.timeZone),
            expectedDate: '',
            currency: 'GBP',
            accountReference: '',
            notes:
              'Material shortage for accepted flooring quote. Review quantities and costs before sending.',
          });
        for (const item of items)
          await tx
            .insert(purchaseItems)
            .values({
              id: randomUUID(),
              purchaseOrderId: id,
              productId: item.m.productId,
              supplierSku: item.m.supplierSku,
              description: item.m.name + ' · ' + item.m.unit,
              quantity: item.quantity,
              unitCostPence: item.cost,
            });
        await tx
          .insert(auditLogs)
          .values({
            userId: staff.id,
            entity: 'purchase-order',
            entityId: id,
            action: 'flooring-draft-created',
            after: { leadId, orderId: p.orderId },
          });
        created.push(id);
      }
      if (p.status !== 'Booked')
        patch.status = (await materialState(tx, p)).every((m) => m.ready)
          ? 'Ready to Book'
          : 'Awaiting Materials';
      await audit(tx, staff, leadId, 'materials-prepared', {
        purchaseOrderIds: created,
      });
    } else if (input.action === 'book') {
      if (staff.role === 'Installer')
        throw new AppError(
          403,
          'FORBIDDEN',
          'A coordinator must book fitting.',
        );
      if (p.status === 'In Progress')
        throw new AppError(
          422,
          'STARTED',
          'Report an issue before rescheduling a started job.',
        );
      if (input.scheduledDate < businessDate(Date.now(), rules.timeZone))
        throw new AppError(422, 'PAST_DATE', 'Choose today or a future date.');
      await bookCheck(
        tx,
        leadId,
        input.fitterId,
        input.scheduledDate,
        input.timeSlot,
      );
      const materials = await materialState(tx, p);
      if (!materials.every((m) => m.ready))
        throw new AppError(
          422,
          'MATERIALS_REQUIRED',
          'Allocate all required materials before confirming fitting.',
        );
      if (!input.customerConfirmed)
        throw new AppError(
          422,
          'CONFIRMATION_REQUIRED',
          'Record customer confirmation before booking fitting.',
        );
      Object.assign(patch, {
        status: 'Booked',
        fitterId: input.fitterId,
        scheduledDate: input.scheduledDate,
        timeSlot: input.timeSlot,
        customerConfirmed: true,
        notes: input.notes,
      });
      leadStatus = 'Fitting Booked';
      await tx
        .insert(notifications)
        .values({
          id: randomUUID(),
          recipientId: input.fitterId,
          type: 'flooring-fitting',
          entity: 'flooring-fitting',
          entityId: leadId,
          title: 'Fitting assigned',
          message:
            p.snapshot.customerName +
            ' · ' +
            input.scheduledDate +
            ' · ' +
            input.timeSlot,
          dedupeKey: 'fitting:' + leadId + ':' + (p.version + 1),
        });
      await audit(tx, staff, leadId, 'fitting-booked', {
        fitterId: input.fitterId,
        date: input.scheduledDate,
        timeSlot: input.timeSlot,
        notes: input.notes,
      });
    } else {
      if (
        staff.role !== 'Installer' &&
        !['Management', 'Team Lead'].includes(staff.role)
      )
        throw new AppError(
          403,
          'FORBIDDEN',
          'The assigned fitter or a manager must record fitting progress.',
        );
      if (input.action === 'start') {
        if (
          !['Booked', 'Issue'].includes(p.status) ||
          !p.fitterId ||
          !p.customerConfirmed
        )
          throw new AppError(
            422,
            'BOOKING_REQUIRED',
            'Book and confirm fitting before starting.',
          );
        await bookCheck(tx, leadId, p.fitterId, p.scheduledDate, p.timeSlot);
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, p.orderId));
        if (!order || !isPaid(order.data))
          throw new AppError(
            422,
            'PAYMENT_REQUIRED',
            'The linked invoice must be issued and fully paid before dispatching materials.',
          );
        const materials = await materialState(tx, p);
        if (!materials.every((m) => m.ready))
          throw new AppError(
            422,
            'MATERIALS_REQUIRED',
            'Allocate every material before starting fitting.',
          );
        await tx.execute(sql`select pg_advisory_xact_lock(10203)`);
        for (const m of materials) {
          const reservations = await tx
            .select()
            .from(stockReservations)
            .where(
              and(
                eq(stockReservations.orderId, p.orderId),
                eq(stockReservations.productId, m.productId),
                eq(stockReservations.groupId, m.groupId),
                eq(stockReservations.status, 'Active'),
              ),
            )
            .for('update');
          if (quantityRound(m.allocated) !== quantityRound(m.quantity))
            throw new AppError(
              422,
              'OVER_ALLOCATED',
              'Allocation differs from the accepted requirement. Ask the warehouse to reconcile it.',
            );
          for (const r of reservations) {
            const [before] = await tx
              .select()
              .from(stockBalances)
              .where(
                and(
                  eq(stockBalances.productId, r.productId),
                  eq(stockBalances.locationId, r.locationId),
                ),
              )
              .for('update');
            if (
              !before ||
              before.physical < r.quantity ||
              before.reserved < r.quantity
            )
              throw new AppError(
                422,
                'STOCK_INTEGRITY',
                'Allocated material is unavailable.',
              );
            const after = {
              ...before,
              physical: quantityRound(before.physical - r.quantity),
              reserved: quantityRound(before.reserved - r.quantity),
            };
            await tx
              .update(stockBalances)
              .set({ physical: after.physical, reserved: after.reserved })
              .where(eq(stockBalances.id, before.id));
            await tx
              .update(stockReservations)
              .set({ status: 'Delivered', updatedAt: new Date() })
              .where(eq(stockReservations.id, r.id));
            const requestId = 'flooring-dispatch:' + r.id;
            await tx
              .insert(stockMovements)
              .values({
                id: randomUUID(),
                type: 'Customer Delivery',
                productId: r.productId,
                locationId: r.locationId,
                orderId: p.orderId,
                quantity: r.quantity,
                reason: 'Dispatched to assigned fitting team: ' + p.fitterId,
                createdBy: staff.id,
                before,
                after,
                requestId,
                requestDigest: digest(requestId),
              });
          }
        }
        for (const groupId of new Set(materials.map((m) => m.groupId)))
          if (!order.data.groups.find((g) => g.id === groupId)?.delivery)
            await updateOrderProgress(
              tx,
              staff.id,
              p.orderId,
              'delivery',
              'Materials dispatched to fitting team',
              undefined,
              groupId,
            );
        patch.status = 'In Progress';
        leadStatus = 'Installation';
      } else if (input.action === 'complete') {
        if (p.status !== 'In Progress')
          throw new AppError(
            422,
            'NOT_STARTED',
            'Start the fitting job before completion.',
          );
        if (!input.evidence)
          throw new AppError(
            422,
            'SIGNOFF_REQUIRED',
            'Record the customer name and sign-off evidence.',
          );
        const photos = await tx
          .select()
          .from(attachments)
          .where(
            and(
              eq(attachments.entity, 'flooring-fitting'),
              eq(attachments.entityId, leadId),
            ),
          );
        if (!photos.some((a) => a.mime.startsWith('image/')))
          throw new AppError(
            422,
            'PHOTO_REQUIRED',
            'Attach at least one completion photo before sign-off.',
          );
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, p.orderId));
        if (!order || !isPaid(order.data))
          throw new AppError(
            422,
            'PAYMENT_REQUIRED',
            'Reconcile the order balance before completion.',
          );
        for (const groupId of new Set(
          p.snapshot.materials.map((m) => m.groupId),
        ))
          await updateOrderProgress(
            tx,
            staff.id,
            p.orderId,
            'assembly',
            input.evidence,
            undefined,
            groupId,
          );
        patch.status = 'Completed';
        patch.signoff = input.evidence;
        leadStatus = 'Completed';
      } else {
        if (!['Booked', 'In Progress'].includes(p.status) || !input.evidence)
          throw new AppError(
            422,
            'ISSUE_REQUIRED',
            'Describe the issue on a booked or started fitting job.',
          );
        const [lead] = await tx
          .select()
          .from(flooringLeads)
          .where(eq(flooringLeads.id, leadId));
        const id = randomUUID();
        await tx
          .insert(serviceCases)
          .values({
            id,
            number: 'CS-' + id.slice(0, 8).toUpperCase(),
            title: 'Fitting issue · ' + p.snapshot.customerName,
            status: 'New',
            customerId: lead.customerId,
            orderId: p.orderId,
            assignedUserId: lead.assignedUserId,
            createdBy: staff.id,
            details: {
              ...blankDetails('service-cases'),
              reportedDate: businessDate(Date.now(), rules.timeZone),
              priority: 'Normal',
              notes: input.evidence,
            },
          });
        await tx
          .insert(auditLogs)
          .values({
            userId: staff.id,
            entity: 'service-cases',
            entityId: id,
            action: 'created-from-fitting',
            after: { leadId, orderId: p.orderId, issue: input.evidence },
          });
        patch.status = 'Issue';
        patch.caseId = id;
        patch.notes = input.evidence;
      }
      await audit(tx, staff, leadId, 'fitting-' + input.action, {
        evidence: input.evidence,
        status: patch.status,
        caseId: patch.caseId,
      });
    }
    await tx
      .update(flooringFulfilments)
      .set(patch)
      .where(eq(flooringFulfilments.leadId, leadId));
    if (leadStatus)
      await tx
        .update(flooringLeads)
        .set({
          status: leadStatus,
          version: sql`${flooringLeads.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(flooringLeads.id, leadId));
  });
  return flooringProject(staff, leadId);
}
