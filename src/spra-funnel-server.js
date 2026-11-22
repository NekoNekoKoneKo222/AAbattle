import express from 'express';
import http from 'node:http';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSpra } from './spra.js';

// Dedicated SPRA-only service. Never forward the entire AAbattle server through Funnel.
const PUBLIC_ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const SPRA_ROOT = path.join(PUBLIC_ROOT, 'spra');
const FONT_ROOT = path.join(PUBLIC_ROOT, 'fonts');
const SESSION_TTL = 12 * 60 * 60 * 1000;
const LIMIT_WINDOW = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 40; // A global ceiling: Funnel may mask the remote IP.
const MAX_SESSIONS = 64;
const MAX_WS = 32;
const MAX_WS_PER_SESSION = 3;
const cookieName = 'spra_friend_session';
const digest = value => createHash('sha256').update(value).digest('hex');
const localHost = host => /^127\.0\.0\.1(?::\d+)?$/.test(host || '') ||
  /^localhost(?::\d+)?$/.test(host || '') || /^\[::1\](?::\d+)?$/.test(host || '');

function getCookie(req) {
  const piece = String(req.headers.cookie || '').split(';').map(x => x.trim())
    .find(x => x.startsWith(cookieName + '='));
  const value = piece?.slice(cookieName.length + 1) || '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (typeof origin !== 'string') return false;
  try {
    const url = new URL(origin);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return false;
    const originalHost = req.headers.host;
    // Tailscale's local reverse proxy normally preserves Host. Where it does
    // not, accept X-Forwarded-Host only from the local proxy socket.
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const forwarded = loopback && typeof req.headers['x-forwarded-host'] === 'string' ?
      req.headers['x-forwarded-host'] : null;
    if (url.host !== originalHost && url.host !== forwarded) return false;
    return url.protocol === 'https:' || (url.protocol === 'http:' && localHost(url.host));
  } catch { return false; }
}

function publicCookie(req) {
  // Production browsers receive a Secure cookie over the Funnel HTTPS URL.
  // Only permit the non-Secure version for an actual localhost development origin.
  return !localHost(req.headers.host) || String(req.headers.origin || '').startsWith('https:');
}

function setSessionCookie(req, res, value, maxAge) {
  res.setHeader('Set-Cookie',
    cookieName + '=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
    maxAge + (publicCookie(req) ? '; Secure' : ''));
}

