import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { createSpra, SPRA_WIDTH, SPRA_HEIGHT, SPRA_WEAPONS } from '../src/spra.js';
import { INK_SCALE, createInkSurface } from '../src/spra-ink.js';

test('SPRA is a bounded top-down ink arena with different weapons', () => {
  assert.equal(SPRA_WIDTH, 54);
  assert.equal(SPRA_HEIGHT, 34);
  assert.deepEqual(Object.keys(SPRA_WEAPONS), ['shooter', 'roller', 'blaster']);
});

function inbox(socket) {
  const messages = [];
  const waiters = [];
  socket.on('message', buffer => {
    const msg = JSON.parse(buffer.toString());
    messages.push(msg);
    for (const item of [...waiters]) {
      if (!item.check(msg)) continue;
      waiters.splice(waiters.indexOf(item), 1);
      clearTimeout(item.timer);
      item.resolve(msg);
    }
  });
  return check => {
    const found = messages.find(check);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const item = { check, resolve, timer: null };
      item.timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(item), 1);
        reject(new Error('SPRA event timeout'));
      }, 3500);
      waiters.push(item);
    });
  };
}

test('PVP: two players join a room, start and paint while moving', { timeout: 9000 }, async () => {
  const spra = createSpra();
  const server = createServer();
  server.on('upgrade', (req, socket, head) => spra.upgrade(req, socket, head));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  let a, b;
  try {
    a = new WebSocket('ws://127.0.0.1:' + port);
    const receiveA = inbox(a);
    await new Promise((resolve, reject) => { a.once('open', resolve); a.once('error', reject); });
    a.send(JSON.stringify({ type: 'join', name: 'BLUE' }));
    const welcomeA = await receiveA(x => x.type === 'welcome');
    assert.match(welcomeA.code, /^[A-F0-9]{6}$/);
    assert.equal(Buffer.from(welcomeA.paint, 'base64').byteLength, SPRA_WIDTH * SPRA_HEIGHT * INK_SCALE * INK_SCALE);

    b = new WebSocket('ws://127.0.0.1:' + port);
    const receiveB = inbox(b);
    await new Promise((resolve, reject) => { b.once('open', resolve); b.once('error', reject); });
    b.send(JSON.stringify({ type: 'join', code: welcomeA.code, name: 'ORANGE' }));
    const welcomeB = await receiveB(x => x.type === 'welcome');
    assert.equal(welcomeA.code, welcomeB.code);
    const lobby = await receiveA(x => x.type === 'state' && x.players.length === 2);
    assert.equal(lobby.players[0].team, 0);
    assert.equal(lobby.players[1].team, 1);

    a.send(JSON.stringify({ type: 'start' }));
    const running = await receiveA(x => x.type === 'state' && x.phase === 'playing');
    assert.equal(running.players.length, 2);
    a.send(JSON.stringify({ type: 'input', x: 0, y: 0, aim: 0, fire: true, swim: false }));
    const painted = await receiveA(x => x.type === 'state' && x.phase === 'playing' && x.scores[0] > 0);
    assert.ok(painted.changes.length > 0);
    assert.ok(painted.players.find(p => p.id === welcomeA.id).ink < 100);
    const opponent = painted.players.find(p => p.id === welcomeB.id);
    assert.equal(opponent.team, 1);
  } finally {
    a?.close(); b?.close();
    spra.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('PVP: clients cannot submit invalid room join codes', { timeout: 7000 }, async () => {
  const spra = createSpra();
  const server = createServer();
  server.on('upgrade', (req, socket, head) => spra.upgrade(req, socket, head));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const socket = new WebSocket('ws://127.0.0.1:' + server.address().port);
  try {
    const receive = inbox(socket);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    socket.send(JSON.stringify({ type: 'join', code: 'NOTREAL', name: 'PLAYER' }));
    const error = await receive(x => x.type === 'error');
    assert.match(error.message, /部屋が見つかりません/);
  } finally {
    socket.close(); spra.close();
    await new Promise(resolve => server.close(resolve));
  }
});
test('organic ink: irregular splash stamps cover subcells and count painted area precisely', () => {
  const ink = createInkSurface(20, 14, [{ x: 10, y: 5, w: 2, h: 3 }]);
  assert.equal(ink.sample(7, 7), 0);
  ink.impact(7, 7, 2.2, 0, 0.6, 341, 'shooter');
  assert.equal(ink.sample(7, 7), 1);
  assert.equal(ink.sample(11, 6), 0, 'ink must not cover solid walls');
  assert.ok(ink.score()[0] > 0);
  assert.ok(ink.score()[0] < 15);
  assert.equal(ink.counts[0], ink.paint.reduce((total, c) => total + (c === 1), 0));
  const delta = ink.flush();
  assert.equal(delta.length % 3, 0);
  assert.ok(delta.length > 0);
  const replica = new Uint8Array(ink.paint.length);
  for (let i = 0; i < delta.length; i += 3) {
    replica.fill(delta[i + 2], delta[i], delta[i] + delta[i + 1]);
  }
  assert.deepEqual(replica, ink.paint);
  assert.deepEqual(ink.flush(), []);
  const before = ink.score()[0];
  ink.impact(7, 7, 2.2, 0, 0.6, 341, 'shooter');
  assert.equal(ink.score()[0], before, 'repainting same team does not gain extra points');
  ink.impact(7, 7, 1.1, 1, 0.3, 997, 'bomb');
  assert.ok(ink.counts[1] > 0 && ink.counts[0] > 0);
  assert.ok(ink.score()[0] < before);
  ink.clear();
  assert.deepEqual(ink.score(), [0, 0]);
  assert.equal(ink.sample(7, 7), 0);
});

test('organic ink: roller leaves a continuous band while shots scatter', () => {
  const ink = createInkSurface(25, 18);
  ink.trail(3, 9, 16, 9, 0.9, 0, 113, true);
  assert.equal(ink.sample(9, 9), 1);
  assert.equal(ink.sample(14, 9), 1);
  const rollerArea = ink.counts[0];
  ink.trail(3, 12, 16, 12, 0.2, 1, 431, false);
  assert.ok(rollerArea > ink.counts[1] * 3);
});
