import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createSamOnline } from '../src/sam-online.js';

function next(ws, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.off('message', receive); reject(new Error(`Timed out waiting for ${type}`)); }, 3000);
    function receive(raw) {
      const value = JSON.parse(String(raw));
      if (value.type === type) { clearTimeout(timeout); ws.off('message', receive); resolve(value); }
    }
    ws.on('message', receive);
  });
}

test('two guests can join a room while the server alone calculates combat', async (t) => {
  const online = createSamOnline();
  const server = http.createServer();
  server.on('upgrade', (req, socket, head) => online.handleUpgrade(req, socket, head));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { online.close(); server.close(); });
  const root = `ws://127.0.0.1:${server.address().port}`;
  const one = new WebSocket(root);
  const two = new WebSocket(root);
  t.after(() => { one.close(); two.close(); });
  await Promise.all([new Promise((resolve) => one.once('open', resolve)), new Promise((resolve) => two.once('open', resolve))]);
  const joinedOne = next(one, 'joined');
  one.send(JSON.stringify({ type: 'create', name: 'DRAWER', stage: { name: 'TEST', platforms: [{ x: 120, y: 430, w: 720, h: 16 }] } }));
  const { code, slot } = await joinedOne;
  assert.equal(slot, 0);
  const joinedTwo = next(two, 'joined');
  two.send(JSON.stringify({ type: 'join', code, name: 'FRIEND' }));
  assert.equal((await joinedTwo).slot, 1);
  const started = next(two, 'started');
  one.send(JSON.stringify({ type: 'start' }));
  const first = await started;
  assert.equal(first.match.fighters[0].damage, 0);
  const state = next(two, 'state');
  one.send(JSON.stringify({ type: 'input', input: { right: true }, damage: 999, winner: 0 }));
  const nextState = await state;
  assert.equal(nextState.match.fighters[0].damage, 0);
  assert.equal(nextState.match.winner, null);
  assert.ok(nextState.match.fighters[0].x > first.match.fighters[0].x);
});
