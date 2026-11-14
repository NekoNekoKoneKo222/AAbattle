import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { mountChaosShogi, resolveCpuTurn } from '../src/chaos-routes.js';
import { DEFAULT_DECK } from '../src/chaos-cards.js';
import { newGame, applyAction, legalActions } from '../src/chaos-shogi.js';

test('CHAOS SHOGI API keeps moves authoritative and opponent cards private',async()=>{
  const app=express();app.use(express.json());mountChaosShogi(app);const server=createServer(app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    const created=await post('/api/CSH/games',{cpu:true,minutes:5});assert.equal(created.status,201);const game=await created.json();assert.equal(game.board.length,81);assert.equal(game.cards.currentHand.length,4);assert.equal(game.cards.deck,undefined);
    const invalid=await post(`/api/CSH/games/${game.id}/actions`,{revision:game.revision,action:{kind:'move',from:58,to:31,promote:false}});assert.equal(invalid.status,400);
    const moved=await post(`/api/CSH/games/${game.id}/actions`,{revision:game.revision,action:{kind:'move',from:58,to:49,promote:false}});assert.equal(moved.status,200);const after=await moved.json();assert.equal(after.turn,'b');assert.ok(after.revision>=2);assert.equal(after.cards.w,undefined);
    const stale=await post(`/api/CSH/games/${game.id}/actions`,{revision:game.revision,action:{kind:'resign'}});assert.equal(stale.status,409);
    const cards=await fetch(base+'/api/CSH/cards').then(r=>r.json());assert.ok(cards.cards.dobby);assert.ok(cards.combos.some(c=>c.id==='eternal-dobby'));
    const invalidDeck=await post('/api/CSH/games',{cpu:true,decks:{b:[...DEFAULT_DECK.slice(0,19),'unknown']}});assert.equal(invalidDeck.status,400);
    const customDeck=await post('/api/CSH/games',{cpu:true,decks:{b:[...DEFAULT_DECK.slice(0,18),'grant','insight']}});assert.equal(customDeck.status,201);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('CPU completes both moves granted by the double-action card',()=>{
  let state=newGame({cpu:true});
  state=applyAction(state,legalActions(state).find(action=>action.kind==='move'));
  state.cards.w.hand=['double'];state.cards.w.cp=10;state.cards.w.cardPlayed=false;
  const result=resolveCpuTurn(state);
  assert.equal(result.game.turn,'b');
  assert.equal(result.game.movesLeft,1);
  assert.equal(result.events.filter(event=>event.kind==='move'||event.kind==='drop').length,2);
  assert.equal(result.events[0].cardId,'double');
  assert.equal(result.game.revision,state.revision+3);
  assert.ok(result.events.every(event=>event.side==='w'));
});

test('CPU also completes a three-move turn without waiting for a human action',()=>{
  let state=newGame({cpu:true});state=applyAction(state,legalActions(state).find(action=>action.kind==='move'));
  state.movesLeft=3;state.cards.w.cardPlayed=true;
  const result=resolveCpuTurn(state);
  assert.equal(result.game.turn,'b');
  assert.equal(result.events.filter(event=>event.kind==='move'||event.kind==='drop').length,3);
});
