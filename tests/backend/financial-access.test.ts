import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { canReadSupplierCosts, supplierCostPence } from '../../lib/financial-access';
import { createCommerceState, parseSavedCommerce, type CommerceState } from '../../lib/commerce';
import { presentCommerce } from '../../server/services/commerce-presentation';
import { projectCommerce, workspaceId } from '../../server/services/commerce';
import { roles, type Role, type Staff } from '../../server/permissions';
import { database, closeDatabase } from '../../server/db';
import { users, workspaces } from '../../server/db/schema';
import { hashPassword } from '../../server/auth';
import { handleApi } from '../../server/api';

const person = (role: Role): Staff => ({ id: 'fixture', name: 'Fixture', email: 'fixture@example.test', role, department: 'Quality', active: true });
const origin = 'http://localhost:3001';
const password = 'Isolated-cost-test-password';
const databaseName = 'ah_crm_cost_test_' + process.pid;
const salesId = randomUUID();
let adminUrl = '';
let created = false;
let salesCookie = '';
let managerCookie = '';
const call = (cookie: string, method = 'GET', input?: unknown, path = 'commerce') => handleApi(new Request(origin + '/api/' + path, {
  method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
  ...(input === undefined ? {} : { body: JSON.stringify(input) }),
}));
const assertRedacted = (state: CommerceState) => {
  assert.ok(state.operations.cases.length > 0, 'This check requires populated records.');
  for (const order of state.operations.cases) for (const line of order.lines) assert.equal(line.cost, null);
};

