import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { database, closeDatabase } from '../../server/db';
import {
  users,
  sessions,
  auditLogs,
  customers,
  workspaces,
  settings,
  priceHistory,
  products,
  purchaseItems,
  purchaseOrders,
  stockLocations,
  stockBalances,
  stockReservations,
  deliveryJobs,
  assemblyJobs,
  payments,
  ecommerceImports,
  orderCostSheets,
} from '../../server/db/schema';
import { handleApi } from '../../server/api';
import { hashPassword, verifyPassword } from '../../server/auth';
import { blankDetails } from '../../lib/business-modules';
import { emptyCosts } from '../../lib/margin';
import {
  createCommerceState,
  invoiceTotals,
  parseSavedCommerce,
  type CommerceState,
  type CommerceAction,
} from '../../lib/commerce';
import { projectCommerce, workspaceId } from '../../server/services/commerce';
const testFiles = resolve('.runtime', 'test-files', String(process.pid));
const origin = 'http://localhost:3001';
const password = 'Synthetic-test-password-2026';
let managerCookie = '';
let warehouseCookie = '';
let managerId = '';
function request(
  path: string,
  method = 'GET',
  value?: unknown,
  cookie = managerCookie,
  headers: Record<string, string> = {},
) {
  return handleApi(
    new Request(origin + '/api/' + path, {
      method,
      headers: {
        origin,
        ...(value !== undefined ? { 'Content-Type': 'application/json' } : {}),
        cookie,
        ...headers,
      },
      body: value !== undefined ? JSON.stringify(value) : undefined,
    }),
  );
}
before(async () => {
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL required for PostgreSQL integration tests.');
  const source = new URL(process.env.DATABASE_URL);
  source.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: source.toString() });
  await admin.connect();
  const name = 'ah_crm_test_' + process.pid;
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  source.pathname = '/' + name;
  process.env.DATABASE_URL = source.toString();
  process.env.ATTACHMENT_ROOT = testFiles;
  process.env.APP_ORIGIN = origin;
  await migrate(database(), { migrationsFolder: './drizzle' });
  await database()
    .insert(settings)
    .values({
      key: 'business',
      value: {
        vatBps: 2000,
        marginThresholds: { excellent: 3600, strong: 3200, acceptable: 2900 },
        supplierConfirmationDays: 3,
        refundApprovalPence: 5000,
      },
    });
  managerId = randomUUID();
  const hash = await hashPassword(password);
  await database()
    .insert(users)
    .values([
      {
        id: managerId,
        name: 'Test Manager',
        email: 'manager@test.invalid',
        role: 'Management',
        department: 'Management',
        passwordHash: hash,
      },
      {
        id: randomUUID(),
        name: 'Test Warehouse',
        email: 'warehouse@test.invalid',
        role: 'Warehouse',
        department: 'Warehouse',
        passwordHash: hash,
      },
    ]);
  await database().transaction(async (tx) => {
    const data = createCommerceState();
    await projectCommerce(tx, data);
    await tx.insert(workspaces).values({ id: workspaceId, data });
  });
  const manager = await request(
    'auth/login',
    'POST',
    { email: 'manager@test.invalid', password },
    '',
  );
  assert.equal(manager.status, 200);
  managerCookie = manager.headers.get('set-cookie')!.split(';')[0];
  const warehouse = await request(
    'auth/login',
    'POST',
    { email: 'warehouse@test.invalid', password },
    '',
  );
  assert.equal(warehouse.status, 200);
  warehouseCookie = warehouse.headers.get('set-cookie')!.split(';')[0];
});
after(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  await closeDatabase();
  const source = new URL(process.env.DATABASE_URL!);
  source.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: source.toString() });
  await admin.connect();
  if (!/^ah_crm_test_\d+$/.test(name))
    throw new Error('Unsafe test database name');
  await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
  if (
    !testFiles.startsWith(
      resolve('.runtime', 'test-files') + requireSeparator(),
    )
  )
    throw new Error('Unsafe test file path');
  await rm(testFiles, { recursive: true, force: true });
});
function requireSeparator() {
  return process.platform === 'win32' ? '\\' : '/';
}
test('password hashing is salted and verifies without storing plaintext', async () => {
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword('wrong', a), false);
});
test('unauthenticated and forged sessions cannot read commerce', async () => {
  assert.equal((await request('commerce', 'GET', undefined, '')).status, 401);
  assert.equal(
    (await request('commerce', 'GET', undefined, 'ah_session=forged')).status,
    401,
  );
});
test('staff response and secure session attributes exclude password hash', async () => {
  const response = await request('auth/me');
  const payload = (await response.json()) as any;
  assert.equal(payload.user.id, managerId);
  assert.equal(payload.user.passwordHash, undefined);
  const login = await request(
    'auth/login',
    'POST',
    { email: 'manager@test.invalid', password },
    '',
  );
  assert.match(login.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/);
});
test('wrong password, missing origin and cross-origin writes are rejected', async () => {
  assert.equal(
    (
      await request(
        'auth/login',
        'POST',
        { email: 'manager@test.invalid', password: 'wrong' },
        '',
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request('auth/logout', 'POST', undefined, managerCookie, {
        origin: 'https://attacker.invalid',
      })
    ).status,
    403,
  );
});
test('warehouse cannot read ledger, settings, staff or audit records directly', async () => {
  for (const path of ['commerce', 'settings', 'users', 'audit'])
    assert.equal(
      (await request(path, 'GET', undefined, warehouseCookie)).status,
      403,
    );
});
test('server validation rejects malformed writes without mutating records', async () => {
  const before = await database().select().from(customers);
  const response = await request('commerce', 'POST', {
    requestId: randomUUID(),
    version: 1,
    action: {
      type: 'create-customer',
      now: Date.now(),
      customer: {
        name: 'Bad',
        email: 'invalid',
        phone: '',
        address: '',
        city: '',
        postcode: '',
      },
    },
  });
  assert.equal(response.status, 422);
  assert.equal(
    (await database().select().from(customers)).length,
    before.length,
  );
});
test('customer save is persistent, audited, idempotent and survives a new connection', async () => {
  const read = await request('commerce');
  const initial = (await read.json()) as any;
  const payload = {
    requestId: randomUUID(),
    version: initial.version,
    action: {
      type: 'create-customer',
      now: Date.now(),
      customer: {
        name: 'Synthetic Persistence',
        email: 'persistent@test.invalid',
        phone: '07000000000',
        address: 'Test address',
        city: 'Nelson',
        postcode: 'BB9 0AA',
      },
    },
  };
  const response = await request('commerce', 'POST', payload);
  assert.equal(response.status, 200);
  const saved = (await response.json()) as any;
  assert.ok(saved.id);
  const replay = await request('commerce', 'POST', payload);
  assert.equal(replay.status, 200);
  assert.equal(((await replay.json()) as any).id, saved.id);
  assert.equal(
    (
      await database()
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, saved.id))
    ).length,
    1,
  );
  await closeDatabase();
  const [found] = await database()
    .select()
    .from(customers)
    .where(eq(customers.id, saved.id));
  assert.equal(found.name, 'Synthetic Persistence');
  const conflict = await request('commerce', 'POST', {
    ...payload,
    requestId: randomUUID(),
    action: {
      ...payload.action,
      customer: { ...payload.action.customer, email: 'different@test.invalid' },
    },
  });
  assert.equal(conflict.status, 409);
});
test('failed workflow transactions do not leave audit or partial records', async () => {
  const [row] = await database().select().from(workspaces);
  const before = await database().select().from(auditLogs);
  const response = await request('commerce', 'POST', {
    requestId: randomUUID(),
    version: row.version,
    action: {
      type: 'pay-invoice',
      id: 'does-not-exist',
      payment: {
        id: randomUUID(),
        amountPence: 100,
        reference: 'test',
        method: 'Cash',
        at: Date.now(),
      },
    },
  });
  assert.equal(response.status, 422);
  assert.equal(
    (await database().select().from(auditLogs)).length,
    before.length,
  );
});
test('supplier and product CRUD validate relationships, preserve price history and protect costs', async () => {
  const supplier = await request('suppliers', 'POST', {
    name: 'Synthetic supplier',
    code: 'TEST-SUPPLIER',
    active: true,
    details: {
      brands: 'Test',
      contact: 'Test',
      email: '',
      phone: '',
      address: '',
      accountReference: '',
      paymentTerms: '',
      leadTimeDays: 7,
      deliveryTerms: '',
      collectionRequired: false,
      notes: '',
    },
  });
  assert.equal(supplier.status, 201);
  const supplied = (await supplier.json()) as any;
  const data = {
    name: 'Synthetic Wardrobe',
    sku: 'TEST-WARDROBE',
    supplierId: supplied.id,
    supplierSku: 'SW-01',
    category: 'Wardrobes',
    status: 'Active',
    supplierCostPence: 6000,
    sellingPricePence: 12000,
    details: {
      brand: 'Test',
      subcategory: '',
      article: '',
      barcode: '',
      notes: '',
      websiteUrl: '',
      shopifyProductId: '',
      shopifyVariantId: '',
      ebayListingId: '',
      websiteStatus: 'Draft',
      widthMm: 1000,
      heightMm: 2000,
      depthMm: 600,
      weightKg: 50,
      packQuantity: 3,
      packDimensions: '',
      vatTreatment: 'Standard',
      discountPence: 0,
      costs: emptyCosts,
    },
  };
  const invalid = await request('products', 'POST', {
    ...data,
    supplierId: 'missing',
  });
  assert.equal(invalid.status, 422);
  const created = await request('products', 'POST', data);
  assert.equal(created.status, 201);
  const product = (await created.json()) as any;
  const updated = await request('products/' + product.id, 'PUT', {
    ...data,
    version: product.version,
    supplierCostPence: 7000,
  });
  assert.equal(updated.status, 200);
  assert.equal(
    (
      await database()
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.productId, product.id))
    ).length,
    2,
  );
  assert.equal(
    (
      await request('products/' + product.id, 'PUT', {
        ...data,
        version: product.version,
      })
    ).status,
    409,
  );
  const warehouse = await request(
    'products',
    'GET',
    undefined,
    warehouseCookie,
  );
  assert.equal(warehouse.status, 200);
  const rows = (await warehouse.json()) as any[];
  assert.equal(rows[0].supplierCostPence, undefined);
  assert.equal(rows[0].sellingPricePence, undefined);
  assert.equal(
    (await request('products', 'POST', data, warehouseCookie)).status,
    403,
  );
});
test('purchase orders preserve item history and supplier tracking validates confirmation and receiving stages', async () => {
  const [product] = await database().select().from(products);
  const payload = {
    supplierId: product.supplierId,
    orderId: '',
    customerId: '',
    date: '2026-10-02',
    expectedDate: '2026-11-01',
    currency: 'GBP',
    accountReference: 'Test',
    notes: 'Synthetic purchase',
    items: [
      {
        productId: product.id,
        description: 'Test wardrobe',
        quantity: 2,
        unitCostPence: 7000,
        customerId: '',
      },
    ],
  };
  const response = await request('purchase-orders', 'POST', payload);
  assert.equal(response.status, 201);
  let purchase = (await response.json()) as any;
  const changed = await request('purchase-orders/' + purchase.id, 'PUT', {
    ...payload,
    version: purchase.version,
    notes: 'Updated draft',
  });
  assert.equal(changed.status, 200);
  purchase = await changed.json();
  const allItems = await database()
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseOrderId, purchase.id));
  assert.equal(allItems.length, 2);
  assert.equal(allItems.filter((v) => v.active).length, 1);
  assert.equal(
    ((await (await request('purchase-orders')).json()) as any[]).find(
      (v) => v.id === purchase.id,
    ).totalPence,
    14000,
  );
  assert.equal(
    (
      await request('purchase-orders/' + purchase.id, 'PATCH', {
        version: purchase.version,
        status: 'Confirmed',
      })
    ).status,
    422,
  );
  for (const status of [
    'Ready to Send',
    'Sent',
    'Awaiting Confirmation',
    'Confirmed',
  ]) {
    const r = await request('purchase-orders/' + purchase.id, 'PATCH', {
      version: purchase.version,
      status,
    });
    assert.equal(r.status, 200);
    purchase = await r.json();
  }
  assert.equal(
    (
      await request('purchase-orders/' + purchase.id, 'PATCH', {
        version: purchase.version,
        status: 'Partially Received',
      })
    ).status,
    422,
  );
  const details = {
    supplierOrderNumber: 'TEST-SO',
    confirmationNumber: 'CONFIRM-01',
    orderedDate: '2026-01-01',
    confirmationDate: '2026-01-02',
    expectedArrival: '2026-01-30',
    collectionRequired: false,
    collectionCompany: '',
    collectionReference: '',
    collectionDate: '',
    lastContacted: '',
    nextChaseDate: '2026-01-05',
    deliveryBooked: false,
    notes: 'Synthetic tracking',
  };
  const tracking = await request('supplier-orders', 'POST', {
    purchaseOrderId: purchase.id,
    ownerId: managerId,
    details,
  });
  assert.equal(tracking.status, 201);
  let record = (await tracking.json()) as any;
  for (const status of ['Order Sent', 'Awaiting Confirmation', 'Confirmed']) {
    const r = await request('supplier-orders/' + record.id, 'PATCH', {
      version: record.version,
      status,
    });
    assert.equal(r.status, 200);
    record = await r.json();
  }
  const rows = await request('supplier-orders');
  assert.equal(
    ((await rows.json()) as any[]).find((v) => v.id === record.id).flags
      .etaOverdue,
    true,
  );
  assert.equal(
    (await request('purchase-orders', 'GET', undefined, warehouseCookie))
      .status,
    403,
  );
});
test('stock receiving, reservations, delivery, returns and retries remain atomic and auditable', async () => {
  const [product] = await database().select().from(products);
  const [purchase] = await database().select().from(purchaseOrders);
  await database()
    .insert(stockLocations)
    .values([
      { id: 'test-warehouse', name: 'Test warehouse', type: 'Physical' },
      { id: 'test-showroom', name: 'Test showroom', type: 'Physical' },
    ]);
  const movement = {
    requestId: randomUUID(),
    type: 'Goods Received',
    productId: product.id,
    locationId: 'test-warehouse',
    purchaseOrderId: purchase.id,
    quantity: 1,
    reason: 'Synthetic receipt',
  };
  const first = await request(
    'inventory/movements',
    'POST',
    movement,
    warehouseCookie,
  );
  assert.equal(first.status, 201);
  assert.equal(
    (await request('inventory/movements', 'POST', movement, warehouseCookie))
      .status,
    201,
  );
  assert.equal(
    (
      await request(
        'inventory/movements',
        'POST',
        { ...movement, requestId: randomUUID(), quantity: 2 },
        warehouseCookie,
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await request(
        'inventory/movements',
        'POST',
        { ...movement, requestId: randomUUID() },
        warehouseCookie,
      )
    ).status,
    201,
  );
  const [received] = await database()
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, purchase.id));
  assert.equal(received.status, 'Received');
  const initial = await request('commerce');
  const state = (await initial.json()) as any;
  const created = await request('commerce', 'POST', {
    requestId: randomUUID(),
    version: state.version,
    action: {
      type: 'create-order',
      input: {
        requestId: randomUUID(),
        customerId: state.data.customers[0].id,
        channel: 'Shopify',
        sourceRef: 'STOCK-TEST',
        lines: [
          {
            productId: product.id,
            name: product.name,
            supplier: 'Test',
            article: 'Test',
            quantity: 1,
            unitPence: 12000,
            options: '',
            route: 'ProBuild',
          },
        ],
        deliveryPence: 0,
        note: 'Stock test',
        now: Date.now(),
      },
    },
  });
  assert.equal(created.status, 200);
  let ledger = (await created.json()) as any;
  const orderId = ledger.id;
  const invoice = ledger.data.invoices.find((v: any) => v.orderId === orderId);
  const issued = await request('commerce', 'POST', {
    requestId: randomUUID(),
    version: ledger.version,
    action: { type: 'issue-invoice', id: invoice.id, now: Date.now() },
  });
  assert.equal(issued.status, 200);
  ledger = await issued.json();
  const paid = await request('commerce', 'POST', {
    requestId: randomUUID(),
    version: ledger.version,
    action: {
      type: 'pay-invoice',
      id: invoice.id,
      payment: {
        id: randomUUID(),
        amountPence: 12000,
        reference: 'STOCK-PAYMENT',
        method: 'Cash',
        at: Date.now(),
      },
    },
  });
  assert.equal(paid.status, 200);
  const reserve = {
    requestId: randomUUID(),
    type: 'Reservation',
    productId: product.id,
    locationId: 'test-warehouse',
    orderId,
    quantity: 1,
    reason: 'Customer allocation',
  };
  assert.equal(
    (await request('inventory/movements', 'POST', reserve, warehouseCookie))
      .status,
    201,
  );
  assert.equal(
    (
      await request(
        'inventory/movements',
        'POST',
        { ...reserve, requestId: randomUUID() },
        warehouseCookie,
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await request(
        'inventory/movements',
        'POST',
        {
          requestId: randomUUID(),
          type: 'Damage',
          productId: product.id,
          locationId: 'test-warehouse',
          quantity: 2,
          reason: 'Test damage',
        },
        warehouseCookie,
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await request(
        'inventory/movements',
        'POST',
        {
          requestId: randomUUID(),
          type: 'Adjustment',
          productId: product.id,
          locationId: 'test-warehouse',
          quantity: 1,
          reason: 'Test adjustment',
        },
        warehouseCookie,
      )
    ).status,
    403,
  );
  const [reservation] = await database()
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.orderId, orderId));
  const delivered = {
    requestId: randomUUID(),
    type: 'Customer Delivery',
    productId: product.id,
    locationId: 'test-warehouse',
    orderId,
    reservationId: reservation.id,
    quantity: 1,
    reason: 'Proof of delivery',
  };
  assert.equal(
    (await request('inventory/movements', 'POST', delivered, warehouseCookie))
      .status,
    201,
  );
  const returned = {
    ...delivered,
    requestId: randomUUID(),
    type: 'Return',
    reason: 'Customer return',
  };
  assert.equal(
    (await request('inventory/movements', 'POST', returned, warehouseCookie))
      .status,
    201,
  );
  assert.equal(
    (
      await request(
        'inventory/movements',
        'POST',
        { ...returned, requestId: randomUUID() },
        warehouseCookie,
      )
    ).status,
    422,
  );
  const [balance] = await database()
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.productId, product.id));
  assert.equal(balance.physical, 2);
  assert.equal(balance.reserved, 0);
  const audit = await database()
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entity, 'stock-movement'));
  assert.equal(audit.length, 5);
});
test('delivery and assembly enforce assignments, evidence, stock and canonical completion', async () => {
  const driverId = randomUUID(),
    installerId = randomUUID();
  const hash = await hashPassword(password);
  await database()
    .insert(users)
    .values([
      {
        id: driverId,
        name: 'Test Driver',
        email: 'driver@test.invalid',
        role: 'Delivery',
        department: 'Delivery',
        passwordHash: hash,
      },
      {
        id: installerId,
        name: 'Test Installer',
        email: 'installer@test.invalid',
        role: 'Installer',
        department: 'Assembly',
        passwordHash: hash,
      },
    ]);
  const driverLogin = await request(
    'auth/login',
    'POST',
    { email: 'driver@test.invalid', password },
    '',
  );
  const driverCookie = driverLogin.headers.get('set-cookie')!.split(';')[0];
  const installerLogin = await request(
    'auth/login',
    'POST',
    { email: 'installer@test.invalid', password },
    '',
  );
  const installerCookie = installerLogin.headers
    .get('set-cookie')!
    .split(';')[0];
  const [ledger] = await database().select().from(workspaces);
  const order = ledger.data.operations.cases.find(
    (v) => v.sourceRef === 'STOCK-TEST',
  )!;
  const line = order.lines[0];
  const allocation = await request(
    'inventory/movements',
    'POST',
    {
      requestId: randomUUID(),
      type: 'Reservation',
      productId: line.productId,
      locationId: 'test-warehouse',
      orderId: order.id,
      quantity: 1,
      reason: 'Delivery allocation',
    },
    warehouseCookie,
  );
  assert.equal(allocation.status, 201);
  const input = {
    title: 'Synthetic delivery',
    customerId: order.customerId,
    orderId: order.id,
    supplierId: '',
    productId: '',
    assignedUserId: driverId,
    details: {
      ...blankDetails('deliveries'),
      groupId: line.groupId,
      address: order.address,
      postcode: order.postcode,
      phone: order.phone,
      packs: 1,
      scheduledDate: '2026-10-03',
      timeSlot: '09:00–12:00',
      customerConfirmed: true,
      assemblyRequired: true,
    },
  };
  const created = await request('operations/deliveries', 'POST', input);
  assert.equal(created.status, 201);
  let delivery = (await created.json()) as any;
  assert.equal(
    (await request('operations/deliveries', 'POST', input)).status,
    409,
  );
  const assigned = await request(
    'operations/deliveries',
    'GET',
    undefined,
    driverCookie,
  );
  assert.equal(((await assigned.json()) as any[]).length, 1);
  assert.equal(
    (await request('commerce', 'GET', undefined, driverCookie)).status,
    403,
  );
  assert.equal(
    (
      await request(
        'operations/deliveries/' + delivery.id,
        'PUT',
        { ...input, version: delivery.version },
        driverCookie,
      )
    ).status,
    403,
  );
  for (const status of ['Ready to Book', 'Booked', 'Confirmed']) {
    const r = await request('operations/deliveries/' + delivery.id, 'PATCH', {
      version: delivery.version,
      status,
    });
    assert.equal(r.status, 200);
    delivery = await r.json();
  }
  const outbound = await request(
    'operations/deliveries/' + delivery.id,
    'PATCH',
    { version: delivery.version, status: 'Out for Delivery' },
    driverCookie,
  );
  assert.equal(outbound.status, 200);
  delivery = await outbound.json();
  assert.equal(
    (
      await request(
        'operations/deliveries/' + delivery.id,
        'PATCH',
        { version: delivery.version, status: 'Delivered' },
        driverCookie,
      )
    ).status,
    422,
  );
  const done = await request(
    'operations/deliveries/' + delivery.id,
    'PATCH',
    {
      version: delivery.version,
      status: 'Delivered',
      evidence: 'Signed by synthetic recipient',
    },
    driverCookie,
  );
  assert.equal(done.status, 200);
  const [stock] = await database()
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.productId, line.productId!));
  assert.equal(stock.physical, 1);
  assert.equal(stock.reserved, 0);
  const [updated] = await database().select().from(workspaces);
  assert.equal(
    updated.data.operations.cases.find((v) => v.id === order.id)!.groups[0]
      .delivery,
    true,
  );
  const [assembly] = await database()
    .select()
    .from(assemblyJobs)
    .where(eq(assemblyJobs.orderId, order.id));
  assert.ok(assembly);
  const assemblyInput = {
    title: assembly.title,
    customerId: assembly.customerId,
    orderId: assembly.orderId,
    supplierId: '',
    productId: '',
    assignedUserId: installerId,
    details: {
      ...assembly.details,
      scheduledDate: '2026-10-04',
      timeSlot: '09:00–12:00',
    },
  };
  const edited = await request(
    'operations/assembly-jobs/' + assembly.id,
    'PUT',
    { ...assemblyInput, version: assembly.version },
  );
  assert.equal(edited.status, 200);
  let assemblyRecord = (await edited.json()) as any;
  for (const status of ['Booked', 'Confirmed']) {
    const r = await request(
      'operations/assembly-jobs/' + assembly.id,
      'PATCH',
      { version: assemblyRecord.version, status },
    );
    assert.equal(r.status, 200);
    assemblyRecord = await r.json();
  }
  const started = await request(
    'operations/assembly-jobs/' + assembly.id,
    'PATCH',
    { version: assemblyRecord.version, status: 'In Progress' },
    installerCookie,
  );
  assert.equal(started.status, 200);
  assemblyRecord = await started.json();
  const signed = await request(
    'operations/assembly-jobs/' + assembly.id,
    'PATCH',
    {
      version: assemblyRecord.version,
      status: 'Completed',
      evidence: 'Synthetic customer sign-off',
    },
    installerCookie,
  );
  assert.equal(signed.status, 200);
  const [finished] = await database().select().from(workspaces);
  assert.equal(
    finished.data.operations.cases.find((v) => v.id === order.id)!.groups[0]
      .assembly,
    'Complete',
  );
});
test('flooring stores room measurements, quote totals and requires a lost reason', async () => {
  const [ledger] = await database().select().from(workspaces);
  const [product] = await database().select().from(products);
  const details = {
    ...blankDetails('flooring'),
    leadSource: 'Showroom',
    measureDate: '2026-10-05',
    surveyor: 'Synthetic surveyor',
    rooms: [
      {
        name: 'Lounge',
        length: 4,
        width: 3,
        wastePercent: 10,
        stairs: false,
        landing: false,
        underlay: 'Standard',
        accessories: 'Grippers',
        notes: '',
      },
    ],
    quote: {
      lines: [{ productId: product.id, quantity: 13.2, unitPricePence: 2000 }],
      underlayPence: 1000,
      accessoriesPence: 500,
      fittingPence: 5000,
      removalPence: 0,
      deliveryPence: 0,
      discountPence: 0,
      costPence: 10000,
    },
  };
  const response = await request('operations/flooring', 'POST', {
    title: 'Synthetic flooring lead',
    customerId: ledger.data.customers[0].id,
    assignedUserId: managerId,
    details,
  });
  assert.equal(response.status, 201);
  let lead = (await response.json()) as any;
  for (const status of ['Measure Booked', 'Measure Completed', 'Quote']) {
    const r = await request('operations/flooring/' + lead.id, 'PATCH', {
      version: lead.version,
      status,
    });
    assert.equal(r.status, 200);
    lead = await r.json();
  }
  const rows = await request('operations/flooring');
  const saved = ((await rows.json()) as any[])[0];
  assert.equal(saved.rooms[0].area, 12);
  assert.equal(saved.rooms[0].requiredQuantity, 13.2);
  assert.ok(saved.profitability.contributionProfitPence > 0);
  assert.equal(
    (
      await request('operations/flooring/' + lead.id, 'PATCH', {
        version: lead.version,
        status: 'Lost',
      })
    ).status,
    422,
  );
});
test('customer service, tasks and management approvals enforce lifecycle and authority', async () => {
  const [ledger] = await database().select().from(workspaces);
  const customerId = ledger.data.customers[0].id;
  const created = await request('operations/service-cases', 'POST', {
    title: 'Synthetic damage',
    customerId,
    assignedUserId: managerId,
    details: {
      ...blankDetails('service-cases'),
      caseType: 'Damage',
      reportedDate: '2026-10-02',
      description: 'Synthetic damaged pack',
      resolution: 'Replacement supplied',
    },
  });
  assert.equal(created.status, 201);
  let record = (await created.json()) as any;
  for (const status of [
    'Investigating',
    'Ready to Resolve',
    'Resolved',
    'Closed',
  ]) {
    const response = await request(
      'operations/service-cases/' + record.id,
      'PATCH',
      { version: record.version, status },
    );
    assert.equal(response.status, 200);
    record = await response.json();
  }
  assert.equal(
    (
      await request('operations/service-cases/' + record.id, 'PATCH', {
        version: record.version,
        status: 'Investigating',
      })
    ).status,
    422,
  );
  const task = await request('operations/tasks', 'POST', {
    title: 'Synthetic chase task',
    assignedUserId: managerId,
    details: {
      ...blankDetails('tasks'),
      dueDate: '2026-10-02',
      linkedType: 'customer',
      linkedId: customerId,
    },
  });
  assert.equal(task.status, 201);
  const taskRow = (await task.json()) as any;
  assert.equal(
    (
      await request('operations/tasks/' + taskRow.id, 'PATCH', {
        version: taskRow.version,
        status: 'Completed',
      })
    ).status,
    200,
  );
  const [product] = await database().select().from(products);
  const approval = await request('operations/approvals', 'POST', {
    title: 'Synthetic low-margin review',
    assignedUserId: managerId,
    details: {
      ...blankDetails('approvals'),
      approvalType: 'Low margin',
      reason: 'Synthetic approval check',
      linkedType: 'product',
      linkedId: product.id,
    },
  });
  assert.equal(approval.status, 201);
  const approvalRow = (await approval.json()) as any;
  assert.equal(
    (
      await request(
        'operations/approvals/' + approvalRow.id,
        'PATCH',
        { version: approvalRow.version, status: 'Approved' },
        warehouseCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request('operations/approvals/' + approvalRow.id, 'PATCH', {
        version: approvalRow.version,
        status: 'Approved',
      })
    ).status,
    200,
  );
});
test('disabled users and expired sessions are rejected on every request', async () => {
  await database()
    .update(users)
    .set({ active: false })
    .where(eq(users.id, managerId));
  assert.equal((await request('auth/me')).status, 401);
  await database()
    .update(users)
    .set({ active: true })
    .where(eq(users.id, managerId));
  await database()
    .update(sessions)
    .set({ expiresAt: new Date(0) })
    .where(eq(sessions.userId, managerId));
  assert.equal((await request('auth/me')).status, 401);
  const result = await request(
    'auth/login',
    'POST',
    { email: 'manager@test.invalid', password },
    '',
  );
  managerCookie = result.headers.get('set-cookie')!.split(';')[0];
});
test('attachments require linked record access and persist metadata and bytes', async () => {
  const [row] = await database().select().from(customers);
  const bytes = Buffer.from('%PDF-1.4\nSynthetic test document');
  const upload = await handleApi(
    new Request(
      origin + '/api/attachments?entity=customer&entityId=' + row.id,
      {
        method: 'POST',
        headers: {
          origin,
          cookie: managerCookie,
          'x-filename': 'synthetic.pdf',
        },
        body: bytes,
      },
    ),
  );
  assert.equal(upload.status, 201);
  const result = (await upload.json()) as any;
  const download = await request('attachments/' + result.id);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.equal(
    (
      await request(
        'attachments/' + result.id,
        'GET',
        undefined,
        warehouseCookie,
      )
    ).status,
    403,
  );
  const bad = await handleApi(
    new Request(
      origin + '/api/attachments?entity=customer&entityId=' + row.id,
      {
        method: 'POST',
        headers: { origin, cookie: managerCookie, 'x-filename': 'script.html' },
        body: '<script>test</script>',
      },
    ),
  );
  assert.equal(bad.status, 415);
});
test('logout invalidates the database session', async () => {
  assert.equal((await request('auth/logout', 'POST')).status, 200);
  assert.equal((await request('auth/me')).status, 401);
});

test('live dashboard, reports and global search are authenticated and role-scoped', async () => {
  const login = await request(
    'auth/login',
    'POST',
    { email: 'manager@test.invalid', password },
    '',
  );
  managerCookie = login.headers.get('set-cookie')!.split(';')[0];
  const dashboard = await request('dashboard');
  assert.equal(dashboard.status, 200);
  const metrics = (await dashboard.json()) as any;
  assert.equal(typeof metrics.sales.monthPence, 'number');
  assert.equal(typeof metrics.delivery.today, 'number');
  const reports = await request('reports');
  assert.equal(reports.status, 200);
  const report = (await reports.json()) as any;
  assert.ok(Array.isArray(report.salesByChannel));
  const search = await request('search?q=John');
  assert.equal(search.status, 200);
  const matches = (await search.json()) as any[];
  assert.ok(
    matches.some((v) => v.type === 'Customer' && v.label === 'John Smith'),
  );
  assert.equal(
    (await request('reports', 'GET', undefined, warehouseCookie)).status,
    403,
  );
  const warehouseSearch = await request(
    'search?q=John',
    'GET',
    undefined,
    warehouseCookie,
  );
  assert.deepEqual(await warehouseSearch.json(), []);
});

test('refunds enforce exact single-use approval, permissions and atomic ledger projection', async () => {
  const mutate = async (action: CommerceAction, cookie = managerCookie) => {
    const [ledger] = await database().select().from(workspaces);
    return request(
      'commerce',
      'POST',
      { requestId: randomUUID(), version: ledger.version, action },
      cookie,
    );
  };
  const [ledger] = await database().select().from(workspaces);
  const created = await mutate({
    type: 'create-order',
    input: {
      requestId: randomUUID(),
      customerId: ledger.data.customers[0].id,
      channel: 'WhatsApp',
      sourceRef: 'REFUND-TEST',
      lines: [
        {
          name: 'Refund test item',
          supplier: 'Rauch',
          article: '',
          quantity: 1,
          unitPence: 20000,
          options: '',
          route: 'Flat Pack Pro',
        },
      ],
      deliveryPence: 0,
      note: 'Synthetic refund test',
      now: Date.now(),
    },
  });
  assert.equal(created.status, 200);
  const order = (await created.json()) as { id: string; data: CommerceState };
  const invoice = order.data.invoices.find((row) => row.orderId === order.id)!;
  assert.equal(
    (await mutate({ type: 'issue-invoice', id: invoice.id, now: Date.now() }))
      .status,
    200,
  );
  assert.equal(
    (
      await mutate({
        type: 'pay-invoice',
        id: invoice.id,
        payment: {
          id: randomUUID(),
          amountPence: 20000,
          reference: 'TEST-RECEIPT',
          method: 'Bank transfer',
          at: Date.now(),
        },
      })
    ).status,
    200,
  );
  const refund: CommerceAction = {
    type: 'refund-invoice',
    id: invoice.id,
    refund: {
      id: randomUUID(),
      amountPence: 6000,
      reference: 'TEST-REFUND',
      method: 'Bank transfer',
      at: 0,
    },
  };
  assert.equal((await mutate(refund, warehouseCookie)).status, 403);
  assert.equal((await mutate(refund)).status, 422);
  const approvalInput = {
    title: 'Synthetic refund approval',
    assignedUserId: managerId,
    details: {
      ...blankDetails('approvals'),
      approvalType: 'Refund',
      reason: 'Synthetic verified return',
      linkedType: 'invoice',
      linkedId: invoice.id,
      amountPence: 6000,
    },
  };
  const ownResponse = await request(
    'operations/approvals',
    'POST',
    approvalInput,
  );
  assert.equal(ownResponse.status, 201);
  const own = (await ownResponse.json()) as { id: string; version: number };
  assert.equal(
    (
      await request('operations/approvals/' + own.id, 'PATCH', {
        version: own.version,
        status: 'Approved',
      })
    ).status,
    422,
  );
  const approvalResponse = await request(
    'operations/approvals',
    'POST',
    approvalInput,
    warehouseCookie,
  );
  assert.equal(approvalResponse.status, 201);
  const approval = (await approvalResponse.json()) as {
    id: string;
    number: string;
    version: number;
  };
  assert.equal(
    (
      await request('operations/approvals/' + approval.id, 'PATCH', {
        version: approval.version,
        status: 'Approved',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await mutate({
        ...refund,
        approvalId: approval.number,
        refund: { ...refund.refund, amountPence: 7000 },
      })
    ).status,
    422,
  );
  const [before] = await database().select().from(workspaces);
  const payload = {
    requestId: randomUUID(),
    version: before.version,
    action: { ...refund, approvalId: approval.number },
  };
  const saved = await request('commerce', 'POST', payload);
  assert.equal(saved.status, 200);
  const result = (await saved.json()) as { data: CommerceState };
  const updated = result.data.invoices.find((row) => row.id === invoice.id)!;
  assert.equal(updated.refunds![0].approvalId, approval.id);
  assert.ok(updated.refunds![0].at > 0);
  assert.equal(invoiceTotals(updated).netPaid, 14000);
  assert.equal(
    result.data.operations.cases.find((row) => row.id === order.id)!.paid,
    140,
  );
  assert.ok(parseSavedCommerce(JSON.stringify(result.data)));
  assert.equal((await request('commerce', 'POST', payload)).status, 200);
  const projected = await database()
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, invoice.id));
  assert.equal(projected.length, 2);
  assert.equal(
    projected.reduce((sum, row) => sum + row.amountPence, 0),
    14000,
  );
  assert.equal(
    (
      await mutate({
        ...refund,
        approvalId: approval.id,
        refund: {
          ...refund.refund,
          id: randomUUID(),
          reference: 'SECOND-REFUND',
        },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await mutate({
        ...refund,
        refund: {
          ...refund.refund,
          id: randomUUID(),
          amountPence: 1000,
          reference: 'SMALL-REFUND',
        },
      })
    ).status,
    200,
  );
  const audit = await database()
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityId, invoice.id));
  assert.equal(
    audit.filter((row) => row.action === 'refund-invoice').length,
    2,
  );
});

test('merchandising edits preserve protected costs and never return price history', async () => {
  const id = randomUUID();
  await database()
    .insert(users)
    .values({
      id,
      name: 'Store manager',
      email: 'shop@test.invalid',
      role: 'Shopify Store Manager',
      department: 'Online',
      passwordHash: await hashPassword(password),
    });
  const login = await request(
    'auth/login',
    'POST',
    { email: 'shop@test.invalid', password },
    '',
  );
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const rows = (await (
    await request('products', 'GET', undefined, cookie)
  ).json()) as any[];
  const product = rows[0];
  assert.ok(product.version);
  assert.equal(product.supplierCostPence, undefined);
  assert.equal(product.details.costs, undefined);
  assert.equal(
    (
      await request(
        'products/' + product.id + '/history',
        'GET',
        undefined,
        cookie,
      )
    ).status,
    403,
  );
  const keys = [
    'name',
    'sku',
    'supplierId',
    'supplierSku',
    'category',
    'status',
    'sellingPricePence',
    'details',
    'version',
  ];
  const input = Object.fromEntries(keys.map((k) => [k, product[k]]));
  input.name = 'Updated storefront title';
  const saved = await request('products/' + product.id, 'PUT', input, cookie);
  assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));
  assert.equal(((await saved.json()) as any).supplierCostPence, undefined);
  assert.equal(
    (
      await request(
        'products/' + product.id,
        'PUT',
        { ...input, supplierCostPence: 1 },
        cookie,
      )
    ).status,
    422,
  );
  const [persisted] = await database()
    .select()
    .from(products)
    .where(eq(products.id, product.id));
  assert.equal(persisted.supplierCostPence, 7000);
});
test('delivery groups reserve separately, booking conflicts block and costs use actual expense', async () => {
  const [product] = await database().select().from(products);
  const mutate = async (action: CommerceAction) => {
    const [w] = await database().select().from(workspaces);
    const r = await request('commerce', 'POST', {
      requestId: randomUUID(),
      version: w.version,
      action,
    });
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    return r.json() as Promise<any>;
  };
  const [w] = await database().select().from(workspaces);
  const result = await mutate({
    type: 'create-order',
    input: {
      requestId: randomUUID(),
      customerId: w.data.customers[0].id,
      channel: 'Shopify',
      sourceRef: 'MULTI-GROUP',
      lines: ['ProBuild', 'Flat Pack Pro'].map((route) => ({
        productId: product.id,
        name: product.name,
        supplier: 'Test',
        article: '',
        quantity: 1,
        unitPence: 12000,
        options: '',
        route: route as any,
      })),
      deliveryPence: 3000,
      note: '',
      now: Date.now(),
    },
  });
  const order = result.data.operations.cases.find(
    (v: any) => v.id === result.id,
  );
  await mutate({ type: 'issue-invoice', id: order.invoice, now: Date.now() });
  await mutate({
    type: 'pay-invoice',
    id: order.invoice,
    payment: {
      id: randomUUID(),
      amountPence: 27000,
      reference: 'MULTI-PAY',
      method: 'Cash',
      at: Date.now(),
    },
  });
  assert.equal(
    (
      await request('inventory/movements', 'POST', {
        requestId: randomUUID(),
        type: 'Adjustment',
        productId: product.id,
        locationId: 'test-warehouse',
        quantity: 3,
        reason: 'Synthetic multi-group stock',
      })
    ).status,
    201,
  );
  for (const group of order.groups)
    assert.equal(
      (
        await request('inventory/movements', 'POST', {
          requestId: randomUUID(),
          type: 'Reservation',
          productId: product.id,
          locationId: 'test-warehouse',
          orderId: order.id,
          groupId: group.id,
          quantity: 1,
          reason: 'Group allocation',
        })
      ).status,
      201,
    );
  const input = (groupId: string) => ({
    title: 'Group delivery ' + groupId,
    customerId: order.customerId,
    orderId: order.id,
    assignedUserId: managerId,
    details: {
      ...blankDetails('deliveries'),
      groupId,
      address: order.address,
      postcode: order.postcode,
      scheduledDate: '2026-11-01',
      timeSlot: '09:00–12:00',
      customerConfirmed: true,
    },
  });
  let a = (await (
    await request('operations/deliveries', 'POST', input(order.groups[0].id))
  ).json()) as any;
  let b = (await (
    await request('operations/deliveries', 'POST', input(order.groups[1].id))
  ).json()) as any;
  async function step(row: any, status: string, evidence?: string) {
    const r = await request('operations/deliveries/' + row.id, 'PATCH', {
      version: row.version,
      status,
      ...(evidence ? { evidence } : {}),
    });
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    return r.json() as Promise<any>;
  }
  a = await step(a, 'Ready to Book');
  a = await step(a, 'Booked');
  b = await step(b, 'Ready to Book');
  assert.equal(
    (
      await request('operations/deliveries/' + b.id, 'PATCH', {
        version: b.version,
        status: 'Booked',
      })
    ).status,
    409,
  );
  a = await step(a, 'Confirmed');
  a = await step(a, 'Out for Delivery');
  await step(a, 'Delivered', 'Synthetic signature');
  const reservations = await database()
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.orderId, order.id));
  assert.equal(
    reservations.find((v) => v.groupId === order.groups[0].id)!.status,
    'Delivered',
  );
  assert.equal(
    reservations.find((v) => v.groupId === order.groups[1].id)!.status,
    'Active',
  );
  const initial = (await (
    await request('orders/' + order.id + '/costs')
  ).json()) as any;
  assert.equal(initial.profit.contributionProfitPence, 8500);
  const saved = await request('orders/' + order.id + '/costs', 'PUT', {
    version: 0,
    costs: { ...emptyCosts, deliveryPence: 1000 },
    notes: 'Actual carrier invoice',
    reviewed: true,
  });
  assert.equal(saved.status, 200);
  assert.equal(
    ((await saved.json()) as any).profit.contributionProfitPence,
    7500,
  );
  assert.equal(
    (
      await request('orders/' + order.id + '/costs', 'PUT', {
        version: 0,
        costs: emptyCosts,
        notes: '',
        reviewed: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        'orders/' + order.id + '/costs',
        'GET',
        undefined,
        warehouseCookie,
      )
    ).status,
    403,
  );
});
test('measured quantities survive purchasing and partial receiving without permitting fractional Each', async () => {
  const [base] = await database().select().from(products);
  const payload = {
    name: 'Measured carpet',
    sku: 'MEASURED',
    supplierId: base.supplierId,
    supplierSku: 'M',
    category: 'Flooring',
    status: 'Active',
    supplierCostPence: 500,
    sellingPricePence: 1000,
    details: { ...base.details, stockUnit: 'm²' },
  };
  const created = await request('products', 'POST', payload);
  assert.equal(created.status, 201);
  const product = (await created.json()) as any;
  const input = {
    supplierId: base.supplierId,
    date: '2026-10-03',
    expectedDate: '',
    currency: 'GBP',
    accountReference: '',
    notes: 'Measured order',
    items: [
      {
        productId: product.id,
        description: 'Carpet sqm',
        quantity: 13.225,
        unitCostPence: 500,
      },
    ],
  };
  let r = await request('purchase-orders', 'POST', input);
  assert.equal(r.status, 201);
  let po = (await r.json()) as any;
  for (const status of [
    'Ready to Send',
    'Sent',
    'Awaiting Confirmation',
    'Confirmed',
  ]) {
    r = await request('purchase-orders/' + po.id, 'PATCH', {
      version: po.version,
      status,
    });
    assert.equal(r.status, 200);
    po = await r.json();
  }
  for (const quantity of [10.1, 3.125]) {
    r = await request('inventory/movements', 'POST', {
      requestId: randomUUID(),
      type: 'Goods Received',
      productId: product.id,
      locationId: 'test-warehouse',
      purchaseOrderId: po.id,
      quantity,
      reason: 'Measured receipt',
    });
    assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
  }
  const [stock] = await database()
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.productId, product.id));
  assert.equal(stock.physical, 13.225);
  assert.equal(
    (
      await request('purchase-orders', 'POST', {
        ...input,
        items: [{ ...input.items[0], productId: base.id }],
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request('products/' + product.id, 'PUT', {
        ...payload,
        version: product.version,
        details: { ...payload.details, stockUnit: 'Each' },
      })
    ).status,
    422,
  );
});
test('documents and notes are permission filtered and drafts remain shared without sending', async () => {
  const [customer] = await database().select().from(customers);
  const path = 'activity?entity=customer&entityId=' + customer.id;
  assert.equal(
    (
      await request(path, 'POST', {
        body: 'Call customer after the delivery window is confirmed.',
      })
    ).status,
    200,
  );
  const history = (await (await request(path)).json()) as any[];
  assert.ok(history.some((v) => v.body.includes('Call customer')));
  assert.equal(
    history.some((v) => 'after' in v),
    false,
  );
  assert.equal(
    (await request(path, 'GET', undefined, warehouseCookie)).status,
    404,
  );
  const docs = (await (await request('documents')).json()) as any[];
  assert.ok(docs.some((v) => v.filename === 'synthetic.pdf'));
  assert.deepEqual(
    await (
      await request('documents', 'GET', undefined, warehouseCookie)
    ).json(),
    [],
  );
  const draft = await request('communication-drafts', 'POST', {
    version: 0,
    entity: 'customer',
    entityId: customer.id,
    to: 'customer@test.invalid',
    subject: 'Delivery update',
    body: 'Your booking is being confirmed.',
  });
  assert.equal(draft.status, 201);
  const saved = (await draft.json()) as any;
  assert.ok(
    ((await (await request('communication-drafts')).json()) as any[]).some(
      (v) => v.id === saved.id,
    ),
  );
  assert.equal(
    (
      await request('communication-drafts/' + saved.id, 'PUT', {
        ...saved,
        id: undefined,
        updatedAt: undefined,
        updatedBy: undefined,
        version: 0,
      })
    ).status,
    409,
  );
});

