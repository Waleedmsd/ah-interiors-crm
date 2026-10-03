import { randomUUID } from 'node:crypto';
import { eq, desc, and, sql } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { database } from './db';
import {
  users,
  sessions,
  auditLogs,
  settings,
  notifications,
  attachments,
  customers,
  orders,
  invoices,
  suppliers,
  products,
  purchaseOrders,
  supplierOrders,
} from './db/schema';
import {
  currentStaff,
  login,
  logout,
  sessionCookie,
  hashPassword,
} from './auth';
import { AppError, authorize, roles, type Staff } from './permissions';
import {
  listRecords,
  saveRecord,
  transitionRecord,
  operationalTables,
} from './services/operational';
import { businessModules, type BusinessModule } from '../lib/business-modules';
import { listStock, moveStock, saveLocation } from './services/inventory';
import {
  listPurchases,
  savePurchase,
  transitionPurchase,
  listSupplierOrders,
  saveSupplierOrder,
  transitionSupplierOrder,
} from './services/purchasing';
import {
  listProducts,
  saveProduct,
  productHistory,
  listSuppliers,
  saveSupplier,
} from './services/catalogue';
import {
  readCommerce,
  mutateCommerce,
  importCommerce,
} from './services/commerce';
import { fileStorage, detectedMime } from './storage/files';
import { dashboardData, reportData, searchRecords } from './services/reporting';
import { getOrderCosts, saveOrderCosts } from './services/order-costs';
import {
  recordChoices,
  documentIndex,
  recordActivity,
  addComment,
} from './services/records';
import {
  shopifyStatus,
  syncShopify,
  importShopifyOrder,
  configureShopify,
} from './integrations/shopify';
import { listDrafts, saveDraft } from './services/communications';
import { businessOptions } from './services/business-options';
import { runJobs } from './jobs';
import {
  acceptFlooring,
  flooringProject,
  listFittings,
  actOnFlooring,
} from './services/flooring';
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}
export function checkOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const expected = process.env.APP_ORIGIN;
  if (!expected)
    throw new AppError(503, 'CONFIGURATION', 'APP_ORIGIN must be configured.');
  if (request.headers.get('origin') !== expected)
    throw new AppError(403, 'ORIGIN', 'Request origin is not allowed.');
}
async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new AppError(413, 'TOO_LARGE', 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AppError(413, 'TOO_LARGE', 'Request is too large.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError(415, 'CONTENT_TYPE', 'JSON is required.');
  try {
    return JSON.parse(
      Buffer.from(await boundedBody(request, 2000000)).toString(),
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(422, 'VALIDATION', 'Invalid JSON.');
  }
}
async function attachmentAccess(
  staff: Staff,
  entity: string,
  entityId: string,
  write = false,
) {
  if (entity === 'flooring-fitting') {
    const project = await flooringProject(staff, entityId);
    if (!project)
      throw new AppError(404, 'NOT_FOUND', 'Fitting job not found.');
    if (write && project.status === 'Completed')
      throw new AppError(
        422,
        'LOCKED',
        'Completed fitting evidence is locked.',
      );
    return;
  }
  if (entity in businessModules) {
    const rows = await listRecords(staff, entity as BusinessModule);
    if (!rows.some((v) => v.id === entityId))
      throw new AppError(404, 'NOT_FOUND', 'Linked job not found.');
    if (
      write &&
      !businessModules[entity as BusinessModule].writeRoles.includes(
        staff.role,
      ) &&
      !['Delivery', 'Installer'].includes(staff.role)
    )
      throw new AppError(403, 'FORBIDDEN', 'Attachment upload is restricted.');
    return;
  }
  if (entity === 'purchase-order' || entity === 'supplier-order') {
    authorize(staff, 'approvals.write');
    const found =
      entity === 'purchase-order'
        ? await database()
            .select()
            .from(purchaseOrders)
            .where(eq(purchaseOrders.id, entityId))
        : await database()
            .select()
            .from(supplierOrders)
            .where(eq(supplierOrders.id, entityId));
    if (!found.length)
      throw new AppError(404, 'NOT_FOUND', 'Linked purchase not found.');
    return;
  }
  authorize(
    staff,
    write
      ? entity === 'customer'
        ? 'customers.write'
        : entity === 'invoice'
          ? 'invoices.write'
          : 'orders.write'
      : 'commerce.read',
  );
  const db = database();
  const found =
    entity === 'customer'
      ? await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.id, entityId))
      : entity === 'order'
        ? await db
            .select({ id: orders.id })
            .from(orders)
            .where(eq(orders.id, entityId))
        : entity === 'invoice'
          ? await db
              .select({ id: invoices.id })
              .from(invoices)
              .where(eq(invoices.id, entityId))
          : [];
  if (!found.length)
    throw new AppError(404, 'NOT_FOUND', 'Linked record was not found.');
}
export async function handleApi(request: Request): Promise<Response> {
  try {
    checkOrigin(request);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, '');
    const method = request.method;
    const db = database();
    if (path === 'health' && method === 'GET') {
      await db.execute(sql`select 1`);
      return json({ status: 'ok' });
    }
    if (path === 'auth/login' && method === 'POST') {
      const input = z
        .object({
          email: z.email().max(254),
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(await body(request));
      const result = await login(input.email, input.password);
      return json({ user: result.user }, 200, {
        'Set-Cookie': sessionCookie(result.token),
      });
    }
    if (path === 'auth/logout' && method === 'POST') {
      await logout(request);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }
    const staff = await currentStaff(request);
    if (path === 'auth/me' && method === 'GET') return json({ user: staff });
    if (path === 'flooring/fittings' && method === 'GET')
      return json(await listFittings(staff));
    if (/^flooring\/[^/]+\/accept$/.test(path) && method === 'POST')
      return json(
        await acceptFlooring(staff, path.split('/')[1], await body(request)),
      );
    if (/^flooring\/[^/]+\/fulfilment$/.test(path)) {
      if (method === 'GET')
        return json(await flooringProject(staff, path.split('/')[1]));
      if (method === 'POST')
        return json(
          await actOnFlooring(staff, path.split('/')[1], await body(request)),
        );
    }
    if (path === 'integrations/shopify/configure' && method === 'POST')
      return json(await configureShopify(staff, await body(request)));
    if (path === 'integrations/shopify' && method === 'GET')
      return json(await shopifyStatus(staff));
    if (path === 'integrations/shopify/sync' && method === 'POST')
      return json(await syncShopify(staff));
    if (
      /^integrations\/shopify\/orders\/[^/]+$/.test(path) &&
      method === 'POST'
    )
      return json(
        await importShopifyOrder(
          staff,
          path.split('/')[3],
          await body(request),
        ),
      );
    if (path === 'records/choices' && method === 'GET')
      return json(await recordChoices(staff));
    if (path === 'communication-drafts' && method === 'GET')
      return json(await listDrafts(staff));
    if (path === 'communication-drafts' && method === 'POST')
      return json(await saveDraft(staff, await body(request)), 201);
    if (/^communication-drafts\/[^/]+$/.test(path) && method === 'PUT')
      return json(
        await saveDraft(staff, await body(request), path.split('/')[1]),
      );
    if (path === 'documents' && method === 'GET')
      return json(await documentIndex(staff));
    if (path === 'activity') {
      const entity = url.searchParams.get('entity') ?? '';
      const id = url.searchParams.get('entityId') ?? '';
      if (method === 'GET')
        return json(await recordActivity(staff, entity, id));
      if (method === 'POST')
        return json(await addComment(staff, entity, id, await body(request)));
    }
    if (path === 'business-options' && method === 'GET')
      return json(await businessOptions());
    if (path === 'dashboard' && method === 'GET')
      return json(await dashboardData(staff));
    if (path === 'reports' && method === 'GET')
      return json(await reportData(staff));
    if (path === 'search' && method === 'GET')
      return json(await searchRecords(staff, url.searchParams.get('q') ?? ''));
    if (/^orders\/[^/]+\/costs$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[1]);
      if (method === 'GET') return json(await getOrderCosts(staff, id));
      if (method === 'PUT')
        return json(await saveOrderCosts(staff, id, await body(request)));
    }
    if (path === 'commerce' && method === 'GET')
      return json(await readCommerce(staff));
    if (path === 'commerce' && method === 'POST')
      return json(await mutateCommerce(staff, await body(request)));
    if (path === 'commerce/import' && method === 'POST')
      return json(await importCommerce(staff, await body(request)));
    if (path.startsWith('operations/')) {
      const [, module, id] = path.split('/');
      if (!(module in businessModules))
        throw new AppError(404, 'NOT_FOUND', 'Business module not found.');
      const typed = module as BusinessModule;
      if (!id && method === 'GET') return json(await listRecords(staff, typed));
      if (!id && method === 'POST')
        return json(await saveRecord(staff, typed, await body(request)), 201);
      if (id && method === 'PUT')
        return json(await saveRecord(staff, typed, await body(request), id));
      if (id && method === 'PATCH')
        return json(
          await transitionRecord(staff, typed, id, await body(request)),
        );
    }
    if (path === 'inventory/orders' && method === 'GET') {
      authorize(staff, 'inventory.write');
      return json(
        (
          await db.select({ id: orders.id, data: orders.data }).from(orders)
        ).map((v) => ({
          id: v.id,
          name: '#' + v.id,
          groups: v.data.groups.map((g) => ({
            id: g.id,
            name: g.supplier + ' · ' + g.route,
          })),
        })),
      );
    }
    if (path === 'inventory/purchases' && method === 'GET') {
      authorize(staff, 'inventory.write');
      const rows = await db
        .select({
          id: purchaseOrders.id,
          name: purchaseOrders.number,
          status: purchaseOrders.status,
        })
        .from(purchaseOrders);
      return json(
        rows.filter((v) =>
          ['Confirmed', 'Partially Received'].includes(v.status),
        ),
      );
    }
    if (path === 'inventory' && method === 'GET')
      return json(await listStock(staff));
    if (path === 'inventory/movements' && method === 'POST')
      return json(await moveStock(staff, await body(request)), 201);
    if (path === 'inventory/locations' && method === 'POST')
      return json(await saveLocation(staff, await body(request)), 201);
    if (path === 'lookups' && method === 'GET') {
      const financial = [
        'Management',
        'Team Lead',
        'Accounts',
        'Customer Service & Sales',
      ].includes(staff.role);
      const operational = [
        'Management',
        'Team Lead',
        'Customer Service & Sales',
        'Shopify Store Manager',
        'Warehouse',
      ].includes(staff.role);
      const customerRows = financial
        ? await db
            .select({ id: customers.id, name: customers.name })
            .from(customers)
        : [];
      const orderRows = financial
        ? await db.select({ id: orders.id, data: orders.data }).from(orders)
        : [];
      return json({
        ...(await businessOptions()),
        customers: customerRows,
        orders: orderRows.map((v) => ({
          id: v.id,
          name: '#' + v.id + ' · ' + v.data.customer,
          customerId: v.data.customerId,
          address: v.data.address,
          postcode: v.data.postcode,
          phone: v.data.phone,
          groups: v.data.groups.map((g) => ({
            id: g.id,
            name: g.supplier + ' · ' + g.route,
          })),
        })),
        suppliers: operational
          ? await db
              .select({ id: suppliers.id, name: suppliers.name })
              .from(suppliers)
          : [],
        products: operational
          ? await db
              .select({
                id: products.id,
                name: products.name,
                unit: sql<string>`coalesce(${products.details}->>'stockUnit', 'Each')`,
                sellingPricePence: products.sellingPricePence,
              })
              .from(products)
          : [],
        staff: ['Management', 'Team Lead', 'Customer Service & Sales'].includes(
          staff.role,
        )
          ? await db
              .select({ id: users.id, name: users.name, role: users.role })
              .from(users)
              .where(eq(users.active, true))
          : [{ id: staff.id, name: staff.name, role: staff.role }],
      });
    }
    if (path === 'purchase-orders' && method === 'GET')
      return json(await listPurchases(staff));
    if (path === 'purchase-orders' && method === 'POST')
      return json(await savePurchase(staff, await body(request)), 201);
    if (/^purchase-orders\/[^/]+$/.test(path) && method === 'PUT')
      return json(
        await savePurchase(staff, await body(request), path.split('/')[1]),
      );
    if (/^purchase-orders\/[^/]+$/.test(path) && method === 'PATCH')
      return json(
        await transitionPurchase(
          staff,
          path.split('/')[1],
          await body(request),
        ),
      );
    if (path === 'supplier-orders' && method === 'GET')
      return json(await listSupplierOrders(staff));
    if (path === 'supplier-orders' && method === 'POST')
      return json(await saveSupplierOrder(staff, await body(request)), 201);
    if (/^supplier-orders\/[^/]+$/.test(path) && method === 'PUT')
      return json(
        await saveSupplierOrder(staff, await body(request), path.split('/')[1]),
      );
    if (/^supplier-orders\/[^/]+$/.test(path) && method === 'PATCH')
      return json(
        await transitionSupplierOrder(
          staff,
          path.split('/')[1],
          await body(request),
        ),
      );
    if (path === 'products' && method === 'GET')
      return json(await listProducts(staff));
    if (path === 'products' && method === 'POST')
      return json(await saveProduct(staff, await body(request)), 201);
    if (/^products\/[^/]+\/history$/.test(path) && method === 'GET')
      return json(await productHistory(staff, path.split('/')[1]));
    if (/^products\/[^/]+$/.test(path) && method === 'PUT')
      return json(
        await saveProduct(staff, await body(request), path.split('/')[1]),
      );
    if (path === 'suppliers' && method === 'GET')
      return json(await listSuppliers(staff));
    if (path === 'suppliers' && method === 'POST')
      return json(await saveSupplier(staff, await body(request)), 201);
    if (/^suppliers\/[^/]+$/.test(path) && method === 'PUT')
      return json(
        await saveSupplier(staff, await body(request), path.split('/')[1]),
      );
    if (path === 'users' && method === 'GET') {
      authorize(staff, 'users.write');
      return json(
        await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            role: users.role,
            department: users.department,
            active: users.active,
            lastLogin: users.lastLogin,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          })
          .from(users),
      );
    }
    if (path === 'users' && method === 'POST') {
      authorize(staff, 'users.write');
      const input = z
        .object({
          name: z.string().trim().min(1).max(200),
          email: z.email().max(254),
          phone: z.string().max(50).optional(),
          role: z.enum(roles),
          department: z.string().max(100),
          password: z.string().min(12).max(128),
        })
        .strict()
        .parse(await body(request));
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          ...input,
          id,
          email: input.email.toLowerCase(),
          passwordHash: await hashPassword(input.password),
        });
        await tx.insert(auditLogs).values({
          userId: staff.id,
          entity: 'user',
          entityId: id,
          action: 'created',
          after: { name: input.name, role: input.role },
        });
      });
      return json({ id }, 201);
    }
    if (path.startsWith('users/') && method === 'PATCH') {
      authorize(staff, 'users.write');
      const id = path.slice(6);
      const patch = z
        .object({
          active: z.boolean().optional(),
          role: z.enum(roles).optional(),
          name: z.string().trim().min(1).max(200).optional(),
          department: z.string().max(100).optional(),
        })
        .strict()
        .parse(await body(request));
      await db.transaction(async (tx) => {
        // Serialize management changes to prevent simultaneous removal of the last manager.
        await tx.execute(sql`select pg_advisory_xact_lock(10201)`);
        const [prior] = await tx.select().from(users).where(eq(users.id, id));
        if (!prior) throw new AppError(404, 'NOT_FOUND', 'User not found.');
        if (
          id === staff.id &&
          (patch.active === false ||
            (patch.role && patch.role !== 'Management'))
        )
          throw new AppError(
            422,
            'SELF_LOCKOUT',
            'You cannot remove your own management access.',
          );
        if (
          prior.role === 'Management' &&
          prior.active &&
          (patch.active === false ||
            (patch.role && patch.role !== 'Management'))
        ) {
          const managers = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.role, 'Management'), eq(users.active, true)));
          if (managers.length < 2)
            throw new AppError(
              422,
              'LAST_MANAGER',
              'At least one active manager is required.',
            );
        }
        await tx
          .update(users)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(users.id, id));
        await tx.delete(sessions).where(eq(sessions.userId, id));
        await tx.insert(auditLogs).values({
          userId: staff.id,
          entity: 'user',
          entityId: id,
          action: 'updated',
          before: {
            role: prior.role,
            active: prior.active,
            name: prior.name,
          },
          after: patch,
        });
      });
      return json({ ok: true });
    }
    if (path === 'settings' && method === 'GET') {
      authorize(staff, 'commerce.read');
      return json(
        await db
          .select({ key: settings.key, value: settings.value })
          .from(settings)
          .where(eq(settings.key, 'business')),
      );
    }
    if (path === 'settings/business' && method === 'PUT') {
      authorize(staff, 'settings.write');
      const input = z
        .object({
          timeZone: z
            .string()
            .refine((v) => {
              try {
                new Intl.DateTimeFormat('en', { timeZone: v });
                return true;
              } catch {
                return false;
              }
            }, 'Choose a valid IANA time zone.')
            .default('Europe/London'),
          vatBps: z.number().int().min(0).max(10000),
          marginThresholds: z.object({
            excellent: z.number().int().min(0).max(10000),
            strong: z.number().int().min(0).max(10000),
            acceptable: z.number().int().min(0).max(10000),
          }),
          supplierConfirmationDays: z.number().int().min(1).max(365),
          serviceChaseDays: z.number().int().min(1).max(365),
          flooringFollowupDays: z.number().int().min(1).max(365),
          refundApprovalPence: z.number().int().nonnegative(),
          expenseApprovalPence: z.number().int().nonnegative(),
          paymentMethods: z.array(z.string().min(1).max(100)).min(1).max(50),
          branches: z.array(z.string().min(1).max(100)).min(1).max(50),
          locations: z.array(z.string().min(1).max(100)).min(1).max(100),
          salesChannels: z.array(z.string().min(1).max(100)).min(1).max(50),
          expenseCategories: z
            .array(z.string().min(1).max(100))
            .min(1)
            .max(100),
        })
        .strict()
        .refine(
          (v) =>
            v.marginThresholds.excellent >= v.marginThresholds.strong &&
            v.marginThresholds.strong >= v.marginThresholds.acceptable,
        )
        .parse(await body(request));
      await db.transaction(async (tx) => {
        const [prior] = await tx
          .select()
          .from(settings)
          .where(eq(settings.key, 'business'))
          .for('update');
        await tx
          .insert(settings)
          .values({ key: 'business', value: input, updatedBy: staff.id })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: input, updatedBy: staff.id, updatedAt: new Date() },
          });
        await tx.insert(auditLogs).values({
          userId: staff.id,
          entity: 'settings',
          entityId: 'business',
          action: 'updated',
          before: prior?.value,
          after: input,
        });
      });
      return json({ ok: true });
    }
    if (path === 'audit' && method === 'GET') {
      authorize(staff, 'audit.read');
      return json(
        await db
          .select()
          .from(auditLogs)
          .orderBy(desc(auditLogs.at))
          .limit(100),
      );
    }
    if (path === 'notifications' && method === 'GET') {
      await runJobs();
      return json(
        await db
          .select()
          .from(notifications)
          .where(eq(notifications.recipientId, staff.id))
          .orderBy(desc(notifications.createdAt))
          .limit(100),
      );
    }
    if (path.startsWith('notifications/') && method === 'PATCH') {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, path.slice(14)),
            eq(notifications.recipientId, staff.id),
          ),
        );
      return json({ ok: true });
    }
    if (path === 'attachments' && method === 'GET') {
      const entity = url.searchParams.get('entity') ?? '';
      const entityId = url.searchParams.get('entityId') ?? '';
      await attachmentAccess(staff, entity, entityId);
      return json(
        await db
          .select({
            id: attachments.id,
            filename: attachments.filename,
            mime: attachments.mime,
            bytes: attachments.bytes,
            createdAt: attachments.createdAt,
          })
          .from(attachments)
          .where(
            and(
              eq(attachments.entity, entity),
              eq(attachments.entityId, entityId),
            ),
          ),
      );
    }
    if (path === 'attachments' && method === 'POST') {
      const entity = url.searchParams.get('entity') ?? '';
      const entityId = url.searchParams.get('entityId') ?? '';
      await attachmentAccess(staff, entity, entityId, true);
      const filename = z
        .string()
        .min(1)
        .max(200)
        .parse(request.headers.get('x-filename'))
        .replace(/[\r\n\\/]/g, '_');
      const bytes = await boundedBody(request, 10 * 1024 * 1024);
      const mime = detectedMime(bytes);
      if (!mime)
        throw new AppError(
          415,
          'FILE_TYPE',
          'Only PDF, PNG, JPEG and WebP files are accepted.',
        );
      const id = randomUUID();
      const storage = fileStorage();
      await storage.put(id, bytes);
      try {
        await db.transaction(async (tx) => {
          await tx.insert(attachments).values({
            id,
            entity,
            entityId,
            filename,
            mime,
            bytes: bytes.length,
            storageKey: id,
            uploadedBy: staff.id,
          });
          await tx.insert(auditLogs).values({
            userId: staff.id,
            entity,
            entityId,
            action: 'attachment-uploaded',
            after: { attachmentId: id, filename, bytes: bytes.length },
          });
        });
      } catch (error) {
        await storage.remove(id);
        throw error;
      }
      return json({ id }, 201);
    }
    if (path.startsWith('attachments/') && method === 'GET') {
      const [file] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, path.slice(12)));
      if (!file) throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
      await attachmentAccess(staff, file.entity, file.entityId);
      const bytes = await fileStorage().get(file.storageKey);
      return new Response(bytes as BodyInit, {
        headers: {
          'Content-Type': file.mime,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    throw new AppError(404, 'NOT_FOUND', 'Endpoint not found.');
  } catch (error) {
    if (error instanceof AppError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    if (error instanceof ZodError)
      return json(
        {
          error: {
            code: 'VALIDATION',
            message: 'Please check the submitted values.',
            fields: error.issues.map((v) => ({
              path: v.path.join('.'),
              message: v.message,
            })),
          },
        },
        422,
      );
    if ((error as { code?: string }).code === '23505')
      return json(
        {
          error: {
            code: 'DUPLICATE',
            message: 'A record with this reference already exists.',
          },
        },
        409,
      );
    // Do not log submitted bodies, session tokens, passwords, connection strings or stack traces.
    console.error('CRM API failure', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'The request could not be completed. Please try again.',
        },
      },
      500,
    );
  }
}
