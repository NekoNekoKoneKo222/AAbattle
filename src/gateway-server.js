import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateOllamaDraft, localOllamaStatus, validateArt } from './generator.js';

const BODY_LIMIT = 6 * 1024;
const OUTPUT_LIMIT = 24 * 1024;
const JOB_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_JOBS = 4;
const HOURLY_LIMIT = 120;
const JOB_PATH = /^\/v1\/skills\/jobs\/([a-f0-9]{64})$/;
const hash = (value) => createHash('sha256').update(value).digest();

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('リクエストが大きすぎます。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('JSONが不正です。'); }
}

function inputFrom(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('入力が不正です。');
  const name = body.name;
  if (typeof name !== 'string' || name.length < 1 || name.length > 24 || /[\u0000-\u001f]/.test(name)) {
    throw new Error('名前は1～24文字にしてください。');
  }
  const art = validateArt(body.art);
  const avoidNames = body.avoidNames;
  if (!Array.isArray(avoidNames) || avoidNames.length > 80 ||
      avoidNames.some((value) => typeof value !== 'string' || value.length > 24)) {
    throw new Error('過去のスキル名が不正です。');
  }
  return { art, name, avoidNames };
}

export function createGateway({
  token = process.env.OLLAMA_GATEWAY_TOKEN,
  generate = generateOllamaDraft,
  status = localOllamaStatus
} = {}) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('OLLAMA_GATEWAY_TOKENは32文字以上にしてください。');
  const expected = hash(token);
  const jobs = new Map();
  const starts = [];
  const queue = [];
  let active = 0;
  function runNext() {
    if (active || !queue.length) return;
    const { input, job } = queue.shift();
    active = 1;
    job.state = 'running';
    Promise.resolve().then(() => generate(input.art, input.name, input.avoidNames)).then((draft) => {
      const encoded = JSON.stringify(draft);
      if (Buffer.byteLength(encoded) > OUTPUT_LIMIT) throw new Error('生成結果が長すぎます。');
      job.draft = draft;
      job.state = 'done';
    }).catch((error) => {
      job.error = typeof error?.message === 'string' ? error.message.slice(0, 180) : 'AI生成に失敗しました。';
      job.state = 'failed';
    }).finally(() => { active = 0; job.completedAt = Date.now(); runNext(); });
  }
  const server = http.createServer(async (req, res) => {
    const supplied = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''))?.[1] || '';
    if (!timingSafeEqual(hash(supplied), expected)) return send(res, 401, { error: '認証が必要です。' });
    const path = req.url;
    if (req.method === 'GET' && path === '/v1/status') {
      try {
        const result = await status();
        return send(res, 200, {
          connected: Boolean(result.connected), installed: Boolean(result.installed), model: result.model,
          active, queued: queue.length
        });
      } catch { return send(res, 503, { error: 'Ollamaの状態を確認できません。' }); }
    }
    const match = req.method === 'GET' && JOB_PATH.exec(path);
    if (match) {
      const job = jobs.get(match[1]);
      if (!job) return send(res, 404, { error: '生成ジョブが見つかりません。' });
      if (job.state === 'running' || job.state === 'queued') return send(res, 202, { status: job.state });
      if (job.state === 'failed') return send(res, 502, { error: job.error });
      return send(res, 200, { draft: job.draft });
    }
    if (req.method !== 'POST' || path !== '/v1/skills/generate') return send(res, 404, { error: 'このAPIは利用できません。' });
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return send(res, 415, { error: 'JSONのみ受け付けます。' });
    }
    let input;
    try { input = inputFrom(await readBody(req)); }
    catch (error) { return send(res, error.message.includes('大きすぎ') ? 413 : 400, { error: error.message }); }
    const now = Date.now();
    while (starts.length && starts[0] < now - 60 * 60 * 1000) starts.shift();
    if (starts.length >= HOURLY_LIMIT) return send(res, 429, { error: '生成回数の上限に達しました。' });
    if (active + queue.length >= MAX_PENDING_JOBS) return send(res, 429, { error: '生成待ちが満杯です。少し待って再試行してください。' });
    starts.push(now);
    const jobId = randomBytes(32).toString('hex');
    const job = { state: 'queued', createdAt: now };
    jobs.set(jobId, job);
    send(res, 202, { jobId });
    queue.push({ input, job });
    runNext();
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (job.completedAt && now - job.completedAt > JOB_TTL_MS) jobs.delete(id);
    }
  }, 60000);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const gateway = createGateway();
  gateway.listen(8787, '127.0.0.1', () => {
    console.log('ASCII BATTLE AI gateway listening on 127.0.0.1:8787');
  });
}
