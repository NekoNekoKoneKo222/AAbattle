import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import WebSocket from 'ws';
import {starterCraft} from '../glyph-infinity/shared/dist/index.js';
import {attachGlyphInfinity} from '../glyph-infinity/server/dist/index.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout=5000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('state timeout');await pause(20);}}
async function fixture(initialCraft=null,start={x:16,y:16}){
  const users=[{id:'phase6-a',username:'A'},{id:'phase6-b',username:'B'}];
  const profiles=new Map(users.map(u=>[u.id,{...start,hp:start.hp??100,xp:0,level:start.level??12,coins:0}]));
  const crafts=new Map(initialCraft?[['phase6-a',initialCraft]]:[]),server=http.createServer();
  const game=attachGlyphInfinity(async u=>({...profiles.get(u.id)}),async(u,p)=>{profiles.set(u.id,{...p});},async u=>structuredClone(crafts.get(u.id)??starterCraft()),async(u,c)=>{crafts.set(u.id,structuredClone(c));},async()=>false);
  server.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,users[req.url==='/a'?0:1]));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`ws://127.0.0.1:${server.address().port}`,a=new WebSocket(base+'/a'),b=new WebSocket(base+'/b'),am=[],bm=[];
  a.on('message',v=>am.push(JSON.parse(v.toString())));b.on('message',v=>bm.push(JSON.parse(v.toString())));
  await Promise.all([once(a,'open'),once(b,'open')]);
  return {a,b,am,bm,crafts,close:async()=>{a.terminate();b.terminate();await game.shutdown();await new Promise(resolve=>server.close(resolve));}};
}

test('join code lets two accounts form a cooperative party without friendship',async()=>{
  const f=await fixture();
  try{
    f.a.send(JSON.stringify({type:'party:create'}));
    await until(()=>f.am.some(v=>v.type==='party:state'&&v.party?.code));
    const code=f.am.findLast(v=>v.type==='party:state').party.code;
    assert.match(code,/^[A-F0-9]{6}$/);
    f.b.send(JSON.stringify({type:'party:join-code',code}));
    await until(()=>f.bm.some(v=>v.type==='party:state'&&v.party?.members.length===2));
    f.a.send(JSON.stringify({type:'rpg:dungeon'}));
    await until(()=>f.am.some(v=>v.type==='state'&&v.dungeon===1)&&f.bm.some(v=>v.type==='state'&&v.dungeon===1));
  }finally{await f.close();}
});

test('ranked PvP starts for two solo players and saves a forfeit result',async()=>{
  const f=await fixture();
  try{
    f.a.send(JSON.stringify({type:'pvp:queue',mode:'ranked',size:1}));
    await until(()=>f.am.some(v=>v.type==='pvp:notice'&&/探して/.test(v.message)));
    f.b.send(JSON.stringify({type:'pvp:queue',mode:'ranked',size:1}));
    await until(()=>f.am.some(v=>v.type==='state'&&v.pvp?.round===1)&&f.bm.some(v=>v.type==='state'&&v.pvp?.round===1));
    const state=f.am.findLast(v=>v.type==='state'&&v.pvp);
    assert.equal(state.players.find(p=>p.id==='phase6-a').maxHp,120);
    f.b.send(JSON.stringify({type:'pvp:leave'}));
    await until(()=>f.am.some(v=>v.type==='pvp:notice'&&/勝利/.test(v.message)));
    await until(()=>f.crafts.get('phase6-a')?.pvp.wins===1&&f.crafts.get('phase6-b')?.pvp.losses===1);
    assert.ok(f.crafts.get('phase6-a').pvp.rating>1000);
  }finally{await f.close();}
});

test('boss cores unlock a craft part once and persist the balance',async()=>{
  const seed=starterCraft();seed.bossParts=1;
  const f=await fixture(seed);
  try{
    f.a.send(JSON.stringify({type:'craft:unlock-part',id:'void'}));
    await until(()=>f.am.some(v=>v.type==='craft:state'&&v.craft.unlockedParts.includes('void')));
    const craft=f.am.findLast(v=>v.type==='craft:state').craft;
    assert.equal(craft.bossParts,0);
    await until(()=>f.crafts.get('phase6-a')?.unlockedParts.includes('void'));
    await pause(220);
    f.a.send(JSON.stringify({type:'craft:unlock-part',id:'void'}));
    await until(()=>f.am.some(v=>v.type==='craft:error'&&/解放済み/.test(v.message)));
  }finally{await f.close();}
});

test('a boss can complete its telegraphed attack while repeatedly hit',async()=>{
  const f=await fixture(null,{x:70,y:720,hp:188});
  try{
    await until(()=>f.am.some(v=>v.type==='state'&&v.enemies.some(e=>e.id==='e8')));
    const boss=f.am.find(v=>v.type==='state').enemies.find(e=>e.id==='e8');
    assert.ok(Math.hypot(boss.x-70,boss.y-720)<100);
    const attack=setInterval(()=>f.a.send(JSON.stringify({type:'input',x:0,y:0,aimX:boss.x-70,aimY:boss.y-720,attack:true,dash:false})),40);
    try{
      await until(()=>f.am.some(v=>v.type==='state'&&v.enemies.some(e=>e.id==='e8'&&e.hp<e.maxHp)),3000);
      await until(()=>f.am.some(v=>v.type==='state'&&v.players.find(p=>p.id==='phase6-a')?.hp<188),4500);
    }finally{clearInterval(attack);}
  }finally{await f.close();}
});

