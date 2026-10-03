import { businessOptions } from './business-options';
import { eq, or, sql } from 'drizzle-orm';
import { database } from '../db';
import {
  customers,
  orders,
  invoices,
  payments,
  workspaces,
  auditLogs,
  requests,
  products,
  suppliers,
  settings,
  approvals,
} from '../db/schema';
import {
  applyCommerce,
  parseSavedCommerce,
  type CommerceState,
  type CommerceAction,
} from '../../lib/commerce';
import { authorize, AppError, type Staff } from '../permissions';
import { digest } from '../auth';
import { mutationInput } from '../validation';
export const workspaceId = 'ah-interiors';
type Tx = Parameters<
  Parameters<ReturnType<typeof database>['transaction']>[0]
>[0];
export async function projectCommerce(tx: Tx, state: CommerceState) {
  for (const customer of state.customers)
    await tx
      .insert(customers)
      .values({ ...customer, data: customer })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          postcode: customer.postcode,
          data: customer,
        },
      });
  for (const order of state.operations.cases)
    await tx
      .insert(orders)
      .values({
        id: order.id,
        customerId: order.customerId,
        channel: order.channel,
        status: order.status,
        data: order,
      })
      .onConflictDoUpdate({
        target: orders.id,
        set: {
          customerId: order.customerId,
          channel: order.channel,
          status: order.status,
          data: order,
        },
      });
  for (const invoice of state.invoices) {
    await tx
      .insert(invoices)
      .values({
        id: invoice.id,
        customerId: invoice.customerId,
        orderId: invoice.orderId,
        lifecycle: invoice.lifecycle,
        data: invoice,
      })
      .onConflictDoUpdate({
        target: invoices.id,
        set: { lifecycle: invoice.lifecycle, data: invoice },
      });
    for (const payment of invoice.payments)
      await tx
        .insert(payments)
        .values({
          ...payment,
          id: invoice.id + ':' + payment.id,
          invoiceId: invoice.id,
          at: new Date(payment.at),
        })
        .onConflictDoNothing();
    for (const refund of invoice.refunds ?? [])
      await tx
        .insert(payments)
        .values({
          id: invoice.id + ':refund:' + refund.id,
          invoiceId: invoice.id,
          amountPence: -refund.amountPence,
          reference: refund.reference,
          method: refund.method,
          at: new Date(refund.at),
        })
        .onConflictDoNothing();
  }
}
export function actionPermission(staff: Staff, action: CommerceAction) {
  if (action.type === 'create-customer')
    return authorize(staff, 'customers.write');
  if (action.type === 'create-order') return authorize(staff, 'orders.write');
  if (action.type === 'pay-invoice' || action.type === 'refund-invoice')
    return authorize(staff, 'payments.write');
  if (action.type === 'operation') {
    if (action.action.type === 'payment')
      throw new AppError(
        422,
        'VALIDATION',
        'Record payments through the invoice ledger.',
      );
    if (
      ['approve', 'check', 'revise', 'line', 'route'].includes(
        action.action.type,
      )
    )
      return authorize(staff, 'approvals.write');
    return authorize(staff, 'orders.write');
  }
  return authorize(staff, 'invoices.write');
}
export async function readCommerce(staff: Staff) {
  authorize(staff, 'commerce.read');
  const [row] = await database()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!row)
    throw new AppError(
      503,
      'NOT_INITIALIZED',
      'Run database migrations and the seed command first.',
    );
  return { data: row.data, version: row.version };
}
export async function mutateCommerce(staff: Staff, input: unknown) {
  authorize(staff, 'commerce.read');
  const parsed = mutationInput.parse(input);
  const action = parsed.action as CommerceAction;
  actionPermission(staff, action);
  if (
    action.type === 'create-order' &&
    !(await businessOptions()).salesChannels.includes(action.input.channel)
  )
    throw new AppError(
      422,
      'CHANNEL_REQUIRED',
      'Choose a configured sales channel.',
    );
  const requestKey = staff.id + ':' + parsed.requestId;
  const actionDigest = digest(JSON.stringify(action));
  return database().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10204)`);
    const [row] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update');
    if (!row)
      throw new AppError(
        503,
        'NOT_INITIALIZED',
        'Initialize the database first.',
      );
    const [prior] = await tx
      .select()
      .from(requests)
      .where(eq(requests.id, requestKey));
    if (prior) {
      if (prior.digest !== actionDigest)
        throw new AppError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request ID was already used.',
        );
      return {
        ...(prior.result as object),
        data: row.data,
        version: row.version,
      };
    }
    if (row.version !== parsed.version)
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'Records changed. Reload the workspace and try again.',
      );
    // Server owns timestamps; caller cannot backdate operational audit evidence.
    if ('now' in action) action.now = Date.now();
    if (action.type === 'refund-invoice') action.refund.at = Date.now();
    if ('input' in action) action.input.now = Date.now();
    if (action.type === 'operation' && 'now' in action.action)
      action.action.now = Date.now();
    const linked = new Map<string, typeof products.$inferSelect>();
    if (action.type === 'create-order')
      for (const line of action.input.lines) {
        if (!line.productId) continue;
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, line.productId));
        if (!product || product.status !== 'Active')
          throw new AppError(
            422,
            'PRODUCT_REQUIRED',
            'Choose an active product.',
          );
        const [supplier] = await tx
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, product.supplierId));
        if (!supplier?.active)
          throw new AppError(
            422,
            'SUPPLIER_REQUIRED',
            'Product supplier is inactive.',
          );
        line.supplier = supplier.name;
        line.article = String(product.details.article ?? product.supplierSku);
        linked.set(product.id, product);
      }
    if (action.type === 'refund-invoice') {
      const [business] = await tx
        .select()
        .from(settings)
        .where(eq(settings.key, 'business'));
      const limit = Number(
        (business?.value as { refundApprovalPence?: number } | undefined)
          ?.refundApprovalPence ?? 0,
      );
      if (action.refund.amountPence > limit && !action.approvalId)
        throw new AppError(
          422,
          'APPROVAL_REQUIRED',
          'A management approval is required for a refund above the configured limit.',
        );
      if (action.approvalId) {
        const [approval] = await tx
          .select()
          .from(approvals)
          .where(
            or(
              eq(approvals.id, action.approvalId),
              eq(approvals.number, action.approvalId),
            ),
          )
          .for('update');
        if (
          !approval ||
          approval.status !== 'Approved' ||
          approval.details.approvalType !== 'Refund' ||
          approval.details.linkedType !== 'invoice' ||
          approval.details.linkedId !== action.id ||
          Number(approval.details.amountPence) !== action.refund.amountPence ||
          !approval.details.decidedBy ||
          approval.details.decidedBy === approval.createdBy
        )
          throw new AppError(
            422,
            'APPROVAL_REQUIRED',
            'Use an approved refund request for this invoice and exact amount, decided by another manager.',
          );
        if (
          row.data.invoices.some((invoice) =>
            (invoice.refunds ?? []).some(
              (refund) => refund.approvalId === approval.id,
            ),
          )
        )
          throw new AppError(
            422,
            'APPROVAL_USED',
            'This approval has already been used for a refund.',
          );
        action.refund.approvalId = approval.id;
      }
    }
    const result = applyCommerce(row.data, action);
    if (action.type === 'create-order' && result.id) {
      const created = result.state.operations.cases.find(
        (v) => v.id === result.id,
      );
      for (const line of created?.lines ?? []) {
        const product = line.productId ? linked.get(line.productId) : undefined;
        if (product) {
          line.sku = product.sku;
          line.cost = product.supplierCostPence / 100;
          line.costVerified = true;
        }
      }
    }
    if (result.error) throw new AppError(422, 'WORKFLOW', result.error);
    if (!parseSavedCommerce(JSON.stringify(result.state)))
      throw new AppError(
        422,
        'INTEGRITY',
        'The change violates ledger relationships.',
      );
    const version = row.version + 1;
    await projectCommerce(tx, result.state);
    await tx
      .update(workspaces)
      .set({ data: result.state, version, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));
    const entity =
      action.type === 'operation'
        ? 'order'
        : action.type.includes('invoice')
          ? 'invoice'
          : action.type === 'create-order'
            ? 'order'
            : 'customer';
    const entityId =
      result.id ??
      ('id' in action
        ? action.id
        : action.type === 'operation'
          ? action.action.id
          : workspaceId);
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity,
        entityId,
        action: action.type === 'operation' ? action.action.type : action.type,
        before:
          entity === 'order'
            ? row.data.operations.cases.find((v) => v.id === entityId)
            : entity === 'invoice'
              ? row.data.invoices.find((v) => v.id === entityId)
              : null,
        after:
          entity === 'order'
            ? result.state.operations.cases.find((v) => v.id === entityId)
            : entity === 'invoice'
              ? result.state.invoices.find((v) => v.id === entityId)
              : result.state.customers.find((v) => v.id === entityId),
      });
    await tx
      .insert(requests)
      .values({
        id: requestKey,
        userId: staff.id,
        digest: actionDigest,
        result: { id: result.id, version },
      });
    return { data: result.state, version, id: result.id };
  });
}
export async function importCommerce(staff: Staff, input: unknown) {
  authorize(staff, 'settings.write');
  const state = parseSavedCommerce(JSON.stringify(input));
  if (!state)
    throw new AppError(
      422,
      'VALIDATION',
      'Invalid browser export or inconsistent invoice balances.',
    );
  return database().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update');
    // Never overwrite shared records. Import is only offered before initial ledger seeding.
    if (existing)
      throw new AppError(
        409,
        'ALREADY_INITIALIZED',
        'Import requires an empty workspace. Existing shared records are never overwritten.',
      );
    await projectCommerce(tx, state);
    await tx.insert(workspaces).values({ id: workspaceId, data: state });
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity: 'workspace',
        entityId: workspaceId,
        action: 'browser-import',
        after: {
          customers: state.customers.length,
          orders: state.operations.cases.length,
          invoices: state.invoices.length,
        },
      });
    return { data: state, version: 1 };
  });
}
