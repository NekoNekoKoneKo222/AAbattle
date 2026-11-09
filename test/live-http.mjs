// Optional end-to-end local smoke test: AI_PROVIDER=ollama node test/live-http.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';

const port = await new Promise((resolve) => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1', () => {
    const selectedPort = socket.address().port;
    socket.close(() => resolve(selectedPort));
  });
});
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, AI_PROVIDER: 'ollama', DATABASE_URL: '', NODE_ENV: 'development', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
let stderr = '';
server.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Local server not ready: ${stderr}`);
  const config = await (await fetch(`${base}/api/config`)).json();
  if (config.generationMode !== 'ollama') throw new Error('Wrong provider');
  if ((await fetch(`${base}/api/ai/status`)).status !== 401) throw new Error('Status endpoint is public');
  if ((await fetch(`${base}/api/fighters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status !== 401) {
    throw new Error('Anonymous generation was not rejected');
  }
  const username = `Test${randomBytes(4).toString('hex')}`;
  const register = await fetch(`${base}/api/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: randomBytes(16).toString('hex') })
  });
  if (register.status !== 201) throw new Error(`Register failed: ${register.status}`);
  const cookie = register.headers.get('set-cookie').split(';')[0];
  const status = await (await fetch(`${base}/api/ai/status`, { headers: { Cookie: cookie } })).json();
  if (!status.connected || !status.installed) throw new Error('Ollama or model is unavailable');
  const result = await fetch(`${base}/api/fighters`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '猫', art: ' /\\_/\\\n( o.o )\n > ^ <' }),
    signal: AbortSignal.timeout(290000)
  });
  const data = await result.json();
  if (result.status !== 201) throw new Error(`Generation failed: ${result.status} ${data.error}`);
  if (data.fighter.definition.skills.length !== 3) throw new Error('Missing skills');
  console.log(JSON.stringify({ provider: config.generationMode, status, generationMs: data.generationMs,
    fighter: { name: data.fighter.name, skills: data.fighter.definition.skills.map((s) => s.name) } }));
} finally {
  server.kill('SIGTERM');
}
