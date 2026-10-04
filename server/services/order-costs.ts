import { eq } from 'drizzle-orm';
import { supplierCostPence } from '../../lib/financial-access';
import { z } from 'zod';
import { database } from '../db';
import { orders, orderCostSheets, auditLogs } from '../db/schema';
import { AppError, type Staff } from '../permissions';
import { canSeeCosts, marginSettings } from './catalogue';
import {
  calculateMargin,
  emptyCosts,
  type VariableCosts,
} from '../../lib/margin';
import type { OrderCase } from '../../lib/operations';
const amount = z.number().int().min(0).max(1000000000);
const input = z
  .object({
    version: z.number().int().nonnegative(),
    costs: z
      .object({
        inboundFreightPence: amount,
        deliveryPence: amount,
        assemblyPence: amount,
        paymentFeePence: amount,
        financeFeePence: amount,
        marketplaceFeePence: amount,
        marketingPence: amount,
        otherPence: amount,
      })
      .strict(),
    notes: z.string().trim().max(10000),
    reviewed: z.boolean(),
  })
  .strict();
export function orderProfit(
  order: OrderCase,
  rules: Awaited<ReturnType<typeof marginSettings>>,
  costs: VariableCosts = emptyCosts,
) {
  return calculateMargin(
    {
      revenuePence: Math.round(order.total * 100),
      supplierCostPence: Math.round(
        order.lines.reduce((n, l) => n + l.quantity * supplierCostPence(l.cost), 0),
      ),
      discountPence: 0,
      vatBps: rules.vatBps,
      vatTreatment: 'Standard',
      costs,
    },
    rules.marginThresholds,
  );
}
function access(staff: Staff) {
  if (!canSeeCosts(staff))
    throw new AppError(
      403,
      'COST_ACCESS',
      'Order costs are restricted to management and accounts.',
    );
}
export async function getOrderCosts(staff: Staff, id: string) {
  access(staff);
  const db = database();
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
  const [sheet] = await db
    .select()
    .from(orderCostSheets)
    .where(eq(orderCostSheets.orderId, id));
  const data = sheet ?? {
    orderId: id,
    costs: { ...emptyCosts },
    notes: '',
    reviewed: false,
    version: 0,
  };
  return {
    ...data,
    productCostsVerified:
      order.data.lines.length > 0 &&
      order.data.lines.every((l) => l.costVerified),
    profit: orderProfit(order.data, await marginSettings(), data.costs),
  };
}
export async function saveOrderCosts(staff: Staff, id: string, raw: unknown) {
  access(staff);
  const { version, ...data } = input.parse(raw);
  await database().transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .for('update');
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
    const [prior] = await tx
      .select()
      .from(orderCostSheets)
      .where(eq(orderCostSheets.orderId, id));
    if ((prior?.version ?? 0) !== version)
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'Costs changed. Reload before saving.',
      );
    await tx
      .insert(orderCostSheets)
      .values({
        ...data,
        orderId: id,
        version: version + 1,
        updatedBy: staff.id,
      })
      .onConflictDoUpdate({
        target: orderCostSheets.orderId,
        set: {
          ...data,
          version: version + 1,
          updatedBy: staff.id,
          updatedAt: new Date(),
        },
      });
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity: 'order',
        entityId: id,
        action: 'costs-updated',
        before: prior,
        after: data,
      });
  });
  return getOrderCosts(staff, id);
}
