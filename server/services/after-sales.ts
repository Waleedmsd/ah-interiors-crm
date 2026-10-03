import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { database } from '../db';
import {
  serviceCases,
  caseWorkflows,
  orders,
  invoices,
  products,
  suppliers,
  purchaseOrders,
  purchaseItems,
  stockReservations,
  stockBalances,
  stockLocations,
  stockMovements,
  deliveryJobs,
  approvals,
  auditLogs,
  users,
} from '../db/schema';
import { AppError, authorize, hasPermission, type Staff } from '../permissions';
import { digest } from '../auth';
import { blankDetails } from '../../lib/business-modules';
import { invoiceTotals } from '../../lib/commerce';
import { businessDate } from '../../lib/business-date';
import { businessOptions } from './business-options';
const access = (staff: Staff) => {
  if (
    !staff.active ||
    ![
      'Management',
      'Team Lead',
      'Customer Service & Sales',
      'Accounts',
    ].includes(staff.role)
  )
    throw new AppError(403, 'FORBIDDEN', 'After-sales access is required.');
};
const draft = (caseId: string) => ({
  caseId,
  productId: null as string | null,
  quantity: 1,
  purchaseOrderId: null as string | null,
  deliveryId: null as string | null,
  approvalId: null as string | null,
  refundId: null as string | null,
  refundPence: 0,
  customerNextDate: '',
  supplierNextDate: '',
  contacts: [] as {
    id: string;
    audience: 'Customer' | 'Supplier';
    note: string;
    at: string;
    by: string;
  }[],
  returns: [] as {
    reservationId: string;
    quantity: number;
    disposition: string;
    movementId: string;
    at: string;
  }[],
  outcome: '',
  customerConfirmed: false,
});
export async function afterSalesProject(staff: Staff, id: string) {
  access(staff);
  const db = database();
  const [c] = await db
    .select()
    .from(serviceCases)
    .where(eq(serviceCases.id, id));
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Case not found.');
  const [saved] = await db
    .select()
    .from(caseWorkflows)
    .where(eq(caseWorkflows.caseId, id));
  const workflow = saved ?? draft(id);
  const [order] = c.orderId
    ? await db.select().from(orders).where(eq(orders.id, c.orderId))
    : [];
  const [invoice] = order
    ? await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, order.data.invoice))
    : [];
  const [purchase] = workflow.purchaseOrderId
    ? await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, workflow.purchaseOrderId))
    : [];
  const [delivery] = workflow.deliveryId
    ? await db
        .select()
        .from(deliveryJobs)
        .where(eq(deliveryJobs.id, workflow.deliveryId))
    : [];
  const [approval] = workflow.approvalId
    ? await db
        .select()
        .from(approvals)
        .where(eq(approvals.id, workflow.approvalId))
    : [];
  const reservations = c.orderId
    ? await db
        .select()
        .from(stockReservations)
        .where(eq(stockReservations.orderId, c.orderId))
    : [];
  const locations = await db
    .select()
    .from(stockLocations)
    .where(
      and(eq(stockLocations.active, true), eq(stockLocations.type, 'Physical')),
    );
  const lines = [
    ...new Map(
      (order?.data.lines ?? [])
        .filter((l) => l.productId)
        .map((l) => [l.productId!, { id: l.productId!, name: l.name }]),
    ).values(),
  ];
  const allocated = reservations
    .filter((r) => r.groupId === 'case:' + id && r.status === 'Active')
    .reduce((n, r) => n + r.quantity, 0);
  const refund = (invoice?.data.refunds ?? []).find(
    (r) => r.id === workflow.refundId,
  );
  return {
    caseId: id,
    number: c.number,
    version: c.version,
    status: c.status,
    replacementRequired: !!c.details.replacementRequired,
    orderId: c.orderId,
    invoiceId: invoice?.id,
    workflow,
    products: lines,
    locations: locations.map((l) => ({ id: l.id, name: l.name })),
    allocated,
    purchase: purchase
      ? {
          id: purchase.id,
          number: purchase.number,
          status: purchase.status,
          expectedDate: purchase.expectedDate,
        }
      : null,
    delivery: delivery
      ? {
          id: delivery.id,
          number: delivery.number,
          status: delivery.status,
          proof: String(delivery.details.proof ?? ''),
        }
      : null,
    approval: approval
      ? { id: approval.id, number: approval.number, status: approval.status }
      : null,
    refund: refund
      ? {
          id: refund.id,
          amountPence: refund.amountPence,
          reference: refund.reference,
        }
      : null,
    availableRefunds: (invoice?.data.refunds ?? []).map((r) => ({
      id: r.id,
      amountPence: r.amountPence,
      reference: r.reference,
    })),
    returnable: reservations
      .filter(
        (r) => r.status === 'Delivered' && r.productId === workflow.productId,
      )
      .map((r) => ({ id: r.id, quantity: r.quantity })),
    canManage: hasPermission(staff, 'orders.write'),
    canStock:
      hasPermission(staff, 'inventory.write') &&
      hasPermission(staff, 'approvals.write'),
    canRefund: hasPermission(staff, 'payments.write'),
  };
}
const text = z.string().trim().min(1).max(2000),
  date = z.union([z.iso.date(), z.literal('')]);
