import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import WebSocket from 'ws';
import {TILE,WORLD,CHUNK_SIZE,WORLD_SITES,BIOMES,biomeAt,chunkKey,chestAt,currentWorldEvent,generatedChunk,canStand,starterCraft} from '../glyph-infinity/shared/dist/index.js';
import {attachGlyphInfinity} from '../glyph-infinity/server/dist/index.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout=3000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('world state timeout');await pause(20);}}
const location=(tx,ty)=>({x:(tx+.5)*TILE,y:(ty+.5)*TILE});

test('64-square chunks and eight biomes are deterministic and traversable',()=>{
  assert.equal(CHUNK_SIZE,64);assert.equal(WORLD,128);assert.equal(generatedChunk(1,0).length,4096);
  assert.strictEqual(generatedChunk(1,0),generatedChunk(1,0));
  assert.equal(chunkKey(-1,0),'-1,0');
  for(const [tx,ty,name] of [[0,0,'city'],[36,0,'forest'],[-42,-38,'mine'],[42,-38,'desert'],[-42,38,'fallen'],[42,38,'anomaly'],[0,72,'abyss'],[76,0,'boundary']])assert.equal(biomeAt(tx,ty),name);
  assert.equal(Object.keys(BIOMES).length,11);
  for(const site of WORLD_SITES)assert.equal(canStand(...Object.values(location(site.tx,site.ty))),true,site.id);
  assert.deepEqual(currentWorldEvent(Date.UTC(2026,10,13,14,59)).id,currentWorldEvent(Date.UTC(2026,10,13,0,0)).id);
  assert.notEqual(currentWorldEvent(Date.UTC(2026,10,13,14,59)).id,currentWorldEvent(Date.UTC(2026,10,13,15,0)).id);
});

test('merchant, exploration, chest and travel are server-authoritative and saved',async()=>{
  const user={id:'world-test',username:'Explorer'},merchant=WORLD_SITES.find(s=>s.id==='merchant');
  let profile={...location(merchant.tx,merchant.ty),hp:100,xp:0,level:2,coins:100},craft=starterCraft();
  const server=http.createServer(),game=attachGlyphInfinity(async()=>({...profile}),async(_u,p)=>{profile={...p};},async()=>structuredClone(craft),async(_u,c)=>{craft=structuredClone(c);});
  server.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,user));server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`ws://127.0.0.1:${server.address().port}`;
  let ws,messages=[];
  const connect=async()=>{messages=[];ws=new WebSocket(url);ws.on('message',data=>messages.push(JSON.parse(data.toString())));await once(ws,'open');await until(()=>messages.some(m=>m.type==='state'));};
  const close=async()=>{ws.close();await once(ws,'close');await pause(30);};
  try{
    await connect();await until(()=>messages.some(m=>m.type==='state'&&m.world?.discovered.includes('merchant')));
    ws.send(JSON.stringify({type:'world:buy',item:'crystal'}));
    await until(()=>messages.some(m=>m.type==='craft:state'&&m.craft.materials.crystal===3));
    assert.equal(profile.coins,75);
    await pause(220);ws.send(JSON.stringify({type:'world:travel',id:'boundary'}));
    await until(()=>messages.some(m=>m.type==='craft:error'&&/未発見/.test(m.message)));
    await close();
    assert.ok(craft.rpg.explored.includes(chunkKey(merchant.tx,merchant.ty)));
    const chest=chestAt(-1,-1);profile={...profile,...location(chest.tx,chest.ty),hp:100};
    await connect();ws.send(JSON.stringify({type:'world:interact'}));
    await until(()=>messages.some(m=>m.type==='world:dialog'&&/宝箱を開封/.test(m.message)));
    assert.ok(craft.rpg.openedChests.includes(chest.id));
    const coins=profile.coins;await pause(220);ws.send(JSON.stringify({type:'world:interact'}));
    await until(()=>messages.some(m=>m.type==='world:dialog'&&/開封済み/.test(m.message)));
    assert.equal(profile.coins,coins);
    await close();
    const forest=WORLD_SITES.find(s=>s.id==='forest');profile={...profile,...location(forest.tx,forest.ty),hp:100};
    await connect();await until(()=>messages.some(m=>m.type==='state'&&m.world?.discovered.includes('forest')));
    ws.send(JSON.stringify({type:'world:travel',id:'city'}));
    await until(()=>messages.some(m=>m.type==='state'&&Math.hypot(m.players[0].x-16,m.players[0].y-16)<20));
    assert.ok(craft.rpg.discovered.includes('forest'));
    await close();
    const event=currentWorldEvent(Date.now());profile={...profile,...location(event.tx,event.ty),hp:100};
    await connect();ws.send(JSON.stringify({type:'world:interact'}));
    await until(()=>messages.some(m=>m.type==='world:dialog'&&/を獲得/.test(m.message)));
    assert.ok(craft.rpg.eventClaims.includes(event.id));
    const rewarded={coins:profile.coins,materials:{...craft.materials}};
    await pause(220);ws.send(JSON.stringify({type:'world:interact'}));
    await until(()=>messages.some(m=>m.type==='world:dialog'&&/受け取り済み/.test(m.message)));
    assert.equal(profile.coins,rewarded.coins);assert.deepEqual(craft.materials,rewarded.materials);
    await close();
    const secret=WORLD_SITES.find(s=>s.id==='secret');profile={...profile,...location(secret.tx,secret.ty),hp:100};
    const beforeSecret=craft.materials.crystal;
    await connect();await until(()=>messages.some(m=>m.type==='state'&&m.world?.discovered.includes('secret')));
    assert.equal(craft.materials.crystal,beforeSecret+5);
    await close();await connect();await pause(80);
    assert.equal(craft.materials.crystal,beforeSecret+5,'secret reward is one-time');
  }finally{if(ws?.readyState!==WebSocket.CLOSED)ws?.terminate();await game.shutdown();await new Promise(resolve=>server.close(resolve));}
});