test('Shopify stages paginated orders, encrypts credentials and imports once with exact pennies', async () => {
  const token = 'shpat_synthetic_test_only_12345';
  const configured = await request('integrations/shopify/configure', 'POST', {
    shop: 'synthetic-store.myshopify.com',
    token,
  });
  assert.equal(configured.status, 200);
  const [secret] = await database()
    .select()
    .from(settings)
    .where(eq(settings.key, 'secret:shopify'));
  assert.ok(!JSON.stringify(secret.value).includes(token));
  assert.ok(
    !JSON.stringify(await (await request('settings')).json()).includes(
      'encrypted',
    ),
  );
  const [customer] = await database().select().from(customers);
  const [product] = await database().select().from(products);
  const money = (amount: string) => ({
    shopMoney: { amount, currencyCode: 'GBP' },
  });
  const fixture = {
    id: 'gid://shopify/Order/987',
    name: '#987',
    updatedAt: '2026-10-02T12:00:00Z',
    createdAt: '2026-10-02T12:00:00Z',
    email: customer.email,
    phone: '07000000000',
    cancelledAt: null,
    displayFinancialStatus: 'PAID',
    displayFulfillmentStatus: 'UNFULFILLED',
    taxesIncluded: true,
    test: false,
    currentTotalPriceSet: money('124.99'),
    currentSubtotalPriceSet: money('119.99'),
    currentShippingPriceSet: money('5.00'),
    shippingAddress: {
      name: 'Shipping recipient',
      address1: '10 Delivery Road',
      address2: '',
      city: 'Nelson',
      zip: 'BB9 0AA',
      phone: '07000000000',
      countryCodeV2: 'GB',
    },
    lineItems: {
      pageInfo: { hasNextPage: false },
      nodes: [
        {
          id: 'gid://shopify/LineItem/98',
          name: product.name,
          sku: product.sku,
          quantity: 3,
          currentQuantity: 3,
          variant: null,
          discountedTotalSet: money('119.99'),
        },
      ],
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(
      String(url),
      /^https:\/\/synthetic-store\.myshopify\.com\/admin\/api\/2026-07\/graphql.json$/,
    );
    assert.equal(
      (options?.headers as Record<string, string>)['X-Shopify-Access-Token'],
      token,
    );
    return Response.json({
      data: {
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [fixture],
        },
      },
    });
  };
  try {
    let response = await request('integrations/shopify/sync', 'POST');
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    let inbox = (await response.json()) as any;
    assert.equal(inbox.orders.length, 1);
    const row = inbox.orders[0];
    assert.equal(row.lines[0].productId, product.id);
    assert.equal(
      (await request('integrations/shopify', 'GET', undefined, warehouseCookie))
        .status,
      403,
    );
    const mappings = [
      {
        lineId: fixture.lineItems.nodes[0].id,
        productId: product.id,
        route: 'AH showroom → BStar',
      },
    ];
    const before = (await database().select().from(workspaces))[0].data;
    response = await request('integrations/shopify/orders/' + row.id, 'POST', {
      mappings,
    });
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    const imported = (await response.json()) as any;
    const [w] = await database().select().from(workspaces);
    assert.equal(w.data.customers.length, before.customers.length);
    const order = w.data.operations.cases.find(
      (v) => v.id === imported.orderId,
    )!;
    assert.equal(order.total, 124.99);
    assert.equal(
      order.lines.reduce((n, l) => n + l.quantity, 0),
      3,
    );
    assert.equal(
      order.lines.reduce(
        (n, l) => n + Math.round(l.unitPrice * 100) * l.quantity,
        0,
      ),
      11999,
    );
    assert.equal(order.address, '10 Delivery Road');
    assert.equal(order.paid, 0);
    response = await request('integrations/shopify/orders/' + row.id, 'POST', {
      mappings,
    });
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as any).orderId, imported.orderId);
    fixture.updatedAt = '2026-10-02T13:00:00Z';
    fixture.cancelledAt = '2026-10-02T13:00:00Z' as any;
    response = await request('integrations/shopify/sync', 'POST');
    assert.equal(response.status, 200);
    inbox = await response.json();
    assert.equal(inbox.orders[0].status, 'Update needs review');
    assert.equal(
      (
        await request('integrations/shopify/orders/' + row.id, 'POST', {
          mappings,
        })
      ).status,
      409,
    );
    assert.equal(
      (await database().select().from(workspaces))[0].data.operations.cases
        .length,
      before.operations.cases.length + 1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('due task reminders reach the assigned staff and are deduplicated', async () => {
  const created = await request('operations/tasks', 'POST', {
    title: 'Synthetic overdue reminder',
    assignedUserId: managerId,
    details: { ...blankDetails('tasks'), dueDate: '2026-01-01' },
  });
  assert.equal(created.status, 201);
  const task = (await created.json()) as any;
  const once = (await (await request('notifications')).json()) as any[];
  assert.equal(
    once.filter((v) => v.entityId === task.id && v.type === 'followup-due')
      .length,
    1,
  );
  const twice = (await (await request('notifications')).json()) as any[];
  assert.equal(
    twice.filter((v) => v.entityId === task.id && v.type === 'followup-due')
      .length,
    1,
  );
});

test('flooring acceptance, shortage buying, allocation and fitting are connected, guarded and repeat-safe', async () => {
  const [ledger] = await database().select().from(workspaces);
  const [base] = await database().select().from(products);
  const productId = randomUUID();
  await database()
    .insert(products)
    .values({
      ...base,
      id: productId,
      name: 'Workflow carpet',
      sku: 'FLOOR-WORKFLOW',
      supplierSku: 'FW',
      supplierCostPence: 500,
      sellingPricePence: 1234,
      details: { ...base.details, stockUnit: 'm²' },
    });
  const fitterId = randomUUID(),
    otherFitterId = randomUUID();
  const passwordHash = await hashPassword(password);
  await database()
    .insert(users)
    .values([
      {
        id: fitterId,
        name: 'Assigned flooring fitter',
        email: 'fitter@test.invalid',
        role: 'Installer',
        passwordHash,
      },
      {
        id: otherFitterId,
        name: 'Other flooring fitter',
        email: 'other-fitter@test.invalid',
        role: 'Installer',
        passwordHash,
      },
    ]);
  const fitterLogin = await request(
    'auth/login',
    'POST',
    { email: 'fitter@test.invalid', password },
    '',
  );
  const fitterCookie = fitterLogin.headers.get('set-cookie')!.split(';')[0];
  const otherLogin = await request(
    'auth/login',
    'POST',
    { email: 'other-fitter@test.invalid', password },
    '',
  );
  const otherCookie = otherLogin.headers.get('set-cookie')!.split(';')[0];
  const details = {
    ...blankDetails('flooring'),
    measureDate: '2026-10-05',
    surveyor: 'Test surveyor',
    rooms: [
      {
        name: 'Lounge',
        length: 3.5,
        width: 3.75,
        wastePercent: 0,
        stairs: false,
        landing: false,
        underlay: '',
        accessories: '',
        notes: '',
      },
    ],
    quote: {
      lines: [{ productId, quantity: 13.125, unitPricePence: 1234 }],
      underlayPence: 0,
      accessoriesPence: 0,
      fittingPence: 5000,
      removalPence: 0,
      deliveryPence: 0,
      discountPence: 111,
      costPence: 8000,
    },
  };
  const createLead = async () => {
    let r = await request('operations/flooring', 'POST', {
      title: 'Flooring workflow test',
      customerId: ledger.data.customers[0].id,
      assignedUserId: managerId,
      details,
    });
    assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
    let l: any = await r.json();
    for (const status of ['Measure Booked', 'Measure Completed', 'Quote']) {
      r = await request('operations/flooring/' + l.id, 'PATCH', {
        version: l.version,
        status,
      });
      assert.equal(r.status, 200);
      l = await r.json();
    }
    return l;
  };
  const lead = await createLead();
  const path = 'flooring/' + lead.id;
  assert.equal(
    (
      await request('operations/flooring/' + lead.id, 'PATCH', {
        version: lead.version,
        status: 'Won',
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request(
        path + '/accept',
        'POST',
        { version: lead.version, evidence: 'Customer accepted' },
        warehouseCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(path + '/accept', 'POST', {
        version: lead.version - 1,
        evidence: 'Customer accepted',
      })
    ).status,
    409,
  );
  let r = await request(path + '/accept', 'POST', {
    version: lead.version,
    evidence: 'Signed quote accepted',
  });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const accepted: any = await r.json();
  r = await request(path + '/accept', 'POST', {
    version: lead.version,
    evidence: 'Retry',
  });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as any).orderId, accepted.orderId);
  let project: any = await (await request(path + '/fulfilment')).json();
  assert.equal(project.totalPence, 21085);
  assert.equal(project.materials[0].quantity, 13.125);
  const [afterAccept] = await database().select().from(workspaces);
  const order = afterAccept.data.operations.cases.find(
    (o) => o.id === accepted.orderId,
  )!;
  assert.equal(order.lines[0].quantity, 13.125);
  assert.equal(order.lines[0].unit, 'm²');
  assert.equal(order.total, 210.85);
  assert.equal(order.discountPence, 111);
  assert.equal(
    afterAccept.data.operations.cases.filter(
      (o) => o.flooringLeadId === lead.id,
    ).length,
    1,
  );
  assert.ok(parseSavedCommerce(JSON.stringify(afterAccept.data)));
  const invoice = afterAccept.data.invoices.find(
    (i) => i.orderId === order.id,
  )!;
  assert.equal(invoiceTotals(invoice).total, 21085);
  assert.equal(invoice.lines[0].unit, 'm²');
  assert.equal(
    (
      await request('operations/flooring/' + lead.id, 'PUT', {
        version: lead.version + 1,
        title: lead.title,
        customerId: lead.customerId,
        orderId: accepted.orderId,
        assignedUserId: managerId,
        details: { ...details, quote: { ...details.quote, discountPence: 0 } },
      })
    ).status,
    422,
  );
  assert.equal(
    (await request(path + '/fulfilment', 'GET', undefined, otherCookie)).status,
    403,
  );
  await database()
    .insert(stockBalances)
    .values({
      id: productId + ':test-warehouse',
      productId,
      locationId: 'test-warehouse',
      physical: 5.125,
      reserved: 0,
      display: 0,
    });
  const act = async (payload: any, cookie = managerCookie, expected = 200) => {
    const response = await request(
      path + '/fulfilment',
      'POST',
      { version: project.version, ...payload },
      cookie,
    );
    assert.equal(
      response.status,
      expected,
      JSON.stringify(await response.clone().json()),
    );
    if (expected === 200) project = await response.json();
    return response;
  };
  const date = '2027-03-15';
  await act(
    {
      action: 'book',
      fitterId,
      scheduledDate: date,
      timeSlot: 'AM',
      customerConfirmed: true,
      notes: '',
    },
    managerCookie,
    422,
  );
  await act({ action: 'prepare' });
  assert.equal(project.materials[0].allocated, 5.125);
  assert.equal(project.materials[0].incoming, 8);
  assert.equal(project.purchases.length, 1);
  await act({ action: 'prepare' });
  assert.equal(
    project.purchases.length,
    1,
    'repeat prepare must not duplicate purchase demand',
  );
  let [po] = await database()
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, project.purchases[0].id));
  const [item] = await database()
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseOrderId, po.id));
  assert.equal(item.quantity, 8);
  for (const status of [
    'Ready to Send',
    'Sent',
    'Awaiting Confirmation',
    'Confirmed',
  ]) {
    r = await request('purchase-orders/' + po.id, 'PATCH', {
      version: po.version,
      status,
    });
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    po = (await r.json()) as any;
  }
  r = await request('inventory/movements', 'POST', {
    requestId: randomUUID(),
    type: 'Goods Received',
    productId,
    locationId: 'test-warehouse',
    purchaseOrderId: po.id,
    quantity: 8,
    reason: 'Flooring material received',
  });
  assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
  await act({ action: 'prepare' });
  assert.equal(project.ready, true);
  assert.equal(project.materials[0].allocated, 13.125);
  await act({
    action: 'book',
    fitterId,
    scheduledDate: date,
    timeSlot: 'AM',
    customerConfirmed: true,
    notes: 'Access through rear door',
  });
  const assignedView = await request(
    path + '/fulfilment',
    'GET',
    undefined,
    fitterCookie,
  );
  assert.equal(assignedView.status, 200);
  const safe: any = await assignedView.json();
  assert.equal(safe.profit, undefined);
  assert.equal(safe.snapshot, undefined);
  assert.equal(safe.totalPence, undefined);
  assert.equal(safe.materials[0].unitCostPence, undefined);
  const otherList: any = await (
    await request('flooring/fittings', 'GET', undefined, otherCookie)
  ).json();
  assert.equal(otherList.length, 0);
  await act({ action: 'start', evidence: '' }, fitterCookie, 422);
  const second = await createLead();
  r = await request('flooring/' + second.id + '/accept', 'POST', {
    version: second.version,
    evidence: 'Second accepted job',
  });
  assert.equal(r.status, 200);
  const secondProject: any = await (
    await request('flooring/' + second.id + '/fulfilment')
  ).json();
  r = await request('flooring/' + second.id + '/fulfilment', 'POST', {
    version: secondProject.version,
    action: 'book',
    fitterId,
    scheduledDate: date,
    timeSlot: '09:00–10:00',
    customerConfirmed: true,
    notes: '',
  });
  assert.equal(
    r.status,
    409,
    'overlapping booking must be rejected before material check',
  );
  const mutate = async (action: CommerceAction) => {
    const [l] = await database().select().from(workspaces);
    const res = await request('commerce', 'POST', {
      requestId: randomUUID(),
      version: l.version,
      action,
    });
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  };
  await mutate({ type: 'issue-invoice', id: invoice.id, now: Date.now() });
  await mutate({
    type: 'pay-invoice',
    id: invoice.id,
    payment: {
      id: randomUUID(),
      amountPence: 21085,
      method: 'Bank transfer',
      reference: 'FLOOR-TEST-PAID',
      at: Date.now(),
    },
  });
  await act(
    { action: 'start', evidence: 'Materials loaded for fitter' },
    fitterCookie,
  );
  assert.equal(project.status, 'In Progress');
  await act(
    { action: 'start', evidence: 'Duplicate start' },
    fitterCookie,
    422,
  );
  await act(
    { action: 'issue', evidence: 'Skirting needs customer decision' },
    fitterCookie,
  );
  assert.ok(project.caseId);
  assert.equal(project.status, 'Issue');
  await act(
    { action: 'start', evidence: 'Customer decision recorded' },
    fitterCookie,
  );
  assert.equal(project.status, 'In Progress');
  let [stock] = await database()
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.productId, productId));
  assert.equal(stock.physical, 0);
  assert.equal(stock.reserved, 0);
  await act(
    { action: 'complete', evidence: 'Customer Test signed off' },
    fitterCookie,
    422,
  );
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
    'base64',
  );
  r = await handleApi(
    new Request(
      origin + '/api/attachments?entity=flooring-fitting&entityId=' + lead.id,
      {
        method: 'POST',
        headers: {
          origin,
          cookie: fitterCookie,
          'x-filename': 'completion.png',
        },
        body: bytes,
      },
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
  await act(
    { action: 'complete', evidence: 'Customer Test signed off' },
    fitterCookie,
  );
  assert.equal(project.status, 'Completed');
  await act(
    { action: 'complete', evidence: 'Duplicate completion' },
    fitterCookie,
    422,
  );
  const [final] = await database().select().from(workspaces);
  const completed = final.data.operations.cases.find((o) => o.id === order.id)!;
  assert.ok(
    completed.groups.every((g) => g.delivery && g.assembly === 'Complete'),
  );
  assert.ok(parseSavedCommerce(JSON.stringify(final.data)));
  const finalLeads: any[] = await (await request('operations/flooring')).json();
  assert.equal(finalLeads.find((l) => l.id === lead.id).status, 'Completed');
  assert.equal(completed.status, 'Complete');
  const documents: any[] = await (
    await request('documents', 'GET', undefined, fitterCookie)
  ).json();
  assert.ok(
    documents.some(
      (d) => d.entity === 'flooring-fitting' && d.entityId === lead.id,
    ),
  );
  const otherDocuments: any[] = await (
    await request('documents', 'GET', undefined, otherCookie)
  ).json();
  assert.ok(!otherDocuments.some((d) => d.entityId === lead.id));
  const salesId = randomUUID();
  await database().insert(users).values({
    id: salesId,
    name: 'Flooring sales',
    email: 'flooring-sales@test.invalid',
    role: 'Customer Service & Sales',
    passwordHash,
  });
  const salesLogin = await request(
    'auth/login',
    'POST',
    { email: 'flooring-sales@test.invalid', password },
    '',
  );
  const salesCookie = salesLogin.headers.get('set-cookie')!.split(';')[0];
  const salesLeads: any[] = await (
    await request('operations/flooring', 'GET', undefined, salesCookie)
  ).json();
  const safeLead = salesLeads.find((l) => l.id === lead.id);
  assert.equal(safeLead.profitability, null);
  assert.equal(safeLead.details.quote.costPence, 0);
  const low = await createLead();
  const lowDetails = {
    ...details,
    quote: {
      ...details.quote,
      lines: [{ productId, quantity: 13.125, unitPricePence: 100 }],
    },
  };
  r = await request('operations/flooring/' + low.id, 'PUT', {
    version: low.version,
    title: low.title,
    customerId: low.customerId,
    assignedUserId: managerId,
    details: lowDetails,
  });
  assert.equal(r.status, 200);
  const lowSaved: any = await r.json();
  r = await request(
    'flooring/' + low.id + '/accept',
    'POST',
    { version: lowSaved.version, evidence: 'Customer accepted' },
    salesCookie,
  );
  assert.equal(r.status, 422);
  assert.equal(((await r.json()) as any).error.code, 'MARGIN_APPROVAL');
  const ordinaryRequest = {
    type: 'create-order',
    input: {
      requestId: randomUUID(),
      customerId: lead.customerId,
      channel: 'Website',
      sourceRef: 'FRACTION-REJECT',
      lines: [
        {
          name: 'Each item',
          supplier: 'Test',
          article: 'T',
          quantity: 1.125,
          unitPence: 1000,
          options: '',
          route: 'ProBuild',
        },
      ],
      deliveryPence: 0,
      note: '',
      now: Date.now(),
    },
  };
  const [ordinaryLedger] = await database().select().from(workspaces);
  r = await request('commerce', 'POST', {
    version: ordinaryLedger.version,
    requestId: randomUUID(),
    action: ordinaryRequest,
  });
  assert.equal(
    r.status,
    422,
    'ordinary public order creation remains whole-unit',
  );

  [stock] = await database()
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.productId, productId));
  assert.equal(stock.physical, 0);
});

