import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyCommerceState } from '../../lib/empty-commerce';
import { applyCommerce } from '../../lib/commerce';

test('an unloaded shared workspace contains no synthetic customers orders or payments', () => {
  const value = emptyCommerceState();
  assert.equal(value.version, 3);
  assert.deepEqual(value.operations, { cases: [] });
  assert.deepEqual(value.customers, []);
  assert.deepEqual(value.invoices, []);
  assert.equal(value.nextOrder, 1);
  assert.equal(value.nextCustomer, 1);
  assert.equal(value.nextInvoice, 1);
});

test('empty workspaces never share mutable arrays across staff sessions', () => {
  const first = emptyCommerceState();
  const second = emptyCommerceState();
  assert.notEqual(first, second);
  assert.notEqual(first.customers, second.customers);
  assert.notEqual(first.invoices, second.invoices);
  assert.notEqual(first.operations, second.operations);
  assert.notEqual(first.operations.cases, second.operations.cases);
});

test('the empty transport state retains the existing customer model', () => {
  const before = emptyCommerceState();
  const result = applyCommerce(before, { type: 'create-customer', now: Date.parse('2026-10-04T10:00:00Z'), customer: {
    name: 'Isolated Test Customer', email: 'customer@example.test', phone: '07700900123',
    address: '1 Example Street', city: 'Nelson', postcode: 'BB9 7XR',
  } });
  assert.equal(result.error, undefined);
  assert.equal(result.state.customers.length, 1);
  assert.equal(result.state.customers[0].name, 'Isolated Test Customer');
  assert.equal(result.state.operations.cases.length, 0);
  assert.equal(result.state.invoices.length, 0);
  assert.equal(before.customers.length, 0);
});

test('server-mode storage must not fall back to the demo-state factory', async () => {
  const source = await readFile(new URL('../../components/server-commerce-store.ts', import.meta.url), 'utf8');
  assert.ok(!source.includes('createCommerceState'));
  assert.ok(source.includes('emptyCommerceState'));
});
