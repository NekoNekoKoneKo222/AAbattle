import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createChaosCollection } from '../src/chaos-collection.js';
import { createChaosBoss, registerChaosBossRoutes, BOSS_CATALOG } from '../src/chaos-boss.js';

async function fixture(t){
  const collection=createChaosCollection(),app=express();app.use(express.json());
  app.use((req,res,next)=>{const id=req.headers['x-test-user'];if(!id)return res.status(401).json({error:'login required'});req.chaosUser={id,username:id};next();});
  const boss=registerChaosBossRoutes(app,{collection}),server=createServer(app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(id,path,body)=>{const response=await fetch(base+'/boss'+path,{method:body===undefined?'GET':'POST',
    headers:{'x-test-user':id,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};};
  return {collection,boss,request};
}

test('boss room allows solo or exactly two members and host starts the match',async t=>{
  const {request}=await fixture(t);
  const create=await request('alice','/rooms',{bossId:'rookie'});
  assert.equal(create.status,200);
  assert.equal(create.data.players.length,1);
  const code=create.data.code;
  const join=await request('bob','/rooms/'+code+'/join',{});
  assert.equal(join.status,200);
  assert.equal(join.data.players.length,2);
  assert.equal((await request('charlie','/rooms/'+code+'/join',{})).status,409);
  assert.equal((await request('stranger','/rooms/'+code)).status,404);
  assert.equal((await request('bob','/rooms/'+code+'/start',{})).status,403);
  const started=await request('alice','/rooms/'+code+'/start',{});
  assert.equal(started.status,200);
  assert.equal(started.data.status,'playing');
  assert.equal(started.data.game.boss.maxHp,BOSS_CATALOG.rookie.maxHp);
  assert.equal(started.data.game.cards.currentHand.length,4);
  const action=started.data.game.legal.find(a=>a.kind==='move');
  assert.ok(action);
  const played=await request('alice','/rooms/'+code+'/actions',{revision:started.data.game.revision,action});
  assert.equal(played.status,200,JSON.stringify(played.data));
  assert.equal(played.data.activeUserId,'bob');
  assert.equal(played.data.game.turn,'b');
  assert.equal((await request('alice','/rooms/'+code+'/actions',{revision:played.data.revision,action})).status,403);
  const move=played.data.game.legal.length?played.data.game.legal[0]:null;
  // Nonactive players cannot see legal moves, while the active teammate can.
  assert.equal(move,null);
  const bob=await request('bob','/rooms/'+code);
  assert.ok(bob.data.game.legal.length);
  const second=await request('bob','/rooms/'+code+'/actions',{revision:bob.data.revision,action:bob.data.game.legal[0]});
  assert.equal(second.status,200,JSON.stringify(second.data));
  assert.equal((await request('bob','/rooms/'+code+'/actions',{revision:bob.data.revision,action:bob.data.game.legal[0]})).status,403);
});

test('solo boss can be defeated by card damage and rewards are saved once',async()=>{
  const collection=createChaosCollection();
  const boss=createChaosBoss({collection});
  const alice={id:'alice',username:'alice'};
  const room=await boss.create(alice,'rookie');
  await boss.start(room.code,alice);
  const raw=boss._test.rooms.get(room.code);
  raw.hp=6;
  raw.game.cards.b.hand=['avada'];
  raw.game.cards.b.cp=10;
  const result=await boss.act(room.code,alice,raw.game.revision,{kind:'card',cardId:'avada',target:18});
  assert.equal(result.status,'cleared');
  assert.equal(result.game.boss.hp,0);
  assert.equal(result.game.status,'finished');
  assert.equal((await collection.profile('alice')).boss.clears.rookie,1);
  const after=await boss.get(room.code,alice);
  assert.equal(after.status,'cleared');
  const profile=await collection.profile('alice');
  assert.equal(profile.coins,5500+BOSS_CATALOG.rookie.rewards.coins);
  assert.equal(profile.shards,BOSS_CATALOG.rookie.rewards.shards);
  assert.ok(profile.titles.owned.includes('bossHunter'));
});

test('boss room uses the server copy of the game state and rejects unauthorized gameplay',async()=>{
  const collection=createChaosCollection(),boss=createChaosBoss({collection});
  const alice={id:'alice',username:'alice'};
  const room=await boss.create(alice,'guardian');
  assert.equal((await boss.start(room.code,alice)).status,'playing');
  const revision=boss._test.rooms.get(room.code).game.revision;
  await assert.rejects(boss.act(room.code,{id:'bob'},revision,{kind:'resign'}),/参加中のボス部屋/);
  await assert.rejects(boss.act(room.code,alice,revision-1,{kind:'resign'}),/盤面が更新/);
  await assert.rejects(boss.act(room.code,alice,revision,{kind:'invalid'}),/未対応/);
  await assert.rejects(boss.leave(room.code,alice),/対局中/);
  const lost=await boss.act(room.code,alice,revision,{kind:'resign'});
  assert.equal(lost.status,'lost');
  assert.equal((await collection.profile('alice')).boss.clears.guardian||0,0);
});
