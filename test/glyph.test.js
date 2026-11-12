import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { tileAt, canStand, zoneAt } from '../glyph-infinity/shared/dist/index.js';
import { attachGlyphInfinity } from '../glyph-infinity/server/dist/index.js';
import { GlyphStore } from '../src/glyph-store.js';

test('glyph world has reachable city gates and distinct zones',()=>{
  assert.equal(tileAt(8,0),'·');
  assert.equal(canStand(8*32+16,16),true);
  assert.equal(zoneAt(16,16),'始まりの街');
  assert.equal(zoneAt(600,0),'文字の森');
});

test('server owns movement and saves profile when disconnected',async()=>{
  const store=new GlyphStore(null),user={id:'player-1',username:'Tester'};
  const httpServer=http.createServer();
  const game=attachGlyphInfinity(u=>store.load(u),(u,p)=>store.save(u,p));
  httpServer.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,user));
  httpServer.listen(0,'127.0.0.1');await once(httpServer,'listening');
  const port=httpServer.address().port;
  const ws=new WebSocket(`ws://127.0.0.1:${port}`);await once(ws,'open');
  try {
    const first=await new Promise(resolve=>ws.once('message',m=>resolve(JSON.parse(m.toString()))));
    assert.equal(first.players[0].x,16);
    ws.send(JSON.stringify({type:'input',x:10000,y:0,aimX:1,aimY:0,attack:false,dash:false,teleportX:9000}));
    await new Promise(resolve=>setTimeout(resolve,260));
    const moved=await new Promise(resolve=>ws.once('message',m=>resolve(JSON.parse(m.toString()))));
    assert.ok(moved.players[0].x>16 && moved.players[0].x<100,`x=${moved.players[0].x}`);
    ws.close();await once(ws,'close');
    let saved=await store.load(user);for(let n=0;n<20&&saved.x===16;n++){await new Promise(resolve=>setTimeout(resolve,10));saved=await store.load(user);}assert.ok(saved.x>16 && saved.x<150,`saved x=${saved.x}`);
  } finally {
    if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
    await game.shutdown();await new Promise(resolve=>httpServer.close(resolve));
  }
});
