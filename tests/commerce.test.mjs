import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const filename = resolve(path);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const loadedModule = { exports: {} };
  vm.runInNewContext(
    outputText,
    {
      module: loadedModule,
      exports: loadedModule.exports,
      Intl,
      require: (name) => {
        assert.ok(name.startsWith('@/lib/'));
        return load(name.replace('@/', '') + '.ts');
      },
    },
    { filename },
  );
  cache.set(path, loadedModule.exports);
  return loadedModule.exports;
}
const {
  createCommerceState,
  applyCommerce,
  invoiceTotals,
  invoiceStatus,
  invoiceOverdue,
  invoiceForOrder,
  invoiceInputForOrder,
  nextInvoiceId,
  parseSavedCommerce,
  parsePounds,
  accountTotals,
} = load('lib/commerce.ts');
const {
  PREVIEW_NOW: now,
  isPaid,
  approvalBlockers,
} = load('lib/operations.ts');
const input = (extra = {}) => ({
  requestId: 'req-1',
  customerId: 'C-0001',
  channel: 'WhatsApp',
  sourceRef: 'WA-2001',
  lines: [
    {
      name: 'Test wardrobe',
      supplier: 'Rauch',
      article: '',
      quantity: 2,
      unitPence: 12555,
      options: 'White / 180 cm',
      route: 'Flat Pack Pro',
    },
  ],
  deliveryPence: 4999,
  note: '',
  now,
  ...extra,
});
const fresh = () => {
  const result = applyCommerce(createCommerceState(), {
    type: 'create-order',
    input: input(),
  });
  assert.equal(result.error, undefined);
  return result.state;
};
const getOrder = (state) =>
  state.operations.cases.find((order) => order.id === 'L-000001');
const getInvoice = (state) => invoiceForOrder(state, 'L-000001');
const issue = (state) =>
  applyCommerce(state, { type: 'issue-invoice', id: getInvoice(state).id, now })
    .state;