test('furniture preparation, shipment splitting and partial completion preserve stock and commercial totals', async () => {
  const [base] = await database().select().from(products);
  const productId = randomUUID();
  await database()
    .insert(products)
    .values({
      ...base,
      id: productId,
      sku: 'FURN-' + productId,
      supplierSku: 'FURN',
      status: 'Active',
      details: { ...base.details, stockUnit: 'Each' },
    });
  const locationId = randomUUID();
  await database()
    .insert(stockLocations)
    .values({
      id: locationId,
      name: 'Furniture test ' + locationId,
      type: 'Physical',
      active: true,
    });
  await database()
    .insert(stockBalances)
    .values({
      id: randomUUID(),
      productId,
      locationId,
      physical: 2,
      reserved: 0,
      display: 0,
    });
  async function mutate(action: CommerceAction) {
    const [w] = await database().select().from(workspaces);
    const r = await request('commerce', 'POST', {
      requestId: randomUUID(),
      version: w.version,
      action,
    });
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    return r.json() as Promise<any>;
  }
  const [w] = await database().select().from(workspaces);
  const created = await mutate({
    type: 'create-order',
    input: {
      requestId: randomUUID(),
      customerId: w.data.customers[0].id,
      channel: 'Shopify',
      sourceRef: 'FURNITURE-JOURNEY',
      lines: [
        { route: 'ProBuild', quantity: 3 },
        { route: 'Flat Pack Pro', quantity: 2 },
      ].map((l) => ({
        ...l,
        route: l.route as any,
        productId,
        name: 'Oak wardrobe',
        supplier: 'Test',
        article: '',
        unitPence: 12000,
        options: '',
      })),
      deliveryPence: 0,
      note: '',
      now: Date.now(),
    },
  });
  const order = created.data.operations.cases.find(
    (o: any) => o.id === created.id,
  );
  const path = 'orders/' + order.id + '/fulfilment';
  let project: any = await (await request(path)).json();
  assert.equal(
    (await request(path, 'GET', undefined, warehouseCookie)).status,
    403,
  );
  assert.equal(
    (await request(path, 'POST', { action: 'prepare', token: project.token }))
      .status,
    422,
  );
  await mutate({ type: 'issue-invoice', id: order.invoice, now: Date.now() });
  await mutate({
    type: 'pay-invoice',
    id: order.invoice,
    payment: {
      id: randomUUID(),
      amountPence: 60000,
      reference: 'FURN-PAID',
      method: 'Cash',
      at: Date.now(),
    },
  });
  project = await (await request(path)).json();
  const token = project.token;
  const concurrent = await Promise.all([
    request(path, 'POST', { action: 'prepare', token }),
    request(path, 'POST', { action: 'prepare', token }),
  ]);
  for (const r of concurrent)
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  project = await concurrent[1].json();
  assert.equal(project.purchases.length, 1);
  assert.equal(
    project.groups.reduce(
      (n: number, g: any) => n + g.materials[0].incoming,
      0,
    ),
    3,
    'incoming cannot cover two groups twice',
  );
  let reservations = await database()
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.orderId, order.id));
  assert.equal(
    reservations.reduce((n, r) => n + r.quantity, 0),
    2,
  );
  const poId = project.purchases[0].id;
  const [poLine] = await database()
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseOrderId, poId));
  assert.equal(poLine.quantity, 3);
  const source = project.groups[0].id;
  let r = await request(path, 'POST', {
    action: 'split',
    token: project.token,
    groupId: source,
    reason: 'Customer requested staged delivery',
    lines: [{ id: order.lines[0].id, quantity: 2 }],
  });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  project = await r.json();
  assert.equal(project.groups.length, 3);
  assert.equal(project.groups[0].ready, true);
  assert.equal(
    (
      await request(path, 'POST', {
        action: 'split',
        token,
        groupId: source,
        reason: 'Stale request retry',
        lines: [{ id: order.lines[0].id, quantity: 1 }],
      })
    ).status,
    409,
  );
  const [afterSplit] = await database().select().from(workspaces);
  const splitOrder = afterSplit.data.operations.cases.find(
    (o) => o.id === order.id,
  )!;
  assert.equal(splitOrder.total, 600);
  assert.equal(
    splitOrder.lines.reduce((n, l) => n + l.quantity, 0),
    5,
  );
  assert.equal(
    invoiceTotals(afterSplit.data.invoices.find((i) => i.id === order.invoice)!)
      .total,
    60000,
  );
  assert.ok(parseSavedCommerce(JSON.stringify(afterSplit.data)));
  reservations = await database()
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.orderId, order.id));
  assert.equal(
    reservations.reduce((n, r) => n + r.quantity, 0),
    2,
  );
  r = await request(path, 'POST', {
    action: 'delivery',
    token: project.token,
    groupId: source,
  });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  project = await r.json();
  assert.equal(project.deliveries.length, 1);
  assert.equal(project.assemblies.length, 1);
  assert.equal(
    (
      await request(path, 'POST', {
        action: 'delivery',
        token: project.token,
        groupId: source,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(path, 'POST', {
        action: 'split',
        token: project.token,
        groupId: source,
        reason: 'Already booked group',
        lines: [{ id: order.lines[0].id, quantity: 1 }],
      })
    ).status,
    422,
  );
  const activeReservation = (
    await database()
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.orderId, order.id))
  ).find((r) => r.groupId === source)!;
  assert.equal(
    (
      await request('inventory/movements', 'POST', {
        requestId: randomUUID(),
        type: 'Customer Delivery',
        productId,
        locationId,
        orderId: order.id,
        reservationId: activeReservation.id,
        quantity: activeReservation.quantity,
        reason: 'Bypass attempt',
      })
    ).status,
    422,
  );
  let [job] = await database()
    .select()
    .from(deliveryJobs)
    .where(eq(deliveryJobs.id, project.deliveries[0].id));
  r = await request('operations/deliveries/' + job.id, 'PUT', {
    version: job.version,
    title: job.title,
    customerId: job.customerId,
    orderId: job.orderId,
    assignedUserId: managerId,
    details: {
      ...job.details,
      scheduledDate: '2027-03-15',
      timeSlot: '09:00–12:00',
      customerConfirmed: true,
    },
  });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  job = (await r.json()) as any;
  for (const status of [
    'Ready to Book',
    'Booked',
    'Confirmed',
    'Out for Delivery',
    'Delivered',
  ]) {
    r = await request('operations/deliveries/' + job.id, 'PATCH', {
      version: job.version,
      status,
      ...(status === 'Delivered'
        ? { evidence: 'Customer signature: synthetic staged delivery' }
        : {}),
    });
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    job = (await r.json()) as any;
  }
  project = await (await request(path)).json();
  assert.equal(project.groups.filter((g: any) => g.delivered).length, 1);
  assert.equal(project.groups[0].materials[0].delivered, 1);
  const [balance] = await database()
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.productId, productId));
  assert.equal(balance.physical, 1);
  assert.equal(balance.reserved, 1);
  const [ledger] = await database().select().from(workspaces);
  assert.notEqual(
    ledger.data.operations.cases.find((o) => o.id === order.id)!.status,
    'Complete',
  );
  r = await request('commerce', 'POST', {
    requestId: randomUUID(),
    version: ledger.version,
    action: {
      type: 'operation',
      action: {
        type: 'evidence',
        id: order.id,
        groupId: source,
        event: 'delivery',
        detail: 'Manual shortcut',
        now: Date.now(),
      },
    },
  });
  assert.equal(r.status, 422);
  // Historical receipt flags cannot substitute for physical allocations.
  const { deliveryReady } =
    await import('../../server/services/order-progress');
  assert.equal(
    deliveryReady(
      {
        ...splitOrder,
        groups: splitOrder.groups.map((g) => ({ ...g, receipt: true })),
      },
      [],
      source,
    ),
    false,
  );
  r = await request(path, 'POST', { action: 'prepare', token: project.token });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  assert.equal(
    ((await r.json()) as any).purchases.length,
    1,
    'retries after partial delivery do not duplicate incoming supply',
  );
});
