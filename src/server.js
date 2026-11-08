import express from 'express';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createStore } from './store.js';
import { validateArt, generateFighter } from './generator.js';
import { createBattle, stepBattle } from './battle.js';

const store = createStore();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
const queued = new Map();
const playing = new Set();
const authFailures = new Map();
const creations = new Map();
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const secure = process.env.NODE_ENV === 'production';
const staticRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  });
  next();
});
app.use(express.json({ limit: '12kb', type: 'application/json' }));

const digest = (value) => createHash('sha256').update(value).digest('hex');
function cookieToken(req) {
  const raw = String(req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('aa_session='));
  const token = raw?.slice('aa_session='.length);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
async function currentUser(req) {
  const token = cookieToken(req);
  return token ? store.findSession(digest(token)) : null;
}
function cookie(res, token, maxAge) {
  res.setHeader('Set-Cookie', `aa_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}
async function issueSession(res, user) {
  const token = randomBytes(32).toString('hex');
  await store.saveSession(digest(token), user.id, Date.now() + SESSION_AGE);
  cookie(res, token, SESSION_AGE / 1000);
}
function publicUser(user) {
  return { id: user.id, username: user.username, wins: user.wins, losses: user.losses };
}
function limit(map, key, max, duration) {
  const now = Date.now();
  const arr = (map.get(key) || []).filter((time) => time > now - duration);
  arr.push(now);
  map.set(key, arr);
  if (map.size > 8000) {
    for (const [k, v] of map) if (!v.length || v[v.length - 1] < now - duration) map.delete(k);
  }
  return arr.length <= max;
}
function wrap(callback) {
  return (req, res) => Promise.resolve(callback(req, res)).catch((error) => {
    console.error('Request failed:', error.message);
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
  });
}
async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) res.status(401).json({ error: 'ログインしてください。' });
  return user;
}
function credentials(body) {
  const username = String(body?.username || '').normalize('NFKC').trim();
  const password = String(body?.password || '');
  if (!/^[\p{L}\p{N}_]{3,20}$/u.test(username)) throw new Error('ユーザー名は3～20文字の文字・数字・_のみです。');
  if (password.length < 10 || password.length > 128) throw new Error('パスワードは10～128文字にしてください。');
  return { username, password, key: username.toLocaleLowerCase('und') };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) => res.json({ generationMode: process.env.GEMINI_API_KEY ? 'gemini' : 'local' }));

app.post('/api/register', wrap(async (req, res) => {
  if (!limit(authFailures, `reg:${req.ip}`, 6, 30 * 60 * 1000)) return res.status(429).json({ error: '登録回数が多すぎます。しばらく待ってください。' });
  let input;
  try { input = credentials(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const user = await store.createUser(input.username, input.key, passwordHash);
  if (!user) return res.status(409).json({ error: 'そのユーザー名はすでに使われています。' });
  await issueSession(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/login', wrap(async (req, res) => {
  const key = `login:${req.ip}:${String(req.body?.username || '').slice(0, 30)}`;
  if (!limit(authFailures, key, 9, 15 * 60 * 1000)) return res.status(429).json({ error: 'ログイン試行が多すぎます。15分後にお試しください。' });
  let input;
  try { input = credentials(req.body); } catch (_) { return res.status(401).json({ error: 'ユーザー名またはパスワードが違います。' }); }
  const user = await store.findUser(input.key);
  if (!user || !(await argon2.verify(user.password_hash, input.password))) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが違います。' });
  }
  await issueSession(res, user);
  res.json({ user: publicUser(user) });
}));

app.post('/api/logout', wrap(async (req, res) => {
  const token = cookieToken(req);
  if (token) await store.deleteSession(digest(token));
  cookie(res, '', 0);
  res.json({ ok: true });
}));

app.get('/api/me', wrap(async (req, res) => {
  const user = await currentUser(req);
  res.json({ user: user ? publicUser(user) : null });
}));

app.post('/api/fighters', wrap(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  if (!limit(creations, user.id, 12, 60 * 60 * 1000)) return res.status(429).json({ error: '生成上限は1時間に12体です。' });
  const name = String(req.body?.name || '').trim();
  if (name.length < 1 || name.length > 24 || /[\u0000-\u001f]/.test(name)) {
    return res.status(400).json({ error: '名前は1～24文字にしてください。' });
  }
  let art;
  try { art = validateArt(req.body?.art); } catch (error) { return res.status(400).json({ error: error.message }); }
  let generated;
  try {
    const existing = await store.listFighters(user.id);
    const existingNames = existing.flatMap((fighter) => [
      ...(fighter.definition?.skills || []).map((skill) => skill.name),
      fighter.definition?.passive?.name
    ]).filter(Boolean);
    generated = await generateFighter(art, name, existingNames);
  }
  catch (error) { return res.status(502).json({ error: error.message.slice(0, 180) }); }
  const fighter = await store.saveFighter(user.id, name, art, generated.definition, generated.mode);
  res.status(201).json({ fighter });
}));

app.get('/api/fighters', wrap(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json({ fighters: await store.listFighters(user.id) });
}));

app.get('/api/history', wrap(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json({ matches: await store.historyForUser(user.id) });
}));

app.use(express.static(staticRoot, { index: 'index.html', maxAge: 60000 }));
app.use((err, _req, res, _next) => {
  res.status(err.status || 400).json({ error: 'リクエストを処理できませんでした。' });
});

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function broadcast(match, payload) {
  match.sockets.forEach((ws) => send(ws, payload));
}
function pruneQueue() {
  for (const [id, entry] of queued) if (entry.ws.readyState !== WebSocket.OPEN) queued.delete(id);
}

async function makeMatch(first, second) {
  if (playing.has(first.user.id) || playing.has(second.user.id)) return;
  queued.delete(first.user.id);
  queued.delete(second.user.id);
  playing.add(first.user.id);
  playing.add(second.user.id);
  const battle = createBattle(first.user, first.fighter, second.user, second.fighter);
  const match = { battle, sockets: [first.ws, second.ws] };
  broadcast(match, {
    type: 'battle:start', id: battle.id,
    fighters: battle.fighters.map(({ userId, username, name, art, definition, hp, maxHp }) => ({
      userId, username, name, art, definition, hp, maxHp, shield: 0
    }))
  });
  const timer = setInterval(async () => {
    try {
      const turn = stepBattle(battle);
      broadcast(match, turn);
      if (battle.ended) {
        clearInterval(timer);
        await store.saveMatch(first.user.id, second.user.id, battle.winnerId, battle.log);
        playing.delete(first.user.id);
        playing.delete(second.user.id);
        broadcast(match, { type: 'battle:finish', winnerId: battle.winnerId });
      }
    } catch (error) {
      console.error('Battle failed:', error.message);
      clearInterval(timer);
      playing.delete(first.user.id);
      playing.delete(second.user.id);
      broadcast(match, { type: 'error', message: '戦闘データの保存に失敗しました。' });
    }
  }, 1000);
  timer.unref?.();
}

wss.on('connection', (ws, _request, user) => {
  ws.userId = user.id;
  send(ws, { type: 'ready', userId: user.id });
  ws.on('message', async (buffer) => {
    let msg;
    try { msg = JSON.parse(buffer.toString()); } catch (_) { return send(ws, { type: 'error', message: '不正なデータです。' }); }
    if (msg?.type === 'ping') return send(ws, { type: 'pong' });
    if (msg?.type === 'queue:leave') {
      if (queued.get(user.id)?.ws === ws) queued.delete(user.id);
      return send(ws, { type: 'queue:left' });
    }
    if (msg?.type !== 'queue:join') return;
    if (playing.has(user.id)) return send(ws, { type: 'error', message: '現在戦闘中です。' });
    if (queued.has(user.id)) return send(ws, { type: 'error', message: 'すでにマッチング待機中です。' });
    const fighterId = typeof msg.fighterId === 'string' ? msg.fighterId : '';
    const fighter = await store.getFighter(fighterId).catch(() => null);
    if (!fighter || fighter.owner_id !== user.id) return send(ws, { type: 'error', message: '自分のキャラを選んでください。' });
    const entry = { ws, user, fighter };
    pruneQueue();
    const opponent = [...queued.values()].find((e) => e.user.id !== user.id);
    if (opponent) {
      makeMatch(opponent, entry).catch((e) => send(ws, { type: 'error', message: e.message }));
    } else {
      queued.set(user.id, entry);
      send(ws, { type: 'queue:waiting', message: '対戦相手を待っています…' });
    }
  });
  ws.on('close', () => { if (queued.get(user.id)?.ws === ws) queued.delete(user.id); });
});

server.on('upgrade', async (req, socket, head) => {
  try {
    const origin = req.headers.origin;
    const expectedHost = req.headers['x-forwarded-host'] || req.headers.host;
    if (!origin || new URL(origin).host !== expectedHost || req.url !== '/ws') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
    }
    const user = await currentUser(req);
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, user));
  } catch (_) { socket.destroy(); }
});

const port = Number(process.env.PORT || 3000);
await store.init();
server.listen(port, '0.0.0.0', () => {
  console.log(`AABattle listening on ${port}; generation: ${process.env.GEMINI_API_KEY ? 'Gemini' : 'local'}`);
});

async function shutdown() {
  wss.clients.forEach((c) => c.close());
  server.close();
  await store.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
