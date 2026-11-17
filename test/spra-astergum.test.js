import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { createSpra, SPRA_WEAPONS, SPRA_INK_MAX } from '../src/spra.js';
import { SPRA_SPECIALS } from '../public/spra/specials.js';
import { connectedInkLanding, wallCrossLanding } from '../src/spra-navigation.js';
import { createInkSurface } from '../src/spra-ink.js';

function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function startClient(game){
 const server=createServer();
 server.on('upgrade',(req,socket,head)=>game.upgrade(req,socket,head));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const socket=new WebSocket('ws://127.0.0.1:'+server.address().port);
 const packets=[];
 socket.on('message',bytes=>{try{packets.push(JSON.parse(bytes.toString()));}catch{}});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 function waitFor(predicate,timeout=5000){
   return new Promise((resolve,reject)=>{
     const start=Date.now();
     const timer=setInterval(()=>{
       const msg=packets.find(predicate);
       if(msg){clearInterval(timer);resolve(msg);}
       else if(Date.now()-start>timeout){clearInterval(timer);reject(new Error('SPRA packet timeout: '+packets.at(-1)?.type));}
     },40);
   });
 }
 return {socket,packets,waitFor,async close(){
  socket.close();game.close();await new Promise(resolve=>server.close(resolve));
 }};
}
test('Aster Gum is an original space weapon with a fixed three-stage special',()=>{
 assert.equal(SPRA_WEAPONS.star_gum.label,'アスターガム');
 assert.equal(SPRA_WEAPONS.star_gum.type,'cosmic');
 assert.equal(SPRA_WEAPONS.star_gum.damage,18);
 assert.equal(SPRA_SPECIALS.final_frontier.label,'ラストのフロンティア');
 assert.ok(SPRA_WEAPONS.star_gum.cost>0);
});
test('Ink tactic: super jump only reaches connected friendly ink patches',()=>{
 const ink=createInkSurface(20,12);
 ink.trail(2.5,6.5,12.5,6.5,.9,0,42,true);
 const ctx={ink,width:20,height:12,walls:[]};
 assert.ok(connectedInkLanding(ctx,{x:3,y:6},{x:11,y:6},0));
 assert.equal(connectedInkLanding(ctx,{x:3,y:6},{x:17,y:6},0),null);
 const wall={x:7,y:4,w:2,h:3};
 const p={x:6,y:5,input:{swim:true},team:0,ink:300,wallCd:0};
 const crossing=wallCrossLanding({walls:[wall],width:20,height:12,wallInk:new Uint8Array([1])},p,1,0);
 assert.ok(crossing?.x>9,'painted walls should provide a crossing onto clear ground');
 assert.equal(wallCrossLanding({walls:[wall],width:20,height:12,wallInk:new Uint8Array([2])},p,1,0),null);
});
test('Aster Gum: charge -> star projectile -> paint explosion; Q gravity balloon costs 75% ink', {timeout:18000},async()=>{
 const game=createSpra();
 const net=await startClient(game);
 try{
  net.socket.send(JSON.stringify({type:'join',name:'ASTRA'}));
  const welcome=await net.waitFor(p=>p.type==='welcome');
  net.socket.send(JSON.stringify({type:'weapon',weapon:'star_gum'}));
  await net.waitFor(p=>p.type==='state'&&p.players.some(x=>x.id===welcome.id&&x.weapon==='star_gum'));
  net.socket.send(JSON.stringify({type:'start'}));
  const first=await net.waitFor(p=>p.type==='state'&&p.phase==='playing');
  const you=first.players.find(x=>x.id===welcome.id);
  assert.equal(you.special,'final_frontier');
  assert.equal(you.ink,SPRA_INK_MAX);
  net.socket.send(JSON.stringify({type:'input',x:0,y:0,aim:0,fire:true,swim:false}));
  await delay(520);
  net.socket.send(JSON.stringify({type:'input',x:0,y:0,aim:0,fire:false,swim:false}));
  await net.waitFor(p=>p.type==='state'&&p.phase==='playing'&&
    p.gumShots?.length>0);
  const sawProjectile=net.packets.some(p=>p.type==='state'&&p.gumShots?.length);
  assert.ok(sawProjectile);
  await net.waitFor(p=>p.type==='state'&&p.effects?.some(e=>e.type==='gum_pop'),5000);
  const inkBeforeBubble=net.packets.filter(p=>p.type==='state'&&p.phase==='playing').at(-1)
    .players.find(p=>p.id===welcome.id).ink;
  net.socket.send(JSON.stringify({type:'input',x:0,y:0,aim:0,fire:false,swim:false,bomb:true}));
  const balloon=await net.waitFor(p=>p.type==='state'&&p.specials?.some(x=>x.kind==='gravity_balloon'),3500);
  const after=balloon.players.find(x=>x.id===welcome.id);
  assert.ok(after.ink <= inkBeforeBubble-205,'bubble spends 225 ink, accounting for passive regeneration between snapshots');
  assert.ok(after.bombCd>=10);
  await net.waitFor(p=>p.type==='state'&&p.effects?.some(x=>x.type==='bubble_pop'),5500);
 }finally{await net.close();}
});
