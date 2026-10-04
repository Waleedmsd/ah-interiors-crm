import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, ApiError } from '../../lib/api-client';

async function withFetch(fake: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('API client preserves Headers objects and forces same-origin credentials', async () => {
  await withFetch(async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('X-Request-ID'), 'test-request');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.equal(headers.get('Accept'), 'application/json');
    assert.equal(init?.credentials, 'same-origin');
    return Response.json({ saved: true });
  }, async () => {
    const result = await apiRequest('/api/test', {
      method: 'POST', body: '{}', credentials: 'include',
      headers: new Headers({ 'X-Request-ID': 'test-request' }),
    });
    assert.deepEqual(result, { saved: true });
  });
});

test('API client preserves tuple headers and explicitly supplied content types', async () => {
  await withFetch(async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'text/plain');
    assert.equal(new Headers(init?.headers).get('X-Test'), 'tuple');
    return Response.json([]);
  }, async () => {
    assert.deepEqual(await apiRequest('/api/test', {
      body: 'example', headers: [['X-Test', 'tuple'], ['Content-Type', 'text/plain']],
    }), []);
  });
});

test('API client does not invent a multipart content type', async () => {
  await withFetch(async (_input, init) => {
    assert.equal(new Headers(init?.headers).has('Content-Type'), false);
    return Response.json({ uploaded: true });
  }, async () => { await apiRequest('/api/test', { method: 'POST', body: new FormData() }); });
});

test('API client accepts successful no-content responses', async () => {
  await withFetch(async () => new Response(null, { status: 204 }), async () => {
    assert.equal(await apiRequest('/api/test'), undefined);
  });
});

test('API client retains structured validation and conflict errors', async () => {
  await withFetch(async () => Response.json({ error: { code: 'VERSION_CONFLICT', message: 'Reload this record.' } }, { status: 409 }), async () => {
    await assert.rejects(apiRequest('/api/test'), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'VERSION_CONFLICT');
      assert.equal(error.message, 'Reload this record.');
      return true;
    });
  });
});

test('API client never displays an HTML gateway response as a business error', async () => {
  await withFetch(async () => new Response('<html>private diagnostic</html>', { status: 502 }), async () => {
    await assert.rejects(apiRequest('/api/test'), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      assert.equal(error.code, 'REQUEST_FAILED');
      assert.ok(!error.message.includes('private diagnostic'));
      return true;
    });
  });
});

test('API client treats unreadable successful responses as failures, not saved data', async () => {
  await withFetch(async () => new Response('not JSON', { status: 200 }), async () => {
    await assert.rejects(apiRequest('/api/test'), error => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
  });
});

test('API client reports network uncertainty without retrying mutations automatically', async () => {
  let attempts = 0;
  await withFetch(async () => { attempts++; throw new TypeError('connection reset'); }, async () => {
    await assert.rejects(apiRequest('/api/test', { method: 'POST', body: '{}' }), error => error instanceof ApiError && error.code === 'NETWORK_ERROR');
    assert.equal(attempts, 1);
  });
});

test('API client preserves request cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = new DOMException('cancelled', 'AbortError');
  await withFetch(async () => { throw cancelled; }, async () => {
    await assert.rejects(apiRequest('/api/test', { signal: controller.signal }), error => error === cancelled);
  });
});
