import { eq, sql } from 'drizzle-orm';
import { workspaces, suppliers, purchaseOrders, auditLogs } from '../db/schema';
import { database } from '../db';
import { projectCommerce, workspaceId } from './commerce';
import { completed, type OrderCase } from '../../lib/operations';
type Tx = Parameters<
  Parameters<ReturnType<typeof database>['transaction']>[0]
>[0];
export function deliveryReady(
  order: OrderCase,
  reservations: {
    productId: string;
    quantity: number;
    groupId?: string | null;
  }[],
  groupId?: string,
) {
  const lines = order.lines.filter(
    (line) => !groupId || line.groupId === groupId,
  );
  if (!lines.length) return false;
  const needed = new Map<
    string,
    { productId: string; groupId: string; quantity: number }
  >();
  for (const line of lines) {
    if (order.groups.find((g) => g.id === line.groupId)?.receipt) continue;
    if (!line.productId) return false;
    const key = line.groupId + ':' + line.productId;
    const prior = needed.get(key);
    needed.set(key, {
      productId: line.productId,
      groupId: line.groupId,
      quantity: (prior?.quantity ?? 0) + line.quantity,
    });
  }
  return [...needed.values()].every(
    (v) =>
      reservations
        .filter((r) => r.productId === v.productId && r.groupId === v.groupId)
        .reduce((n, r) => n + r.quantity, 0) >= v.quantity,
  );
}
export async function updateOrderProgress(
  tx: Tx,
  staffId: string,
  orderId: string,
  kind: 'supplier-confirmed' | 'received' | 'delivery' | 'assembly',
  source: string,
  supplierId?: string,
  groupId?: string,
) {
  const [ledger] = await tx
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for('update');
  if (!ledger) return;
  const data = structuredClone(ledger.data);
  const order = data.operations.cases.find((v) => v.id === orderId);
  if (!order) return;
  const [supplier] = supplierId
    ? await tx.select().from(suppliers).where(eq(suppliers.id, supplierId))
    : [];
  const before = structuredClone(order.groups);
  if (kind === 'supplier-confirmed')
    order.groups = order.groups.map((g) =>
      g.supplier === supplier?.name ? { ...g, supplierStatus: 'Confirmed' } : g,
    );
  if (kind === 'received') {
    const associated = await tx
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.orderId, orderId));
    if (
      associated
        .filter((v) => v.supplierId === supplierId && v.status !== 'Cancelled')
        .every((v) => v.status === 'Received')
    )
      order.groups = order.groups.map((g) =>
        g.supplier === supplier?.name ? { ...g, receipt: true } : g,
      );
  }
  if (kind === 'delivery')
    order.groups = order.groups.map((g) =>
      g.id !== groupId
        ? g
        : {
            ...g,
            receipt: true,
            released: true,
            delivery: true,
            jobs: g.jobs.map((job) =>
              job.type === 'Delivery' ? { ...job, status: 'Done' } : job,
            ),
          },
    );
  if (kind === 'assembly')
    order.groups = order.groups.map((g) =>
      g.id !== groupId
        ? g
        : {
            ...g,
            assembly: g.assembly === 'Not required' ? g.assembly : 'Complete',
          },
    );
  order.events.unshift({
    id: 'EV-' + Date.now() + '-' + kind,
    title: 'Recorded ' + kind + ' evidence',
    source,
    detail: source,
    at: Date.now(),
  });
  if (completed(order)) order.tasks = [];
  await tx
    .update(workspaces)
    .set({ data, version: ledger.version + 1, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
  await projectCommerce(tx, data);
  await tx
    .insert(auditLogs)
    .values({
      userId: staffId,
      entity: 'order',
      entityId: orderId,
      action: kind,
      before,
      after: order.groups,
    });
}