test('level ten players can enter and leave the infinite abyss',async()=>{
  const f=await fixture();
  try{
    f.a.send(JSON.stringify({type:'rpg:abyss'}));
    await until(()=>f.am.some(v=>v.type==='state'&&v.zone.includes('無限深淵')&&v.dungeon===1));
    f.a.send(JSON.stringify({type:'rpg:leave'}));
    await until(()=>f.am.some(v=>v.type==='state'&&v.dungeon===0));
    assert.equal(f.crafts.get('phase6-a')?.abyssDepth??0,0);
  }finally{await f.close();}
});

test('PvP melee collision damages the opposing player, not a world enemy',async()=>{
  const f=await fixture();
  try{
    f.a.send(JSON.stringify({type:'pvp:queue',mode:'ranked',size:1}));
    f.b.send(JSON.stringify({type:'pvp:queue',mode:'ranked',size:1}));
    await until(()=>f.am.some(v=>v.type==='state'&&v.pvp?.round===1));
    const moveA=setInterval(()=>f.a.send(JSON.stringify({type:'input',x:1,y:0,aimX:1,aimY:0,attack:false,dash:false})),40);
    const moveB=setInterval(()=>f.b.send(JSON.stringify({type:'input',x:-1,y:0,aimX:-1,aimY:0,attack:false,dash:false})),40);
    await pause(1100);clearInterval(moveA);clearInterval(moveB);
    const attackA=setInterval(()=>f.a.send(JSON.stringify({type:'input',x:0,y:0,aimX:1,aimY:0,attack:true,dash:false})),40);
    try{await until(()=>f.bm.some(v=>v.type==='state'&&v.pvp&&v.players.find(p=>p.id==='phase6-b')?.hp<120),4500);}finally{clearInterval(attackA);}
    assert.ok(f.bm.findLast(v=>v.type==='state'&&v.pvp)?.enemies.length===0);
  }finally{await f.close();}
});

test('holding only basic attack no longer wins a high-level boss duel',async()=>{
  const f=await fixture(null,{x:70,y:720,hp:892,level:100});
  try{
    await until(()=>f.am.some(v=>v.type==='state'&&v.enemies.some(e=>e.id==='e8')));
    const boss=f.am.find(v=>v.type==='state').enemies.find(e=>e.id==='e8');
    const aimX=Math.max(-1,Math.min(1,boss.x-70)),aimY=Math.max(-1,Math.min(1,boss.y-720));
    const attack=setInterval(()=>f.a.send(JSON.stringify({type:'input',x:0,y:0,aimX,aimY,attack:true,dash:false})),40);
    try{await until(()=>f.am.some(v=>v.type==='state'&&v.players.find(p=>p.id==='phase6-a')?.x===16),20000);}finally{clearInterval(attack);}
    assert.equal(f.crafts.get('phase6-a')?.bossParts??0,0);
  }finally{await f.close();}
});

test('world chat reaches both players, sanitizes text, and limits rapid messages',async()=>{
  const f=await fixture();
  try{
    f.a.send(JSON.stringify({type:'chat:world',message:'合流\nしよう'}));
    await until(()=>f.bm.some(v=>v.type==='chat:world'&&v.message==='合流 しよう'));
    assert.ok(f.am.some(v=>v.type==='chat:world'&&v.from==='A'));
    f.a.send(JSON.stringify({type:'chat:world',message:'連打'}));
    await until(()=>f.am.some(v=>v.type==='chat:error'));
    assert.equal(f.bm.filter(v=>v.type==='chat:world').length,1);
  }finally{await f.close();}
});

test('shared world presence and boss HP let independent players earn co-op rewards',async()=>{
  const f=await fixture(null,{x:70,y:720,hp:892,level:100});
  try{
    await until(()=>f.am.some(v=>v.type==='world:presence'&&v.players.length===2)&&f.bm.some(v=>v.type==='world:presence'&&v.players.length===2),2500);
    const first=f.am.findLast(v=>v.type==='world:presence'),second=f.bm.findLast(v=>v.type==='world:presence');
    assert.deepEqual(first.players.map(p=>p.id).sort(),second.players.map(p=>p.id).sort());
    assert.equal(first.enemies.find(e=>e.id==='e8').hp,second.enemies.find(e=>e.id==='e8').hp);
    const boss=first.enemies.find(e=>e.id==='e8'),aimX=Math.max(-1,Math.min(1,boss.x-70)),aimY=Math.max(-1,Math.min(1,boss.y-720));
    const command=JSON.stringify({type:'input',x:0,y:0,aimX,aimY,attack:true,dash:false});
    const attack=setInterval(()=>{f.a.send(command);f.b.send(command);},40);
    try{await until(()=>f.crafts.get('phase6-a')?.bossParts>=1&&f.crafts.get('phase6-b')?.bossParts>=1,15000);}finally{clearInterval(attack);}
    assert.equal(f.crafts.get('phase6-a').rpg.bossKills,1);
    assert.equal(f.crafts.get('phase6-b').rpg.bossKills,1);
  }finally{await f.close();}
});
