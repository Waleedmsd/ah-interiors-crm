import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const origin = process.env.APP_ORIGIN ?? 'http://localhost:3001';
assert.equal(process.env.CI, 'true', 'Only disposable quality fixtures may be used.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const database = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname));
assert.equal(database.pathname, '/ah_crm_ci');
assert.ok(process.env.SEED_PASSWORD);
const root = '.runtime/ci-evidence/commerce-browser';
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const report = { checks: [], errors: [], failures: [] };
const contexts = [];
async function session(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  contexts.push(context);
  const result = await context.request.post(origin + '/api/auth/login', {
    headers: { Origin: origin }, data: { email: `quality-${role}@ahinteriors.test`, password: process.env.SEED_PASSWORD },
  });
  assert.equal(result.status(), 200, `Fixture login failed: ${role}`);
  return context;
}
async function ledger(context) {
  const response = await context.request.get(origin + '/api/commerce');
  assert.equal(response.status(), 200);
  return (await response.json()).data;
}
try {
  const manager = await session('management');
  const page = await manager.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push(error.message));
  const key = randomUUID().slice(0, 8);
  const name = 'Quality Persistence ' + key;
  const email = `quality-${key}@example.test`;
  await page.goto(origin + '/customers', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name', { exact: true }).fill(name);
  await dialog.getByLabel('Email address', { exact: true }).fill(email);
  await dialog.getByLabel('Phone (optional)', { exact: true }).fill('07700900123');
  await dialog.getByLabel('Street address', { exact: true }).fill('1 Quality Test Street');
  await dialog.getByLabel('Town / city', { exact: true }).fill('Nelson');
  await dialog.getByLabel('Postcode', { exact: true }).fill('BB9 7XR');
  await dialog.getByRole('button', { name: 'Save customer', exact: true }).click();
  await expect(dialog).toBeHidden();
  let state = await ledger(manager);
  const customer = state.customers.find(value => value.email === email);
  assert.ok(customer, 'The customer must exist in the shared database, not only the DOM.');
  report.checks.push('Customer creation persisted through the real UI.');

  await page.goto(origin + '/orders/new?customer=' + encodeURIComponent(customer.id), { waitUntil: 'networkidle' });
  await page.getByLabel('Sales channel', { exact: true }).selectOption('Showroom');
  await page.getByLabel('Original order reference', { exact: true }).fill('QUALITY-' + key);
  await page.getByLabel('Choose catalogue product', { exact: true }).selectOption('DEMO-WARDROBE');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Unit price (£)', { exact: true }).fill('99.99');
  await page.getByLabel('Colour, size & accessories', { exact: true }).fill('Synthetic quality fixture; no live customer.');
  await page.getByLabel('Delivery & services (£)', { exact: true }).fill('15.00');
  await page.getByRole('button', { name: 'Create order & invoice', exact: true }).click();
  await page.waitForURL(url => /^\/orders\/L-\d+$/.test(url.pathname));
  state = await ledger(manager);
  const order = state.operations.cases.find(value => value.sourceRef === 'QUALITY-' + key);
  assert.ok(order);
  assert.equal(order.customerId, customer.id);
  assert.equal(order.total, 214.98);
  assert.equal(state.operations.cases.filter(value => value.sourceRef === 'QUALITY-' + key).length, 1);
  let invoice = state.invoices.find(value => value.orderId === order.id);
  assert.ok(invoice);
  assert.equal(invoice.lifecycle, 'Draft');
  assert.equal(invoice.payments.length, 0);
  report.checks.push('Catalogue-linked order and one linked unpaid invoice persisted atomically.');
  await page.screenshot({ path: root + '/created-order.png', fullPage: true });

  await page.goto(origin + '/invoices/' + invoice.id, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Review & issue', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Issue (locally|invoice)$/ }).click();
  await expect(dialog).toBeHidden();
  invoice = (await ledger(manager)).invoices.find(value => value.id === invoice.id);
  assert.equal(invoice.lifecycle, 'Issued');
  assert.equal(invoice.customerSnapshot.id, customer.id);
  report.checks.push('Issuing an invoice persisted its immutable customer snapshot.');

  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount received (£)', { exact: true }).fill('100.01');
  const paymentReference = 'QUALITY-PAYMENT-' + key;
  await dialog.getByLabel('Payment / bank reference', { exact: true }).fill(paymentReference);
  await dialog.getByRole('button', { name: 'Record verified payment', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText(paymentReference, { exact: true })).toBeVisible();
  state = await ledger(manager);
  invoice = state.invoices.find(value => value.id === invoice.id);
  assert.equal(invoice.payments.length, 1);
  assert.equal(invoice.payments[0].amountPence, 10001);
  assert.equal(state.operations.cases.find(value => value.id === order.id).paid, 100.01);
  report.checks.push('Verified partial payment survived refresh and reconciled with its order in exact pennies.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: root + '/invoice-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, 'The populated mobile invoice must not overflow the viewport.');

  const accounts = await session('accounts');
  const accountPage = await accounts.newPage();
  await accountPage.goto(origin + '/invoices/' + invoice.id, { waitUntil: 'networkidle' });
  await expect(accountPage.getByText(paymentReference, { exact: true })).toBeVisible();
  report.checks.push('A separate Accounts session loaded the same persisted payment.');
  const sales = await session('customer-service-sales');
  const salesPage = await sales.newPage();
  await salesPage.goto(origin + '/orders/' + order.id, { waitUntil: 'networkidle' });
  await expect(salesPage.getByRole('heading', { name, exact: true })).toBeVisible();
  assert.equal(await salesPage.getByLabel('Supplier unit cost (£)', { exact: true }).count(), 0);
  await salesPage.goto(origin + '/invoices/' + invoice.id, { waitUntil: 'networkidle' });
  await expect(salesPage.getByRole('button', { name: 'Record payment', exact: true })).toBeDisabled();
  report.checks.push('Sales sees its order without supplier-cost controls or payment-recording permission.');
} catch (error) {
  report.failures.push(error.message);
  throw error;
} finally {
  await writeFile(root + '/report.json', JSON.stringify(report, null, 2));
  console.log('COMMERCE_BROWSER_SUMMARY', JSON.stringify(report));
  for (const context of contexts) await context.close();
  await browser.close();
}
assert.equal(report.errors.length, 0, 'Unexpected browser errors during commerce actions.');
assert.equal(report.checks.length, 6, 'All real persistence and role checks must complete.');
