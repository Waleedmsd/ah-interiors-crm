import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(
  new URL('../lib/mail-state.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const plain = (value) => JSON.parse(JSON.stringify(value));
function load({ readFails = false, writeFails = false, raw = null } = {}) {
  const data = new Map([['ah-interiors-local-workspace-v3', 'KEEP-LEDGER']]);
  if (raw !== null) data.set('amiro-mail-preview-v1', raw);
  let failWrites = writeFails;
  const listeners = new Map();
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    URLSearchParams,
    localStorage: {
      getItem: (key) => {
        if (readFails) throw Error('blocked');
        return data.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (failWrites) throw Error('quota');
        data.set(key, value);
      },
    },
    window: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    },
  });
  return {
    ...module.exports,
    disk: data,
    listeners,
    allowWrites: () => {
      failWrites = false;
    },
  };
}
const draft = (extra = {}) => ({
  id: 'qa-1',
  mode: 'new',
  to: 'test@example.invalid',
  cc: '',
  bcc: '',
  subject: 'A clear subject',
  body: 'Hello from the local QA suite.',
  attachments: [],
  updatedAt: 100,
  ...extra,
});
test('mail storage is versioned and isolated from the commerce ledger', () => {
  const m = load();
  assert.equal(m.MAIL_STORAGE_KEY, 'amiro-mail-preview-v1');
  const store = m.createMailStore();
  store.start();
  store.commit({ type: 'save', draft: draft() });
  assert.equal(m.disk.get('ah-interiors-local-workspace-v3'), 'KEEP-LEDGER');
  assert.equal(JSON.parse(m.disk.get(m.MAIL_STORAGE_KEY)).drafts.length, 1);
});
test('mail parser accepts valid local data and rejects corrupt or future versions', () => {
  const m = load();
  assert.deepEqual(plain(m.parseMailState(null)), plain(m.emptyMailState()));
  for (const raw of [
    'null',
    '[]',
    '{bad',
    '{"version":2,"drafts":[],"flags":{}}',
  ])
    assert.throws(() => m.parseMailState(raw));
  const state = m.updateMail(m.emptyMailState(), {
    type: 'save',
    draft: draft(),
  });
  assert.equal(
    m.parseMailState(JSON.stringify(state)).drafts[0].subject,
    draft().subject,
  );
});
test('draft identity is idempotent; blanking a saved draft replaces its old body', () => {
  const m = load();
  let state = m.updateMail(m.emptyMailState(), {
    type: 'save',
    draft: draft(),
  });
  state = m.updateMail(state, {
    type: 'save',
    draft: draft({ subject: '', body: '', to: '', updatedAt: 101 }),
    expectedUpdatedAt: 100,
  });
  assert.equal(state.drafts.length, 1);
  assert.equal(state.drafts[0].body, '');
});
test('discard removes only the chosen local draft', () => {
  const m = load();
  let state = m.updateMail(m.emptyMailState(), {
    type: 'save',
    draft: draft(),
  });
  state = m.updateMail(state, { type: 'save', draft: draft({ id: 'qa-2' }) });
  state = m.updateMail(state, {
    type: 'discard',
    id: 'qa-1',
    expectedUpdatedAt: 100,
  });
  assert.deepEqual(plain(state.drafts.map((d) => d.id)), ['qa-2']);
  assert.equal(state.flags.rauch.read, true);
});
test('star, read and archive flags stay attached to stable thread IDs', () => {
  const m = load();
  let state = m.updateMail(m.emptyMailState(), {
    type: 'flags',
    ids: ['sarah'],
    patch: { starred: true, archived: true },
  });
  state = m.updateMail(state, {
    type: 'flags',
    ids: ['sarah'],
    patch: { read: true },
  });
  assert.deepEqual(plain(m.mailFlags(state, 'sarah')), {
    starred: true,
    archived: true,
    read: true,
  });
  assert.equal(m.mailFlags(state, 'john').starred, false);
});
test('review validates all recipients, subject and body without blocking incomplete draft storage', () => {
  const m = load();
  assert.equal(m.draftErrors(draft()).length, 0);
  assert.equal(
    m.draftErrors(draft({ to: '', subject: '', body: '' })).length,
    3,
  );
  assert.ok(
    m.draftErrors(draft({ cc: 'bad address', bcc: 'also-bad' })).length >= 2,
  );
  assert.equal(
    m.draftErrors(draft({ to: 'one@example.invalid;two@example.invalid' }))
      .length,
    0,
  );
  assert.ok(
    m.draftErrors(draft({ to: 'qa@example.invalid\nBcc:evil@example.invalid' }))
      .length,
  );
});
test('mail-app handoff percent-encodes spaces, plus signs, newlines and query characters', () => {
  const m = load();
  const uri = m.mailtoFor(
    draft({
      subject: 'A + B & C',
      body: 'Hello\nNext line',
      cc: 'copy@example.invalid',
      bcc: 'private@example.invalid',
    }),
  );
  assert.ok(uri.startsWith('mailto:test%40example.invalid?'));
  assert.ok(uri.includes('subject=A%20%2B%20B%20%26%20C'));
  assert.ok(uri.includes('%0A'));
  assert.ok(!uri.includes('+'));
  assert.throws(() => m.mailtoFor(draft({ to: 'invalid' })));
});
test('oversized and malformed attachment metadata cannot enter saved state', () => {
  const m = load();
  for (const attachments of [
    [{ id: 'f', name: 'f.pdf', size: -1 }],
    [{ id: 'f', name: 'f.pdf', size: 30 * 1024 * 1024 }],
    Array.from({ length: 11 }, (_, i) => ({
      id: String(i),
      name: 'f.txt',
      size: 1,
    })),
  ])
    assert.throws(() =>
      m.updateMail(m.emptyMailState(), {
        type: 'save',
        draft: draft({ attachments }),
      }),
    );
});
test('mail store hydrates and removes its storage listener cleanly', () => {
  const m = load();
  const store = m.createMailStore();
  let notifications = 0;
  const unsub = store.subscribe(() => notifications++);
  const stop = store.start();
  assert.equal(store.getSnapshot().loaded, true);
  assert.equal(notifications, 1);
  unsub();
  stop();
  assert.equal(m.listeners.size, 0);
});
test('unreadable saved mail is retained and edits become session-only', () => {
  const m = load({ raw: 'DO-NOT-OVERWRITE' });
  const store = m.createMailStore();
  store.start();
  assert.equal(store.getSnapshot().sessionOnly, true);
  store.commit({ type: 'save', draft: draft() });
  assert.equal(m.disk.get(m.MAIL_STORAGE_KEY), 'DO-NOT-OVERWRITE');
  assert.equal(store.getSnapshot().data.drafts.length, 1);
});
test('unavailable storage retains a usable in-memory draft', () => {
  const m = load({ readFails: true });
  const store = m.createMailStore();
  store.start();
  assert.equal(
    store.commit({ type: 'save', draft: draft() }).sessionOnly,
    true,
  );
  assert.equal(store.getSnapshot().data.drafts[0].body, draft().body);
});
test('a storage event cannot erase drafts retained after a failed write', () => {
  const m = load({ writeFails: true });
  const store = m.createMailStore();
  store.start();
  store.commit({ type: 'save', draft: draft() });
  m.allowWrites();
  m.disk.set(m.MAIL_STORAGE_KEY, JSON.stringify(m.emptyMailState()));
  m.listeners.get('storage')({ key: m.MAIL_STORAGE_KEY });
  assert.equal(store.getSnapshot().data.drafts[0].id, 'qa-1');
  assert.match(store.getSnapshot().warning, /retained/);
});
test('external storage changes block stale commits when not yet reconciled', () => {
  const m = load();
  const store = m.createMailStore();
  store.start();
  m.disk.set(m.MAIL_STORAGE_KEY, JSON.stringify(m.emptyMailState()));
  assert.match(
    store.commit({ type: 'save', draft: draft() }).error,
    /another tab/,
  );
  assert.equal(store.getSnapshot().data.drafts.length, 0);
});
test('per-draft revisions prevent a stale composer from overwriting or discarding a remote update', () => {
  const m = load();
  const store = m.createMailStore();
  store.start();
  store.commit({ type: 'save', draft: draft(), expectedUpdatedAt: null });
  const remote = m.updateMail(store.getSnapshot().data, {
    type: 'save',
    draft: draft({ body: 'newer remote', updatedAt: 200 }),
  });
  m.disk.set(m.MAIL_STORAGE_KEY, JSON.stringify(remote));
  m.listeners.get('storage')({ key: m.MAIL_STORAGE_KEY });
  assert.match(
    store.commit({
      type: 'save',
      draft: draft({ body: 'old composer', updatedAt: 300 }),
      expectedUpdatedAt: 100,
    }).error,
    /changed elsewhere/,
  );
  assert.match(
    store.commit({ type: 'discard', id: 'qa-1', expectedUpdatedAt: 100 }).error,
    /changed elsewhere/,
  );
  assert.equal(store.getSnapshot().data.drafts[0].body, 'newer remote');
});
test('unrelated storage events never replace mail state', () => {
  const m = load();
  const store = m.createMailStore();
  store.start();
  const before = store.getSnapshot();
  m.listeners.get('storage')({ key: 'ah-interiors-local-workspace-v3' });
  assert.equal(store.getSnapshot(), before);
});
test('duplicate draft IDs and invalid flags are rejected on restoration', () => {
  const m = load();
  assert.throws(() =>
    m.parseMailState(
      JSON.stringify({ version: 1, drafts: [draft(), draft()], flags: {} }),
    ),
  );
  assert.throws(() =>
    m.parseMailState(
      JSON.stringify({
        version: 1,
        drafts: [],
        flags: { rauch: { read: 'yes', starred: false, archived: false } },
      }),
    ),
  );
});
