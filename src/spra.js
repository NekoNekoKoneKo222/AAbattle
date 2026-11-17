import { randomUUID, randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

export const SPRA_WIDTH = 54;
export const SPRA_HEIGHT = 34;
export const SPRA_DURATION = 180;
const MAX_HUMANS = 8;
const STEP = 0.05;
const COLORS = ['#25d4f5', '#ff9c28'];
const WALLS = [
  { x: 13, y: 5, w: 4, h: 7 }, { x: 37, y: 22, w: 4, h: 7 },
  { x: 13, y: 22, w: 4, h: 7 }, { x: 37, y: 5, w: 4, h: 7 },
  { x: 23, y: 14, w: 8, h: 6 },
  { x: 5, y: 15, w: 5, h: 4 }, { x: 44, y: 15, w: 5, h: 4 }
];
export const SPRA_WEAPONS = Object.freeze({
  shooter: { label: 'シューター', delay: 0.17, cost: 4, damage: 18, range: 15, radius: 1.15 },
  roller: { label: 'ローラー', delay: 0.48, cost: 9, damage: 32, range: 4.2, radius: 2.55 },
  blaster: { label: 'ブラスター', delay: 0.72, cost: 11, damage: 38, range: 12, radius: 2.45 }
});
const roomCode = () => randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearWall = (x, y, radius = 0.38) => x < 1 + radius || y < 1 + radius ||
  x > SPRA_WIDTH - 1 - radius || y > SPRA_HEIGHT - 1 - radius ||
  WALLS.some(r => x + radius > r.x && x - radius < r.x + r.w &&
    y + radius > r.y && y - radius < r.y + r.h);
const validTile = (x, y) => x >= 0 && y >= 0 && x < SPRA_WIDTH && y < SPRA_HEIGHT &&
  !WALLS.some(w => x + 0.5 > w.x && x + 0.5 < w.x + w.w && y + 0.5 > w.y && y + 0.5 < w.y + w.h);

function makeRoom(code) {
  return {
    code, host: null, state: 'lobby', paint: new Uint8Array(SPRA_WIDTH * SPRA_HEIGHT),
    changed: new Map(), players: new Map(), effects: [], elapsed: 0,
    counts: [0, 0], winner: -1, updatedAt: Date.now(), broadcastAt: 0, practice: false
  };
}

function makePlayer(id, name, team, ws = null, bot = false) {
  return {
    id, name, team, ws, bot, x: team === 0 ? 4.5 : SPRA_WIDTH - 4.5,
    y: SPRA_HEIGHT / 2 + (Math.random() - 0.5) * 10,
    aim: team === 0 ? 0 : Math.PI, hp: 100, ink: 100, weapon: 'shooter',
    input: { x: 0, y: 0, fire: false, swim: false },
    cooldown: 0, bombCd: 0, charge: 0, deadFor: 0, invuln: 0,
    ko: 0, deaths: 0, connectedAt: Date.now(), inputsAt: 0, inputCount: 0
  };
}

function score(room) {
  return room.counts.map(n => Math.round(n * 1000 / (SPRA_WIDTH * SPRA_HEIGHT)) / 10);
}
function tilePaint(room, x, y, team) {
  const col = Math.floor(x), row = Math.floor(y);
  if (!validTile(col, row)) return;
  const index = row * SPRA_WIDTH + col;
  const target = team + 1, previous = room.paint[index];
  if (previous === target) return;
  if (previous > 0) room.counts[previous - 1]--;
  room.paint[index] = target;
  room.counts[team]++;
  room.changed.set(index, target);
}
function splash(room, x, y, radius, team) {
  const lowX = Math.max(0, Math.floor(x - radius));
  const highX = Math.min(SPRA_WIDTH - 1, Math.ceil(x + radius));
  const lowY = Math.max(0, Math.floor(y - radius));
  const highY = Math.min(SPRA_HEIGHT - 1, Math.ceil(y + radius));
  for (let iy = lowY; iy <= highY; iy++) {
    for (let ix = lowX; ix <= highX; ix++) {
      const d = Math.hypot(ix + 0.5 - x, iy + 0.5 - y);
      // Small uneven edges make splashes look less like perfect circles.
      const wobble = Math.sin(ix * 11.31 + iy * 7.57 + room.elapsed * 4) * 0.28;
      if (d <= radius + wobble) tilePaint(room, ix, iy, team);
    }
  }
}
function spawn(p) {
  p.x = p.team === 0 ? 4.5 : SPRA_WIDTH - 4.5;
  p.y = SPRA_HEIGHT / 2 + (Math.random() - 0.5) * 10;
  p.aim = p.team === 0 ? 0 : Math.PI;
  p.hp = 100; p.ink = 100; p.deadFor = 0; p.invuln = 1.5;
  p.cooldown = 0; p.bombCd = 0;
}
function inflict(room, target, damage, by) {
  if (target.deadFor > 0 || target.invuln > 0 || target.team === by.team) return;
  target.hp = Math.max(0, target.hp - damage);
  if (target.hp === 0) {
    target.deadFor = 3;
    target.deaths++;
    by.ko++;
    room.effects.push({ type: 'ko', x: target.x, y: target.y, team: by.team });
    splash(room, target.x, target.y, 1.7, by.team);
  }
}
function shoot(room, p) {
  const gun = SPRA_WEAPONS[p.weapon] || SPRA_WEAPONS.shooter;
  if (p.cooldown > 0 || p.ink < gun.cost || p.deadFor > 0) return;
  p.cooldown = gun.delay;
  p.ink -= gun.cost;
  const dx = Math.cos(p.aim), dy = Math.sin(p.aim);
  let end = { x: p.x, y: p.y }, struck = false;
  const hit = new Set();
  for (let r = 0.65; r <= gun.range; r += 0.58) {
    const x = p.x + dx * r, y = p.y + dy * r;
    if (nearWall(x, y, 0.07)) break;
    end = { x, y };
    if (Math.floor(r * 10) % 17 <= 5) splash(room, x, y, p.weapon === 'roller' ? 1.8 : 0.65, p.team);
    if (p.weapon === 'roller') continue;
    for (const other of room.players.values()) {
      if (other.team === p.team || other.deadFor > 0 || hit.has(other.id)) continue;
      if (Math.hypot(x - other.x, y - other.y) < 0.78) {
        hit.add(other.id);
        inflict(room, other, gun.damage, p);
        struck = true;
        if (p.weapon === 'shooter') break;
      }
    }
    if (struck && p.weapon === 'shooter') break;
  }
  splash(room, end.x, end.y, gun.radius, p.team);
  if (p.weapon !== 'shooter') {
    for (const other of room.players.values()) {
      if (other.team !== p.team && other.deadFor === 0 &&
          Math.hypot(other.x - end.x, other.y - end.y) <= gun.radius + 0.55) {
        inflict(room, other, gun.damage, p);
      }
    }
  }
  room.effects.push({ type: 'shot', x: p.x, y: p.y, tx: end.x, ty: end.y, team: p.team, weapon: p.weapon });
}
function bomb(room, p) {
  if (p.bombCd > 0 || p.ink < 18 || p.deadFor > 0) return;
  p.ink -= 18; p.bombCd = 7;
  const dx = Math.cos(p.aim), dy = Math.sin(p.aim);
  let x = p.x, y = p.y;
  for (let d = 0; d < 6; d += 0.5) {
    const nx = p.x + dx * d, ny = p.y + dy * d;
    if (nearWall(nx, ny, 0.15)) break;
    x = nx; y = ny;
  }
  splash(room, x, y, 3.7, p.team);
  for (const other of room.players.values()) {
    if (other.team !== p.team && other.deadFor === 0 && Math.hypot(x - other.x, y - other.y) < 3.6) inflict(room, other, 49, p);
  }
  room.effects.push({ type: 'bomb', x, y, team: p.team });
}
function botInput(room, p) {
  const enemy = [...room.players.values()].filter(v => v.team !== p.team && v.deadFor <= 0).sort((a, b) => distance(a, p) - distance(b, p))[0];
  if (!enemy) {
    p.input = { x: 0, y: 0, fire: false, swim: false };
    return;
  }
  const dx = enemy.x - p.x, dy = enemy.y - p.y, d = Math.hypot(dx, dy) || 1;
  const jitter = Math.sin(room.elapsed * 0.8 + p.id.length) * 0.14;
  p.aim = Math.atan2(dy, dx) + jitter;
  p.input = { x: d > 7 ? dx / d : Math.sin(room.elapsed * 1.8 + p.id.length) * 0.6,
    y: d > 7 ? dy / d : Math.cos(room.elapsed * 1.8 + p.id.length) * 0.6,
    fire: d < 15, swim: p.ink < 25 };
}
function move(room, p, dt) {
  if (p.deadFor > 0) {
    p.deadFor = Math.max(0, p.deadFor - dt);
    if (p.deadFor === 0) spawn(p);
    return;
  }
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.bombCd = Math.max(0, p.bombCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  if (p.bot) botInput(room, p);
  const own = room.paint[Math.floor(p.y) * SPRA_WIDTH + Math.floor(p.x)] === p.team + 1;
  const swim = p.input.swim && own;
  const speed = swim ? 9.6 : own ? 6.2 : 5.1;
  let { x, y } = p.input;
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  if (!nearWall(p.x + x * speed * dt, p.y)) p.x += x * speed * dt;
  if (!nearWall(p.x, p.y + y * speed * dt)) p.y += y * speed * dt;
  p.ink = clamp(p.ink + (swim ? 31 : own ? 12 : 3.5) * dt, 0, 100);
  if (p.input.fire && !swim) shoot(room, p);
}
function pack(p) {
  return { id: p.id, name: p.name, team: p.team, x: +p.x.toFixed(2), y: +p.y.toFixed(2),
    aim: +p.aim.toFixed(2), hp: p.hp, ink: Math.floor(p.ink),
    weapon: p.weapon, ko: p.ko, deaths: p.deaths, dead: p.deadFor > 0,
    bombCd: +p.bombCd.toFixed(1), swim: p.input.swim && !p.deadFor, bot: p.bot };
}
function send(ws, object) {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(object)); } catch {}
  }
}
function broadcast(room, object) {
  for (const p of room.players.values()) if (p.ws) send(p.ws, object);
}
function snapshot(room) {
  return { type: 'state', code: room.code, host: room.host, phase: room.state,
    remaining: Math.max(0, Math.ceil(SPRA_DURATION - room.elapsed)),
    scores: score(room), players: [...room.players.values()].map(pack),
    changes: [...room.changed].flat(), effects: room.effects.splice(0, 30),
    winner: room.winner, colors: COLORS };
}
function reset(room) {
  room.state = 'lobby'; room.elapsed = 0; room.winner = -1;
  room.counts = [0, 0]; room.paint.fill(0); room.changed.clear();
  for (const p of room.players.values()) { spawn(p); p.ko = 0; p.deaths = 0; p.invuln = 0; }
}
function addBot(room) {
  if (room.players.size >= MAX_HUMANS) return;
  const left = [...room.players.values()].filter(p => p.team === 0).length;
  const right = room.players.size - left;
  const team = left <= right ? 0 : 1;
  const bot = makePlayer(randomUUID(), 'INK BOT ' + ([...room.players.values()].filter(p => p.bot).length + 1), team, null, true);
  room.players.set(bot.id, bot);
}
function cleanName(value) {
  return String(value || 'PLAYER').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || 'PLAYER';
}

