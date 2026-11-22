import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { WebSocket } from 'ws';
import { createSpra } from '../src/spra.js';

test('firing continuously cannot stop PVP state, player rendering data, or CPU movement', { timeout: 18000 }, async () => {
 const game=createSpra();
 const latency=monitorEventLoopDelay({resolution:20});
 latency.enable();
 const startedAt=performance.now();
 const server=createServer();
 server.on('upgrade',(req,socket,head)=>game.upgrade(req,socket,head));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const ws=new WebSocket('ws://127.0.0.1:'+server.address().port);
 const messages=[],sizes=[];
 ws.on('message',raw=>{
   try{const m=JSON.parse(raw.toString());messages.push(m);sizes.push(raw.length);}
   catch {}
 });
 try {
  await new Promise((ok,bad)=>{ws.once('open',ok);ws.once('error',bad);});
  ws.send(JSON.stringify({type:'join',name:'STRESS TEST'}));
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.ok(messages.some(m=>m.type==='welcome'));
  const id=messages.find(m=>m.type==='welcome').id;
  ws.send(JSON.stringify({type:'start'}));
  await new Promise(resolve=>setTimeout(resolve,450));
  const first=messages.find(m=>m.type==='state' && m.phase==='playing');
  assert.ok(first,'the match must start');
  assert.ok(first.players.length===8);
  const bots=first.players.filter(p=>p.bot);
  assert.equal(bots.length,7);
  const initial=new Map(bots.map(p=>[p.id,{x:p.x,y:p.y}]));
  let maxMessage=0;
  const interval=setInterval(()=>ws.send(JSON.stringify({type:'input',fire:true,x:0,y:0,aim:0,swim:false})),80);
  try {await new Promise(resolve=>setTimeout(resolve,4500));}
  finally {clearInterval(interval);}
  const states=messages.filter(m=>m.type==='state' && m.phase==='playing');
  assert.ok(states.length>=16, 'must receive frequent state updates even during sustained shooting; got '+states.length);
  const last=states.at(-1);
  assert.ok(last.players.some(p=>p.id===id),'player cannot disappear from state');
  assert.equal(last.players.length,8,'bots must remain present');
  const moved=last.players.filter(p=>p.bot && initial.has(p.id) &&
     Math.hypot(p.x-initial.get(p.id).x,p.y-initial.get(p.id).y)>0.7);
  assert.ok(moved.length>=3,'at least 3 bots should continue moving while ink spreads, got '+moved.length);
  for(const size of sizes)maxMessage=Math.max(maxMessage,size);
  assert.ok(maxMessage<800000,'messages should not exceed 800KB: '+maxMessage);
  console.log('[SPRA 7-CPU REALTIME PROFILE]',JSON.stringify({
    elapsedMs:+(performance.now()-startedAt).toFixed(1),
    snapshots:states.length,movedBots:moved.length,
    loopP99Ms:+(latency.percentile(99)/1e6).toFixed(2),
    loopMaxMs:+(latency.max/1e6).toFixed(2),
    maxWebSocketBytes:maxMessage,
    averageWebSocketBytes:Math.round(sizes.reduce((sum,n)=>sum+n,0)/Math.max(1,sizes.length))
  }));
 }finally{
   latency.disable();
   ws.close();
   game.close();
   await new Promise(resolve=>server.close(resolve));
 }
});