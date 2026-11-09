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
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'development', PORT: String(port), DATABASE_URL: '', GEMINI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe']
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
  assert.equal((await request('players/BobTest/fighters')).status, 401);
  const publicBob = await request('players/BobTest/fighters', null, ac);
  assert.equal(publicBob.status, 200);
  assert.equal(publicBob.body.fighters[0].name, '猫2');
  assert.ok(!Object.hasOwn(publicBob.body.fighters[0], 'owner_id'));
  assert.equal((await request('trades', null, ac)).body.trades.length, 0);
  assert.equal((await request('trades', { toUsername: 'BobTest', offeredFighterId: fighterB.body.fighter.id, requestedFighterId: fighterA.body.fighter.id }, ac)).status, 409);
  const requestTrade = { toUsername: 'BobTest', offeredFighterId: fighterA.body.fighter.id, requestedFighterId: fighterB.body.fighter.id };
  const pending = await request('trades', requestTrade, ac);
  assert.equal(pending.status, 201, JSON.stringify(pending.body));
  const tradeId = pending.body.trade.id;
  assert.equal((await request('trades', requestTrade, ac)).status, 409);
  assert.equal((await request(`trades/${tradeId}/accept`, {}, ac)).status, 403);
  assert.equal((await request(`trades/${tradeId}/accept`, {})).status, 401);
  const accepted = await request(`trades/${tradeId}/accept`, {}, bc);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.trade.status, 'accepted');
  assert.equal((await request('fighters', null, ac)).body.fighters[0].id, fighterB.body.fighter.id);
  assert.equal((await request('fighters', null, bc)).body.fighters[0].id, fighterA.body.fighter.id);
  assert.equal((await request(`trades/${tradeId}/accept`, {}, bc)).status, 409);
  assert.equal((await request('trades', null, bc)).body.trades[0].status, 'accepted');
  assert.equal((await request('pve/enemies')).status, 401);
  assert.equal((await request('pve/history')).status, 401);
  const pveEnemies = await request('pve/enemies', null, ac);
  assert.equal(pveEnemies.status, 200);
  assert.equal(pveEnemies.body.enemies.length, 4);
  assert.equal((await request('pve/battle', { difficulty: 'boss', fighterId: 'invalid' }, ac)).status, 400);
  assert.equal((await request('pve/battle', { difficulty: 'easy', fighterId: fighterA.body.fighter.id }, ac)).status, 403);
  const pve = await request('pve/battle', { difficulty: 'easy', fighterId: fighterB.body.fighter.id }, ac);
  assert.equal(pve.status, 201, JSON.stringify(pve.body));
  assert.equal(pve.body.battle.difficulty, 'easy');
  assert.ok(pve.body.battle.log.length >= 1);
  const pveHistory = await request('pve/history', null, ac);
  assert.equal(pveHistory.status, 200);
  assert.equal(pveHistory.body.wins + pveHistory.body.losses, 1);
  assert.equal(pveHistory.body.matches[0].id, pve.body.battle.id);
  assert.ok(!Object.hasOwn(pveHistory.body.matches[0], 'transcript'));
  assert.equal((await request('pve/history', null, bc)).body.matches.length, 0);
  assert.equal((await request('history', null, ac)).body.matches.length, 0);
  assert.equal((await request('me', null, ac)).body.user.wins, 0);
  assert.equal((await request('me', null, ac)).body.user.losses, 0);
  const wsA = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: url, Cookie: ac } });
  const wsB = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: url, Cookie: bc } });
  t.after(() => { wsA.close(); wsB.close(); });
  const messagesA = [];
  const messagesB = [];
  wsA.on('message', (d) => messagesA.push(JSON.parse(d)));
  wsB.on('message', (d) => messagesB.push(JSON.parse(d)));
  await Promise.all([new Promise((r) => wsA.on('open', r)), new Promise((r) => wsB.on('open', r))]);
  wsA.send(JSON.stringify({ type: 'queue:join', fighterId: fighterB.body.fighter.id }));
  wsB.send(JSON.stringify({ type: 'queue:join', fighterId: fighterA.body.fighter.id }));
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
