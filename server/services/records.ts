import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { database } from '../db';
import {
  customers,
  orders,
  invoices,
  suppliers,
  products,
  purchaseOrders,
  supplierOrders,
  stockMovements,
  flooringFulfilments,
  attachments,
  auditLogs,
  users,
} from '../db/schema';
import { hasPermission, AppError, type Staff } from '../permissions';
import {
  businessModules,
  canUseModule,
  type BusinessModule,
} from '../../lib/business-modules';
import { listRecords } from './operational';
import { recordHref, recordEntity } from '../../lib/record-links';
export async function recordChoices(staff: Staff) {
  const db = database();
  const result: { id: string; name: string; entity: string; href: string }[] =
    [];
  const add = (entity: string, rows: { id: string; name: string }[]) =>
    result.push(
      ...rows.map((v) => ({ ...v, entity, href: recordHref(entity, v.id) })),
    );
  if (hasPermission(staff, 'commerce.read')) {
    add(
      'customer',
      await db
        .select({ id: customers.id, name: customers.name })
        .from(customers),
    );
    add(
      'order',
      (await db.select({ id: orders.id, data: orders.data }).from(orders)).map(
        (v) => ({ id: v.id, name: '#' + v.id + ' · ' + v.data.customer }),
      ),
    );
    add(
      'invoice',
      (await db.select({ id: invoices.id }).from(invoices)).map((v) => ({
        id: v.id,
        name: v.id,
      })),
    );
  }
  if (
    [
      'Management',
      'Team Lead',
      'Customer Service & Sales',
      'Shopify Store Manager',
      'Warehouse',
      'Accounts',
    ].includes(staff.role)
  ) {
    add(
      'product',
      await db.select({ id: products.id, name: products.name }).from(products),
    );
    add(
      'supplier',
      await db
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers),
    );
  }
  if (hasPermission(staff, 'approvals.write')) {
    add(
      'purchase-order',
      await db
        .select({ id: purchaseOrders.id, name: purchaseOrders.number })
        .from(purchaseOrders),
    );
    add(
      'supplier-order',
      await db
        .select({ id: supplierOrders.id, name: supplierOrders.number })
        .from(supplierOrders),
    );
  }
  if (hasPermission(staff, 'inventory.write'))
    add(
      'stock-movement',
      (
        await db
          .select({ id: stockMovements.id, type: stockMovements.type })
          .from(stockMovements)
      ).map((v) => ({ id: v.id, name: v.type + ' · ' + v.id.slice(0, 8) })),
    );
  for (const module of Object.keys(businessModules) as BusinessModule[])
    if (canUseModule(staff.role, module))
      add(
        module,
        (await listRecords(staff, module)).map((v) => ({
          id: v.id,
          name: v.number + ' · ' + v.title,
        })),
      );
  if (staff.role === 'Installer' || canUseModule(staff.role, 'flooring')) {
    const fitting = await db
      .select()
      .from(flooringFulfilments)
      .where(
        staff.role === 'Installer'
          ? eq(flooringFulfilments.fitterId, staff.id)
          : undefined,
      );
    add(
      'flooring-fitting',
      fitting.map((v) => ({
        id: v.leadId,
        name: 'Fitting · ' + v.snapshot.customerName + ' · ' + v.orderId,
      })),
    );
  }
  return result;
}
export async function recordAccess(staff: Staff, entity: string, id: string) {
  const row = (await recordChoices(staff)).find(
    (v) => v.entity === recordEntity(entity) && v.id === id,
  );
  if (!row)
    throw new AppError(
      404,
      'NOT_FOUND',
      'Record not found or access is restricted.',
    );
  return row;
}
export async function documentIndex(staff: Staff) {
  const allowed = await recordChoices(staff);
  const lookup = new Map(allowed.map((v) => [v.entity + ':' + v.id, v]));
  const rows = await database()
    .select({
      id: attachments.id,
      entity: attachments.entity,
      entityId: attachments.entityId,
      filename: attachments.filename,
      mime: attachments.mime,
      bytes: attachments.bytes,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .orderBy(desc(attachments.createdAt));
  return rows.flatMap((v) => {
    const record = lookup.get(recordEntity(v.entity) + ':' + v.entityId);
    return record ? [{ ...v, recordName: record.name, href: record.href }] : [];
  });
}
export async function recordActivity(staff: Staff, entity: string, id: string) {
  await recordAccess(staff, entity, id);
  const rows = await database()
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      after: auditLogs.after,
      at: auditLogs.at,
      author: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(
      and(
        eq(auditLogs.entity, recordEntity(entity)),
        eq(auditLogs.entityId, id),
      ),
    )
    .orderBy(desc(auditLogs.at))
    .limit(100);
  return rows.map(({ after, ...v }) => ({
    ...v,
    body:
      v.action === 'comment-added'
        ? String((after as { body?: string })?.body ?? '')
        : '',
  }));
}
export async function addComment(
  staff: Staff,
  entity: string,
  id: string,
  input: unknown,
) {
  await recordAccess(staff, entity, id);
  const data = z
    .object({ body: z.string().trim().min(1).max(5000) })
    .strict()
    .parse(input);
  await database()
    .insert(auditLogs)
    .values({
      userId: staff.id,
      entity: recordEntity(entity),
      entityId: id,
      action: 'comment-added',
      after: data,
    });
  return recordActivity(staff, entity, id);
}
