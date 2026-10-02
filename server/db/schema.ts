import { pgTable, text, timestamp, boolean, integer, jsonb, bigserial, index } from 'drizzle-orm/pg-core';
import type { CommerceState, Customer, Invoice } from '../../lib/commerce';
import type { OrderCase } from '../../lib/operations';
export const users = pgTable('staff_users', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  phone: text('phone'), role: text('role').notNull(), department: text('department').notNull().default(''),
  passwordHash: text('password_hash').notNull(), active: boolean('active').notNull().default(true),
  lastLogin: timestamp('last_login', {withTimezone:true}),
  createdAt: timestamp('created_at', {withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone:true}).notNull().defaultNow(),
});
export const sessions = pgTable('staff_sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(()=>users.id),
  expiresAt: timestamp('expires_at', {withTimezone:true}).notNull(), createdAt: timestamp('created_at', {withTimezone:true}).notNull().defaultNow(),
});
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull(), resetAt: timestamp('reset_at', {withTimezone:true}).notNull(),
});
export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(), userId:text('user_id').notNull().references(()=>users.id),
  expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(), usedAt:timestamp('used_at',{withTimezone:true}),
});
// The versioned workflow document retains every existing preview concept. Relational
// projections below are written in the SAME transaction for reporting and references.
export const workspaces = pgTable('commerce_workspaces', {
  id:text('id').primaryKey(), version:integer('version').notNull().default(1),
  data:jsonb('data').$type<CommerceState>().notNull(), updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
});
export const customers = pgTable('customers', {
  id:text('id').primaryKey(), name:text('name').notNull(), email:text('email').notNull(), phone:text('phone').notNull(),
  postcode:text('postcode').notNull(), data:jsonb('data').$type<Customer>().notNull(),
}, t=>[index('customer_name_idx').on(t.name),index('customer_email_idx').on(t.email),index('customer_phone_idx').on(t.phone),index('customer_postcode_idx').on(t.postcode)]);
export const orders = pgTable('sales_orders', {
  id:text('id').primaryKey(), customerId:text('customer_id').references(()=>customers.id),
  channel:text('channel').notNull(), status:text('status').notNull(), data:jsonb('data').$type<OrderCase>().notNull(),
});
export const invoices = pgTable('invoices', {
  id:text('id').primaryKey(), customerId:text('customer_id').notNull().references(()=>customers.id),
  orderId:text('order_id').references(()=>orders.id), lifecycle:text('lifecycle').notNull(), data:jsonb('data').$type<Invoice>().notNull(),
});
export const payments = pgTable('payments', {
  id:text('id').primaryKey(), invoiceId:text('invoice_id').notNull().references(()=>invoices.id),
  amountPence:integer('amount_pence').notNull(), reference:text('reference').notNull(), method:text('method').notNull(),
  at:timestamp('at',{withTimezone:true}).notNull(),
});
export const auditLogs = pgTable('audit_logs', {
  id:bigserial('id',{mode:'number'}).primaryKey(), userId:text('user_id').references(()=>users.id),
  entity:text('entity').notNull(), entityId:text('entity_id').notNull(), action:text('action').notNull(),
  before:jsonb('before'), after:jsonb('after'), at:timestamp('at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('audit_entity_idx').on(t.entity,t.entityId)]);
export const settings = pgTable('application_settings', {
  key:text('key').primaryKey(), value:jsonb('value').notNull(), updatedBy:text('updated_by').references(()=>users.id),
  updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
});
export const notifications = pgTable('notifications', {
  id:text('id').primaryKey(), recipientId:text('recipient_id').notNull().references(()=>users.id),
  type:text('type').notNull(), entity:text('entity'), entityId:text('entity_id'),
  title:text('title').notNull(), message:text('message').notNull(), readAt:timestamp('read_at',{withTimezone:true}),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), dedupeKey:text('dedupe_key').unique(),
});
export const attachments = pgTable('attachments', {
  id:text('id').primaryKey(), entity:text('entity').notNull(), entityId:text('entity_id').notNull(),
  filename:text('filename').notNull(), mime:text('mime').notNull(), bytes:integer('bytes').notNull(),
  storageKey:text('storage_key').notNull(), uploadedBy:text('uploaded_by').notNull().references(()=>users.id),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
export const jobs = pgTable('background_jobs', {
  id:text('id').primaryKey(), type:text('type').notNull(), payload:jsonb('payload').notNull(),
  runAt:timestamp('run_at',{withTimezone:true}).notNull(), attempts:integer('attempts').notNull().default(0),
  completedAt:timestamp('completed_at',{withTimezone:true}), lastError:text('last_error'),
});
export const requests = pgTable('idempotency_requests', {
  id:text('id').primaryKey(), userId:text('user_id').notNull().references(()=>users.id),
  digest:text('digest').notNull(), result:jsonb('result').notNull(), createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
