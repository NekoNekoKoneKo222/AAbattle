import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

test('Worker forwards only the fixed gateway routes and bearer header', async () => {
  let forwarded;
  const env = { GATEWAY: { fetch: async (request) => {
    forwarded = request;
    return new Response(JSON.stringify({ connected: true }), { status: 200 });
  } } };
  const reject = await worker.fetch(new Request('https://example.workers.dev/api/delete', { method: 'POST' }), env);
  assert.equal(reject.status, 404);
  assert.equal(forwarded, undefined);
  const status = await worker.fetch(new Request('https://example.workers.dev/v1/status', {
    headers: { Authorization: 'Bearer secret', 'CF-Access-Client-Secret': 'should-not-forward' }
  }), env);
  assert.equal(status.status, 200);
  assert.equal(forwarded.url, 'http://127.0.0.1:8787/v1/status');
  assert.equal(forwarded.headers.get('Authorization'), 'Bearer secret');
  assert.equal(forwarded.headers.get('CF-Access-Client-Secret'), null);
});
