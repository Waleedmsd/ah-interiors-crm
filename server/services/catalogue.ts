import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { database } from '../db';
import {
  suppliers,
  products,
  priceHistory,
  auditLogs,
  settings,
  purchaseItems,
  stockBalances,
} from '../db/schema';
import { authorize, hasPermission, AppError, type Staff } from '../permissions';
import {
  calculateMargin,
  type MarginThresholds,
  emptyCosts,
} from '../../lib/margin';
import { stockUnits, stockUnit } from '../../lib/stock-units';
const text = z.string().trim().max(10000);
const money = z.number().int().min(0).max(1000000000);
export const supplierInput = z
  .object({
    name: text.min(1).max(200),
    code: text.min(1).max(50),
    active: z.boolean(),
    details: z
      .object({
        brands: text.max(1000),
        contact: text.max(200),
        email: z.union([z.email(), z.literal('')]),
        phone: text.max(50),
        address: text.max(1000),
        accountReference: text.max(100),
        paymentTerms: text.max(200),
        leadTimeDays: z.number().int().min(0).max(3650),
        deliveryTerms: text.max(1000),
        collectionRequired: z.boolean(),
        notes: text,
      })
      .strict(),
  })
  .strict();
const costs = z
  .object({
    inboundFreightPence: money,
    deliveryPence: money,
    assemblyPence: money,
    paymentFeePence: money,
    financeFeePence: money,
    marketplaceFeePence: money,
    marketingPence: money,
    otherPence: money,
  })
  .strict();
export const productInput = z
  .object({
    version: z.number().int().positive().optional(),
    name: text.min(1).max(200),
    sku: text.min(1).max(100),
    supplierId: z.string().min(1),
    supplierSku: text.max(100),
    category: text.min(1).max(100),
    status: z.enum(['Active', 'Inactive', 'Discontinued']),
    supplierCostPence: money,
    sellingPricePence: money,
    details: z
      .object({
        stockUnit: z.enum(stockUnits).default('Each'),
        brand: text.max(100),
        subcategory: text.max(100),
        article: text.max(200),
        barcode: text.max(100),
        notes: text,
        websiteUrl: z.union([z.url(), z.literal('')]),
        shopifyProductId: text.max(100),
        shopifyVariantId: text.max(100),
        ebayListingId: text.max(100),
        websiteStatus: z.enum(['Draft', 'Published', 'Hidden']),
        widthMm: z.number().nonnegative().max(100000),
        heightMm: z.number().nonnegative().max(100000),
        depthMm: z.number().nonnegative().max(100000),
        weightKg: z.number().nonnegative().max(100000),
        packQuantity: z.number().int().min(1).max(10000),
        packDimensions: text.max(1000),
        vatTreatment: z.enum(['Standard', 'Zero rated', 'Exempt']),
        discountPence: money,
        costs,
      })
      .strict(),
  })
  .strict();
export type ProductInput = z.infer<typeof productInput>;
export const canSeeCosts = (staff: Staff) =>
  ['Management', 'Team Lead', 'Accounts'].includes(staff.role);
const merchandisingDetails = productInput.shape.details.omit({
  vatTreatment: true,
  discountPence: true,
  costs: true,
});
const merchandisingInput = productInput
  .omit({ supplierCostPence: true, details: true })
  .extend({ details: merchandisingDetails });
function publicProduct(v: typeof products.$inferSelect) {
  const { supplierCostPence, ...record } = v;
  const { vatTreatment, discountPence, costs, ...details } = v.details;
  return { ...record, details };
}

