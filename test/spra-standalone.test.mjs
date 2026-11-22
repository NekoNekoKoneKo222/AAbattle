import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { WebSocket } from 'ws';
import { createSpraFunnelServer } from '../src/spra-funnel-server.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const password='Standalone-Test-Only-SPRA-Passphrase-123';

test('Standalone package has SPRA only and original pixel art',async()=>{
  const actual=(await readdir(root)).filter(x=>!x.startsWith('.')).sort();
  const expected=[
    'README.md','START_SPRA_FUNNEL.bat','STOP_SPRA_FUNNEL.bat',
    'package.json','package-lock.json','node_modules','public','scripts','src','test'
  ].sort();
  assert.deepEqual(actual,expected);
  assert.deepEqual((await readdir(join(root,'src'))).sort(),
    ['spra-funnel-server.js','spra-ink.js','spra-leaderboard.js','spra-navigation.js','spra.js'].sort());
  assert.deepEqual((await readdir(join(root,'public'))).sort(),['fonts','spra']);
  const css=await readFile(join(root,'public/spra/style.css'),'utf8');
  assert.match(css,/image-rendering:pixelated/);
});

test('Standalone friend login exposes only SPRA routes and accepts battle rooms',{timeout:12000},async()=>{
  const service=createSpraFunnelServer({password});
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+service.server.address().port;
  let ws;
  try{
    assert.equal((await fetch(origin+'/CSH/')).status,404);
    assert.equal((await fetch(origin+'/api/login')).status,404);
    assert.equal((await fetch(origin+'/spra/game.js')).status,401);
    const denied=await fetch(origin+'/spra/login',{method:'POST',
      headers:{Origin:'https://malicious.example','Content-Type':'application/json'},
      body:JSON.stringify({password})});
    assert.equal(denied.status,403);
    const login=await fetch(origin+'/spra/login',{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({password})});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    for(const [p,type] of [
      ['/spra/',/text\/html/],['/spra/style.css',/text\/css/],
      ['/spra/game.js',/javascript/],['/spra/weapons.js',/javascript/],
      ['/spra/tutorial.js',/javascript/],
      ['/fonts/ibm-plex-mono-latin-400-normal.woff2',/font\/woff2/]
    ]){
      const r=await fetch(origin+p,{headers:{Cookie:cookie}});
      assert.equal(r.status,200,'Asset failed: '+p);
      assert.match(r.headers.get('content-type'),type,'Incorrect MIME: '+p);
    }
    const welcome=new Promise((resolve,reject)=>{
      ws=new WebSocket(origin.replace('http:','ws:')+'/spra/ws',{headers:{Origin:origin,Cookie:cookie}});
      const timer=setTimeout(()=>reject(new Error('Welcome timeout')),4500);
      ws.on('open',()=>ws.send(JSON.stringify({type:'join',name:'STANDALONE'})));
      ws.on('message',data=>{
        const msg=JSON.parse(data.toString());
        if(msg.type==='welcome'){clearTimeout(timer);resolve(msg);}
      });
      ws.on('error',reject);
    });
    const msg=await welcome;
    assert.equal(msg.width,160);
    assert.equal(msg.height,100);
  } finally {ws?.terminate();await service.close();}
});