export function createSpra() {
  const rooms = new Map();
  const links = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  function leave(ws) {
    const connection = links.get(ws);
    if (!connection) return;
    links.delete(ws);
    const room = rooms.get(connection.code);
    if (!room) return;
    room.players.delete(connection.id);
    if (room.host === connection.id) room.host = [...room.players.values()].find(p => !p.bot)?.id || null;
    room.updatedAt = Date.now();
    if (![...room.players.values()].some(p => !p.bot)) rooms.delete(room.code);
    else broadcast(room, snapshot(room));
  }

  wss.on('connection', ws => {
    ws.on('error', () => {});
    send(ws, { type: 'connected' });
    ws.on('message', payload => {
      let msg;
      try { msg = JSON.parse(payload.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      if (msg.type === 'join') {
        if (links.has(ws)) return;
        let code = String(msg.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        let room = code ? rooms.get(code) : null;
        if (code && !room) return send(ws, { type: 'error', message: '部屋が見つかりません。コードを確認してください。' });
        if (!room) {
          for (let i = 0; i < 20; i++) { code = roomCode(); if (!rooms.has(code)) break; }
          if (rooms.has(code)) return send(ws, { type: 'error', message: '部屋を作成できませんでした。' });
          room = makeRoom(code); rooms.set(code, room);
        }
        if (room.players.size >= MAX_HUMANS || room.state === 'playing') return send(ws, { type: 'error', message: '対戦中、または満員の部屋には入れません。' });
        const id = randomUUID();
        const humans = [...room.players.values()].filter(p => !p.bot);
        const countBlue = [...room.players.values()].filter(p => p.team === 0).length;
        const countOrange = room.players.size - countBlue;
        const team = countBlue <= countOrange ? 0 : 1;
        const player = makePlayer(id, cleanName(msg.name), team, ws);
        room.players.set(id, player);
        room.host ||= id;
        room.updatedAt = Date.now();
        links.set(ws, { id, code });
        send(ws, { type: 'welcome', id, code, width: SPRA_WIDTH, height: SPRA_HEIGHT,
          walls: WALLS, duration: SPRA_DURATION, colors: COLORS,
          paint: Buffer.from(room.paint).toString('base64') });
        broadcast(room, snapshot(room));
        return;
      }
      const link = links.get(ws);
      if (!link) return;
      const room = rooms.get(link.code), player = room?.players.get(link.id);
      if (!room || !player) return;
      const now = Date.now();
      room.updatedAt = now;
      if (msg.type === 'input' && room.state === 'playing') {
        if (now - player.inputsAt > 1000) { player.inputsAt = now; player.inputCount = 0; }
        if (++player.inputCount > 35) return;
        player.input.x = clamp(Number(msg.x), -1, 1);
        player.input.y = clamp(Number(msg.y), -1, 1);
        player.input.fire = msg.fire === true;
        player.input.swim = msg.swim === true;
        if (Number.isFinite(msg.aim)) player.aim = clamp(msg.aim, -Math.PI * 2, Math.PI * 2);
        if (msg.bomb === true) bomb(room, player);
      } else if (msg.type === 'weapon' && room.state !== 'playing' && Object.hasOwn(SPRA_WEAPONS, msg.weapon)) {
        player.weapon = msg.weapon;
        broadcast(room, snapshot(room));
      } else if (msg.type === 'team' && room.state === 'lobby') {
        const team = Number(msg.team);
        if (team === 0 || team === 1) { player.team = team; spawn(player); broadcast(room, snapshot(room)); }
      } else if (msg.type === 'bot' && player.id === room.host && room.state !== 'playing') {
        addBot(room);
        broadcast(room, snapshot(room));
      } else if (msg.type === 'start' && player.id === room.host && room.state !== 'playing') {
        if (room.players.size < 2) addBot(room);
        if (room.players.size < 2) return;
        reset(room);
        room.state = 'playing';
        broadcast(room, { type: 'reset', paint: Buffer.from(room.paint).toString('base64') });
        broadcast(room, snapshot(room));
      } else if (msg.type === 'lobby' && player.id === room.host && room.state === 'results') {
        reset(room);
        broadcast(room, { type: 'reset', paint: Buffer.from(room.paint).toString('base64') });
        broadcast(room, snapshot(room));
      }
    });
    ws.on('close', () => leave(ws));
  });

  const tick = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.state !== 'playing') continue;
      room.elapsed += STEP;
      for (const p of room.players.values()) move(room, p, STEP);
      if (room.elapsed >= SPRA_DURATION) {
        room.state = 'results';
        room.winner = room.counts[0] === room.counts[1] ? -1 : room.counts[0] > room.counts[1] ? 0 : 1;
      }
      if (now - room.broadcastAt >= 100 || room.state === 'results') {
        room.broadcastAt = now;
        broadcast(room, snapshot(room));
        room.changed.clear();
      }
    }
    for (const [code, room] of rooms) if (now - room.updatedAt > 20 * 60 * 1000) rooms.delete(code);
  }, 50);
  tick.unref?.();

  return {
    upgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    },
    close() {
      clearInterval(tick);
      for (const ws of wss.clients) ws.close();
      wss.close();
      rooms.clear();
    }
  };
}
