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
  createOperationsState,
  operationsReducer: reduce,
  isPaid,
  completed,
  approvalBlockers,
  currentStatus,
  PREVIEW_NOW: now,
  DAY,
  dueLabel,
  suppliers,
  movementRows,
} = load('lib/operations.ts');
const { operationsReply } = load('lib/operations-assistant.ts');
const find = (state, id = '10004821') =>
  state.cases.find((order) => order.id === id);
function prepared(id = '10004821') {
  return reduce(createOperationsState(), { type: 'prepare', id, now });
}
function reviewed(id = '10004821') {
  let state = prepared(id);
  for (const draft of find(state, id).pack.drafts)
    state = reduce(state, {
      type: 'draft',
      id,
      draftId: draft.id,
      patch: { reviewed: true },
    });
  for (const key of ['specification', 'routing', 'payment', 'split'])
    state = reduce(state, { type: 'check', id, key, value: true });
  return state;
}
const serial = (value) => JSON.stringify(value);

test('five channels, all supplier profiles, and supplier tags separate from article checks', () => {
  const state = createOperationsState();
  assert.equal(new Set(state.cases.map((order) => order.channel)).size, 5);
  assert.ok(suppliers.length >= 20);
  assert.match(find(state, '10004822').supplierSource, /Shopify tag/);
  assert.equal(find(state, '10004812').lines[0].matched, false);
});
test('Process prepares drafts without approval, purchase, booking or duplicate packs', () => {
  const initial = createOperationsState();
  const state = reduce(initial, { type: 'prepare', id: '10004821', now });
  const order = find(state);
  assert.equal(order.pack.state, 'Draft');
  assert.equal(currentStatus(order), 'In review');
  assert.equal(order.pack.drafts.length, 3);
  assert.equal(serial(order.groups), serial(find(initial).groups));
  assert.equal(
    find(reduce(state, { type: 'prepare', id: order.id, now })).events.length,
    order.events.length,
  );
  assert.equal(find(initial).pack, undefined);
});
test('WhatsApp invoice and partial payment do not unlock Process', () => {
  let state = createOperationsState();
  assert.equal(isPaid(find(state, '10004823')), false);
  state = reduce(state, { type: 'prepare', id: '10004823', now });
  assert.equal(find(state, '10004823').pack, undefined);
  state = reduce(state, {
    type: 'payment',
    id: '10004823',
    reference: '',
    now,
  });
  assert.equal(isPaid(find(state, '10004823')), false);
  state = reduce(state, {
    type: 'payment',
    id: '10004823',
    reference: 'DEMO-BANK',
    now,
  });
  assert.equal(isPaid(find(state, '10004823')), true);
  state = reduce(state, { type: 'prepare', id: '10004823', now });
  assert.equal(find(state, '10004823').pack.state, 'Draft');
});
test('catalogue accessories have independent codes and quantities, and amounts reconcile', () => {
  const order = find(prepared());
  assert.equal(order.lines.length, 3);
  assert.equal(
    order.lines.find((line) => line.name === 'Extra interior shelf').quantity,
    2,
  );
  assert.match(order.pack.drafts[0].body, /Colour code: SAMPLE-ALP-W/);
  assert.match(order.pack.drafts[0].body, /2 × Extra interior shelf/);
  assert.match(order.pack.drafts[0].body, /SAMPLE-SHELF-45/);
  assert.equal(
    order.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) +
      280,
    order.total,
  );
});
test('provider notice follows placement, customer draft excludes internal codes', () => {
  const order = find(prepared());
  const provider = order.pack.drafts.find(
    (draft) => draft.kind === 'Provider notice',
  );
  assert.match(provider.timing, /After supplier order placement/);
  assert.match(provider.body, /confirm physical receipt/);
  const customer = order.pack.drafts.find(
    (draft) => draft.kind === 'Customer update',
  );
  assert.doesNotMatch(customer.body, /SAMPLE-|Article:|Colour code:/);
  assert.match(customer.body, /No delivery date is confirmed/);
});
test('all checks and all drafts are required before Go ahead', () => {
  const state = prepared();
  assert.ok(approvalBlockers(find(state)).length > 0);
  assert.equal(
    find(reduce(state, { type: 'approve', id: '10004821', now })).pack.state,
    'Draft',
  );
  assert.equal(approvalBlockers(find(reviewed())).length, 0);
});
test('Go ahead records only local approval; repeat approval is idempotent', () => {
  const before = reviewed();
  let state = reduce(before, { type: 'approve', id: '10004821', now });
  const order = find(state);
  assert.equal(order.pack.state, 'Approved');
  assert.equal(currentStatus(order), 'Approved');
  assert.equal(serial(order.groups), serial(find(before).groups));
  assert.match(order.events.at(-1).detail, /Nothing sent, purchased or booked/);
  state = reduce(state, { type: 'approve', id: order.id, now });
  assert.equal(find(state).events.length, order.events.length);
});
test('draft edits invalidate review and final checks; invalid recipients block approval', () => {
  let state = reviewed();
  state = reduce(state, {
    type: 'draft',
    id: '10004821',
    draftId: 'g1-supplier',
    patch: { to: 'invalid-address' },
  });
  assert.equal(find(state).pack.drafts[0].reviewed, false);
  assert.equal(find(state).pack.checks.specification, false);
  assert.ok(
    approvalBlockers(find(state)).some((value) =>
      value.includes('valid recipient'),
    ),
  );
});
test('approved drafts are locked; revise retains content but needs new approval', () => {
  const approved = reduce(reviewed(), { type: 'approve', id: '10004821', now });
  const tampered = reduce(approved, {
    type: 'draft',
    id: '10004821',
    draftId: 'g1-supplier',
    patch: { body: 'Changed' },
  });
  assert.equal(serial(find(tampered).pack), serial(find(approved).pack));
  const revised = reduce(approved, {
    type: 'revise',
    id: '10004821',
    now: now + 10,
  });
  assert.equal(find(revised).pack.revision, 2);
  assert.equal(find(revised).pack.state, 'Draft');
  assert.equal(find(revised).pack.approvedAt, undefined);
  assert.ok(find(revised).pack.drafts.every((draft) => !draft.reviewed));
});
test('changing an article rebuilds dependent drafts and clears catalogue verification', () => {
  const state = reduce(reviewed(), {
    type: 'line',
    id: '10004821',
    lineId: 'l1',
    article: 'SAMPLE-NEW',
    matched: false,
    now,
  });
  assert.equal(find(state).pack.revision, 2);
  assert.match(find(state).pack.drafts[0].body, /SAMPLE-NEW/);
  assert.equal(find(state).pack.checks.specification, false);
  assert.ok(
    approvalBlockers(find(state)).some((value) => value.includes('catalogue')),
  );
});
test('route changes refresh the contact, charging and held transport instructions', () => {
  const state = reduce(reviewed(), {
    type: 'route',
    id: '10004821',
    groupId: 'g1',
    route: 'AH showroom → BStar',
    checked: false,
    now,
  });
  const order = find(state);
  assert.equal(order.groups[0].assembly, 'Not required');
  assert.match(order.groups[0].charging, /BStar/);
  assert.ok(
    order.pack.drafts.some(
      (draft) =>
        draft.kind === 'Transport instructions' && draft.body.includes('HOLD:'),
    ),
  );
  assert.ok(
    approvalBlockers(order).some((value) => value.includes('coverage')),
  );
});
test('mixed orders preserve separate quantities, groups and explicit delivery-plan acceptance', () => {
  let state = reviewed('10004824');
  const order = find(state, '10004824');
  assert.equal(order.groups.length, 2);
  assert.equal(
    order.pack.drafts.filter((draft) => draft.kind === 'Supplier order').length,
    2,
  );
  assert.equal(order.pack.drafts.length, 5);
  assert.equal(
    order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) +
      100,
    order.total,
  );
  state = reduce(state, {
    type: 'check',
    id: order.id,
    key: 'split',
    value: false,
  });
  assert.ok(
    approvalBlockers(find(state, order.id)).some((value) =>
      value.includes('mixed-order'),
    ),
  );
});
test('missing or duplicate drafts cannot pass as a complete pack', () => {
  const order = find(reviewed('10004824'), '10004824');
  const broken = {
    ...order,
    pack: { ...order.pack, drafts: order.pack.drafts.slice(1) },
  };
  assert.ok(
    approvalBlockers(broken).some((value) =>
      value.includes('complete draft set'),
    ),
  );
});
test('collection and delivery jobs stay separate; one complete group cannot close a mixed order', () => {
  const state = createOperationsState();
  const mixed = find(state, '10004824');
  const partial = {
    ...mixed,
    groups: mixed.groups.map((group, i) => ({ ...group, delivery: i === 0 })),
  };
  assert.equal(completed(partial), false);
  const transport = find(state, '10004798').groups[0];
  assert.notEqual(transport.jobs[0].ref, transport.jobs[1].ref);
  assert.equal(transport.delivery, false);
});
test('physical receipt, payment, release and completion have independent gates', () => {
  const state = createOperationsState();
  const premature = reduce(state, {
    type: 'evidence',
    id: '10004821',
    groupId: 'g1',
    event: 'delivery',
    detail: 'Not ordered yet',
    now,
  });
  assert.equal(find(premature).groups[0].delivery, false);
  let updated = reduce(state, {
    type: 'evidence',
    id: '10004786',
    groupId: 'g1',
    event: 'assembly',
    detail: 'No delivery proof',
    now,
  });
  assert.equal(
    find(updated, '10004786').groups[0].assembly,
    'Awaiting booking',
  );
  updated = reduce(updated, {
    type: 'evidence',
    id: '10004786',
    groupId: 'g1',
    event: 'delivery',
    detail: 'Sample delivery proof',
    now,
  });
  assert.equal(completed(find(updated, '10004786')), false);
  updated = reduce(updated, {
    type: 'evidence',
    id: '10004786',
    groupId: 'g1',
    event: 'assembly',
    detail: 'Sample fitter report',
    now,
  });
  assert.equal(completed(find(updated, '10004786')), true);
});
test('24-hour reminders do not imply a sent chaser or change operational status', () => {
  const state = createOperationsState();
  const before = find(state, '10004798');
  assert.match(dueLabel(before.tasks[0].dueAt, now), /overdue/);
  const changed = reduce(state, {
    type: 'snooze',
    id: before.id,
    taskId: before.tasks[0].id,
    now,
  });
  assert.equal(find(changed, before.id).tasks[0].dueAt, now + DAY);
  assert.equal(serial(find(changed, before.id).groups), serial(before.groups));
  assert.match(
    find(changed, before.id).events.at(-1).detail,
    /No follow-up sent/,
  );
});
test('assistant follows order context, targets supplier rather than customer, and respects approval', () => {
  const initial = createOperationsState();
  const followup = operationsReply(
    'Draft a supplier follow-up',
    initial.cases,
    '10004798',
    now,
  );
  assert.match(followup.action.description, /Hypnos.*10004798/);
  assert.match(followup.action.content, /Hello Hypnos/);
  assert.equal(followup.orderId, '10004798');
  assert.match(
    operationsReply(
      'What is blocking this order?',
      initial.cases,
      '10004823',
      now,
    ).text,
    /Payment hold/,
  );
  const state = reduce(reviewed(), { type: 'approve', id: '10004821', now });
  assert.match(
    operationsReply('Summarise this order', state.cases, '10004821', now).text,
    /Nothing has been sent, purchased or booked/,
  );
});

