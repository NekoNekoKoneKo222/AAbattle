import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';

async function freePort() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

test('account registration, authentication, character saving and online matchmaking', { timeout: 30000 }, async (t) => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'development', PORT: String(port), DATABASE_URL: '', OPENAI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  server.stderr.on('data', (d) => { output += d.toString(); });
  t.after(() => server.kill('SIGTERM'));
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(`Server stopped: ${output}`);
    try { const r = await fetch(`${url}/api/health`); if (r.ok) { ready = true; break; } } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  assert.ok(ready, output || 'Server not ready');

  async function request(endpoint, data, token) {
    const res = await fetch(`${url}/api/${endpoint}`, {
      method: data ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: token } : {}) },
      body: data ? JSON.stringify(data) : undefined
    });
    return { status: res.status, cookie: res.headers.get('set-cookie'), body: await res.json() };
  }
  const alice = await request('register', { username: 'AliceTest', password: 'safe-password-123' });
  const bob = await request('register', { username: 'BobTest', password: 'safe-password-456' });
  assert.equal(alice.status, 201);
  assert.equal(bob.status, 201);
  assert.match(alice.cookie, /HttpOnly/);
  assert.match(alice.cookie, /SameSite=Lax/);
  const ac = alice.cookie.split(';')[0];
  const bc = bob.cookie.split(';')[0];
  assert.equal((await request('login', { username: 'AliceTest', password: 'wrong-password' })).status, 401);
  assert.equal((await request('me')).body.user, null);
  assert.equal((await request('me', null, ac)).body.user.username, 'AliceTest');

  const art = ' /\\_/\\\n( o.o )\n > ^ <';
  const fighterA = await request('fighters', { name: '猫', art }, ac);
  const fighterB = await request('fighters', { name: '猫2', art: '[o_o]\n /|\\' }, bc);
  assert.equal(fighterA.status, 201, JSON.stringify(fighterA.body));
  assert.equal(fighterB.status, 201, JSON.stringify(fighterB.body));
  assert.equal(fighterA.body.fighter.art, art);
  assert.equal((await request('fighters', null, ac)).body.fighters.length, 1);
  const wsA = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: url, Cookie: ac } });
  const wsB = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: url, Cookie: bc } });
  t.after(() => { wsA.close(); wsB.close(); });
  const messagesA = [];
  const messagesB = [];
  wsA.on('message', (d) => messagesA.push(JSON.parse(d)));
  wsB.on('message', (d) => messagesB.push(JSON.parse(d)));
  await Promise.all([new Promise((r) => wsA.on('open', r)), new Promise((r) => wsB.on('open', r))]);
  wsA.send(JSON.stringify({ type: 'queue:join', fighterId: fighterA.body.fighter.id }));
  wsB.send(JSON.stringify({ type: 'queue:join', fighterId: fighterB.body.fighter.id }));
  let finished = false;
  for (let i = 0; i < 250; i++) {
    if (messagesA.some((x) => x.type === 'battle:finish') && messagesB.some((x) => x.type === 'battle:finish')) { finished = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 70));
  }
  assert.ok(finished, `Match did not finish: ${JSON.stringify(messagesA.slice(-4))}`);
  assert.ok(messagesA.some((x) => x.type === 'battle:start'));
  assert.ok(messagesA.some((x) => x.type === 'battle:turn'));
  assert.equal((await request('history', null, ac)).body.matches.length, 1);
  assert.equal((await request('history', null, bc)).body.matches.length, 1);
  const logout = await request('logout', {}, ac);
  assert.equal(logout.status, 200);
  assert.equal((await request('me', null, ac)).body.user, null);
});
