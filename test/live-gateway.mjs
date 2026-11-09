// Optional PC-side test: node test/live-gateway.mjs
import { randomBytes } from 'node:crypto';
import { createGateway } from '../src/gateway-server.js';

const token = randomBytes(32).toString('hex');
const gateway = createGateway({ token });
await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${gateway.address().port}`;
const auth = { Authorization: `Bearer ${token}` };
try {
  if ((await fetch(`${base}/v1/status`)).status !== 401) throw new Error('Unauthenticated request was accepted');
  const status = await (await fetch(`${base}/v1/status`, { headers: auth })).json();
  if (!status.connected || !status.installed) throw new Error('Ollama or model is unavailable');
  const started = Date.now();
  const response = await fetch(`${base}/v1/skills/generate`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '猫', art: ' /\\_/\\\n( o.o )\n > ^ <', avoidNames: [] })
  });
  if (response.status !== 202) throw new Error(`Job creation failed: ${response.status}`);
  const { jobId } = await response.json();
  for (let i = 0; i < 150; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const result = await fetch(`${base}/v1/skills/jobs/${jobId}`, { headers: auth });
    if (result.status === 202) continue;
    const data = await result.json();
    if (result.status !== 200 || data.draft?.skills?.length !== 3) {
      throw new Error(`Generation failed: ${result.status} ${data.error || ''}`);
    }
    console.log(JSON.stringify({ elapsedMs: Date.now() - started, model: status.model,
      skills: data.draft.skills.map((skill) => skill.name), passive: data.draft.passive.name }));
    process.exitCode = 0;
    break;
  }
  if (process.exitCode === undefined) throw new Error('Gateway timed out');
} finally {
  gateway.close();
}
