import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import WebSocket from 'ws';
import {starterCraft} from '../glyph-infinity/shared/dist/index.js';
import {attachGlyphInfinity} from '../glyph-infinity/server/dist/index.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout=4000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('online state timeout');await pause(20);}}

test('two accounts share world combat and can form a friend-only co-op party',async()=>{
  const alice={id:'online-alice',username:'Alice'},bob={id:'online-bob',username:'Bob'};
  const profiles=new Map([alice,bob].map(u=>[u.id,{x:360,y:50,hp:100,xp:0,level:2,coins:0}]));
  const crafts=new Map(),server=http.createServer();let friendsAllowed=false;
  const game=attachGlyphInfinity(async u=>({...profiles.get(u.id)}),async(u,p)=>{profiles.set(u.id,{...p});},async u=>structuredClone(crafts.get(u.id)??starterCraft()),async(u,c)=>{crafts.set(u.id,structuredClone(c));},async()=>friendsAllowed);
  server.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,req.url==='/alice'?alice:bob));server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`ws://127.0.0.1:${server.address().port}`;
  const wa=new WebSocket(url+'/alice'),wb=new WebSocket(url+'/bob'),am=[],bm=[];
  wa.on('message',v=>am.push(JSON.parse(v.toString())));wb.on('message',v=>bm.push(JSON.parse(v.toString())));
  try{
    await Promise.all([once(wa,'open'),once(wb,'open')]);
    await until(()=>bm.some(v=>v.type==='state'&&v.players.some(p=>p.id===alice.id)));
    wa.send(JSON.stringify({type:'input',x:1,y:0,aimX:0,aimY:0,attack:false,dash:false}));
    await until(()=>bm.some(v=>v.type==='state'&&v.players.find(p=>p.id===alice.id)?.x>365));
    wa.send(JSON.stringify({type:'input',x:0,y:0,aimX:1,aimY:0,attack:true,dash:false}));
    await until(()=>bm.some(v=>v.type==='state'&&v.enemies.some(e=>e.id==='e0'&&e.hp<e.maxHp)));
    wa.send(JSON.stringify({type:'party:create'}));
    await until(()=>am.some(v=>v.type==='party:state'&&v.party?.leaderId===alice.id));
    await pause(420);wa.send(JSON.stringify({type:'party:invite',targetId:bob.id}));
    await until(()=>am.some(v=>v.type==='party:error'&&/フレンドだけ/.test(v.message)));
    friendsAllowed=true;
    await pause(420);wa.send(JSON.stringify({type:'party:invite',targetId:bob.id}));
    await until(()=>bm.some(v=>v.type==='party:state'&&v.invites?.length===1));
    const invite=bm.findLast(v=>v.type==='party:state').invites[0];
    wb.send(JSON.stringify({type:'party:join',id:invite.id}));
    await until(()=>bm.some(v=>v.type==='party:state'&&v.party?.members.length===2));
    await pause(420);wa.send(JSON.stringify({type:'party:chat',message:'一緒に行こう'}));
    await until(()=>bm.some(v=>v.type==='party:chat'&&v.message==='一緒に行こう'));
    wa.send(JSON.stringify({type:'rpg:dungeon'}));
    await until(()=>bm.some(v=>v.type==='state'&&v.dungeon===1)&&am.some(v=>v.type==='state'&&v.dungeon===1));
    const a=am.findLast(v=>v.type==='state'&&v.dungeon===1),b=bm.findLast(v=>v.type==='state'&&v.dungeon===1);
    assert.deepEqual(a.enemies.map(e=>e.id),b.enemies.map(e=>e.id));
    const attack=setInterval(()=>wb.send(JSON.stringify({type:'input',x:0,y:1,aimX:0,aimY:1,attack:true,dash:false})),50);
    try{await until(()=>am.some(v=>v.type==='state'&&v.dungeon===1&&v.enemies.some(e=>e.hp<e.maxHp))||am.some(v=>v.type==='state'&&v.dungeon===2),6000);}finally{clearInterval(attack);}
    assert.ok(am.some(v=>v.type==='state'&&v.dungeon===1&&v.players.some(p=>p.id===bob.id)));
    wa.close();await once(wa,'close');
    await until(()=>bm.some(v=>v.type==='party:state'&&v.party?.leaderId===bob.id));
    await until(()=>Math.abs(profiles.get(alice.id).x-360)<40);
  }finally{wa.terminate();wb.terminate();await game.shutdown();await new Promise(resolve=>server.close(resolve));}
});