test('assistant payment summary reflects a newly recorded sample payment', () => {
  const initial = createOperationsState();
  assert.match(
    operationsReply('Show unpaid orders', initial.cases).text,
    /£2,920/,
  );
  const paid = reduce(initial, {
    type: 'payment',
    id: '10004823',
    reference: 'DEMO-PAID',
    now,
  });
  assert.match(
    operationsReply('Show unpaid orders', paid.cases).text,
    /No outstanding customer balances/,
  );
});
test('assembly appointment evidence updates the reminder and Today movement summary', () => {
  const booked = reduce(createOperationsState(), {
    type: 'evidence',
    id: '10004786',
    groupId: 'g1',
    event: 'booking',
    detail: 'Sample provider appointment 10 September',
    now,
  });
  assert.match(
    movementRows(booked.cases).find((row) => row.order.id === '10004786').label,
    /Appointment recorded/,
  );
  assert.equal(find(booked, '10004786').tasks[0].dueAt, now + DAY);
  assert.match(find(booked, '10004786').tasks[0].title, /completion/);
});
test('completed delivery and assembly clear stale movement and follow-up rows', () => {
  let state = reduce(createOperationsState(), {
    type: 'evidence',
    id: '10004786',
    groupId: 'g1',
    event: 'delivery',
    detail: 'Sample delivery report',
    now,
  });
  state = reduce(state, {
    type: 'evidence',
    id: '10004786',
    groupId: 'g1',
    event: 'assembly',
    detail: 'Sample fitter completion report',
    now,
  });
  assert.equal(find(state, '10004786').tasks.length, 0);
  assert.equal(
    movementRows(state.cases).some((row) => row.order.id === '10004786'),
    false,
  );
});
