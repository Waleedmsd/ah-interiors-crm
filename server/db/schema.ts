import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  bigserial,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { CommerceState, Customer, Invoice } from '../../lib/commerce';
import type { OrderCase } from '../../lib/operations';
export const users = pgTable('staff_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  role: text('role').notNull(),
  department: text('department').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  lastLogin: timestamp('last_login', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const sessions = pgTable('staff_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  attempts: integer('attempts').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});
export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});
// The versioned workflow document retains every existing preview concept. Relational
// projections below are written in the SAME transaction for reporting and references.
export const workspaces = pgTable('commerce_workspaces', {
  id: text('id').primaryKey(),
  version: integer('version').notNull().default(1),
  data: jsonb('data').$type<CommerceState>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const customers = pgTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    postcode: text('postcode').notNull(),
    data: jsonb('data').$type<Customer>().notNull(),
  },
  (t) => [
    index('customer_name_idx').on(t.name),
    index('customer_email_idx').on(t.email),
    index('customer_phone_idx').on(t.phone),
    index('customer_postcode_idx').on(t.postcode),
  ],
);
export const orders = pgTable('sales_orders', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id),
  channel: text('channel').notNull(),
  status: text('status').notNull(),
  data: jsonb('data').$type<OrderCase>().notNull(),
});
export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  orderId: text('order_id').references(() => orders.id),
  lifecycle: text('lifecycle').notNull(),
  data: jsonb('data').$type<Invoice>().notNull(),
});
export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id')
    .notNull()
    .references(() => invoices.id),
  amountPence: integer('amount_pence').notNull(),
  reference: text('reference').notNull(),
  method: text('method').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull(),
});
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id').references(() => users.id),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_entity_idx').on(t.entity, t.entityId)],
);
export const settings = pgTable('application_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id')
    .notNull()
    .references(() => users.id),
  type: text('type').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  dedupeKey: text('dedupe_key').unique(),
});
export const attachments = pgTable('attachments', {
  id: text('id').primaryKey(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  storageKey: text('storage_key').notNull(),
  uploadedBy: text('uploaded_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const jobs = pgTable('background_jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  runAt: timestamp('run_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  lastError: text('last_error'),
});
export const requests = pgTable('idempotency_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  digest: text('digest').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  active: boolean('active').notNull().default(true),
  details: jsonb('details').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sku: text('sku').notNull().unique(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    supplierSku: text('supplier_sku').notNull(),
    category: text('category').notNull(),
    status: text('status').notNull().default('Active'),
    supplierCostPence: integer('supplier_cost_pence').notNull(),
    sellingPricePence: integer('selling_price_pence').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('products_name_idx').on(t.name),
    index('products_supplier_sku_idx').on(t.supplierSku),
  ],
);
export const priceHistory = pgTable('product_price_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  supplierCostPence: integer('supplier_cost_pence').notNull(),
  sellingPricePence: integer('selling_price_pence').notNull(),
  previousSupplierCostPence: integer('previous_supplier_cost_pence'),
  previousSellingPricePence: integer('previous_selling_price_pence'),
  changedBy: text('changed_by')
    .notNull()
    .references(() => users.id),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: text('id').primaryKey(),
  number: text('number').notNull().unique(),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  orderId: text('order_id').references(() => orders.id),
  customerId: text('customer_id').references(() => customers.id),
  buyerId: text('buyer_id')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull().default('Draft'),
  date: text('date').notNull(),
  expectedDate: text('expected_date'),
  currency: text('currency').notNull().default('GBP'),
  accountReference: text('account_reference').notNull().default(''),
  notes: text('notes').notNull().default(''),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const purchaseItems = pgTable('purchase_order_items', {
  id: text('id').primaryKey(),
  purchaseOrderId: text('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  supplierSku: text('supplier_sku').notNull(),
  description: text('description').notNull(),
  active: boolean('active').notNull().default(true),
  quantity: numeric('quantity', {
    precision: 14,
    scale: 3,
    mode: 'number',
  }).notNull(),
  unitCostPence: integer('unit_cost_pence').notNull(),
  receivedQuantity: numeric('received_quantity', {
    precision: 14,
    scale: 3,
    mode: 'number',
  })
    .notNull()
    .default(0),
  customerId: text('customer_id').references(() => customers.id),
});
export const supplierOrders = pgTable('supplier_orders', {
  id: text('id').primaryKey(),
  number: text('number').notNull().unique(),
  supplierId: text('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  purchaseOrderId: text('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id),
  orderId: text('order_id').references(() => orders.id),
  customerId: text('customer_id').references(() => customers.id),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull().default('Needs Ordering'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stockLocations = pgTable('stock_locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  type: text('type').notNull(),
  active: boolean('active').notNull().default(true),
});
export const stockBalances = pgTable(
  'stock_balances',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    locationId: text('location_id')
      .notNull()
      .references(() => stockLocations.id),
    physical: numeric('physical', { precision: 14, scale: 3, mode: 'number' })
      .notNull()
      .default(0),
    reserved: numeric('reserved', { precision: 14, scale: 3, mode: 'number' })
      .notNull()
      .default(0),
    display: numeric('display', { precision: 14, scale: 3, mode: 'number' })
      .notNull()
      .default(0),
  },
  (t) => [
    uniqueIndex('stock_product_location_unique').on(t.productId, t.locationId),
    check(
      'stock_balances_valid',
      sql`${t.physical} >= 0 AND ${t.reserved} >= 0 AND ${t.display} >= 0 AND ${t.reserved} + ${t.display} <= ${t.physical}`,
    ),
  ],
);
export const stockReservations = pgTable('stock_reservations', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  locationId: text('location_id')
    .notNull()
    .references(() => stockLocations.id),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  groupId: text('group_id'),
  quantity: numeric('quantity', {
    precision: 14,
    scale: 3,
    mode: 'number',
  }).notNull(),
  status: text('status').notNull().default('Active'),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const stockMovements = pgTable('stock_movements', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  locationId: text('location_id')
    .notNull()
    .references(() => stockLocations.id),
  targetLocationId: text('target_location_id').references(
    () => stockLocations.id,
  ),
  orderId: text('order_id').references(() => orders.id),
  purchaseOrderId: text('purchase_order_id').references(
    () => purchaseOrders.id,
  ),
  quantity: numeric('quantity', {
    precision: 14,
    scale: 3,
    mode: 'number',
  }).notNull(),
  reason: text('reason').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  before: jsonb('before').notNull(),
  after: jsonb('after').notNull(),
  requestId: text('request_id').notNull().unique(),
  requestDigest: text('request_digest').notNull(),
});

// Domain tables share lifecycle columns while keeping distinct relations and histories.
const operationalTable = (name: string) =>
  pgTable(name, {
    id: text('id').primaryKey(),
    number: text('number').notNull().unique(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    customerId: text('customer_id').references(() => customers.id),
    orderId: text('order_id').references(() => orders.id),
    supplierId: text('supplier_id').references(() => suppliers.id),
    productId: text('product_id').references(() => products.id),
    assignedUserId: text('assigned_user_id').references(() => users.id),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  });
export const deliveryJobs = operationalTable('delivery_jobs');
export const assemblyJobs = operationalTable('assembly_jobs');
export const flooringLeads = operationalTable('flooring_leads');
export const serviceCases = operationalTable('customer_service_cases');
export const centralTasks = operationalTable('central_tasks');
export const expenses = operationalTable('business_expenses');
export const approvals = operationalTable('management_approvals');

export const orderCostSheets = pgTable('order_cost_sheets', {
  orderId: text('order_id')
    .primaryKey()
    .references(() => orders.id),
  costs: jsonb('costs')
    .$type<import('../../lib/margin').VariableCosts>()
    .notNull(),
  notes: text('notes').notNull().default(''),
  reviewed: boolean('reviewed').notNull().default(false),
  version: integer('version').notNull().default(1),
  updatedBy: text('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const ecommerceImports = pgTable(
  'ecommerce_imports',
  {
    id: text('id').primaryKey(),
    shop: text('shop').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('Needs review'),
    payload: jsonb('payload').notNull(),
    orderId: text('order_id').references(() => orders.id),
    error: text('error'),
    externalUpdatedAt: text('external_updated_at').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('ecommerce_shop_order_unique').on(t.shop, t.externalId)],
);

export const communicationDrafts = pgTable('communication_drafts', {
  id: text('id').primaryKey(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  to: text('recipient').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  version: integer('version').notNull().default(1),
  updatedBy: text('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const flooringFulfilments = pgTable(
  'flooring_fulfilments',
  {
    leadId: text('lead_id')
      .primaryKey()
      .references(() => flooringLeads.id),
    orderId: text('order_id')
      .notNull()
      .unique()
      .references(() => orders.id),
    snapshot: jsonb('snapshot')
      .$type<import('../../lib/flooring-workflow').FlooringSnapshot>()
      .notNull(),
    status: text('status').notNull().default('Awaiting Materials'),
    fitterId: text('fitter_id').references(() => users.id),
    scheduledDate: text('scheduled_date').notNull().default(''),
    timeSlot: text('time_slot').notNull().default(''),
    customerConfirmed: boolean('customer_confirmed').notNull().default(false),
    signoff: text('signoff').notNull().default(''),
    notes: text('notes').notNull().default(''),
    caseId: text('case_id').references(() => serviceCases.id),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('flooring_fitter_schedule_idx').on(t.fitterId, t.scheduledDate),
  ],
);
