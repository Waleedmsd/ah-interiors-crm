import {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { and, eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { database } from '../db';
import {
  settings,
  ecommerceImports,
  products,
  suppliers,
  workspaces,
  auditLogs,
} from '../db/schema';
import { AppError, authorize, type Staff } from '../permissions';
import {
  applyCommerce,
  parseSavedCommerce,
  type NewOrderLine,
} from '../../lib/commerce';
import { projectCommerce, workspaceId } from '../services/commerce';
export const shopifyQuery =
  'query CrmOrders($after: String, $query: String!) {\n  orders(first: 10, after: $after, sortKey: UPDATED_AT, query: $query) {\n    pageInfo { hasNextPage endCursor }\n    nodes {\n      id name updatedAt createdAt email phone cancelledAt displayFinancialStatus displayFulfillmentStatus taxesIncluded test\n      currentTotalPriceSet { shopMoney { amount currencyCode } }\n      currentSubtotalPriceSet { shopMoney { amount currencyCode } }\n      currentShippingPriceSet { shopMoney { amount currencyCode } }\n      shippingAddress { name address1 address2 city zip phone countryCodeV2 }\n      lineItems(first: 100) {\n        pageInfo { hasNextPage }\n        nodes { id name sku quantity currentQuantity variant { id } discountedTotalSet { shopMoney { amount currencyCode } } }\n      }\n    }\n  }\n}\n';
const apiVersion = '2026-07';
const money = z.object({
  shopMoney: z.object({
    amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    currencyCode: z.string(),
  }),
});
const lineSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  quantity: z.number().int().positive().max(10000),
  currentQuantity: z.number().int().nonnegative(),
  variant: z.object({ id: z.string() }).nullable(),
  discountedTotalSet: money,
});
const orderSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.string(),
  createdAt: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  displayFinancialStatus: z.string().nullable(),
  displayFulfillmentStatus: z.string(),
  taxesIncluded: z.boolean(),
  test: z.boolean(),
  currentTotalPriceSet: money,
  currentSubtotalPriceSet: money,
  currentShippingPriceSet: money,
  shippingAddress: z
    .object({
      name: z.string().nullable(),
      address1: z.string().nullable(),
      address2: z.string().nullable(),
      city: z.string().nullable(),
      zip: z.string().nullable(),
      phone: z.string().nullable(),
      countryCodeV2: z.string().nullable(),
    })
    .nullable(),
  lineItems: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean() }),
    nodes: z.array(lineSchema),
  }),
});
export type ShopifyOrder = z.infer<typeof orderSchema>;
function access(staff: Staff) {
  if (
    !['Management', 'Team Lead', 'Shopify Store Manager'].includes(staff.role)
  )
    throw new AppError(
      403,
      'FORBIDDEN',
      'Store integration access is restricted.',
    );
}
const shopName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/);
async function config() {
  let shop = process.env.SHOPIFY_SHOP?.trim().toLowerCase() ?? '',
    token = process.env.SHOPIFY_ACCESS_TOKEN ?? '';
  const [saved] = await database()
    .select()
    .from(settings)
    .where(eq(settings.key, 'secret:shopify'));
  if (saved) {
    const value = saved.value as {
      shop: string;
      iv: string;
      tag: string;
      encrypted: string;
    };
    shop = value.shop;
    const key = process.env.SHOPIFY_CREDENTIALS_KEY;
    if (!key || !/^[a-f0-9]{64}$/i.test(key))
      throw new AppError(
        503,
        'SECRET_KEY',
        'Shopify credential encryption key is not configured on this server.',
      );
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(key, 'hex'),
        Buffer.from(value.iv, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(value.tag, 'hex'));
      token = Buffer.concat([
        decipher.update(Buffer.from(value.encrypted, 'hex')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new AppError(
        503,
        'SECRET_KEY',
        'Stored Shopify credentials cannot be unlocked. Restore the server encryption key.',
      );
    }
  }
  return {
    shop,
    token,
    configured: shopName.safeParse(shop).success && !!token,
  };
}
export async function configureShopify(staff: Staff, raw: unknown) {
  authorize(staff, 'settings.write');
  const input = z
    .object({ shop: shopName, token: z.string().trim().min(10).max(500) })
    .strict()
    .parse(raw);
  const key = process.env.SHOPIFY_CREDENTIALS_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new AppError(
      503,
      'SECRET_KEY',
      'Configure SHOPIFY_CREDENTIALS_KEY on the server before saving credentials.',
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([
    cipher.update(input.token, 'utf8'),
    cipher.final(),
  ]);
  const value = {
    shop: input.shop,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    encrypted: encrypted.toString('hex'),
  };
  await database().transaction(async (tx) => {
    await tx
      .insert(settings)
      .values({ key: 'secret:shopify', value, updatedBy: staff.id })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedBy: staff.id, updatedAt: new Date() },
      });
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity: 'integration',
        entityId: input.shop,
        action: 'credentials-configured',
        after: { shop: input.shop },
      });
  });
  return { ok: true };
}
export function shopifyPence(value: z.infer<typeof money>) {
  const n = Number(value.shopMoney.amount) * 100;
  if (
    value.shopMoney.currencyCode !== 'GBP' ||
    !Number.isSafeInteger(Math.round(n)) ||
    n < 0 ||
    n > 1000000000
  )
    throw new AppError(
      422,
      'CURRENCY',
      'Only GBP orders with supported totals can be imported.',
    );
  return Math.round(n);
}
export function shopifyReadiness(order: ShopifyOrder) {
  const issues: string[] = [];
  if (order.cancelledAt) issues.push('Cancelled order: review in Shopify.');
  if (order.test) issues.push('Test order: excluded from live orders.');
  if (order.lineItems.pageInfo.hasNextPage)
    issues.push('More than 100 lines: manual review required.');
  if (!order.taxesIncluded)
    issues.push('Tax-exclusive pricing requires accounts review.');
  if (
    !['PAID', 'PENDING', 'AUTHORIZED', 'PARTIALLY_PAID'].includes(
      order.displayFinancialStatus ?? '',
    )
  )
    issues.push('Refunded, voided or unsupported payment status.');
  if (order.displayFulfillmentStatus !== 'UNFULFILLED')
    issues.push('Existing fulfilment requires reconciliation before import.');
  if (
    !order.shippingAddress?.address1 ||
    !order.shippingAddress.city ||
    !order.shippingAddress.zip
  )
    issues.push('Complete delivery address required.');
  if (order.shippingAddress?.countryCodeV2 !== 'GB')
    issues.push('International orders require delivery and tax review.');
  if (
    !order.lineItems.nodes.length ||
    order.lineItems.nodes.some((l) => l.quantity !== l.currentQuantity)
  )
    issues.push('Edited or removed order lines require reconciliation.');
  try {
    const total = shopifyPence(order.currentTotalPriceSet),
      subtotal = shopifyPence(order.currentSubtotalPriceSet),
      shipping = shopifyPence(order.currentShippingPriceSet);
    const sum = order.lineItems.nodes.reduce(
      (n, l) => n + shopifyPence(l.discountedTotalSet),
      0,
    );
    if (total <= 0 || sum !== subtotal || total !== subtotal + shipping)
      issues.push('Discounts, tax or additional charges need reconciliation.');
  } catch (e) {
    issues.push((e as Error).message);
  }
  return issues;
}
function matchProduct(
  line: ShopifyOrder['lineItems']['nodes'][number],
  catalogue: (typeof products.$inferSelect)[],
) {
  const byVariant = line.variant
    ? catalogue.filter(
        (p) =>
          p.details.shopifyVariantId === line.variant!.id ||
          p.details.shopifyVariantId === line.variant!.id.split('/').pop(),
      )
    : [];
  if (byVariant.length === 1) return byVariant[0].id;
  const bySku = line.sku
    ? catalogue.filter((p) => p.sku.toLowerCase() === line.sku!.toLowerCase())
    : [];
  return bySku.length === 1 ? bySku[0].id : '';
}
export async function shopifyStatus(staff: Staff) {
  access(staff);
  const c = await config();
  const [state] = await database()
    .select()
    .from(settings)
    .where(eq(settings.key, 'integration:shopify:' + c.shop));
  const rows = await database()
    .select()
    .from(ecommerceImports)
    .where(eq(ecommerceImports.shop, c.shop))
    .orderBy(desc(ecommerceImports.updatedAt));
  const catalogue = await database()
    .select()
    .from(products)
    .where(eq(products.status, 'Active'));
  return {
    shop: c.shop,
    configured: c.configured,
    apiVersion,
    state: state?.value ?? null,
    canImport: ['Management', 'Team Lead'].includes(staff.role),
    products: catalogue.map((p) => ({ id: p.id, name: p.name, sku: p.sku })),
    orders: rows.map((row) => {
      const order = orderSchema.parse(row.payload);
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        orderId: row.orderId,
        error: row.error,
        updatedAt: row.updatedAt,
        payment: order.displayFinancialStatus,
        email: order.email,
        address: order.shippingAddress,
        total: order.currentTotalPriceSet.shopMoney,
        issues: shopifyReadiness(order),
        lines: order.lineItems.nodes.map((l) => ({
          id: l.id,
          name: l.name,
          sku: l.sku,
          quantity: l.quantity,
          total: l.discountedTotalSet.shopMoney,
          productId: matchProduct(l, catalogue),
        })),
      };
    }),
  };
}
export async function syncShopify(staff: Staff) {
  access(staff);
  const c = await config();
  if (!c.configured)
    throw new AppError(
      503,
      'SHOPIFY_SETUP',
      'Configure SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN on the server first.',
    );
  const key = 'integration:shopify:' + c.shop;
  const [saved] = await database()
    .select()
    .from(settings)
    .where(eq(settings.key, key));
  const prior = saved?.value as
    | {
        cursor?: string | null;
        since?: string;
        startedAt?: string;
        lastSuccess?: string;
      }
    | undefined;
  const startedAt = prior?.cursor ? prior.startedAt! : new Date().toISOString();
  const since = prior?.cursor
    ? prior.since!
    : new Date(Date.now() - 59 * 86400000).toISOString();
  try {
    const response = await fetch(
      'https://' + c.shop + '/admin/api/' + apiVersion + '/graphql.json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': c.token,
        },
        body: JSON.stringify({
          query: shopifyQuery,
          variables: {
            after: prior?.cursor ?? null,
            query: 'updated_at:>=' + since + ' updated_at:<=' + startedAt,
          },
        }),
        signal: AbortSignal.timeout(25000),
        redirect: 'error',
      },
    );
    if (!response.ok)
      throw new AppError(
        502,
        'SHOPIFY_RESPONSE',
        'Shopify returned HTTP ' +
          response.status +
          '. Check access scopes or retry after the rate limit resets.',
      );
    const payload = (await response.json()) as {
      data?: unknown;
      errors?: unknown[];
    };
    if (payload.errors?.length)
      throw new AppError(
        502,
        'SHOPIFY_QUERY',
        'Shopify rejected the query. Check read_orders, read_products and customer data access.',
      );
    const result = z
      .object({
        orders: z.object({
          pageInfo: z.object({
            hasNextPage: z.boolean(),
            endCursor: z.string().nullable(),
          }),
          nodes: z.array(orderSchema),
        }),
      })
      .parse(payload.data);
    await database().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(10206)`);
      const [latest] = await tx
        .select()
        .from(settings)
        .where(eq(settings.key, key));
      if (JSON.stringify(latest?.value) !== JSON.stringify(saved?.value))
        throw new AppError(
          409,
          'SYNC_BUSY',
          'Another sync finished. Refresh before continuing.',
        );
      for (const order of result.orders.nodes) {
        const [existing] = await tx
          .select()
          .from(ecommerceImports)
          .where(
            and(
              eq(ecommerceImports.shop, c.shop),
              eq(ecommerceImports.externalId, order.id),
            ),
          );
        if (existing?.externalUpdatedAt === order.updatedAt) continue;
        await tx
          .insert(ecommerceImports)
          .values({
            id: randomUUID(),
            shop: c.shop,
            externalId: order.id,
            name: order.name,
            payload: order,
            externalUpdatedAt: order.updatedAt,
          })
          .onConflictDoUpdate({
            target: [ecommerceImports.shop, ecommerceImports.externalId],
            set: {
              payload: order,
              name: order.name,
              externalUpdatedAt: order.updatedAt,
              status: existing?.orderId
                ? 'Update needs review'
                : 'Needs review',
              error: null,
              updatedAt: new Date(),
            },
          });
      }
      const value = {
        cursor: result.orders.pageInfo.hasNextPage
          ? result.orders.pageInfo.endCursor
          : null,
        since,
        startedAt,
        lastSuccess: new Date().toISOString(),
        error: null,
      };
      await tx
        .insert(settings)
        .values({ key, value, updatedBy: staff.id })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedBy: staff.id, updatedAt: new Date() },
        });
      await tx
        .insert(auditLogs)
        .values({
          userId: staff.id,
          entity: 'integration',
          entityId: c.shop,
          action: 'shopify-orders-synced',
          after: { count: result.orders.nodes.length },
        });
    });
    return shopifyStatus(staff);
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : 'Shopify sync failed. Check connectivity and app access, then retry.';
    if (!(error instanceof AppError && error.status === 409))
      await database()
        .insert(settings)
        .values({
          key,
          value: { ...prior, error: message },
          updatedBy: staff.id,
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: { ...prior, error: message }, updatedAt: new Date() },
        });
    throw error instanceof AppError
      ? error
      : new AppError(502, 'SHOPIFY_SYNC', message);
  }
}

export async function importShopifyOrder(
  staff: Staff,
  id: string,
  raw: unknown,
) {
  authorize(staff, 'orders.write');
  const input = z
    .object({
      mappings: z
        .array(
          z
            .object({
              lineId: z.string(),
              productId: z.string().min(1),
              route: z.enum([
                'ProBuild',
                'Flat Pack Pro',
                'AH showroom → BStar',
                'Supplier → BStar',
              ]),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict()
    .parse(raw);
  return database().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10204)`);
    const [row] = await tx
      .select()
      .from(ecommerceImports)
      .where(
        and(
          eq(ecommerceImports.id, id),
          eq(ecommerceImports.shop, (await config()).shop),
        ),
      )
      .for('update');
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Shopify order not found.');
    if (row.orderId) {
      if (row.status === 'Imported') return { orderId: row.orderId };
      throw new AppError(
        409,
        'RECONCILE',
        'This order is already linked. Review the changed Shopify order against the existing CRM order.',
      );
    }
    const order = orderSchema.parse(row.payload);
    const issues = shopifyReadiness(order);
    if (issues.length)
      throw new AppError(422, 'REVIEW_REQUIRED', issues.join(' '));
    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update');
    if (!workspace)
      throw new AppError(503, 'NOT_INITIALIZED', 'Initialize the CRM first.');
    const sourceRef = row.shop + '/' + order.name;
    const duplicate = workspace.data.operations.cases.find(
      (v) =>
        v.channel === 'Shopify' &&
        [sourceRef, order.name].includes(v.sourceRef),
    );
    if (duplicate)
      throw new AppError(
        409,
        'DUPLICATE_ORDER',
        'This Shopify reference already exists as CRM order ' +
          duplicate.id +
          '. Reconcile the existing record.',
      );
    const matches = workspace.data.customers.filter(
      (v) =>
        !!order.email &&
        v.email.trim().toLowerCase() === order.email.trim().toLowerCase(),
    );
    if (matches.length > 1)
      throw new AppError(
        422,
        'CUSTOMER_MATCH',
        'Multiple customer accounts match. Resolve the duplicate accounts before importing.',
      );
    const address = order.shippingAddress!;
    if (!order.email || !z.email().safeParse(order.email).success)
      throw new AppError(
        422,
        'CUSTOMER_EMAIL',
        'A valid customer email is required. Update it in Shopify and sync again.',
      );
    const lines: NewOrderLine[] = [];
    const linked = new Map<string, typeof products.$inferSelect>();
    for (const line of order.lineItems.nodes) {
      const choices = input.mappings.filter((m) => m.lineId === line.id);
      if (choices.length !== 1)
        throw new AppError(
          422,
          'PRODUCT_MAPPING',
          'Map every Shopify line once.',
        );
      const mapping = choices[0];
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, mapping.productId));
      if (!product || product.status !== 'Active')
        throw new AppError(
          422,
          'PRODUCT_MAPPING',
          'Choose an active CRM product for every line.',
        );
      const [supplier] = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, product.supplierId));
      if (!supplier?.active)
        throw new AppError(
          422,
          'SUPPLIER_REQUIRED',
          'Product supplier must be active.',
        );
      linked.set(product.id, product);
      const total = shopifyPence(line.discountedTotalSet),
        unit = Math.floor(total / line.quantity),
        remainder = total - unit * line.quantity;
      const add = (quantity: number, unitPence: number) => {
        if (quantity)
          lines.push({
            productId: product.id,
            name: line.name,
            supplier: supplier.name,
            article: String(product.details.article ?? product.supplierSku),
            quantity,
            unitPence,
            options: 'Shopify ' + order.name + ' · ' + (line.sku ?? ''),
            route: mapping.route,
          });
      };
      add(line.quantity - remainder, unit);
      add(remainder, unit + 1);
    }
    const result = applyCommerce(workspace.data, {
      type: 'create-order',
      input: {
        requestId: 'shopify:' + row.id,
        ...(matches.length
          ? { customerId: matches[0].id }
          : {
              customer: {
                name: address.name || order.email,
                email: order.email,
                phone: address.phone || order.phone || '',
                address: [address.address1, address.address2]
                  .filter(Boolean)
                  .join(', '),
                city: address.city!,
                postcode: address.zip!,
              },
            }),
        channel: 'Shopify',
        sourceRef,
        lines,
        deliveryPence: shopifyPence(order.currentShippingPriceSet),
        note:
          'Imported from Shopify ' +
          order.name +
          '. Shopify payment status: ' +
          order.displayFinancialStatus +
          '. Reconcile payment and invoice VAT before release.',
        now: Date.now(),
      },
    });
    if (result.error || !result.id)
      throw new AppError(
        422,
        'IMPORT_FAILED',
        result.error ?? 'Could not create order.',
      );
    const created = result.state.operations.cases.find(
      (v) => v.id === result.id,
    )!;
    Object.assign(created, {
      customer: address.name || created.customer,
      address: [address.address1, address.address2].filter(Boolean).join(', '),
      city: address.city!,
      postcode: address.zip!,
      phone: address.phone || order.phone || created.phone,
    });
    for (const line of created.lines) {
      const product = linked.get(line.productId!)!;
      line.sku = product.sku;
      line.cost = product.supplierCostPence / 100;
      line.costVerified = true;
    }
    created.events[0] = {
      ...created.events[0],
      title: 'Imported from Shopify',
      source: staff.name,
      detail:
        'Linked to Shopify ' +
        order.name +
        '. Invoice draft awaits accounts review.',
    };
    if (
      Math.round(created.total * 100) !==
        shopifyPence(order.currentTotalPriceSet) ||
      !parseSavedCommerce(JSON.stringify(result.state))
    )
      throw new AppError(
        422,
        'TOTAL_MISMATCH',
        'Imported total or ledger relationships do not match Shopify.',
      );
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
      .update(ecommerceImports)
      .set({
        status: 'Imported',
        orderId: result.id,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(ecommerceImports.id, id));
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity: 'order',
        entityId: result.id,
        action: 'shopify-imported',
        after: {
          shop: row.shop,
          externalId: row.externalId,
          reference: row.name,
        },
      });
    return { orderId: result.id };
  });
}
