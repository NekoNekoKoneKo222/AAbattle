const MAX_RESPONSE_BYTES = 32 * 1024;
const JOB_TIMEOUT_MS = 285000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const gatewayConfigured = () => Boolean(process.env.OLLAMA_GATEWAY_URL);

function configuration() {
  const raw = process.env.OLLAMA_GATEWAY_URL;
  if (!raw) throw new Error('OLLAMA_GATEWAY_URLが設定されていません。');
  const auth = process.env.OLLAMA_GATEWAY_AUTH || 'cloudflare';
  if (auth !== 'cloudflare' && auth !== 'tailscale') {
    throw new Error('OLLAMA_GATEWAY_AUTHが不正です。');
  }
  let url;
  try { url = new URL(raw); } catch { throw new Error('OLLAMA_GATEWAY_URLが不正です。'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash ||
      (auth === 'cloudflare' && url.port) ||
      (auth === 'tailscale' && (url.port !== '8443' || !url.hostname.endsWith('.ts.net')))) {
    throw new Error('OLLAMA_GATEWAY_URLにはHTTPSのホスト名だけを設定してください。');
  }
  const token = process.env.OLLAMA_GATEWAY_TOKEN;
  const clientId = process.env.CF_ACCESS_CLIENT_ID;
  const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!token || (auth === 'cloudflare' && (!clientId || !clientSecret))) {
    throw new Error('AIゲートウェイの認証情報が不足しています。');
  }
  return { origin: url.origin, headers: {
    Authorization: `Bearer ${token}`,
    ...(auth === 'cloudflare' ? {
      'CF-Access-Client-Id': clientId,
      'CF-Access-Client-Secret': clientSecret
    } : {})
  } };
}

async function limitedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return response.json();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('AIゲートウェイの応答が長すぎます。');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('AIゲートウェイの応答を解析できません。'); }
}

async function request(path, method = 'GET', body) {
  const { origin, headers } = configuration();
  let response;
  try {
    response = await fetch(`${origin}${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('AIゲートウェイへ接続できません。PCと公開トンネルを確認してください。');
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('AIゲートウェイの認証に失敗しました。認証設定とBearerトークンを確認してください。');
  }
  if (response.status === 429) throw new Error('AIゲートウェイが混雑しています。少し待って再試行してください。');
  if (response.status === 524 || response.status === 504) throw new Error('AIゲートウェイがタイムアウトしました。');
  if (response.status === 502) {
    const data = await limitedJson(response).catch(() => ({}));
    throw new Error(typeof data.error === 'string' ? data.error.slice(0, 180) : 'AIゲートウェイの生成に失敗しました。');
  }
  if (!response.ok) throw new Error(`AIゲートウェイがHTTP ${response.status}を返しました。`);
  return { status: response.status, data: await limitedJson(response) };
}

export async function gatewayStatus(model) {
  try {
    const { data } = await request('/v1/status');
    return { connected: Boolean(data.connected), model, installed: Boolean(data.installed) };
  } catch { return { connected: false, model, installed: false }; }
}

export async function gatewayGenerate({ art, name, avoidNames }) {
  const { status, data } = await request('/v1/skills/generate', 'POST', { art, name, avoidNames });
  if (status !== 202 || !/^[a-f0-9]{64}$/.test(data.jobId || '')) {
    throw new Error('AIゲートウェイが不正なジョブ番号を返しました。');
  }
  const started = Date.now();
  while (Date.now() - started < JOB_TIMEOUT_MS) {
    await sleep(2000);
    const result = await request(`/v1/skills/jobs/${data.jobId}`);
    if (result.status === 202) continue;
    if (result.status !== 200 || !result.data.draft) throw new Error('AIゲートウェイの生成結果が不正です。');
    return result.data.draft;
  }
  throw new Error('AIゲートウェイの生成がタイムアウトしました。');
}
