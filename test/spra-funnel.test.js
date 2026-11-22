import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSpraFunnelServer } from '../src/spra-funnel-server.js';

const PASSWORD = 'Example-Friends-Only-Password-2026';
const start = async () => {
  const service = createSpraFunnelServer({ password: PASSWORD });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + service.server.address().port;
  return { service, base };
};
const login = async base => {
  const result = await fetch(base + '/spra/login', {
    method: 'POST',
    headers: {'Origin': base, 'Content-Type': 'application/json'},
    body: JSON.stringify({ password: PASSWORD })
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true });
  const cookie = result.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  return cookie.split(';')[0];
};

function socket(base, cookie, origin) {
  return new Promise(resolve => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/spra/ws', {
      headers: { Origin: origin, Cookie: cookie || '' }
    });
    ws.once('open', () => resolve({ ok: true, ws }));
    ws.once('unexpected-response', (_req, res) => {
      resolve({ ok: false, code: res.statusCode, ws });
      res.resume();
    });
    ws.once('error', e => resolve({ ok: false, code: 0, ws, error: e.message }));
  });
}

test('SPRA Funnel rejects anonymous resources and other AAbattle games', async () => {
  const { service, base } = await start();
  try {
    assert.equal((await fetch(base + '/healthz')).status, 200);
    assert.equal((await fetch(base + '/spra/')).status, 200);
    assert.equal((await fetch(base + '/spra/style.css')).status, 401);
    assert.equal((await fetch(base + '/spra/game.js')).status, 401);
    assert.equal((await fetch(base + '/fonts/ibm-plex-mono-latin-400-normal.woff2')).status, 401);
    assert.equal((await fetch(base + '/api/spra/leaderboard')).status, 401);
    assert.equal((await fetch(base + '/CSH/')).status, 404);
    assert.equal((await fetch(base + '/api/login')).status, 404);
    assert.equal((await fetch(base + '/src/server.js')).status, 404);
    const cssLogin = await fetch(base + '/spra/funnel-access.css');
    assert.equal(cssLogin.status, 200);
    assert.match(cssLogin.headers.get('content-type'), /text\/css/);
  } finally { await service.close(); }
});

test('SPRA Funnel guards login by origin/password, serves real 2D client assets', async () => {
  const { service, base } = await start();
  try {
    const badOrigin = await fetch(base + '/spra/login', {
      method: 'POST',
      headers: { Origin: 'https://attacker.invalid', 'Content-Type':'application/json' },
      body: JSON.stringify({ password: PASSWORD })
    });
    assert.equal(badOrigin.status, 403);
    const badPassword = await fetch(base + '/spra/login', {
      method: 'POST',
      headers: {Origin:base, 'Content-Type':'application/json'},
      body: JSON.stringify({ password: 'incorrect-password' })
    });
    assert.equal(badPassword.status, 401);
    const token = await login(base);
    for (const item of [
      ['/spra/', 'text/html'], ['/spra/style.css', 'text/css'],
      ['/spra/game.js', 'javascript'], ['/spra/city.js', 'javascript'],
      ['/spra/weapons.js', 'javascript'], ['/spra/tutorial.js', 'javascript'],
      ['/spra/touch-guard.js','javascript'],
      ['/fonts/ibm-plex-mono-latin-400-normal.woff2','font/woff2']
    ]) {
      const response = await fetch(base + item[0], { headers: {Cookie: token} });
      assert.equal(response.status, 200, item[0] + ' must be served');
      assert.match(response.headers.get('content-type'), new RegExp(item[1]), item[0] + ' MIME');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    const page = await (await fetch(base + '/spra/', {headers:{Cookie:token}})).text();
    assert.match(page, /id="gameCanvas"/);
    assert.match(page, /\/spra\/style\.css/);
    assert.match(page, /\/spra\/game\.js/);
    assert.equal((await fetch(base + '/api/spra/leaderboard', {headers:{Cookie:token}})).status, 200);
    const badCookie = await fetch(base + '/spra/game.js', {headers:{Cookie:token.slice(0,-1) + (token.endsWith('0')?'1':'0')}});
    assert.equal(badCookie.status, 401);
  } finally { await service.close(); }
});

test('SPRA Funnel WS requires authenticated same-origin session and accepts a real match', { timeout:10000 }, async () => {
  const { service, base } = await start();
  const connected = [];
  try {
    const unauthorized = await socket(base, '', base);
    assert.equal(unauthorized.ok, false);
    assert.equal(unauthorized.code, 401);
    const cookie = await login(base);
    const forged = await socket(base, cookie, 'https://attacker.invalid');
    assert.equal(forged.ok, false);
    assert.equal(forged.code, 403);
    const allowed = await socket(base, cookie, base);
    assert.equal(allowed.ok, true, allowed.error);
    connected.push(allowed.ws);
    const joined = new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Timed out waiting for room')),5000);
      allowed.ws.on('message', raw=>{
        const data=JSON.parse(raw.toString());
        if(data.type==='welcome'){clearTimeout(timer);resolve(data);}
      });
    });
    allowed.ws.send(JSON.stringify({type:'join',name:'FRIEND'}));
    const welcome = await joined;
    assert.match(welcome.code, /^[A-Z0-9]{6}$/);
    assert.equal(welcome.width, 160);
    assert.equal(welcome.height, 100);
  } finally {
    for(const ws of connected)ws.terminate();
    await service.close();
  }
});

test('SPRA Funnel logout invalidates assets and closes existing game socket', {timeout:8000}, async()=>{
  const { service, base } = await start();
  let ws;
  try {
    const cookie=await login(base);
    const result=await socket(base,cookie,base);
    assert.equal(result.ok,true);
    ws=result.ws;
    const closed=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('WebSocket remained open after logout')),3000);
      ws.once('close',()=>{clearTimeout(timer);resolve();});
    });
    const response=await fetch(base+'/spra/logout',{
      method:'POST',headers:{Origin:base,Cookie:cookie}
    });
    assert.equal(response.status,200);
    await closed;
    assert.equal((await fetch(base+'/spra/style.css',{headers:{Cookie:cookie}})).status,401);
  } finally {ws?.terminate();await service.close();}
});