export async function marginSettings() {
  const [row] = await database()
    .select()
    .from(settings)
    .where(eq(settings.key, 'business'));
  if (!row)
    throw new AppError(
      503,
      'SETTINGS_REQUIRED',
      'Business settings are not initialized.',
    );
  return row.value as { vatBps: number; marginThresholds: MarginThresholds };
}
export async function listSuppliers(staff: Staff) {
  if (
    !hasPermission(staff, 'catalogue.write') &&
    !hasPermission(staff, 'orders.write') &&
    !hasPermission(staff, 'inventory.write')
  )
    throw new AppError(403, 'FORBIDDEN', 'Supplier access is restricted.');
  return database().select().from(suppliers).orderBy(suppliers.name);
}
export async function saveSupplier(staff: Staff, input: unknown, id?: string) {
  authorize(staff, 'catalogue.write');
  const data = supplierInput.parse(input);
  const recordId = id ?? randomUUID();
  return database().transaction(async (tx) => {
    const [prior] = await tx
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, recordId))
      .for('update');
    if (id && !prior)
      throw new AppError(404, 'NOT_FOUND', 'Supplier not found.');
    const [record] = await tx
      .insert(suppliers)
      .values({ ...data, id: recordId })
      .onConflictDoUpdate({
        target: suppliers.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity: 'supplier',
        entityId: recordId,
        action: prior ? 'updated' : 'created',
        before: prior,
        after: record,
      });
    return record;
  });
}
export async function listProducts(staff: Staff) {
  if (
    !hasPermission(staff, 'catalogue.write') &&
    !hasPermission(staff, 'orders.write') &&
    !hasPermission(staff, 'inventory.write') &&
    staff.role !== 'Accounts'
  )
    throw new AppError(403, 'FORBIDDEN', 'Product access is restricted.');
  const rows = await database().select().from(products).orderBy(products.name);
  if (staff.role === 'Warehouse')
    return rows.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      supplierId: v.supplierId,
      supplierSku: v.supplierSku,
      category: v.category,
      status: v.status,
      details: {
        stockUnit: stockUnit(v.details),
        packQuantity: v.details.packQuantity,
        packDimensions: v.details.packDimensions,
      },
    }));
  if (!canSeeCosts(staff)) return rows.map(publicProduct);
  const rules = await marginSettings();
  return rows.map((v) => ({
    ...v,
    profitability: calculateMargin(
      {
        revenuePence: v.sellingPricePence,
        supplierCostPence: v.supplierCostPence,
        discountPence: Number(v.details.discountPence),
        vatBps: rules.vatBps,
        vatTreatment: v.details.vatTreatment as 'Standard',
        costs: v.details.costs as typeof emptyCosts,
      },
      rules.marginThresholds,
    ),
  }));
}
export async function saveProduct(staff: Staff, input: unknown, id?: string) {
  authorize(staff, 'catalogue.write');
  const financial = canSeeCosts(staff);
  if (!financial && !id)
    throw new AppError(
      403,
      'PRICING_SETUP',
      'A manager must create the product and verify its pricing before merchandising edits.',
    );
  const parsed = financial
    ? productInput.parse(input)
    : merchandisingInput.parse(input);
  const { version, ...submitted } = parsed;
  const recordId = id ?? randomUUID();
  return database().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(products)
      .where(eq(products.id, recordId))
      .for('update');
    const data = financial
      ? (submitted as ProductInput)
      : ({
          ...submitted,
          supplierCostPence: existing?.supplierCostPence ?? 0,
          details: {
            ...submitted.details,
            vatTreatment: existing?.details.vatTreatment,
            discountPence: existing?.details.discountPence,
            costs: existing?.details.costs,
          },
        } as ProductInput);
    if (existing && stockUnit(existing.details) !== stockUnit(data.details)) {
      const [stock] = await tx
        .select()
        .from(stockBalances)
        .where(eq(stockBalances.productId, recordId));
      const [purchase] = await tx
        .select()
        .from(purchaseItems)
        .where(eq(purchaseItems.productId, recordId));
      if (stock || purchase)
        throw new AppError(
          422,
          'UNIT_LOCKED',
          'The stock unit cannot change after stock or purchase activity. Create a separate product for a different unit.',
        );
    }
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, data.supplierId));
    if (!supplier || !supplier.active)
      throw new AppError(
        422,
        'SUPPLIER_REQUIRED',
        'Choose an active supplier.',
      );
    const [prior] = await tx
      .select()
      .from(products)
      .where(eq(products.id, recordId))
      .for('update');
    if (id && !prior)
      throw new AppError(404, 'NOT_FOUND', 'Product not found.');
    if (prior && version !== prior.version)
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'Product changed. Reload before saving.',
      );
    const [record] = await tx
      .insert(products)
      .values({ ...data, id: recordId })
      .onConflictDoUpdate({
        target: products.id,
        set: {
          ...data,
          version: (prior?.version ?? 0) + 1,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (
      !prior ||
      prior.supplierCostPence !== data.supplierCostPence ||
      prior.sellingPricePence !== data.sellingPricePence
    )
      await tx
        .insert(priceHistory)
        .values({
          productId: recordId,
          supplierCostPence: data.supplierCostPence,
          sellingPricePence: data.sellingPricePence,
          previousSupplierCostPence: prior?.supplierCostPence,
          previousSellingPricePence: prior?.sellingPricePence,
          changedBy: staff.id,
        });
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity: 'product',
        entityId: recordId,
        action: prior ? 'updated' : 'created',
        before: prior,
        after: record,
      });
    return financial ? record : publicProduct(record);
  });
}
export async function productHistory(staff: Staff, id: string) {
  authorize(staff, 'catalogue.write');
  if (!canSeeCosts(staff))
    throw new AppError(
      403,
      'COST_ACCESS',
      'Price and cost history is restricted to financial staff.',
    );
  return database()
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.productId, id))
    .orderBy(desc(priceHistory.at));
}