before(async () => {
  assert.ok(process.env.DATABASE_URL, 'Use a disposable local PostgreSQL database.');
  const source = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(source.hostname), 'Never run against a remote business database.');
  source.pathname = '/postgres';
  adminUrl = source.toString();
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try { await admin.query(`CREATE DATABASE "${databaseName}"`); created = true; }
  finally { await admin.end(); }
  source.pathname = '/' + databaseName;
  process.env.DATABASE_URL = source.toString();
  process.env.APP_ORIGIN = origin;
  await migrate(database(), { migrationsFolder: './drizzle' });
  const passwordHash = await hashPassword(password);
  await database().insert(users).values([
    { id: randomUUID(), name: 'Cost Manager', email: 'cost-manager@example.test', role: 'Management', department: 'Quality', passwordHash },
    { id: salesId, name: 'Cost Sales', email: 'cost-sales@example.test', role: 'Customer Service & Sales', department: 'Quality', passwordHash },
  ]);
  await database().transaction(async tx => {
    const data = createCommerceState();
    await projectCommerce(tx, data);
    await tx.insert(workspaces).values({ id: workspaceId, data });
  });
  for (const kind of ['manager', 'sales']) {
    const response = await call('', 'POST', { email: `cost-${kind}@example.test`, password }, 'auth/login');
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    if (kind === 'manager') managerCookie = cookie;
    else salesCookie = cookie;
  }
});
after(async () => {
  await closeDatabase();
  if (!created) return;
  assert.match(databaseName, /^ah_crm_cost_test_\d+$/);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try { await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
  finally { await admin.end(); }
});

test('supplier-cost visibility is explicit for all nine roles', () => {
  for (const role of roles) assert.equal(canReadSupplierCosts(person(role)), ['Management', 'Team Lead', 'Accounts'].includes(role), role);
  assert.equal(canReadSupplierCosts(null), false);
  assert.equal(canReadSupplierCosts(undefined), false);
  assert.equal(canReadSupplierCosts({ ...person('Management'), active: false }), false);
});
test('redaction preserves sale values without mutating the canonical ledger', () => {
  const state = createCommerceState();
  const before = JSON.stringify(state);
  const visible = presentCommerce(person('Customer Service & Sales'), state);
  assertRedacted(visible);
  assert.equal(JSON.stringify(state), before);
  assert.equal(visible.operations.cases[0].total, state.operations.cases[0].total);
  assert.equal(visible.operations.cases[0].lines[0].unitPrice, state.operations.cases[0].lines[0].unitPrice);
  assert.deepEqual(visible.invoices, state.invoices);
});
test('financial roles receive independent complete response objects', () => {
  const state = createCommerceState();
  for (const role of ['Management', 'Team Lead', 'Accounts'] as const) {
    const visible = presentCommerce(person(role), state);
    assert.deepEqual(visible, state);
    assert.notEqual(visible.operations.cases[0], state.operations.cases[0]);
  }
});
test('a role-redacted response cannot be imported as the canonical ledger', () => {
  const canonical = createCommerceState();
  assert.ok(parseSavedCommerce(JSON.stringify(canonical)));
  assert.equal(parseSavedCommerce(JSON.stringify(presentCommerce(person('Customer Service & Sales'), canonical))), null);
});
test('hidden costs cannot silently become zero-profitability inputs', () => {
  for (const value of [null, NaN, Infinity, -1, Number.MAX_VALUE]) assert.throws(() => supplierCostPence(value));
  assert.equal(supplierCostPence(0), 0);
  assert.equal(supplierCostPence(123.45), 12345);
});
test('roles without commerce access cannot obtain a redacted ledger either', () => {
  assert.throws(() => presentCommerce(person('Warehouse'), createCommerceState()));
  assert.throws(() => presentCommerce({ ...person('Management'), active: false }, createCommerceState()));
});
test('authenticated sales reads redact costs while management reads retain them', async () => {
  const sales = await call(salesCookie);
  assert.equal(sales.status, 200);
  assertRedacted((await sales.json()).data);
  const manager = await call(managerCookie);
  assert.equal(manager.status, 200);
  const payload = await manager.json();
  assert.ok(payload.data.operations.cases.every((order: CommerceState['operations']['cases'][number]) => order.lines.every(line => typeof line.cost === 'number')));
});
test('successful mutations and idempotent retries do not leak or erase canonical costs', async () => {
  const snapshot = await (await call(salesCookie)).json();
  const input = { requestId: randomUUID(), version: snapshot.version, action: {
    type: 'create-customer', now: Date.now(), customer: { name: 'Redaction Test', email: 'redaction-customer@example.test', phone: '07700900123', address: '1 Example Street', city: 'Nelson', postcode: 'BB9 7XR' },
  } };
  const first = await call(salesCookie, 'POST', input);
  assert.equal(first.status, 200);
  const saved = await first.json();
  assertRedacted(saved.data);
  const second = await call(salesCookie, 'POST', input);
  assert.equal(second.status, 200);
  const replay = await second.json();
  assertRedacted(replay.data);
  assert.equal(replay.version, saved.version);
  assert.equal(replay.data.customers.filter((customer: { email: string }) => customer.email === 'redaction-customer@example.test').length, 1);
  const [canonical] = await database().select().from(workspaces).where(eq(workspaces.id, workspaceId));
  assert.ok(parseSavedCommerce(JSON.stringify(canonical.data)));
  assert.ok(canonical.data.operations.cases[0].lines[0].cost !== null);
});
test('sales cannot change protected supplier costs by bypassing the interface', async () => {
  const snapshot = await (await call(salesCookie)).json();
  const order = snapshot.data.operations.cases[0];
  const response = await call(salesCookie, 'POST', { requestId: randomUUID(), version: snapshot.version, action: { type: 'operation', action: {
    type: 'line', id: order.id, lineId: order.lines[0].id, article: order.lines[0].article, matched: true, cost: 0, now: Date.now(),
  } } });
  assert.equal(response.status, 403);
  assert.equal((await (await call(salesCookie)).json()).version, snapshot.version);
});
test('a role change takes effect on the next request of an existing session', async () => {
  await database().update(users).set({ role: 'Warehouse' }).where(eq(users.id, salesId));
  assert.equal((await call(salesCookie)).status, 403);
});
