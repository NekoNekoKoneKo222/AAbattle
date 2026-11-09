import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '../shift-arena/apps/client/node_modules/@colyseus/sdk/build/index.mjs';
import { attachShiftArena } from '../shift-arena/apps/server/dist/index.js';

function next(room,type){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(`Timeout ${type}`)),4000);room.onMessage(type,value=>{clearTimeout(timeout);resolve(value);});});}
test('two browser clients share one server-authoritative 3v3 match',async(t)=>{
  const httpServer=http.createServer((_req,res)=>res.end('ok'));
  const shift=attachShiftArena(httpServer);
  httpServer.on('upgrade',(req,socket,head)=>shift.upgrade(req,socket,head));
  await shift.listen(0);
  const port=httpServer.address().port;
  t.after(async()=>{await shift.shutdown();});
  const one=new Client(`ws://127.0.0.1:${port}/sam/colyseus`);
  const two=new Client(`ws://127.0.0.1:${port}/sam/colyseus`);
  const a=await one.create('shift',{name:'ALICE',character:'rei',mode:'core'});
  const b=await two.joinById(a.roomId,{name:'BOB',character:'gald'});
  t.after(()=>{a.leave();b.leave();});
  assert.match(a.roomId,/^[A-F0-9]{6}$/);
  const started=next(b,'started');
  a.send('start');
  const state=await started;
  assert.equal(state.players.length,6);
  assert.equal(state.players.find(p=>p.id===a.sessionId).name,'ALICE');
  assert.equal(state.players.find(p=>p.id===b.sessionId).name,'BOB');
  const updated=next(b,'state');
  a.send('input',{mx:999,mz:0,ax:1,az:0,attack:false,hp:0,damage:999999});
  const nextState=await updated;
  const player=nextState.players.find(p=>p.id===a.sessionId);
  assert.equal(player.hp,4200);
  assert.ok(Math.abs(player.x-state.players.find(p=>p.id===a.sessionId).x)<1);
});