function pay(state, amountPence, reference = 'BANK-1', id = reference) {
  return applyCommerce(state, {
    type: 'pay-invoice',
    id: getInvoice(state).id,
    payment: { id, amountPence, reference, method: 'Bank transfer', at: now },
  });
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('seed ledger restores with matching invoice/order balances', () => {
  const state = createCommerceState();
  const restored = parseSavedCommerce(JSON.stringify(state));
  assert.ok(restored);
  assert.equal(restored.customers.length, 8);
  assert.equal(restored.invoices.length, 11);
  for (const order of state.operations.cases)
    assert.equal(
      invoiceTotals(invoiceForOrder(state, order.id)).paid,
      Math.round(order.paid * 100),
    );
});
test('new order atomically reuses customer and creates unpaid linked draft', () => {
  const state = fresh();
  assert.equal(state.customers.length, 8);
  assert.equal(getOrder(state).customerId, 'C-0001');
  assert.equal(getOrder(state).total, 301.09);
  assert.equal(getInvoice(state).lifecycle, 'Draft');
  assert.equal(invoiceTotals(getInvoice(state)).total, 30109);
  assert.equal(isPaid(getOrder(state)), false);
  assert.ok(parseSavedCommerce(JSON.stringify(state)));
});
test('new customer is created once and duplicate emails are blocked', () => {
  const state = createCommerceState();
  const customer = {
    name: 'Test Customer',
    email: 'test@example.test',
    phone: '',
    address: '1 Test Road',
    city: 'Nelson',
    postcode: 'BB9 1AA',
  };
  const created = applyCommerce(state, {
    type: 'create-customer',
    customer,
    now,
  });
  assert.equal(created.id, 'C-0009');
  assert.equal(created.state.customers.length, 9);
  assert.ok(
    applyCommerce(created.state, {
      type: 'create-customer',
      customer: { ...customer, email: ' TEST@example.test ' },
      now,
    }).error,
  );
});
test('order creation request is idempotent and source references cannot duplicate', () => {
  const state = fresh();
  const again = applyCommerce(state, { type: 'create-order', input: input() });
  assert.equal(again.state, state);
  assert.equal(again.id, 'L-000001');
  assert.ok(
    applyCommerce(state, {
      type: 'create-order',
      input: input({ requestId: 'another' }),
    }).error,
  );
});
test('one customer can hold multiple independent orders', () => {
  const state = applyCommerce(fresh(), {
    type: 'create-order',
    input: input({ requestId: 'two', sourceRef: 'WA-2002' }),
  }).state;
  assert.equal(state.customers.length, 8);
  assert.equal(
    state.operations.cases.filter((order) => order.customerId === 'C-0001')
      .length,
    3,
  );
  assert.equal(
    state.invoices.filter((invoice) => invoice.orderId?.startsWith('L-'))
      .length,
    2,
  );
});
test('invalid order line amounts, quantities and references do not mutate state', () => {
  const state = createCommerceState();
  for (const patch of [
    { sourceRef: '' },
    { deliveryPence: -1 },
    { deliveryPence: NaN },
    { lines: [] },
    { lines: [{ ...input().lines[0], quantity: 1.2 }] },
    { lines: [{ ...input().lines[0], unitPence: -1 }] },
  ]) {
    const result = applyCommerce(state, {
      type: 'create-order',
      input: input(patch),
    });
    assert.ok(result.error);
    assert.equal(result.state, state);
  }
});
test('draft payment is blocked and issuing snapshots customer details', () => {
  const state = fresh();
  assert.ok(pay(state, 100).error);
  const issued = issue(state);
  assert.equal(getInvoice(issued).lifecycle, 'Issued');
  assert.equal(getInvoice(issued).customerSnapshot.id, 'C-0001');
  assert.notEqual(getInvoice(issued).customerSnapshot, issued.customers[0]);
  assert.equal(getInvoice(issued).emailDraft, undefined);
});
test('partial then final payment reconciles integer pennies and unlocks only that order', () => {
  let state = issue(fresh());
  const other = state.operations.cases.find((order) => order.id === '10004823');
  state = pay(state, 10101).state;
  assert.equal(invoiceStatus(getInvoice(state)), 'Partially paid');
  assert.equal(invoiceTotals(getInvoice(state)).balance, 20008);
  assert.equal(getOrder(state).paid, 101.01);
  assert.equal(isPaid(getOrder(state)), false);
  state = pay(state, 20008, 'BANK-2').state;
  assert.equal(invoiceStatus(getInvoice(state)), 'Paid');
  assert.equal(isPaid(getOrder(state)), true);
  assert.equal(
    state.operations.cases.find((order) => order.id === other.id).paid,
    other.paid,
  );
  assert.ok(parseSavedCommerce(JSON.stringify(state)));
});
test('payment retry is idempotent; duplicate references and overpayments rejected', () => {
  const state = pay(issue(fresh()), 100).state;
  const again = pay(state, 100);
  assert.equal(again.state, state);
  assert.ok(pay(state, 100, ' bank-1 ', 'different').error);
  for (const amount of [-1, 0, 0.1, NaN, Infinity, 30110])
    assert.ok(pay(state, amount, 'INVALID').error);
});
test('issued financial fields are immutable', () => {
  const state = issue(fresh());
  const invoice = getInvoice(state);
  const result = applyCommerce(state, {
    type: 'edit-invoice',
    id: invoice.id,
    input: { ...invoice, notes: 'Change', now },
  });
  assert.ok(result.error);
  assert.equal(result.state, state);
});
test('order-linked invoice cannot change customer or total; duplicate generation opens active invoice', () => {
  const state = fresh();
  const invoice = getInvoice(state);
  const original = invoiceInputForOrder(getOrder(state), now);
  for (const extra of [
    { customerId: 'C-0002' },
    { lines: [{ ...original.lines[0], unitPence: 1 }] },
  ])
    assert.ok(
      applyCommerce(state, {
        type: 'edit-invoice',
        id: invoice.id,
        input: { ...original, ...extra },
      }).error,
    );
  const again = applyCommerce(state, {
    type: 'create-invoice',
    id: nextInvoiceId(state),
    input: original,
  });
  assert.equal(again.id, invoice.id);
  assert.equal(again.state, state);
});
test('standalone payment changes customer balance but no order', () => {
  let state = createCommerceState();
  const before = JSON.stringify(state.operations);
  const target = state.invoices.find(
    (invoice) => invoice.id === 'INV-2026-1039',
  );
  const outstanding = accountTotals(
    state.invoices.filter(
      (invoice) => invoice.customerId === target.customerId,
    ),
    now,
  ).outstanding;
  state = applyCommerce(state, {
    type: 'pay-invoice',
    id: target.id,
    payment: {
      id: 's1',
      amountPence: 5000,
      reference: 'STANDALONE',
      method: 'Cash',
      at: now,
    },
  }).state;
  assert.equal(JSON.stringify(state.operations), before);
  assert.equal(
    accountTotals(
      state.invoices.filter(
        (invoice) => invoice.customerId === target.customerId,
      ),
      now,
    ).outstanding,
    outstanding - 5000,
  );
});
test('overdue is independent of partial payment; due today and paid are not overdue', () => {
  const state = createCommerceState();
  const invoice = state.invoices.find((item) => item.id === 'INV-10004823');
  assert.equal(invoiceStatus(invoice), 'Partially paid');
  assert.equal(invoiceOverdue(invoice, now), true);
  assert.equal(
    invoiceOverdue({ ...invoice, dueDate: '2026-09-05' }, now),
    false,
  );
  assert.equal(
    invoiceOverdue(
      { ...invoice, payments: [{ amountPence: invoiceTotals(invoice).total }] },
      now,
    ),
    false,
  );
});
test('draft arithmetic supports discounts and rounded tax without floating balances', () => {
  const totals = invoiceTotals({
    lines: [{ quantity: 3, unitPence: 999 }],
    discountPence: 100,
    taxBps: 2000,
    payments: [],
  });
  assert.equal(totals.subtotal, 2997);
  assert.equal(totals.tax, 579);
  assert.equal(totals.total, 3476);
  for (const text of ['', '-1', '1.001', 'Infinity', '1e3'])
    assert.ok(Number.isNaN(parsePounds(text)));
  assert.equal(parsePounds('123.45'), 12345);
});
test('invoice dates, zero totals and invalid taxes are rejected before saving', () => {
  const state = fresh();
  const invoice = getInvoice(state);
  for (const extra of [
    { dueDate: '2026-02-31' },
    { dueDate: '2025-01-01' },
    { discountPence: 999999 },
    { taxBps: NaN },
    { taxBps: -1 },
    { taxBps: 0.1 },
    { lines: [] },
  ])
    assert.ok(
      applyCommerce(state, {
        type: 'edit-invoice',
        id: invoice.id,
        input: { ...invoice, ...extra, now },
      }).error,
    );
});
test('unpaid invoice can be voided with reason, never deleted; paid invoice cannot', () => {
  const state = issue(fresh());
  assert.ok(
    applyCommerce(state, {
      type: 'void-invoice',
      id: getInvoice(state).id,
      reason: '',
      now,
    }).error,
  );
  const voided = applyCommerce(state, {
    type: 'void-invoice',
    id: getInvoice(state).id,
    reason: 'Incorrect draft selection',
    now,
  }).state;
  assert.equal(voided.invoices.length, state.invoices.length);
  assert.equal(
    voided.invoices.find((invoice) => invoice.id === getInvoice(state).id)
      .lifecycle,
    'Void',
  );
  assert.equal(getOrder(voided).paymentVerified, false);
  assert.ok(parseSavedCommerce(JSON.stringify(voided)));
  const partial = pay(state, 100).state;
  assert.ok(
    applyCommerce(partial, {
      type: 'void-invoice',
      id: getInvoice(partial).id,
      reason: 'No',
      now,
    }).error,
  );
});
test('invoice email is a draft, validates recipient and becomes stale after payment', () => {
  let state = issue(fresh());
  const action = {
    type: 'invoice-email',
    id: getInvoice(state).id,
    to: 'customer@example.test',
    subject: 'Invoice',
    body: 'Your balance is £301.09',
    now,
  };
  assert.ok(applyCommerce(state, { ...action, to: 'invalid' }).error);
  state = applyCommerce(state, action).state;
  assert.equal(getInvoice(state).emailDraft.to, action.to);
  assert.match(getInvoice(state).history.at(-1).title, /not sent/);
  state = pay(state, 100).state;
  assert.equal(getInvoice(state).emailDraft, undefined);
});
test('new uncatalogued products remain blocked after payment until cost and specification reviewed', () => {
  let state = issue(fresh());
  state = pay(state, 30109).state;
  state = applyCommerce(state, {
    type: 'operation',
    action: { type: 'prepare', id: 'L-000001', now },
  }).state;
  const blockers = approvalBlockers(getOrder(state));
  assert.ok(blockers.some((value) => value.includes('catalogue')));
  assert.ok(blockers.some((value) => value.includes('supplier cost')));
  state = applyCommerce(state, {
    type: 'operation',
    action: {
      type: 'line',
      id: 'L-000001',
      lineId: 'l1',
      article: 'TEST-001',
      matched: true,
      cost: 50,
      now,
    },
  }).state;
  assert.equal(getOrder(state).lines[0].costVerified, true);
  assert.ok(
    !approvalBlockers(getOrder(state)).some((value) =>
      value.includes('supplier cost'),
    ),
  );
  assert.ok(approvalBlockers(getOrder(state)).length > 0);
});
test('restoration rejects corrupt JSON, financial gate tampering and duplicate active invoices', () => {
  assert.equal(parseSavedCommerce('{'), null);
  for (const change of [
    (s) => {
      s.version = 1;
    },
    (s) => {
      getInvoice(s).payments = [
        {
          id: 'bad',
          amountPence: 1,
          reference: 'bad',
          method: 'Cash',
          at: now,
        },
      ];
    },
    (s) => {
      getOrder(s).paymentVerified = true;
    },
    (s) => {
      s.invoices.push({ ...getInvoice(s), id: 'DUPLICATE' });
    },
    (s) => {
      getOrder(s).groups = null;
    },
    (s) => {
      getOrder(s).issues = null;
    },
  ]) {
    const state = plain(fresh());
    change(state);
    assert.equal(parseSavedCommerce(JSON.stringify(state)), null);
  }
});
test('restoration rejects duplicate payment identities and references', () => {
  const state = plain(pay(issue(fresh()), 100).state);
  const invoice = getInvoice(state);
  invoice.payments.push({ ...invoice.payments[0] });
  assert.equal(parseSavedCommerce(JSON.stringify(state)), null);
  invoice.payments[1].id = 'new-id';
  assert.equal(parseSavedCommerce(JSON.stringify(state)), null);
});
test('restoration repairs stale counters to unused sequential IDs', () => {
  const state = plain(fresh());
  state.nextOrder = 1;
  state.nextCustomer = 1;
  state.nextInvoice = 1;
  const restored = parseSavedCommerce(JSON.stringify(state));
  assert.ok(restored);
  assert.equal(restored.nextOrder, 2);
  assert.equal(restored.nextCustomer, 9);
  assert.equal(restored.nextInvoice, 1042);
});
test('an existing invoice number cannot silently swallow a different new invoice', () => {
  const state = fresh();
  const invoice = getInvoice(state);
  const result = applyCommerce(state, {
    type: 'create-invoice',
    id: invoice.id,
    input: { ...invoice, notes: 'different request', now },
  });
  assert.ok(result.error);
  assert.equal(result.state, state);
});

function makeBrowserStores() {
  const storage = new Map();
  const locks = new Set();
  const lockManager = {
    async request(name, options, callback) {
      if (locks.has(name)) return callback(null);
      locks.add(name);
      try {
        return await callback({ name });
      } finally {
        locks.delete(name);
      }
    },
  };
  const create = () => {
    const loadedModule = { exports: {} };
    const events = new Map();
    const { outputText } = ts.transpileModule(
      readFileSync(resolve('components/local-commerce-store.ts'), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    );
    vm.runInNewContext(
      outputText.replaceAll('import.meta', '({})') +
        '\nmodule.exports.__test = { initialize, get: () => snapshot, dispose: () => releaseWriter?.() };',
      {
        module: loadedModule,
        exports: loadedModule.exports,
        window: {
          addEventListener: (key, value) => events.set(key, value),
          removeEventListener: () => {},
        },
        navigator: { locks: lockManager },
        localStorage: {
          getItem: (key) => storage.get(key) || null,
          setItem: (key, value) => storage.set(key, value),
        },
        require: (name) => (name === 'react' ? {} : load('lib/commerce.ts')),
      },
    );
    return loadedModule.exports;
  };
  return { create, storage };
}
test('local store survives a new tab/session and only one tab may edit', async () => {
  const env = makeBrowserStores();
  const first = env.create();
  first.__test.initialize();
  assert.equal(first.__test.get().ready, true);
  const second = env.create();
  second.__test.initialize();
  assert.equal(second.__test.get().persistence, 'read-only');
  assert.ok(
    second.commitCommerce({ type: 'create-order', input: input() }).error,
  );
  assert.equal(
    first.commitCommerce({ type: 'create-order', input: input() }).id,
    'L-000001',
  );
  first.__test.dispose();
  await new Promise((resolve) => setImmediate(resolve));
  const refreshed = env.create();
  refreshed.__test.initialize();
  assert.equal(refreshed.__test.get().ready, true);
  assert.equal(getOrder(refreshed.__test.get().data).total, 301.09);
  refreshed.__test.dispose();
});
test('unexpected external storage changes block stale writes and preserve newer records', () => {
  const env = makeBrowserStores();
  const first = env.create();
  first.__test.initialize();
  const newer = fresh();
  env.storage.set('ah-interiors-local-workspace-v3', JSON.stringify(newer));
  const result = first.commitCommerce({
    type: 'create-order',
    input: input({ requestId: 'two', sourceRef: 'WA-2002' }),
  });
  assert.ok(result.error);
  assert.equal(first.__test.get().data.operations.cases.length, 9);
  assert.equal(
    JSON.parse(env.storage.get('ah-interiors-local-workspace-v3')).operations
      .cases.length,
    9,
  );
  first.__test.dispose();
});
