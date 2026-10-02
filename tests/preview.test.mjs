import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Run the pure preview helpers without a browser or a live backend.
const modules = new Map();
function load(source) {
  if (modules.has(source)) return modules.get(source);
  const filename = resolve(source);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.ok(name.startsWith('@/lib/'), 'Only local preview helper dependencies are allowed');
      return load(name.replace('@/', '') + '.ts');
    },
    Intl,
  }, { filename });
  modules.set(source, module.exports);
  return module.exports;
}
const { demoOrders, filterOrders, money } = load('lib/demo-data.ts');
const { previewReply } = load('lib/assistant-preview.ts');
const { invoices, overdueTotal } = load('lib/account-data.ts');
const { toCsv } = load('lib/preview-utils.ts');

test('new order totals and finance summaries use consistent records', () => {
  const newOrders = filterOrders(demoOrders, '', 'New');
  assert.equal(newOrders.length, 4);
  assert.equal(newOrders.reduce((sum, order) => sum + order.total, 0), 10000);
  assert.equal(overdueTotal, 2510);
  assert.equal(invoices.reduce((sum, invoice) => sum + invoice.total - invoice.paid, 0), 7080);
});
test('order search handles names, suppliers, whitespace, order hashes and status filters', () => {
  assert.equal(filterOrders(demoOrders, ' SARAH ')[0].id, '10004822');
  assert.equal(filterOrders(demoOrders, '#10004821')[0].customer, 'John Smith');
  assert.equal(filterOrders(demoOrders, 'rauch').length, 3);
  assert.equal(filterOrders(demoOrders, 'rauch', 'Attention').length, 1);
  assert.equal(filterOrders(demoOrders, 'no such customer').length, 0);
});
test('assistant reflects local order status and a smaller review queue', () => {
  const updated = demoOrders.map((order) => order.id === '10004821' ? { ...order, status: 'Processing' } : order);
  assert.match(previewReply('Review order #10004821', updated).text, /Workflow: Processing/);
  assert.match(previewReply('Prepare new orders', updated).text, /3 new orders worth £7,160/);
  assert.match(previewReply('What needs attention?', updated).text, /3 new orders/);
});
test('drafts target the selected customer and show the actual balance', () => {
  const reply = previewReply('Draft a payment reminder for David Brown');
  assert.equal(reply.action.status, 'pending');
  assert.match(reply.action.description, /David Brown.*10004823/);
  assert.match(reply.action.content, /£2,920/);
  assert.doesNotMatch(reply.action.content, /John/);
});
test('supplier draft uses the sample PO and unknown customers are not invented', () => {
  assert.match(previewReply('Draft a follow-up to Hypnos').action.content, /PO-2026-002829/);
  assert.equal(previewReply('Draft an email').action, undefined);
  assert.equal(previewReply('Review #10009999').action, undefined);
  assert.match(previewReply('Review #10009999').text, /not in the eight-order/);
});
test('assistant ledger answer matches Accounts and preparing does not change orders', () => {
  assert.match(previewReply('Show unpaid orders').text, new RegExp(money(overdueTotal)));
  const before = JSON.stringify(demoOrders);
  const reply = previewReply('Process new orders');
  assert.equal(reply.action.status, 'pending');
  assert.match(reply.text, /approval remains a separate step/);
  assert.equal(JSON.stringify(demoOrders), before);
});
test('CSV escapes quotes, multiline values and spreadsheet formulas', () => {
  const csv = toCsv(['Name', 'Value'], [['A "quoted" name', '=SUM(A1:A2)'], ['line\nline', 0]]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"A ""quoted"" name"'));
  assert.ok(csv.includes('"\'=SUM(A1:A2)"'));
  assert.ok(csv.includes('"line\nline","0"'));
});
