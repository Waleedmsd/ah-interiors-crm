import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness({ readFails = false, writeFails = false } = {}) {
  const data = new Map([['commerce-sentinel', 'unchanged']]),
    listeners = new Map(),
    cache = new Map();
  const storage = {
    getItem: (key) => {
      if (readFails) throw Error('blocked');
      return data.get(key) || null;
    },
    setItem: (key, value) => {
      if (writeFails) throw Error('quota');
      data.set(key, value);
    },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    });
    const result = { exports: {} };
    vm.runInNewContext(outputText, {
      module: result,
      exports: result.exports,
      localStorage: storage,
      window: {
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: (name) => listeners.delete(name),
      },
      require: (name) => load(name.replace('@/', '') + '.ts'),
    });
    cache.set(file, result.exports);
    return result.exports;
  }
  const store = load('lib/ui-preference-store.ts').createUIPreferenceStore();
  return { store, data, listeners };
}
test('appearance store has stable server state and publishes hydrated preferences', () => {
  const { store, data } = harness();
  data.set(
    'amiro-ui-preferences-v1',
    '{"version":1,"motion":"reduced","materials":"solid"}',
  );
  assert.equal(store.getServerSnapshot().ready, false);
  let notifications = 0;
  store.subscribe(() => notifications++);
  store.start();
  assert.equal(store.getSnapshot().ready, true);
  assert.equal(store.getSnapshot().preferences.motion, 'reduced');
  assert.equal(notifications, 1);
});
test('appearance changes preserve sibling preferences and leave other storage unchanged', () => {
  const { store, data } = harness();
  store.start();
  store.update({ motion: 'reduced', navigation: 'collapsed' });
  store.update({ materials: 'solid' });
  assert.equal(store.getSnapshot().preferences.motion, 'reduced');
  assert.equal(store.getSnapshot().preferences.navigation, 'collapsed');
  assert.equal(data.get('commerce-sentinel'), 'unchanged');
  assert.deepEqual([...data.keys()].sort(), [
    'amiro-ui-preferences-v1',
    'commerce-sentinel',
  ]);
});
test('unavailable preference reads produce usable session-only defaults', () => {
  const { store } = harness({ readFails: true });
  store.start();
  assert.equal(store.getSnapshot().ready, true);
  assert.equal(store.getSnapshot().sessionOnly, true);
  assert.equal(store.getSnapshot().preferences.motion, 'full');
});
test('failed preference writes preserve the live in-memory choice', () => {
  const { store } = harness({ writeFails: true });
  store.start();
  store.update({ motion: 'reduced' });
  assert.equal(store.getSnapshot().preferences.motion, 'reduced');
  assert.equal(store.getSnapshot().sessionOnly, true);
});
test('storage events synchronize appearance without accepting unrelated records', () => {
  const { store, listeners } = harness();
  store.start();
  const before = store.getSnapshot();
  listeners.get('storage')({
    key: 'commerce-sentinel',
    newValue: 'irrelevant',
  });
  assert.equal(store.getSnapshot(), before);
  listeners.get('storage')({
    key: 'amiro-ui-preferences-v1',
    newValue: '{"version":1,"materials":"solid"}',
  });
  assert.equal(store.getSnapshot().preferences.materials, 'solid');
});
test('appearance subscriptions and window listener are removed cleanly', () => {
  const { store, listeners } = harness();
  const stop = store.start();
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  unsubscribe();
  store.update({ materials: 'solid' });
  assert.equal(calls, 0);
  stop();
  assert.equal(listeners.size, 0);
});
