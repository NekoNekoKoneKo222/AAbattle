import { randomUUID, randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createInkSurface, INK_SCALE } from './spra-ink.js';
import { SPRA_WEAPONS } from '../public/spra/weapons.js';
export { SPRA_WEAPONS };

export const SPRA_WIDTH = 160;
export const SPRA_HEIGHT = 100;
export const SPRA_DURATION = 180;
export const SPRA_INK_MAX = 300;
const MAX_HUMANS = 8;
const STEP = 0.05;
const COLORS = ['#25d4f5', '#ff9c28'];
const WALLS = [
  { x: 26, y: 14, w: 9, h: 17 }, { x: 125, y: 69, w: 9, h: 17 },
  { x: 26, y: 69, w: 9, h: 17 }, { x: 125, y: 14, w: 9, h: 17 },
  { x: 51, y: 30, w: 14, h: 9 }, { x: 95, y: 61, w: 14, h: 9 },
  { x: 51, y: 61, w: 14, h: 9 }, { x: 95, y: 30, w: 14, h: 9 },
  { x: 75, y: 43, w: 10, h: 14 },
  { x: 12, y: 44, w: 10, h: 12 }, { x: 138, y: 44, w: 10, h: 12 },
  { x: 77, y: 10, w: 6, h: 12 }, { x: 77, y: 78, w: 6, h: 12 },
  { x: 38, y: 46, w: 5, h: 8 }, { x: 117, y: 46, w: 5, h: 8 }
];
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
    code, host: null, state: 'lobby', ink: createInkSurface(SPRA_WIDTH, SPRA_HEIGHT, WALLS),
    players: new Map(), effects: [], bombs: [], nextBomb: 0, round:0, elapsed: 0,
    winner: -1, updatedAt: Date.now(), broadcastAt: 0, practice: false
  };
}

function makePlayer(id, name, team, ws = null, bot = false) {
  return {
    id, name, team, ws, bot, x: team === 0 ? 9 : SPRA_WIDTH - 9,
    y: SPRA_HEIGHT / 2 + (Math.random() - 0.5) * 28,
    aim: team === 0 ? 0 : Math.PI, hp: 100, ink: SPRA_INK_MAX, weapon: 'shooter',
    input: { x: 0, y: 0, fire: false, swim: false },
    cooldown: 0, bombCd: 0, charge: 0, deadFor: 0, invuln: 0,
    ko: 0, deaths: 0, connectedAt: Date.now(), inputsAt: 0, inputCount: 0
  };
}

