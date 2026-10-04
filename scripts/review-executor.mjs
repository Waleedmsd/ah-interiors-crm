// Temporary review tooling. Remove this executor before merging the hardening PR.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const branch = 'codex/production-hardening-2026-10-04';
const repository = 'Waleedmsd/ah-interiors-crm';
assert.equal(process.env.GITHUB_REPOSITORY, repository);
assert.equal(process.env.GITHUB_REF, 'refs/heads/' + branch);
assert.equal(process.env.GITHUB_EVENT_NAME, 'push');
const plan = JSON.parse(await readFile('scripts/review-plan.json', 'utf8'));
const escape = value => String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

if (plan.mode === 'inspect') {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = directory + '/' + entry.name;
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!/\.tsx?$/.test(path)) continue;
      const source = await readFile(path, 'utf8');
      const hits = source.split('\n').flatMap((line, index) => /\bcost\b|\bcostVerified\b/.test(line) ? [{ line: index + 1, text: line.slice(0, 1400) }] : []);
      if (hits.length) found.push({ path, sha: createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest('hex'), hits });
    }
  }
  for (const directory of ['lib', 'components', 'server', 'app']) await walk(directory);
  const batches = [];
  let batch = [];
  for (const file of found) {
    if (JSON.stringify([...batch, file]).length > 10000 && batch.length) { batches.push(batch); batch = []; }
    batch.push(file);
  }
  if (batch.length) batches.push(batch);
  assert.ok(batches.length <= 10, 'Review inventory exceeds annotation budget; narrow inspection first.');
  for (let index = 0; index < batches.length; index++) console.log(`::notice title=Source review ${index + 1} of ${batches.length}::${escape(JSON.stringify(batches[index]))}`);
  console.log(`Inspected ${found.length} source files. No source changes made.`);
} else if (plan.mode === 'apply') {
  assert.ok(Array.isArray(plan.files) && plan.files.length > 0 && plan.files.length <= 30);
  assert.ok(typeof plan.message === 'string' && plan.message.length < 200);
  assert.ok(process.env.GITHUB_TOKEN);
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub operation failed: ${method} ${path}, status ${response.status}`);
    return response.json();
  };
  const ref = await api('/git/ref/heads/' + branch);
  assert.equal(ref.object.sha, process.env.GITHUB_SHA, 'Branch changed since this exact review plan was triggered. Reconcile before retrying.');
  const parent = await api('/git/commits/' + ref.object.sha);
  const changed = [];
  const seen = new Set();
  for (const file of plan.files) {
    assert.ok(/^(lib|components|server|app|tests)\/[a-zA-Z0-9_./\[\]-]+\.(ts|tsx|css|mjs)$/.test(file.path) && !file.path.includes('..'));
    assert.ok(!seen.has(file.path)); seen.add(file.path);
    let content = await readFile(file.path, 'utf8');
    const sha = createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
    assert.equal(sha, file.sha, `Source changed: ${file.path}`);
    assert.ok(Array.isArray(file.replacements) && file.replacements.length > 0);
    for (const replacement of file.replacements) {
      assert.ok(typeof replacement.from === 'string' && replacement.from.length > 0 && typeof replacement.to === 'string');
      const count = content.split(replacement.from).length - 1;
      assert.equal(count, replacement.count ?? 1, `Exact replacement no longer matches ${file.path}`);
      content = content.split(replacement.from).join(replacement.to);
    }
    changed.push({ path: file.path, content });
  }
  const tree = [];
  for (const file of changed) {
    const blob = await api('/git/blobs', 'POST', { content: Buffer.from(file.content).toString('base64'), encoding: 'base64' });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await api('/git/trees', 'POST', { base_tree: parent.tree.sha, tree });
  const commit = await api('/git/commits', 'POST', { message: plan.message, tree: newTree.sha, parents: [parent.sha] });
  await api('/git/refs/heads/' + branch, 'PATCH', { sha: commit.sha, force: false });
  console.log(`::notice title=Reviewed patch committed::${commit.sha}: ${changed.map(file => file.path).join(', ')}`);
  console.log('The application is not deployed or merged. Run the quality gate on the resulting commit before release.');
} else { throw new Error('Unsupported review plan mode.'); }
