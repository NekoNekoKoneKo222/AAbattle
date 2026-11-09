// Cloudflare Access must protect this Worker's workers.dev hostname.
// The PC gateway checks its own independent Bearer token.
const jobPath = /^\/v1\/skills\/jobs\/[a-f0-9]{64}$/;
const allowed = (method, path) =>
  (method === 'POST' && path === '/v1/skills/generate') ||
  (method === 'GET' && (path === '/v1/status' || jobPath.test(path)));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.search || !allowed(request.method, url.pathname)) {
      return new Response(JSON.stringify({ error: 'このAPIは利用できません。' }), {
        status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
    const headers = new Headers();
    const authorization = request.headers.get('Authorization');
    if (authorization) headers.set('Authorization', authorization);
    if (request.method === 'POST') headers.set('Content-Type', 'application/json');
    const target = new Request(`http://127.0.0.1:8787${url.pathname}`, {
      method: request.method, headers,
      body: request.method === 'POST' ? request.body : undefined
    });
    try {
      const result = await env.GATEWAY.fetch(target);
      return new Response(result.body, {
        status: result.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff' }
      });
    } catch {
      return new Response(JSON.stringify({ error: 'PCゲートウェイへ接続できません。' }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
  }
};