function score(room) { return room.ink.score(); }
function splash(room, x, y, r, team, angle=0, seed=1, style='impact') {
  room.ink.impact(x, y, r, team, angle, seed, style);
}
function spawn(p) {
  p.x = p.team === 0 ? 9 : SPRA_WIDTH - 9;
  p.y = SPRA_HEIGHT / 2 + (Math.random() - 0.5) * 28;
  p.aim = p.team === 0 ? 0 : Math.PI;
  p.hp = 100; p.ink = SPRA_INK_MAX; p.deadFor = 0; p.invuln = 1.5;
  p.cooldown = 0; p.bombCd = 0; p.swimming=false;
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
  const seed = Math.round(room.elapsed * 1000) + p.id.charCodeAt(0) * 37;
  const count = gun.projectiles || 1;
  const type = gun.type;
  const hit = new Set();
  const ends = [];
  for (let j = 0; j < count; j++) {
    const spread = (j - (count - 1) / 2) * gun.spread +
      (Math.sin(seed * 1.17 + j * 9.74) * .04);
    const angle = p.aim + spread;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let end = { x: p.x, y: p.y };
    const range = gun.range * (1 - Math.abs(spread) * .11);
    let struck = false;
    for (let r = 0.7; r <= range; r += 0.62) {
      const x = p.x + dx * r, y = p.y + dy * r;
      if (nearWall(x, y, .09)) break;
      end = { x, y };
      if (type === 'roller' || type === 'brush') continue;
      for (const other of room.players.values()) {
        if (other.team === p.team || other.deadFor > 0 || hit.has(other.id)) continue;
        if (Math.hypot(x - other.x, y - other.y) < .79) {
          hit.add(other.id);
          inflict(room, other, gun.damage, p);
          struck = true;
          if (['shooter','dualies','splatling','charger'].includes(type)) break;
        }
      }
      if (struck && ['shooter','dualies','splatling','charger'].includes(type)) break;
    }
    const sx = p.x + dx * .55, sy = p.y + dy * .55;
    if (type === 'roller' || type === 'brush') {
      room.ink.trail(sx, sy, end.x, end.y, type === 'roller' ? gun.radius * .35 : gun.radius * .21, p.team, seed+j, true);
      splash(room, end.x, end.y, gun.radius*.65, p.team, angle, seed+j, 'roller');
    } else if (type === 'charger') {
      room.ink.trail(sx, sy, end.x, end.y, .13, p.team, seed+j, true);
      splash(room, end.x, end.y, gun.radius, p.team, angle, seed+j, 'shooter');
    } else if (type === 'blaster') {
      room.ink.trail(sx, sy, end.x, end.y, .14, p.team, seed+j, false);
      splash(room, end.x, end.y, gun.radius, p.team, angle, seed+j, 'bomb');
    } else {
      room.ink.trail(sx, sy, end.x, end.y, type === 'slosher' ? .35 : .19, p.team, seed+j, false);
      splash(room, end.x, end.y, gun.radius * (count > 1 ? .64 : 1), p.team, angle, seed+j, 'shooter');
    }
    ends.push(end);
  }
  if (['roller','brush','blaster','slosher','brella'].includes(type)) {
    for (const other of room.players.values()) {
      if (other.team === p.team || other.deadFor > 0 || hit.has(other.id)) continue;
      if (ends.some(end => Math.hypot(other.x-end.x,other.y-end.y) < gun.radius*.75+.65)) {
        hit.add(other.id);
        inflict(room, other, gun.damage, p);
      }
    }
  }
  const end = ends[Math.floor(ends.length/2)] || {x:p.x,y:p.y};
  room.effects.push({type:'shot',x:p.x,y:p.y,tx:end.x,ty:end.y,
    team:p.team,weapon:p.weapon,weaponType:type,seed});
}
// Q launches a real projectile. The server integrates its arc and paints only
// after ground contact or obstacle collision; clients render the same flight.
function bomb(room, p) {
  if (p.bombCd > 0 || p.ink < 48 || p.deadFor > 0 || room.bombs.length >= 32) return;
  p.ink -= 48;
  p.bombCd = 7;
  room.bombs.push({
    id: ++room.nextBomb, owner: p.id, team:p.team,
    x:p.x, y:p.y, z:.7,
    vx:Math.cos(p.aim)*13.5, vy:Math.sin(p.aim)*13.5,
    vz:9, seed:Math.round(room.elapsed*1000) + room.nextBomb
  });
}
function updateBombs(room, dt) {
  for(let i=room.bombs.length-1;i>=0;i--) {
    const b=room.bombs[i];
    const oldX=b.x,oldY=b.y;
    b.x += b.vx*dt; b.y += b.vy*dt;
    b.z += b.vz*dt;
    b.vz -= 19*dt;
    const collision=nearWall(b.x,b.y,.2);
    if(collision) {b.x=oldX; b.y=oldY;}
    if(b.z > 0 && !collision) continue;
    room.bombs.splice(i,1);
    const owner=room.players.get(b.owner);
    if(!owner)continue;
    splash(room,b.x,b.y,5.1,b.team,Math.atan2(b.vy,b.vx),b.seed,'bomb');
    for(const target of room.players.values()) {
      if(target.team!==b.team && target.deadFor<=0) {
        const dist=Math.hypot(target.x-b.x,target.y-b.y);
        if(dist<4.9)inflict(room,target,dist<2.5?80:42,owner);
      }
    }
    room.effects.push({type:'bomb',x:b.x,y:b.y,team:b.team,seed:b.seed});
  }
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
  const blockAhead = nearWall(p.x + dx/d*2, p.y + dy/d*2, .5);
  p.input = { x: blockAhead ? -dy/d : d > 8 ? dx / d : Math.sin(room.elapsed * 1.8 + p.id.length) * .55,
    y: blockAhead ? (p.y >= SPRA_HEIGHT / 2 ? 1 : -1) : d > 8 ? dy / d : Math.cos(room.elapsed * 1.8 + p.id.length) * .55,
    fire: d < (SPRA_WEAPONS[p.weapon]?.range || 22), swim: p.ink < 65 };
  if(d<12 && p.bombCd===0 && p.ink>100 && Math.random()<.0025) bomb(room,p);
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
  const own = room.ink.sample(p.x,p.y) === p.team + 1;
  const swim = p.input.swim && own;
  p.swimming = swim;
  const speed = swim ? 12 : own ? 8.1 : room.ink.sample(p.x,p.y) && !own ? 5.1 : 7.0;
  let { x, y } = p.input;
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  if (!nearWall(p.x + x * speed * dt, p.y)) p.x += x * speed * dt;
  if (!nearWall(p.x, p.y + y * speed * dt)) p.y += y * speed * dt;
  p.ink = clamp(p.ink + (swim ? 145 : own ? 42 : 8) * dt, 0, SPRA_INK_MAX);
  if (p.input.fire && !swim) shoot(room, p);
}
function roomSafeSwim(p) { return Boolean(p.swimming); }
function pack(p) {
  return { id: p.id, name: p.name, team: p.team, x: +p.x.toFixed(2), y: +p.y.toFixed(2),
    aim: +p.aim.toFixed(2), hp: p.hp, ink: Math.floor(p.ink),
    weapon: p.weapon, ko: p.ko, deaths: p.deaths, dead: p.deadFor > 0,
    bombCd: +p.bombCd.toFixed(1), maxInk: SPRA_INK_MAX,
    swim: p.input.swim && roomSafeSwim(p), bot: p.bot };
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
  return { type: 'state', code: room.code, host: room.host, round: room.round, phase: room.state,
    remaining: Math.max(0, Math.ceil(SPRA_DURATION - room.elapsed)),
    scores: score(room), players: [...room.players.values()].map(pack),
    changes: room.ink.flush(), paintScale: INK_SCALE, effects: room.effects.splice(0, 30),
    winner: room.winner, colors: COLORS,
    bombs: room.bombs.map(b => ({id:b.id,x:+b.x.toFixed(2),y:+b.y.toFixed(2),z:+b.z.toFixed(2),team:b.team})) };
}
function reset(room) {
  room.state = 'lobby'; room.elapsed = 0; room.winner = -1;
  room.ink.clear(); room.bombs=[];
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
function fillBots(room) {
  while(room.players.size < MAX_HUMANS) addBot(room);
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
        send(ws, { type: 'welcome', id, code, width: SPRA_WIDTH, height: SPRA_HEIGHT, maxInk:SPRA_INK_MAX,
          walls: WALLS, duration: SPRA_DURATION, colors: COLORS,
          paint: room.ink.snapshot(), paintScale: INK_SCALE });
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
        if (team === 0 || team === 1) {
          const teammates = [...room.players.values()].filter(other => other.id !== player.id && other.team === team);
          if (teammates.length >= 4) return send(ws, { type: 'error', message: 'そのチームは4人で満員です。' });
          player.team = team;
          spawn(player);
          broadcast(room, snapshot(room));
        }
      } else if (msg.type === 'bot' && player.id === room.host && room.state !== 'playing') {
        addBot(room);
        broadcast(room, snapshot(room));
      } else if (msg.type === 'start' && player.id === room.host && room.state !== 'playing') {
        fillBots(room);
        const blues = [...room.players.values()].filter(p => p.team === 0).length;
        const oranges = room.players.size - blues;
        if (!blues || !oranges) return send(ws, { type: 'error', message: 'PvPには青・オレンジ両方のチームが必要です。' });
        reset(room);
        room.round++;
        room.state = 'playing';
        broadcast(room, { type: 'reset', paint: room.ink.snapshot(), paintScale: INK_SCALE });
        broadcast(room, snapshot(room));
      } else if (msg.type === 'lobby' && player.id === room.host && room.state === 'results') {
        reset(room);
        broadcast(room, { type: 'reset', paint: room.ink.snapshot(), paintScale: INK_SCALE });
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
      updateBombs(room,STEP);
      if (room.elapsed >= SPRA_DURATION) {
        room.state = 'results';
        room.winner = room.ink.counts[0] === room.ink.counts[1] ? -1 : room.ink.counts[0] > room.ink.counts[1] ? 0 : 1;
      }
      if (now - room.broadcastAt >= 100 || room.state === 'results') {
        room.broadcastAt = now;
        broadcast(room, snapshot(room));
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
