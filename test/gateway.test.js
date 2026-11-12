import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../src/gateway-server.js';
import { gatewayGenerate, gatewayStatus } from '../src/gateway-client.js';

const token = 't'.repeat(48);
const valid = { name: '猫', art: ' /\\_/\\\n( o.o )\n > ^ <', avoidNames: [] };

test('gateway accepts only authenticated, bounded generation jobs and status reads', async (t) => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const gateway = createGateway({
    token,
    generate: async () => pending,
    status: async () => ({ connected: true, installed: true, model: 'qwen2.5:3b' })
  });
  await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => gateway.close());
  const root = `http://127.0.0.1:${gateway.address().port}`;
  const request = (path, options = {}) => fetch(root + path, {
    ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  assert.equal((await fetch(root + '/v1/status')).status, 401);
  assert.equal((await request('/api/delete')).status, 404);
  assert.equal((await request('/v1/skills/generate', { method: 'GET' })).status, 404);
  assert.equal((await request('/v1/status')).status, 200);
  assert.equal((await request('/v1/skills/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...valid, art: 'x'.repeat(1601) })
  })).status, 400);
  assert.equal((await request('/v1/skills/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...valid, avoidNames: ['x'.repeat(13000)] })
  })).status, 413);
  const started = await request('/v1/skills/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid)
  });
  assert.equal(started.status, 202);
  const { jobId } = await started.json();
  assert.match(jobId, /^[a-f0-9]{64}$/);
  assert.equal((await request(`/v1/skills/jobs/${jobId}`)).status, 202);
  const second = await request('/v1/skills/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid)
  });
  assert.equal(second.status, 202);
  const secondJobId = (await second.json()).jobId;
  assert.equal((await (await request(`/v1/skills/jobs/${secondJobId}`)).json()).status, 'queued');
  const busyStatus = await (await request('/v1/status')).json();
  assert.equal(busyStatus.active, 1);
  assert.equal(busyStatus.queued, 1);
  for (let i = 0; i < 2; i++) {
    assert.equal((await request('/v1/skills/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid)
    })).status, 202);
  }
  assert.equal((await request('/v1/skills/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid)
  })).status, 429);
  finish({ title: '猫', skills: [] });
  for (let i = 0; i < 20; i++) {
    const result = await request(`/v1/skills/jobs/${jobId}`);
    if (result.status === 200) {
      assert.equal((await result.json()).draft.title, '猫');
      for (let j = 0; j < 20; j++) {
        const queued = await request(`/v1/skills/jobs/${secondJobId}`);
        if (queued.status === 200) {
          assert.equal((await queued.json()).draft.title, '猫');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail('queued job did not finish');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('job did not finish');
});

test('gateway client requires a fixed HTTPS host and sends both Access and Bearer credentials', async () => {
  const old = Object.fromEntries(['OLLAMA_GATEWAY_URL', 'OLLAMA_GATEWAY_TOKEN', 'OLLAMA_GATEWAY_AUTH', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET']
    .map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  try {
    Object.assign(process.env, {
      OLLAMA_GATEWAY_URL: 'http://localhost:8787',
      OLLAMA_GATEWAY_TOKEN: token,
      CF_ACCESS_CLIENT_ID: 'client-id',
      CF_ACCESS_CLIENT_SECRET: 'client-secret'
    });
    delete process.env.OLLAMA_GATEWAY_AUTH;
    await assert.rejects(gatewayGenerate(valid), /HTTPS/);
    process.env.OLLAMA_GATEWAY_URL = 'https://ai.example.com';
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, `Bearer ${token}`);
      assert.equal(init.headers['CF-Access-Client-Id'], 'client-id');
      assert.equal(init.headers['CF-Access-Client-Secret'], 'client-secret');
      if (url.endsWith('/v1/status')) return new Response(JSON.stringify({ connected: true, installed: true }), { status: 200 });
      if (url.endsWith('/v1/skills/generate')) {
        assert.equal(init.method, 'POST');
        return new Response(JSON.stringify({ jobId: 'a'.repeat(64) }), { status: 202 });
      }
      return new Response(JSON.stringify({ draft: { title: '猫' } }), { status: 200 });
    };
    assert.deepEqual(await gatewayStatus('qwen2.5:3b'), { connected: true, installed: true, model: 'qwen2.5:3b', active: 0, queued: 0 });
    assert.equal((await gatewayGenerate(valid)).title, '猫');
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('gateway client permits the separate Tailscale Funnel port with Bearer only', async () => {
  const old = Object.fromEntries(['OLLAMA_GATEWAY_URL', 'OLLAMA_GATEWAY_TOKEN', 'OLLAMA_GATEWAY_AUTH', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET']
    .map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  try {
    Object.assign(process.env, {
      OLLAMA_GATEWAY_AUTH: 'tailscale',
      OLLAMA_GATEWAY_URL: 'https://nekoneko-pc.tail877793.ts.net:8443',
      OLLAMA_GATEWAY_TOKEN: token
    });
    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://nekoneko-pc.tail877793.ts.net:8443/v1/status');
      assert.deepEqual(init.headers, { Authorization: `Bearer ${token}` });
      return new Response(JSON.stringify({ connected: true, installed: true }), { status: 200 });
    };
    assert.equal((await gatewayStatus('qwen2.5:3b')).connected, true);
    process.env.OLLAMA_GATEWAY_URL = 'https://attacker.example.com:8443';
    await assert.rejects(gatewayGenerate(valid), /HTTPS/);
    process.env.OLLAMA_GATEWAY_URL = 'https://nekoneko-pc.tail877793.ts.net:443';
    await assert.rejects(gatewayGenerate(valid), /HTTPS/);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('gateway client recovers a job after a temporary tunnel 502 and gateway restart', async () => {
  const old = Object.fromEntries(['OLLAMA_GATEWAY_URL', 'OLLAMA_GATEWAY_TOKEN', 'OLLAMA_GATEWAY_AUTH']
    .map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  try {
    Object.assign(process.env, {
      OLLAMA_GATEWAY_AUTH: 'tailscale',
      OLLAMA_GATEWAY_URL: 'https://nekoneko-pc.tail877793.ts.net:8443',
      OLLAMA_GATEWAY_TOKEN: token
    });
    let submissions = 0;
    let polls = 0;
    globalThis.fetch = async (url) => {
      if (url.endsWith('/v1/skills/generate')) {
        submissions++;
        return new Response(JSON.stringify({ jobId: String(submissions).repeat(64) }), { status: 202 });
      }
      polls++;
      if (polls === 1) return new Response('<html>proxy error</html>', { status: 502 });
      if (polls === 2) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ draft: { title: '復旧した猫' } }), { status: 200 });
    };
    assert.equal((await gatewayGenerate(valid)).title, '復旧した猫');
    assert.equal(submissions, 2);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('gateway reuses the same job when a submission response is lost', async (t) => {
  let generations = 0;
  const gateway = createGateway({ token, generate: async () => {
    generations++;
    return { title: '猫', skills: [] };
  } });
  await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => gateway.close());
  const root = `http://127.0.0.1:${gateway.address().port}`;
  const requestId = 'f'.repeat(64);
  const submit = (body) => fetch(`${root}/v1/skills/generate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const first = await submit({ ...valid, requestId });
  const firstId = (await first.json()).jobId;
  const second = await submit({ ...valid, requestId });
  assert.equal(second.status, 202);
  assert.deepEqual(await second.json(), { jobId: firstId, reused: true });
  assert.equal((await submit({ ...valid, name: '別の猫', requestId })).status, 409);
  assert.equal((await submit({ ...valid, requestId: 'bad' })).status, 400);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(generations, 1);
});

test('gateway client retries a temporary submission failure with the same request ID', async () => {
  const old = Object.fromEntries(['OLLAMA_GATEWAY_URL', 'OLLAMA_GATEWAY_TOKEN', 'OLLAMA_GATEWAY_AUTH']
    .map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  try {
    Object.assign(process.env, {
      OLLAMA_GATEWAY_AUTH: 'tailscale',
      OLLAMA_GATEWAY_URL: 'https://nekoneko-pc.tail877793.ts.net:8443',
      OLLAMA_GATEWAY_TOKEN: token
    });
    let posts = 0;
    let requestId;
    globalThis.fetch = async (url, init) => {
      if (url.endsWith('/v1/skills/generate')) {
        posts++;
        const body = JSON.parse(init.body);
        if (requestId) assert.equal(body.requestId, requestId);
        requestId = body.requestId;
        if (posts === 1) return new Response('<html>temporary proxy error</html>', { status: 502 });
        return new Response(JSON.stringify({ jobId: 'a'.repeat(64) }), { status: 202 });
      }
      return new Response(JSON.stringify({ draft: { title: '復旧した猫' } }), { status: 200 });
    };
    assert.equal((await gatewayGenerate(valid)).title, '復旧した猫');
    assert.equal(posts, 2);
    assert.match(requestId, /^[a-f0-9]{64}$/);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
