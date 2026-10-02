import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
const read = (file) =>
  readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const sheet = postcss.parse(read('app/motion.css'));
test('spatial targets use live preferences without remounting business state', () => {
  const react = read('components/studio-motion.tsx');
  assert.match(react, /preferences\.motion === 'reduced'/);
  assert.match(react, /y: reduced \? 0 : 8/);
  assert.match(react, /Math\.min\(delay,\s*0?\.16\)/);
  assert.doesNotMatch(react, /key=\{preferences/);
  const assistant = read('components/assistant-panel.tsx');
  assert.match(assistant, /y: reduced \? 0 : 8/);
  const nav = read('components/studio-navigation.tsx');
  assert.match(nav, /reduced \?[\s\S]*liquid-nav-selection/);
  assert.doesNotMatch(
    read('components/customer-workspace.tsx'),
    /whileHover|index %/,
  );
});
test('first entrance has a one-session lifecycle separate from live motion mode', () => {
  assert.match(
    read('components/ui-preferences-provider.tsx'),
    /dataset\.entrance/,
  );
  assert.match(read('app/motion.css'), /data-entrance='playing'/);
  assert.doesNotMatch(
    read('app/motion.css'),
    /data-ui-ready='true'.*animation/,
  );
});
test('motion rules have defined keyframes and no perpetual or blanket transitions', () => {
  const names = new Set();
  sheet.walkAtRules('keyframes', (rule) => names.add(rule.params));
  sheet.walkDecls('animation', (decl) => {
    if (decl.value === 'none') return;
    assert.ok(names.has(decl.value.split(/\s+/)[0]), decl.value);
    assert.doesNotMatch(decl.value, /infinite/);
  });
  sheet.walkDecls('transition', (decl) =>
    assert.doesNotMatch(decl.value, /\ball\b/),
  );
  assert.match(read('app/motion.css'), /data-motion='reduced'/);
});
test('all portalled glass surfaces have solid and unsupported-filter fallbacks', () => {
  const css = read('app/reskin.css');
  for (const slot of [
    'dialog-content',
    'sheet-content',
    'popover-content',
    'select-content',
    'dropdown-menu-content',
    'command-dialog',
  ]) {
    assert.match(
      css,
      new RegExp("data-materials='solid'[\\s\\S]*data-slot='" + slot + "'"),
    );
    assert.match(
      css,
      new RegExp("@supports not[\\s\\S]*data-slot='" + slot + "'"),
    );
  }
});
test('print disables CSS motion and restores visible invoice surfaces', () => {
  const print = sheet.nodes.find(
    (node) => node.type === 'atrule' && node.params === 'print',
  );
  assert.ok(print);
  const values = new Map();
  print.walkDecls((decl) => {
    assert.ok(decl.important);
    values.set(decl.prop, decl.value);
  });
  for (const prop of [
    'animation',
    'transition',
    'translate',
    'scale',
    'rotate',
    'transform',
  ])
    assert.equal(values.get(prop), 'none');
  assert.equal(values.get('opacity'), '1');
});
