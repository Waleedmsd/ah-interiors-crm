import { updateOrderProgress } from './order-progress';
import { isPaid } from '../../lib/operations';
import { digest } from '../auth';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import { database } from '../db';
import {
  stockLocations,
  stockBalances,
  stockReservations,
  stockMovements,
  purchaseOrders,
  purchaseItems,
  supplierOrders,
  products,
  orders,
  auditLogs,
} from '../db/schema';
import { authorize, AppError, type Staff } from '../permissions';
import { stockUnit, quantityValid, quantityRound } from '../../lib/stock-units';
export const movementTypes = [
  'Goods Received',
  'Transfer',
  'Reservation',
  'Unreservation',
  'Customer Delivery',
  'Return',
  'Adjustment',
  'Damage',
  'Display Stock',
] as const;
const id = z.string().min(1).max(128);
export const movementInput = z
  .object({
    requestId: z.uuid(),
    type: z.enum(movementTypes),
    productId: id,
    locationId: id,
    targetLocationId: id.optional(),
    orderId: id.optional(),
    purchaseOrderId: id.optional(),
    reservationId: id.optional(),
    groupId: id.optional(),
    quantity: z
      .number()
      .min(-10000)
      .max(10000)
      .refine((v) => v !== 0),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
type Tx = Parameters<
  Parameters<ReturnType<typeof database>['transaction']>[0]
>[0];
async function location(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(stockLocations)
    .where(eq(stockLocations.id, id));
  if (!row?.active || row.type !== 'Physical')
    throw new AppError(
      422,
      'LOCATION',
      'Select an active physical stock location.',
    );
  return row;
}
async function balance(tx: Tx, productId: string, locationId: string) {
  const id = productId + ':' + locationId;
  await tx
    .insert(stockBalances)
    .values({ id, productId, locationId })
    .onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.id, id))
    .for('update');
  return row;
}
function validStock(row: {
  physical: number;
  reserved: number;
  display: number;
}) {
  row.physical = quantityRound(row.physical);
  row.reserved = quantityRound(row.reserved);
  row.display = quantityRound(row.display);
  if (
    row.physical < 0 ||
    row.reserved < 0 ||
    row.display < 0 ||
    row.reserved + row.display > row.physical
  )
    throw new AppError(
      422,
      'STOCK_UNAVAILABLE',
      'This movement exceeds available stock or would consume reserved/display stock.',
    );
}
export async function listStock(staff: Staff) {
  authorize(staff, 'inventory.write');
  const db = database();
  const [locations, balances, reservations, movements, items, purchases] =
    await Promise.all([
      db.select().from(stockLocations),
      db.select().from(stockBalances),
      db
        .select()
        .from(stockReservations)
        .where(inArray(stockReservations.status, ['Active', 'Delivered'])),
      db
        .select()
        .from(stockMovements)
        .orderBy(desc(stockMovements.createdAt))
        .limit(200),
      db.select().from(purchaseItems).where(eq(purchaseItems.active, true)),
      db
        .select()
        .from(purchaseOrders)
        .where(
          inArray(purchaseOrders.status, [
            'Sent',
            'Awaiting Confirmation',
            'Confirmed',
            'Partially Received',
          ]),
        ),
    ]);
  const incoming = items
    .filter((item) => purchases.some((p) => p.id === item.purchaseOrderId))
    .map((item) => ({
      productId: item.productId,
      purchaseOrderId: item.purchaseOrderId,
      quantity: item.quantity - item.receivedQuantity,
    }));
  return {
    locations,
    balances: balances.map((v) => ({
      ...v,
      available: quantityRound(v.physical - v.reserved - v.display),
    })),
    reservations,
    movements: movements.map(({ before, after, ...v }) => v),
    incoming,
  };
}
export async function saveLocation(staff: Staff, input: unknown) {
  authorize(staff, 'settings.write');
  const data = z
    .object({
      name: z.string().trim().min(1).max(200),
      type: z.enum(['Physical', 'Incoming', 'In Transit', 'Reserved']),
    })
    .strict()
    .parse(input);
  const id = randomUUID();
  return database().transaction(async (tx) => {
    const [row] = await tx
      .insert(stockLocations)
      .values({ id, ...data })
      .returning();
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity: 'stock-location',
        entityId: id,
        action: 'created',
        after: row,
      });
    return row;
  });
}
export async function moveStock(staff: Staff, input: unknown) {
  authorize(staff, 'inventory.write');
  const data = movementInput.parse(input);
  const requestDigest = digest(JSON.stringify(data));
  if (data.quantity < 0 && !['Adjustment', 'Display Stock'].includes(data.type))
    throw new AppError(
      422,
      'QUANTITY',
      'Only adjustments may use negative quantities.',
    );
  if (data.type === 'Adjustment') authorize(staff, 'approvals.write');
  return database().transaction(async (tx) => {
    // Deterministic global inventory lock avoids transfer/receipt/reservation deadlocks.
    // Database constraint checks and row locks still protect each balance.
    await tx.execute(sql`select pg_advisory_xact_lock(10204)`);
    await tx.execute(sql`select pg_advisory_xact_lock(10203)`);
    const [priorRequest] = await tx
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.requestId, data.requestId));
    if (priorRequest) {
      if (
        priorRequest.requestDigest !== requestDigest ||
        priorRequest.productId !== data.productId ||
        priorRequest.quantity !== data.quantity ||
        priorRequest.type !== data.type ||
        priorRequest.locationId !== data.locationId ||
        priorRequest.orderId !== (data.orderId ?? null) ||
        priorRequest.purchaseOrderId !== (data.purchaseOrderId ?? null)
      )
        throw new AppError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Movement request ID was already used.',
        );
      return priorRequest;
    }
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, data.productId));
    if (!product)
      throw new AppError(
        422,
        'PRODUCT_REQUIRED',
        'Select an existing product.',
      );
    if (!quantityValid(data.quantity, stockUnit(product.details)))
      throw new AppError(
        422,
        'UNIT_QUANTITY',
        'Use whole quantities for Each/Pack or up to three decimal places for m²/Metre.',
      );
    await location(tx, data.locationId);
    if (data.orderId) {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, data.orderId));
      if (!order)
        throw new AppError(422, 'ORDER_REQUIRED', 'Sales order not found.');
    }
    const before = await balance(tx, data.productId, data.locationId);
    let next = { ...before };
    let targetBefore: typeof before | undefined;
    let targetAfter: typeof before | undefined;
    if (data.type === 'Goods Received') {
      if (!data.purchaseOrderId)
        throw new AppError(
          422,
          'PURCHASE_REQUIRED',
          'Goods receiving requires a linked confirmed purchase order.',
        );
      const [purchase] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, data.purchaseOrderId))
        .for('update');
      if (
        !purchase ||
        !['Confirmed', 'Partially Received'].includes(purchase.status)
      )
        throw new AppError(
          422,
          'PURCHASE_STATUS',
          'Purchase order must be confirmed before receipt.',
        );
      const items = await tx
        .select()
        .from(purchaseItems)
        .where(
          and(
            eq(purchaseItems.purchaseOrderId, purchase.id),
            eq(purchaseItems.productId, data.productId),
            eq(purchaseItems.active, true),
          ),
        )
        .for('update');
      const outstanding = items.reduce(
        (sum, item) => sum + item.quantity - item.receivedQuantity,
        0,
      );
      if (data.quantity > quantityRound(outstanding))
        throw new AppError(
          422,
          'OVER_RECEIPT',
          'Received quantity exceeds the outstanding purchase quantity.',
        );
      let remaining = data.quantity;
      for (const item of items) {
        const received = Math.min(
          remaining,
          item.quantity - item.receivedQuantity,
        );
        await tx
          .update(purchaseItems)
          .set({
            receivedQuantity: quantityRound(item.receivedQuantity + received),
          })
          .where(eq(purchaseItems.id, item.id));
        remaining = quantityRound(remaining - received);
      }
      const all = await tx
        .select()
        .from(purchaseItems)
        .where(
          and(
            eq(purchaseItems.purchaseOrderId, purchase.id),
            eq(purchaseItems.active, true),
          ),
        );
      const complete = all.every(
        (item) => item.receivedQuantity === item.quantity,
      );
      await tx
        .update(purchaseOrders)
        .set({
          status: complete ? 'Received' : 'Partially Received',
          version: purchase.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, purchase.id));
      if (complete && purchase.orderId)
        await updateOrderProgress(
          tx,
          staff.id,
          purchase.orderId,
          'received',
          purchase.number,
          purchase.supplierId,
        );
      if (complete)
        await tx
          .update(supplierOrders)
          .set({
            status: 'Received',
            version: sql`${supplierOrders.version}+1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(supplierOrders.purchaseOrderId, purchase.id),
              sql`${supplierOrders.status} NOT IN ('Cancelled','Completed')`,
            ),
          );
      await tx
        .insert(auditLogs)
        .values({
          userId: staff.id,
          entity: 'purchase-order',
          entityId: purchase.id,
          action: 'goods-received',
          before: { status: purchase.status },
          after: {
            status: complete ? 'Received' : 'Partially Received',
            productId: data.productId,
            quantity: data.quantity,
          },
        });
      next.physical += data.quantity;
    } else if (data.type === 'Return') {
      if (!data.reservationId || !data.orderId)
        throw new AppError(
          422,
          'RETURN_EVIDENCE',
          'Returns require a delivered reservation and order.',
        );
      const [returned] = await tx
        .select()
        .from(stockReservations)
        .where(eq(stockReservations.id, data.reservationId))
        .for('update');
      if (
        !returned ||
        returned.status !== 'Delivered' ||
        returned.orderId !== data.orderId ||
        returned.productId !== data.productId ||
        returned.quantity !== data.quantity
      )
        throw new AppError(
          422,
          'RETURN_EVIDENCE',
          'Return must match a delivered reservation that has not been returned.',
        );
      await tx
        .update(stockReservations)
        .set({ status: 'Returned', updatedAt: new Date() })
        .where(eq(stockReservations.id, returned.id));
      next.physical += data.quantity;
    } else if (data.type === 'Adjustment') {
      next.physical += data.quantity;
    } else if (data.type === 'Damage') {
      next.physical -= data.quantity;
    } else if (data.type === 'Transfer') {
      if (!data.targetLocationId || data.targetLocationId === data.locationId)
        throw new AppError(
          422,
          'TARGET_LOCATION',
          'Choose a different destination location.',
        );
      await location(tx, data.targetLocationId);
      targetBefore = await balance(tx, data.productId, data.targetLocationId);
      targetAfter = {
        ...targetBefore,
        physical: targetBefore.physical + data.quantity,
      };
      next.physical -= data.quantity;
    } else if (data.type === 'Display Stock') {
      next.display += data.quantity;
    } else if (data.type === 'Reservation') {
      if (!data.orderId)
        throw new AppError(
          422,
          'ORDER_REQUIRED',
          'Stock reservations require a sales order.',
        );
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, data.orderId));
      if (!isPaid(order.data))
        throw new AppError(
          422,
          'PAYMENT_REQUIRED',
          'Verified full payment is required before reserving stock.',
        );
      const productLines = order.data.lines.filter(
        (line) => line.productId === data.productId || line.sku === product.sku,
      );
      const groupIds = [...new Set(productLines.map((v) => v.groupId))];
      const groupId =
        data.groupId ?? (groupIds.length === 1 ? groupIds[0] : undefined);
      if (!groupId || !groupIds.includes(groupId))
        throw new AppError(
          422,
          'GROUP_REQUIRED',
          'Select the product fulfilment group.',
        );
      const ordered = order.data.lines
        .filter((line) => line.groupId === groupId)
        .filter(
          (line) =>
            (line as typeof line & { productId?: string }).productId ===
              data.productId || line.sku === product.sku,
        )
        .reduce((sum, line) => sum + line.quantity, 0);
      const reserved = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.orderId, data.orderId),
            eq(stockReservations.productId, data.productId),
            eq(stockReservations.groupId, groupId),
            inArray(stockReservations.status, ['Active', 'Delivered']),
          ),
        );
      if (
        reserved.reduce((sum, v) => sum + v.quantity, 0) + data.quantity >
        ordered
      )
        throw new AppError(
          422,
          'ALLOCATION',
          'Link the product to the sales order; reservations cannot exceed its ordered quantity.',
        );
      await tx
        .insert(stockReservations)
        .values({
          id: randomUUID(),
          productId: data.productId,
          locationId: data.locationId,
          orderId: data.orderId,
          groupId,
          quantity: data.quantity,
          createdBy: staff.id,
        });
      next.reserved += data.quantity;
    } else if (['Unreservation', 'Customer Delivery'].includes(data.type)) {
      if (!data.reservationId)
        throw new AppError(
          422,
          'RESERVATION_REQUIRED',
          'Choose the existing stock reservation.',
        );
      const [reservation] = await tx
        .select()
        .from(stockReservations)
        .where(eq(stockReservations.id, data.reservationId))
        .for('update');
      if (
        !reservation ||
        reservation.status !== 'Active' ||
        reservation.productId !== data.productId ||
        reservation.locationId !== data.locationId ||
        reservation.quantity !== data.quantity ||
        reservation.orderId !== data.orderId
      )
        throw new AppError(
          422,
          'RESERVATION',
          'Movement must match the active reservation and order.',
        );
      await tx
        .update(stockReservations)
        .set({
          status: data.type === 'Customer Delivery' ? 'Delivered' : 'Released',
          updatedAt: new Date(),
        })
        .where(eq(stockReservations.id, reservation.id));
      next.reserved -= data.quantity;
      if (data.type === 'Customer Delivery') next.physical -= data.quantity;
    }
    validStock(next);
    if (targetAfter) validStock(targetAfter);
    await tx
      .update(stockBalances)
      .set({
        physical: next.physical,
        reserved: next.reserved,
        display: next.display,
      })
      .where(eq(stockBalances.id, next.id));
    if (targetAfter)
      await tx
        .update(stockBalances)
        .set({ physical: targetAfter.physical })
        .where(eq(stockBalances.id, targetAfter.id));
    const id = randomUUID();
    const [movement] = await tx
      .insert(stockMovements)
      .values({
        ...data,
        id,
        orderId: data.orderId ?? null,
        purchaseOrderId: data.purchaseOrderId ?? null,
        targetLocationId: data.targetLocationId ?? null,
        createdBy: staff.id,
        requestDigest,
        before: { source: before, target: targetBefore },
        after: { source: next, target: targetAfter },
      })
      .returning();
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity: 'stock-movement',
        entityId: id,
        action: data.type,
        before: { source: before, target: targetBefore },
        after: { source: next, target: targetAfter, reason: data.reason },
      });
    return movement;
  });
}
