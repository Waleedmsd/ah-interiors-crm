import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(
  new URL('../lib/ui-preferences.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const loaded = { exports: {} };
vm.runInNewContext(outputText, { module: loaded, exports: loaded.exports });
const {
  parseUIPreferences,
  stableIdentity,
  moduleForPath,
  UI_PREFERENCES_KEY,
} = loaded.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));
const defaults = { version: 1, motion: 'full', materials: 'glass' };
test('invalid and future preference records return safe defaults', () => {
  for (const input of [
    null,
    '',
    '{bad',
    'null',
    '[]',
    '42',
    '{"version":2,"motion":"reduced"}',
  ])
    assert.deepEqual(plain(parseUIPreferences(input)), defaults, input);
});
test('valid preferences round trip including explicit navigation', () => {
  const input = {
    version: 1,
    motion: 'reduced',
    materials: 'solid',
    navigation: 'collapsed',
  };
  assert.deepEqual(plain(parseUIPreferences(JSON.stringify(input))), input);
});
test('invalid fields fall back independently', () => {
  assert.deepEqual(
    plain(
      parseUIPreferences(
        '{"version":1,"motion":"invalid","materials":"solid","navigation":"invalid"}',
      ),
    ),
    { ...defaults, materials: 'solid' },
  );
});
test('unknown preference fields cannot leak into the UI record', () => {
  assert.deepEqual(
    plain(
      parseUIPreferences(
        '{"version":1,"motion":"reduced","customerId":"C-001","paid":true}',
      ),
    ),
    { ...defaults, motion: 'reduced' },
  );
});
test('parsed defaults do not share mutable objects', () => {
  const first = parseUIPreferences(null);
  first.motion = 'reduced';
  assert.deepEqual(plain(parseUIPreferences(null)), defaults);
});
test('responsive navigation is represented by no explicit saved override', () => {
  assert.equal(parseUIPreferences(null).navigation, undefined);
  assert.equal(
    parseUIPreferences('{"version":1,"navigation":"expanded"}').navigation,
    'expanded',
  );
});
test('customer identity is stable regardless of collection order', () => {
  const ids = ['C-0009', 'C-0020', 'C-0001'];
  const before = new Map(ids.map((id) => [id, stableIdentity(id)]));
  for (const id of ids.reverse())
    assert.equal(stableIdentity(id), before.get(id));
});
test('module identity preserves review, detail and Accounts alias mappings', () => {
  for (const [route, module] of [
    ['/orders', 'orders'],
    ['/orders/1/review', 'orders'],
    ['/reviews', 'orders'],
    ['/invoices/I-1', 'finance'],
    ['/accounts', 'finance'],
    ['/purchasing', 'purchasing'],
    ['/assembly', 'fulfilment'],
    ['/assistant', 'assistant'],
    ['/customers', 'workspace'],
  ])
    assert.equal(moduleForPath(route), module, route);
});
test('display preferences have an independent versioned storage key', () => {
  assert.equal(UI_PREFERENCES_KEY, 'amiro-ui-preferences-v1');
  const provider = readFileSync(
    new URL('../components/ui-preferences-provider.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    provider,
    /ah-interiors-local-workspace|applyCommerce|createCommerceState/,
  );
  const store = readFileSync(
    new URL('../lib/ui-preference-store.ts', import.meta.url),
    'utf8',
  );
  assert.match(store, /localStorage\.setItem\(UI_PREFERENCES_KEY/);
  assert.match(store, /sessionOnly = true/);
});