const LOGIN_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#091a28"><title>SPRA | FRIEND ACCESS</title>
<link rel="stylesheet" href="/spra/funnel-access.css">
<script defer src="/spra/funnel-access.js"></script></head>
<body><main class="gateway" aria-label="SPRA フレンドアクセス">
<div class="ink ink-one"></div><div class="ink ink-two"></div>
<section class="panel"><div class="pixel-emblem" aria-hidden="true"><span>SP</span><span>RA</span></div>
<p class="eyebrow">PRIVATE FRIEND MATCH / 2D INK BATTLE</p>
<h1>SPRA<span>INK BATTLE</span></h1>
<p class="lead">フレンド限定ゲート。ホストから伝えられた合言葉を入力してください。</p>
<form id="accessForm"><label for="password">ACCESS PASSWORD</label>
<input id="password" type="password" minlength="12" maxlength="128" autocomplete="off" required placeholder="合言葉を入力">
<button type="submit">ゲームに入る <span aria-hidden="true">▶</span></button></form>
<p class="notice" id="notice" role="status" aria-live="polite"></p>
<p class="foot">PLAY FAIR. PAINT TOGETHER.</p>
</section></main></body></html>`;

export function createSpraFunnelServer({ password = process.env.SPRA_FRIEND_PASSWORD, spra = createSpra() } = {}) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    spra.close();
    throw new Error('SPRA_FRIEND_PASSWORD must be 12-128 characters.');
  }
  const salt = randomBytes(24);
  const expectedPassword = scryptSync(password, salt, 64);
  const sessions = new Map();
  const socketsBySession = new Map();
  let failures = [];
  let activeWs = 0;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'no-store',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"
    });
    next();
  });
  const isAuthed = req => {
    const token = getCookie(req);
    const key = token && digest(token);
    const until = key && sessions.get(key);
    if (!until) return '';
    if (until <= Date.now()) { sessions.delete(key); return ''; }
    return key;
  };
  const requireFriend = (req, res, next) => {
    if (!isAuthed(req)) return res.status(401).type('text/plain').send('Login required at /spra/');
    next();
  };
  const loginAsset = (file, type) => (_req, res) => res.type(type).sendFile(path.join(SPRA_ROOT, file));
  app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));
  app.get('/spra/funnel-access.css', loginAsset('funnel-access.css', 'text/css'));
  app.get('/spra/funnel-access.js', loginAsset('funnel-access.js', 'text/javascript'));
  app.post('/spra/login', express.json({ limit: '1kb', type: 'application/json' }), (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: '送信元が一致しません。' });
    const now = Date.now();
    failures = failures.filter(t => t > now - LIMIT_WINDOW);
    if (failures.length >= MAX_LOGIN_ATTEMPTS) {
      return res.status(429).json({ error: '試行回数の上限です。15分後にお試しください。' });
    }
    const candidate = req.body?.password;
    if (typeof candidate !== 'string' || candidate.length < 12 || candidate.length > 128) {
      failures.push(now);
      return res.status(401).json({ error: '合言葉を確認してください。' });
    }
    const supplied = scryptSync(candidate, salt, 64);
    if (!timingSafeEqual(expectedPassword, supplied)) {
      failures.push(now);
      return res.status(401).json({ error: '合言葉が違います。' });
    }
    // Invalidate expired sessions and cap server-side session memory.
    for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
    if (sessions.size >= MAX_SESSIONS) return res.status(503).json({ error: '現在満員です。' });
    const token = randomBytes(32).toString('hex');
    sessions.set(digest(token), now + SESSION_TTL);
    setSessionCookie(req, res, token, Math.floor(SESSION_TTL / 1000));
    res.json({ ok: true });
  });
  app.post('/spra/logout', (req, res) => {
    if (!sameOrigin(req)) return res.status(403).end();
    const token = getCookie(req);
    if (token) sessions.delete(digest(token));
    setSessionCookie(req, res, '', 0);
    res.json({ ok: true });
  });
  const enter = (req, res) => {
    if (!isAuthed(req)) return res.status(200).type('html').send(LOGIN_HTML);
    res.sendFile(path.join(SPRA_ROOT, 'index.html'));
  };
  app.get(['/', '/spra', '/spra/'], enter);
  app.get('/api/spra/leaderboard', requireFriend, async (_req, res) => {
    try { res.json(await spra.listRankings(20)); }
    catch { res.status(503).json({ error: 'ランキングを取得できません。' }); }
  });
  // SPA assets and fonts are served ONLY after authentication. No sibling
  // AAbattle games, secrets, /src, /test, /api or root static directories.
  app.use('/spra', requireFriend, express.static(SPRA_ROOT, {
    dotfiles: 'deny', index: false, fallthrough: false, etag: false
  }));
  app.use('/fonts', requireFriend, express.static(FONT_ROOT, {
    dotfiles: 'deny', index: false, fallthrough: false, etag: false
  }));
  app.use((_req, res) => res.status(404).type('text/plain').send('Not found'));
  app.use((err, _req, res, _next) => {
    res.status(err.status === 413 ? 413 : 400).type('text/plain').send('Bad request');
  });

  const server = http.createServer(app);
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.on('upgrade', (req, socket, head) => {
    const fail = status => {
      socket.write('HTTP/1.1 ' + status + '\r\nConnection: close\r\n\r\n');
      socket.destroy();
    };
    if (req.url !== '/spra/ws' || !sameOrigin(req)) return fail('403 Forbidden');
    const key = isAuthed(req);
    if (!key) return fail('401 Unauthorized');
    const used = socketsBySession.get(key) || 0;
    if (activeWs >= MAX_WS || used >= MAX_WS_PER_SESSION) return fail('429 Too Many Requests');
    activeWs++;
    socketsBySession.set(key, used + 1);
    socket.once('close', () => {
      activeWs = Math.max(0, activeWs - 1);
      const remaining = (socketsBySession.get(key) || 1) - 1;
      if (remaining > 0) socketsBySession.set(key, remaining);
      else socketsBySession.delete(key);
    });
    try { spra.upgrade(req, socket, head); }
    catch { socket.destroy(); }
  });
  async function close() {
    spra.close();
    await new Promise(resolve => server.close(resolve));
    sessions.clear();
  }
  return { app, server, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.SPRA_PORT || 3187);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid SPRA_PORT');
  const service = createSpraFunnelServer();
  service.server.listen(port, '127.0.0.1', () => {
    console.log('[SPRA] local service: http://127.0.0.1:' + port + '/spra/');
    console.log('[SPRA] only loopback is listening. Use Tailscale Funnel to publish HTTPS.');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    service.close().finally(() => process.exit(0));
  });
}
