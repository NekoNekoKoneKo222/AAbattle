import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createMatch, stepMatch, DEFAULT_MOVE, DEFAULT_STAGE } from '../public/sam/engine.js';

const MAX_ROOMS = 12;
const send = (ws, value) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); };
const cleanName = (value) => typeof value === 'string' ? value.trim().slice(0, 24) : 'FIGHTER';
const cleanArt = (value) => typeof value === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]{1,90000}$/.test(value) ? value : null;
const number = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
function cleanStage(stage) {
  if (!stage || !Array.isArray(stage.platforms)) return DEFAULT_STAGE;
  return { name: cleanName(stage.name) || 'STAGE', platforms: stage.platforms.slice(0, 24).map((item) => {
    const p = item && typeof item === 'object' ? item : {};
    return {
    x: number(p.x, 0, 960, 0), y: number(p.y, 80, 520, 430),
    w: number(p.w, 30, 960, 100), h: number(p.h, 8, 40, 16)
  }; }) };
}
function cleanMove(move) {
  if (!move || typeof move !== 'object') return DEFAULT_MOVE;
  return { name: cleanName(move.name) || DEFAULT_MOVE.name,
    damage: number(move.damage, 1, 999, 10), knockback: number(move.knockback, 1, 90, 7),
    range: number(move.range, 20, 500, 66), startup: number(move.startup, 1, 120, 8),
    recovery: number(move.recovery, 0, 120, 18), cooldown: number(move.cooldown, 0, 180, 12) };
}
function cleanInput(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(['left','right','down','jump','dash','attack','special','strong','shield','grab','dodge']
    .map((key) => [key, value[key] === true]));
}

export function createSamOnline() {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  const rooms = new Map();
  let tick = 0;
  const interval = setInterval(() => {
    tick++;
    for (const room of rooms.values()) {
      if (!room.match || room.match.winner !== null) continue;
      stepMatch(room.match, room.inputs);
      if (tick % 3 === 0 || room.match.winner !== null) broadcast(room, { type: 'state', match: room.match });
    }
  }, 1000 / 60);
  interval.unref();
  function broadcast(room, value) { for (const player of room.players) send(player?.ws, value); }
  function roster(room) { broadcast(room, { type: 'room', code: room.code,
    players: room.players.map((p) => p ? { name: p.name, art: p.art } : null),
    canStart: room.players.every(Boolean) }); }
  function leave(ws) {
    const room = ws.room;
    if (!room) return;
    const slot = room.players.findIndex((p) => p?.ws === ws);
    if (slot >= 0) room.players[slot] = null;
    ws.room = null; ws.slot = null;
    if (!room.players.some(Boolean)) rooms.delete(room.code);
    else { room.match = null; room.inputs = [{}, {}]; roster(room); broadcast(room, { type: 'notice', message: '相手が退出しました' }); }
  }
  wss.on('connection', (ws) => {
    send(ws, { type: 'ready' });
    let windowStart = Date.now();
    let messages = 0;
    ws.on('message', (raw) => {
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messages = 0; }
      if (++messages > 45) return ws.close(1008, 'rate limit');
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (!message || typeof message !== 'object') return;
      try {
      if (message.type === 'create') {
        if (ws.room) return;
        if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'error', message: 'ルームが満員です' });
        let code;
        do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
        const room = { code, players: [null, null], inputs: [{}, {}], match: null,
          stage: cleanStage(message.stage), move: cleanMove(message.move), free: message.free === true };
        room.players[0] = { ws, name: cleanName(message.name) || 'PLAYER 1', art: cleanArt(message.art) };
        ws.room = room; ws.slot = 0; rooms.set(code, room);
        send(ws, { type: 'joined', code, slot: 0 }); roster(room);
      } else if (message.type === 'join') {
        if (ws.room) return;
        const room = rooms.get(String(message.code || '').toUpperCase());
        if (!room || room.players[1] || !room.players[0]) return send(ws, { type: 'error', message: '参加できるルームがありません' });
        room.players[1] = { ws, name: cleanName(message.name) || 'PLAYER 2', art: cleanArt(message.art) };
        ws.room = room; ws.slot = 1;
        send(ws, { type: 'joined', code: room.code, slot: 1 }); roster(room);
      } else if (message.type === 'start') {
        const room = ws.room;
        if (!room || ws.slot !== 0 || !room.players.every(Boolean)) return;
        room.inputs = [{}, {}];
        room.match = createMatch({ mode: 'local', stage: room.stage, move: room.move, free: room.free });
        broadcast(room, { type: 'started', match: room.match, stage: room.stage, move: room.move, free: room.free });
      } else if (message.type === 'input') {
        const room = ws.room;
        if (room?.match && room.match.winner === null) room.inputs[ws.slot] = cleanInput(message.input);
      } else if (message.type === 'leave') leave(ws);
      } catch { send(ws, { type: 'error', message: '入力が不正です' }); }
    });
    ws.on('close', () => leave(ws));
  });
  return {
    handleUpgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req)); },
    close() { clearInterval(interval); wss.clients.forEach((ws) => ws.close()); rooms.clear(); }
  };
}
