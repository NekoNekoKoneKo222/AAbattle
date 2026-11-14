import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { mountChaosShogi } from '../src/chaos-routes.js';
import { createChaosCollection } from '../src/chaos-collection.js';
import { DEFAULT_DECK } from '../src/chaos-cards.js';

test('collection endpoints require an account and reject forged cards and spending',async t=>{
  const app=express();app.use(express.json());const collection=createChaosCollection(),online=mountChaosShogi(app,{collection,currentUser:async req=>req.get('x-test-user')?{id:req.get('x-test-user'),username:'tester'}:null});
  const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{online.close();await new Promise(resolve=>server.close(resolve));});const root=`http://127.0.0.1:${server.address().port}/api/CSH/online/collection`;
  const call=async(path='',body,headers={})=>{const response=await fetch(root+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  assert.equal((await call()).status,401);assert.equal((await call('',undefined,{'x-test-user':'alice'})).data.coins,500);
  assert.equal((await call('/packs',{count:100},{'x-test-user':'alice'})).status,400);
  assert.equal((await call('/packs',{count:10},{'x-test-user':'alice'})).status,409);
  assert.equal((await call('/decks',{name:'starter',cards:[...DEFAULT_DECK.slice(0,19),'world-end']},{'x-test-user':'alice'})).status,409);
  assert.equal((await call('/packs',{count:1},{'x-test-user':'alice',origin:'https://example.com'})).status,403);
  const pack=await call('/packs',{count:1},{'x-test-user':'alice'});assert.equal(pack.status,200);assert.equal(pack.data.profile.coins,250);assert.equal(pack.data.packs[0].cards.length,5);
});
