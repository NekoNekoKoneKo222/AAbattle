import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { TILE, tileAt, canStand, zoneAt, setWorldMap, authoredMapSize } from '../glyph-infinity/shared/dist/index.js';
import { attachGlyphInfinity } from '../glyph-infinity/server/dist/index.js';
import { GlyphStore } from '../src/glyph-store.js';

test('glyph world has reachable city gates and distinct zones',()=>{
  assert.equal(tileAt(8,0),'·');
  assert.equal(canStand(8*32+16,16),true);
  assert.equal(zoneAt(16,16),'始まりの街');
  assert.equal(zoneAt(600,0),'文字の森');
});

test('world.txt overrides terrain consistently for server collision and map',()=>{
  const source=readFileSync(new URL('../glyph-infinity/world.txt',import.meta.url),'utf8');
  setWorldMap(source);
  try {
    assert.deepEqual(authoredMapSize(),{originX:-24,originY:-18,width:49,height:37});
    assert.equal(tileAt(0,0),'◎');
    assert.equal(tileAt(8,3),'#');
    assert.equal(canStand(8*TILE+16,3*TILE+16),false);
    assert.equal(canStand(8*TILE+16,16),true);
    setWorldMap('@origin 0 0\nS#\n..');
    assert.equal(tileAt(0,0),'◎');
    assert.equal(tileAt(1,0),'#');
    assert.equal(canStand(48,16),false);
  } finally { setWorldMap(''); }
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
    const dashStates=[];const onDash=m=>dashStates.push(JSON.parse(m.toString()));ws.on('message',onDash);
    ws.send(JSON.stringify({type:'input',x:1,y:0,aimX:0,aimY:0,attack:false,dash:true}));
    await new Promise(resolve=>setTimeout(resolve,260));ws.off('message',onDash);
    assert.ok(dashStates.some(s=>s.rollUntil>s.time),'dash should last beyond a single tick');
    assert.ok(dashStates.some(s=>s.effects.some(e=>e.kind==='trail')),'dash should leave a visible trail');
    ws.close();await once(ws,'close');
    let saved=await store.load(user);for(let n=0;n<20&&saved.x===16;n++){await new Promise(resolve=>setTimeout(resolve,10));saved=await store.load(user);}assert.ok(saved.x>16 && saved.x<250,`saved x=${saved.x}`);
  } finally {
    if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
    await game.shutdown();await new Promise(resolve=>httpServer.close(resolve));
  }
});

test('keyboard melee auto-targets a nearby enemy without a mouse',async()=>{
  let user={id:'melee-player',username:'Melee'};
  let profile={x:16,y:16,hp:100,xp:0,level:1,coins:0};
  const httpServer=http.createServer();
  const game=attachGlyphInfinity(async()=>({...profile}),async(_user,value)=>{profile={...value};});
  httpServer.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,user));
  httpServer.listen(0,'127.0.0.1');await once(httpServer,'listening');
  const url=`ws://127.0.0.1:${httpServer.address().port}`;
  let ws=new WebSocket(url),timer;
  try {
    await once(ws,'open');
    const initial=await new Promise(resolve=>ws.once('message',m=>resolve(JSON.parse(m.toString()))));
    const target=initial.enemies.find(e=>e.id==='e0');
    assert.ok(target);
    ws.close();await once(ws,'close');
    await new Promise(resolve=>setTimeout(resolve,30));
    let near=null;
    for(const radius of [38,48,60,70])for(let a=0;a<8;a++){
      const x=target.x+Math.cos(a*Math.PI/4)*radius,y=target.y+Math.sin(a*Math.PI/4)*radius;
      if(canStand(x,y)&&!near)near={x,y};
    }
    assert.ok(near,'an accessible melee position should exist');
    profile={...profile,...near,hp:100};
    user={...user,id:'melee-player-near'};
    ws=new WebSocket(url);await once(ws,'open');
    const states=[];ws.on('message',m=>{const value=JSON.parse(m.toString());if(value.type==='state')states.push(value);});
    const attack=()=>ws.send(JSON.stringify({type:'input',x:0,y:0,aimX:0,aimY:0,attack:true,dash:false}));
    attack();timer=setInterval(attack,50);
    await new Promise(resolve=>setTimeout(resolve,800));
    assert.ok(states.some(s=>s.effects.some(e=>e.kind==='slash')),'swing should have a visible effect');
    assert.ok(states.some(s=>s.enemies.find(e=>e.id==='e0')?.hp<target.hp),`melee attack should damage e0: target=${JSON.stringify(target)}, near=${JSON.stringify(near)}, states=${JSON.stringify(states.map(s=>({x:s.players[0].x,y:s.players[0].y,hp:s.enemies.find(e=>e.id==='e0')?.hp,slash:s.effects.some(e=>e.kind==='slash')})).slice(0,8))}`);
  } finally {
    clearInterval(timer);
    if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
    await game.shutdown();await new Promise(resolve=>httpServer.close(resolve));
  }
});

test('ranged enemy warns before firing a dodgeable projectile',async()=>{
  let user={id:'ranged-player',username:'Ranged'};
  let profile={x:16,y:16,hp:100,xp:0,level:1,coins:0};
  const httpServer=http.createServer();
  const game=attachGlyphInfinity(async()=>({...profile}),async(_user,value)=>{profile={...value};});
  httpServer.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,user));
  httpServer.listen(0,'127.0.0.1');await once(httpServer,'listening');
  const url=`ws://127.0.0.1:${httpServer.address().port}`;
  let ws=new WebSocket(url);
  try {
    await once(ws,'open');
    const initial=await new Promise(resolve=>ws.once('message',m=>resolve(JSON.parse(m.toString()))));
    const target=initial.enemies.find(e=>e.id==='e1');assert.ok(target);
    ws.close();await once(ws,'close');await new Promise(resolve=>setTimeout(resolve,30));
    let near=null;
    for(const radius of [120,140,100,80,64,48,36])for(let a=0;a<16;a++){
      const x=target.x+Math.cos(a*Math.PI/8)*radius,y=target.y+Math.sin(a*Math.PI/8)*radius;
      if(!canStand(x,y))continue;
      let clear=true;
      for(let t=0;t<=1;t+=.1)if(!canStand(target.x+(x-target.x)*t,target.y+(y-target.y)*t))clear=false;
      if(clear&&!near)near={x,y};
    }
    assert.ok(near,'a clear ranged lane should exist');
    profile={...profile,...near,hp:100};
    user={...user,id:'ranged-player-near'};
    ws=new WebSocket(url);await once(ws,'open');
    const states=[];ws.on('message',m=>{const value=JSON.parse(m.toString());if(value.type==='state')states.push(value);});
    await new Promise(resolve=>setTimeout(resolve,1300));
    assert.ok(states.some(s=>(s.enemies.find(e=>e.id==='e1')?.windupUntil??0)>s.time),'warning should precede the shot');
    assert.ok(states.some(s=>s.projectiles.length>0),'the enemy should fire a moving projectile');
  } finally {
    if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
    await game.shutdown();await new Promise(resolve=>httpServer.close(resolve));
  }
});