const input = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('stop-replacement'),
      version: z.number().int(),
      reason: text,
    })
    .strict(),
  z
    .object({
      action: z.literal('reopen'),
      version: z.number().int(),
      reason: text,
    })
    .strict(),
  z
    .object({
      action: z.literal('configure'),
      version: z.number().int(),
      productId: z.string(),
      quantity: z.number().int().min(1).max(10000),
    })
    .strict(),
  z
    .object({
      action: z.literal('contact'),
      version: z.number().int(),
      audience: z.enum(['Customer', 'Supplier']),
      note: text,
      nextDate: date,
    })
    .strict(),
  z
    .object({
      action: z.literal('prepare'),
      version: z.number().int(),
      unitCostPence: z.number().int().min(0).max(100000000),
    })
    .strict(),
  z
    .object({ action: z.literal('delivery'), version: z.number().int() })
    .strict(),
  z
    .object({
      action: z.literal('return'),
      version: z.number().int(),
      reservationId: z.string(),
      quantity: z.number().int().positive(),
      locationId: z.string(),
      disposition: z.enum(['Restock', 'Write off']),
      reason: text,
    })
    .strict(),
  z
    .object({
      action: z.literal('request-refund'),
      version: z.number().int(),
      amountPence: z.number().int().positive().max(100000000),
      reason: text,
    })
    .strict(),
  z
    .object({
      action: z.literal('link-refund'),
      version: z.number().int(),
      refundId: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('resolve'),
      version: z.number().int(),
      outcome: z.enum([
        'Replacement delivered',
        'Refund recorded',
        'Returned goods',
        'Advice / no further action',
        'Combined remedy',
      ]),
      note: text,
      customerConfirmed: z.literal(true),
    })
    .strict(),
]);
export async function actOnAfterSales(staff: Staff, id: string, raw: unknown) {
  access(staff);
  const action = input.parse(raw);
  if (
    action.action === 'link-refund' ||
    (action.action === 'request-refund' && staff.role === 'Accounts')
  )
    authorize(staff, 'payments.write');
  else authorize(staff, 'orders.write');
  const rules = await businessOptions();
  const today = businessDate(Date.now(), rules.timeZone);
  await database().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10204)`);
    const [c] = await tx
      .select()
      .from(serviceCases)
      .where(eq(serviceCases.id, id))
      .for('update');
    if (!c) throw new AppError(404, 'NOT_FOUND', 'Case not found.');
    if (c.version !== action.version)
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'Case changed. Refresh before continuing.',
      );
    if (['Resolved', 'Closed'].includes(c.status) && action.action !== 'reopen')
      throw new AppError(
        422,
        'LOCKED',
        'Reopen the case before recording further work.',
      );
    const [saved] = await tx
      .select()
      .from(caseWorkflows)
      .where(eq(caseWorkflows.caseId, id));
    const w = saved ? structuredClone(saved) : draft(id);
    const [order] = c.orderId
      ? await tx.select().from(orders).where(eq(orders.id, c.orderId))
      : [];
    const details = { ...c.details };
    let status = c.status === 'New' ? 'Investigating' : c.status;
    if (!['contact', 'resolve', 'reopen'].includes(action.action) && !order)
      throw new AppError(
        422,
        'ORDER_REQUIRED',
        'Link the original sales order to this case first.',
      );
    if (action.action === 'reopen') {
      if (!['Resolved', 'Closed'].includes(c.status))
        throw new AppError(
          422,
          'STATUS',
          'Only a resolved or closed case can be reopened.',
        );
      w.outcome = '';
      w.customerConfirmed = false;
      status = 'Investigating';
      details.resolution = '';
      details.resolutionDate = '';
    } else if (action.action === 'configure') {
      const held = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.groupId, 'case:' + id),
            eq(stockReservations.status, 'Active'),
          ),
        );
      if (held.length)
        throw new AppError(
          422,
          'LOCKED_ITEM',
          'Allocated replacement stock locks the remedy item.',
        );
      if (w.purchaseOrderId || w.deliveryId || w.returns.length)
        throw new AppError(
          422,
          'LOCKED_ITEM',
          'The remedy item is already in use. Open a separate case for another item.',
        );
      const rows = order!.data.lines.filter(
        (l) => l.productId === action.productId,
      );
      if (
        !rows.length ||
        action.quantity > rows.reduce((n, l) => n + l.quantity, 0)
      )
        throw new AppError(
          422,
          'PRODUCT_REQUIRED',
          'Select an ordered product and a quantity within the original sale.',
        );
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, action.productId));
      if (
        !product ||
        !['Each', 'Pack'].includes(String(product.details.stockUnit ?? 'Each'))
      )
        throw new AppError(
          422,
          'UNIT',
          'This replacement workflow handles whole items or packs.',
        );
      w.productId = product.id;
      w.quantity = action.quantity;
      await tx
        .update(serviceCases)
        .set({ productId: product.id, supplierId: product.supplierId })
        .where(eq(serviceCases.id, id));
    } else if (action.action === 'contact') {
      w.contacts.push({
        id: randomUUID(),
        audience: action.audience,
        note: action.note,
        at: new Date().toISOString(),
        by: staff.name,
      });
      if (action.audience === 'Customer') {
        w.customerNextDate = action.nextDate;
        details.customerLastUpdated = today;
      } else {
        w.supplierNextDate = action.nextDate;
        details.supplierContacted = true;
        details.supplierResponse = action.note;
      }
    } else if (action.action === 'prepare') {
      authorize(staff, 'inventory.write');
      authorize(staff, 'approvals.write');
      await tx.execute(sql`select pg_advisory_xact_lock(10203)`);
      if (!w.productId || w.deliveryId)
        throw new AppError(
          422,
          'ITEM_REQUIRED',
          'Select a remedy item before preparing it; existing delivery jobs own their allocation.',
        );
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, w.productId));
      const [supplier] = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, product.supplierId));
      if (product.status !== 'Active' || !supplier?.active)
        throw new AppError(
          422,
          'PRODUCT_REQUIRED',
          'Use an active product and supplier.',
        );
      if (w.purchaseOrderId) {
        const [po] = await tx
          .select()
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, w.purchaseOrderId));
        if (po?.status === 'Cancelled')
          throw new AppError(
            422,
            'CANCELLED_REPLACEMENT',
            'This replacement was cancelled. Open a new case to start a different replacement.',
          );
      }
      const held = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.orderId, c.orderId!),
            eq(stockReservations.groupId, 'case:' + id),
            eq(stockReservations.status, 'Active'),
          ),
        );
      let needed = w.quantity - held.reduce((n, r) => n + r.quantity, 0);
      const locations = await tx
        .select()
        .from(stockLocations)
        .where(
          and(
            eq(stockLocations.active, true),
            eq(stockLocations.type, 'Physical'),
          ),
        );
      for (const location of locations) {
        const [before] = await tx
          .select()
          .from(stockBalances)
          .where(
            and(
              eq(stockBalances.productId, w.productId),
              eq(stockBalances.locationId, location.id),
            ),
          )
          .for('update');
        if (!before) continue;
        const quantity = Math.min(
          needed,
          Math.max(0, before.physical - before.reserved - before.display),
        );
        if (quantity <= 0) continue;
        const after = { ...before, reserved: before.reserved + quantity },
          rid = randomUUID(),
          key = 'case-reserve:' + rid;
        await tx
          .update(stockBalances)
          .set({ reserved: after.reserved })
          .where(eq(stockBalances.id, before.id));
        await tx.insert(stockReservations).values({
          id: rid,
          productId: w.productId,
          locationId: location.id,
          orderId: c.orderId!,
          groupId: 'case:' + id,
          quantity,
          createdBy: staff.id,
        });
        await tx.insert(stockMovements).values({
          id: randomUUID(),
          type: 'Reservation',
          productId: w.productId,
          locationId: location.id,
          orderId: c.orderId,
          quantity,
          reason: c.number + ' replacement',
          createdBy: staff.id,
          before,
          after,
          requestId: key,
          requestDigest: digest(key),
        });
        needed -= quantity;
      }
      if (needed > 0 && !w.purchaseOrderId) {
        const poId = randomUUID();
        await tx.insert(purchaseOrders).values({
          id: poId,
          number: 'PO-' + poId.slice(0, 8).toUpperCase(),
          supplierId: product.supplierId,
          customerId: c.customerId,
          buyerId: staff.id,
          date: today,
          notes:
            'Replacement for ' +
            c.number +
            ' · original order ' +
            c.orderId +
            '. Confirm supplier charge before sending.',
        });
        await tx.insert(purchaseItems).values({
          id: randomUUID(),
          purchaseOrderId: poId,
          productId: w.productId,
          supplierSku: product.supplierSku,
          description: product.name + ' · replacement ' + c.number,
          quantity: needed,
          unitCostPence: action.unitCostPence,
          customerId: c.customerId,
        });
        w.purchaseOrderId = poId;
        details.replacementReference = 'PO-' + poId.slice(0, 8).toUpperCase();
        await tx.insert(auditLogs).values({
          userId: staff.id,
          entity: 'purchase-order',
          entityId: poId,
          action: 'case-replacement-draft',
          after: { caseId: id, orderId: c.orderId },
        });
      }
      details.replacementRequired = true;
      status = 'Awaiting Supplier';
    } else if (action.action === 'delivery') {
      if (w.deliveryId)
        throw new AppError(
          409,
          'DELIVERY_EXISTS',
          'Open the existing replacement delivery.',
        );
      if (!w.productId || !details.replacementRequired)
        throw new AppError(
          422,
          'REPLACEMENT_REQUIRED',
          'Prepare the replacement first.',
        );
      const held = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.orderId, c.orderId!),
            eq(stockReservations.groupId, 'case:' + id),
            eq(stockReservations.productId, w.productId),
            eq(stockReservations.status, 'Active'),
          ),
        );
      if (held.reduce((n, r) => n + r.quantity, 0) !== w.quantity)
        throw new AppError(
          422,
          'STOCK_REQUIRED',
          'Receive and allocate the full replacement quantity first.',
        );
      if (!order!.data.address || !order!.data.postcode)
        throw new AppError(
          422,
          'ADDRESS_REQUIRED',
          'Complete the original customer delivery address first.',
        );
      const deliveryId = randomUUID();
      await tx.insert(deliveryJobs).values({
        id: deliveryId,
        number: 'DEL-' + deliveryId.slice(0, 8).toUpperCase(),
        title: c.number + ' · replacement delivery',
        status: 'Ready to Book',
        customerId: c.customerId,
        orderId: c.orderId,
        createdBy: staff.id,
        details: {
          ...blankDetails('deliveries'),
          groupId: 'case:' + id,
          address: order!.data.address,
          postcode: order!.data.postcode,
          phone: order!.data.phone,
          notes:
            'Replacement for ' +
            c.number +
            '. Capture customer proof; do not reopen the original sale.',
        },
      });
      w.deliveryId = deliveryId;
      await tx.insert(auditLogs).values({
        userId: staff.id,
        entity: 'deliveries',
        entityId: deliveryId,
        action: 'case-replacement-created',
        after: { caseId: id },
      });
    } else if (action.action === 'return') {
      authorize(staff, 'inventory.write');
      await tx.execute(sql`select pg_advisory_xact_lock(10203)`);
      const [r] = await tx
        .select()
        .from(stockReservations)
        .where(eq(stockReservations.id, action.reservationId))
        .for('update');
      const [location] = await tx
        .select()
        .from(stockLocations)
        .where(eq(stockLocations.id, action.locationId));
      if (
        !r ||
        r.orderId !== c.orderId ||
        r.productId !== w.productId ||
        r.status !== 'Delivered' ||
        action.quantity > r.quantity ||
        !location?.active ||
        location.type !== 'Physical'
      )
        throw new AppError(
          422,
          'RETURN_REQUIRED',
          'Choose delivered units from this order and a physical receiving location.',
        );
      if (
        action.quantity + w.returns.reduce((n, v) => n + v.quantity, 0) >
        w.quantity
      )
        throw new AppError(
          422,
          'RETURN_QUANTITY',
          'Returned quantity exceeds this case requirement.',
        );
      if (action.quantity === r.quantity)
        await tx
          .update(stockReservations)
          .set({ status: 'Returned', updatedAt: new Date() })
          .where(eq(stockReservations.id, r.id));
      else {
        await tx
          .update(stockReservations)
          .set({
            quantity: r.quantity - action.quantity,
            updatedAt: new Date(),
          })
          .where(eq(stockReservations.id, r.id));
        await tx.insert(stockReservations).values({
          ...r,
          id: randomUUID(),
          quantity: action.quantity,
          status: 'Returned',
          createdBy: staff.id,
          updatedAt: new Date(),
        });
      }
      await tx
        .insert(stockBalances)
        .values({
          id: randomUUID(),
          productId: r.productId,
          locationId: location.id,
        })
        .onConflictDoNothing();
      const [before] = await tx
        .select()
        .from(stockBalances)
        .where(
          and(
            eq(stockBalances.productId, r.productId),
            eq(stockBalances.locationId, location.id),
          ),
        )
        .for('update');
      const received = {
          ...before,
          physical: before.physical + action.quantity,
        },
        after = action.disposition === 'Restock' ? received : before;
      await tx
        .update(stockBalances)
        .set({ physical: after.physical })
        .where(eq(stockBalances.id, before.id));
      const movementId = randomUUID(),
        key = 'case-return:' + movementId;
      const movement = {
        productId: r.productId,
        locationId: location.id,
        orderId: c.orderId,
        quantity: action.quantity,
        reason: c.number + ' · ' + action.reason,
        createdBy: staff.id,
      };
      await tx.insert(stockMovements).values({
        ...movement,
        id: movementId,
        type: 'Return',
        before,
        after: received,
        requestId: key,
        requestDigest: digest(key),
      });
      if (action.disposition === 'Write off') {
        const k = key + ':damage';
        await tx.insert(stockMovements).values({
          ...movement,
          id: randomUUID(),
          type: 'Damage',
          before: received,
          after,
          requestId: k,
          requestDigest: digest(k),
        });
      }
      w.returns.push({
        reservationId: r.id,
        quantity: action.quantity,
        disposition: action.disposition,
        movementId,
        at: new Date().toISOString(),
      });
    } else if (action.action === 'stop-replacement') {
      authorize(staff, 'inventory.write');
      authorize(staff, 'approvals.write');
      await tx.execute(sql`select pg_advisory_xact_lock(10203)`);
      if (!details.replacementRequired)
        throw new AppError(
          422,
          'REPLACEMENT_REQUIRED',
          'No active replacement requirement.',
        );
      const [po] = w.purchaseOrderId
        ? await tx
            .select()
            .from(purchaseOrders)
            .where(eq(purchaseOrders.id, w.purchaseOrderId))
        : [];
      if (po && !['Draft', 'Cancelled', 'Received'].includes(po.status))
        throw new AppError(
          422,
          'SUPPLIER_CANCELLATION',
          'Confirm supplier cancellation and record it on the purchase order before stopping the replacement.',
        );
      const [job] = w.deliveryId
        ? await tx
            .select()
            .from(deliveryJobs)
            .where(eq(deliveryJobs.id, w.deliveryId))
        : [];
      if (
        job &&
        ['Out for Delivery', 'Delivered', 'Completed', 'Failed'].includes(
          job.status,
        )
      )
        throw new AppError(
          422,
          'DISPATCHED',
          'Dispatched replacement goods require a return or a further service case.',
        );
      if (po?.status === 'Draft') {
        await tx
          .update(purchaseOrders)
          .set({
            status: 'Cancelled',
            version: po.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(purchaseOrders.id, po.id));
        await tx
          .insert(auditLogs)
          .values({
            userId: staff.id,
            entity: 'purchase-order',
            entityId: po.id,
            action: 'case-replacement-cancelled',
            before: po,
            after: { reason: action.reason },
          });
      }
      if (job) {
        await tx
          .update(deliveryJobs)
          .set({
            status: 'Cancelled',
            version: job.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(deliveryJobs.id, job.id));
        await tx
          .insert(auditLogs)
          .values({
            userId: staff.id,
            entity: 'deliveries',
            entityId: job.id,
            action: 'case-replacement-cancelled',
            before: job,
            after: { reason: action.reason },
          });
      }
      const held = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.groupId, 'case:' + id),
            eq(stockReservations.status, 'Active'),
          ),
        )
        .for('update');
      for (const r of held) {
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
        if (!before || before.reserved < r.quantity)
          throw new AppError(
            422,
            'STOCK_INTEGRITY',
            'Review the replacement allocation balance.',
          );
        const after = { ...before, reserved: before.reserved - r.quantity },
          key = 'case-release:' + r.id;
        await tx
          .update(stockBalances)
          .set({ reserved: after.reserved })
          .where(eq(stockBalances.id, before.id));
        await tx
          .update(stockReservations)
          .set({ status: 'Released', updatedAt: new Date() })
          .where(eq(stockReservations.id, r.id));
        await tx
          .insert(stockMovements)
          .values({
            id: randomUUID(),
            type: 'Unreservation',
            productId: r.productId,
            locationId: r.locationId,
            orderId: c.orderId,
            quantity: r.quantity,
            reason: c.number + ' · ' + action.reason,
            createdBy: staff.id,
            before,
            after,
            requestId: key,
            requestDigest: digest(key),
          });
      }
      details.replacementRequired = false;
      status = 'Investigating';
      w.supplierNextDate = '';
    } else if (action.action === 'request-refund') {
      const [previousApproval] = w.approvalId
        ? await tx
            .select()
            .from(approvals)
            .where(eq(approvals.id, w.approvalId))
        : [];
      if (
        (w.approvalId && previousApproval?.status !== 'Rejected') ||
        w.refundId
      )
        throw new AppError(
          409,
          'REFUND_EXISTS',
          'This case already has a refund request.',
        );
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, order!.data.invoice));
      if (
        !invoice ||
        invoice.data.lifecycle !== 'Issued' ||
        action.amountPence > invoiceTotals(invoice.data).netPaid
      )
        throw new AppError(
          422,
          'REFUND_AMOUNT',
          'Refund must be within the invoice net payments.',
        );
      const approvalId = randomUUID();
      await tx.insert(approvals).values({
        id: approvalId,
        number: 'APR-' + approvalId.slice(0, 8).toUpperCase(),
        title: c.number + ' · refund request',
        status: 'Requested',
        customerId: c.customerId,
        orderId: c.orderId,
        createdBy: staff.id,
        details: {
          ...blankDetails('approvals'),
          approvalType: 'Refund',
          linkedType: 'invoice',
          linkedId: invoice.id,
          amountPence: action.amountPence,
          reason: action.reason,
        },
      });
      await tx.insert(auditLogs).values({
        userId: staff.id,
        entity: 'approvals',
        entityId: approvalId,
        action: 'case-refund-requested',
        after: {
          caseId: id,
          invoiceId: invoice.id,
          amountPence: action.amountPence,
          reason: action.reason,
        },
      });
      w.approvalId = approvalId;
      w.refundPence = action.amountPence;
    } else if (action.action === 'link-refund') {
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, order!.data.invoice));
      const refund = invoice?.data.refunds?.find(
        (r) => r.id === action.refundId,
      );
      const used = await tx
        .select()
        .from(caseWorkflows)
        .where(eq(caseWorkflows.refundId, action.refundId));
      if (
        !refund ||
        (w.refundId && w.refundId !== action.refundId) ||
        used.some((v) => v.caseId !== id) ||
        (w.refundPence && refund.amountPence !== w.refundPence) ||
        (w.approvalId && refund.approvalId !== w.approvalId)
      )
        throw new AppError(
          422,
          'REFUND_REQUIRED',
          'Choose the matching recorded invoice refund; it must not belong to another case.',
        );
      w.refundId = refund.id;
      w.refundPence = refund.amountPence;
    } else if (action.action === 'resolve') {
      if (!c.assignedUserId)
        throw new AppError(
          422,
          'OWNER_REQUIRED',
          'Assign a case owner before resolution.',
        );
      const [delivery] = w.deliveryId
        ? await tx
            .select()
            .from(deliveryJobs)
            .where(eq(deliveryJobs.id, w.deliveryId))
        : [];
      const [purchase] = w.purchaseOrderId
        ? await tx
            .select()
            .from(purchaseOrders)
            .where(eq(purchaseOrders.id, w.purchaseOrderId))
        : [];
      if (purchase && !['Received', 'Cancelled'].includes(purchase.status))
        throw new AppError(
          422,
          'PURCHASE_OPEN',
          'Receive or cancel the outstanding replacement purchase before resolution.',
        );
      if (
        details.replacementRequired &&
        (!delivery || !['Delivered', 'Completed'].includes(delivery.status))
      )
        throw new AppError(
          422,
          'REPLACEMENT_OPEN',
          'Complete the replacement delivery before resolving this case.',
        );
      const [refundApproval] = w.approvalId
        ? await tx
            .select()
            .from(approvals)
            .where(eq(approvals.id, w.approvalId))
        : [];
      const agreedNoRefund =
        refundApproval?.status === 'Rejected' &&
        action.outcome === 'Advice / no further action';
      if (
        (w.approvalId || details.caseType === 'Refund') &&
        !w.refundId &&
        !agreedNoRefund
      )
        throw new AppError(
          422,
          'REFUND_OPEN',
          'Record the invoice refund and link it before resolving.',
        );
      if (
        details.caseType === 'Return' &&
        w.returns.reduce((n, r) => n + r.quantity, 0) < w.quantity
      )
        throw new AppError(
          422,
          'RETURN_OPEN',
          'Receive the required returned quantity before resolving.',
        );
      if (
        action.outcome === 'Combined remedy' &&
        [
          !!w.refundId,
          w.returns.length > 0,
          !!delivery && ['Delivered', 'Completed'].includes(delivery.status),
        ].filter(Boolean).length < 2
      )
        throw new AppError(
          422,
          'EVIDENCE',
          'A combined remedy requires at least two recorded outcomes.',
        );
      if (
        action.outcome === 'Replacement delivered' &&
        (!delivery || !['Delivered', 'Completed'].includes(delivery.status))
      )
        throw new AppError(
          422,
          'EVIDENCE',
          'No replacement delivery is linked.',
        );
      if (action.outcome === 'Refund recorded' && !w.refundId)
        throw new AppError(422, 'EVIDENCE', 'No recorded refund is linked.');
      if (action.outcome === 'Returned goods' && !w.returns.length)
        throw new AppError(422, 'EVIDENCE', 'No returned goods are recorded.');
      w.outcome = action.outcome;
      w.customerConfirmed = true;
      w.customerNextDate = '';
      w.supplierNextDate = '';
      details.resolution = action.note;
      details.resolutionDate = today;
      status = 'Resolved';
    }
    await tx
      .insert(caseWorkflows)
      .values(w)
      .onConflictDoUpdate({ target: caseWorkflows.caseId, set: w });
    await tx
      .update(serviceCases)
      .set({ details, status, version: c.version + 1, updatedAt: new Date() })
      .where(eq(serviceCases.id, id));
    await tx.insert(auditLogs).values({
      userId: staff.id,
      entity: 'service-cases',
      entityId: id,
      action: 'after-sales:' + action.action,
      before: saved,
      after: { workflow: w, status, details, request: action },
    });
  });
  return afterSalesProject(staff, id);
}

export async function orderServiceCases(staff: Staff, orderId: string) {
  authorize(staff, 'commerce.read');
  return database()
    .select({
      id: serviceCases.id,
      number: serviceCases.number,
      title: serviceCases.title,
      status: serviceCases.status,
    })
    .from(serviceCases)
    .where(eq(serviceCases.orderId, orderId));
}
