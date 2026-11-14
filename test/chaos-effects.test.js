import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffectEngine } from '../src/chaos-effects.js';
import { newGame, applyAction } from '../src/chaos-shogi.js';
import { activeEffects, canActivate, combosFor } from '../src/chaos-cards.js';

const at=(x,y)=>y*9+x;
function setup(){const s=newGame();s.board.fill(null);s.board[at(4,8)]={side:'b',type:'K',promoted:false};s.board[at(4,0)]={side:'w',type:'K',promoted:false};s.board[at(0,2)]={side:'w',type:'P',promoted:false};s.cards.b.deck=[];s.cards.w.deck=[];s.cards.b.hand=[];s.cards.w.hand=[];s.cards.b.cp=10;s.cards.w.cp=10;return s;}
const item=(id,extra={})=>({id,uses:0,usedTurn:-1,...extra});

test('combo definitions activate from equipment and disappear when a piece is unequipped',()=>{
  const s=setup();s.board[at(0,6)]={side:'b',type:'P',promoted:false};s.cards.b.equipment=[item('multiply',{uses:2}),item('infinity')];
  assert.ok(combosFor(s,'b').some(c=>c.id==='infinite-multiply'));
  assert.equal(canActivate(s,'b',0),true);
  s.cards.b.equipment.pop();
  assert.equal(canActivate(s,'b',0),false);
  s.cards.b.equipment.push(item('infinity'));s.board[at(0,6)]=null;
  assert.equal(canActivate(s,'b',0),false);
  s.cards.b.equipment=[item('copier',{uses:2}),item('greed'),item('infinity')];
  assert.ok(combosFor(s,'b').some(c=>c.id==='mass-production'));
  assert.ok(activeEffects(s,'b').has('draw-on-steal'));
  s.cards.b.equipment=[item('reflect'),item('shield')];
  assert.ok(combosFor(s,'b').some(c=>c.id==='absolute-defense'));
});

test('card theft emits a bounded chain and Greed draws only while equipped',()=>{
  let s=setup();s.cards.b.equipment=[item('copier'),item('greed'),item('infinity')];s.cards.b.hand=['snatch','tax'];s.cards.w.hand=['grant'];s.cards.b.deck=['insight'];
  s=applyAction(s,{kind:'card',cardId:'snatch'});
  assert.deepEqual(s.cards.b.hand.sort(),['grant','insight','tax']);
  assert.deepEqual(s.effectEvents.map(e=>e.type),['ON_CARD_TARGETED','ON_CARD_STOLEN','ON_CARD_DRAWN','ON_CARD_PLAYED']);
  assert.ok(s.effectEvents.every(e=>Object.keys(e).join(',')==='id,type'));
  s=setup();s.cards.b.hand=['snatch'];s.cards.w.hand=['grant'];s.cards.b.deck=['insight'];
  s=applyAction(s,{kind:'card',cardId:'snatch'});
  assert.deepEqual(s.cards.b.hand,['grant']);
  assert.ok(!s.effectEvents.some(e=>e.type==='ON_CARD_DRAWN'));
});

test('infinite multiplication can exceed its match limit but still costs CP and stays once per turn',()=>{
  let s=setup();s.board[at(0,6)]={side:'b',type:'P',promoted:false};s.cards.b.equipment=[item('multiply',{uses:2}),item('infinity')];
  s=applyAction(s,{kind:'activate',slot:0,target:at(1,6)});
  assert.equal(s.board[at(1,6)].type,'P');assert.equal(s.cards.b.equipment[0].uses,3);assert.equal(s.cards.b.cp,8);
  assert.throws(()=>applyAction(s,{kind:'activate',slot:0,target:at(1,5)}),/発動できません/);
  s.cards.b.equipment.pop();s.cards.b.turnSerial++;
  assert.equal(canActivate(s,'b',0),false);
});

test('infinite revive works once per attacking turn and stops when Infinity is removed',()=>{
  let s=setup();s.board[at(1,2)]={side:'w',type:'P',promoted:false};s.cards.b.hand=['avada'];s.cards.b.equipment=[item('dobby',{uses:1}),item('infinity')];s.cards.w.equipment=[item('immortal'),item('infinity')];
  s=applyAction(s,{kind:'card',cardId:'avada',target:at(0,2)});
  assert.ok(s.board[at(0,2)]);assert.equal(s.cards.w.equipment[0].uses,1);
  s=applyAction(s,{kind:'activate',slot:0,choice:'destroy',target:at(1,2)});
  assert.equal(s.board[at(1,2)],null);assert.equal(s.cards.w.equipment[0].uses,1);
  s=applyAction(s,{kind:'move',from:at(4,8),to:at(3,8)});
  s=applyAction(s,{kind:'move',from:at(4,0),to:at(3,0)});
  s.cards.b.cp=10;s=applyAction(s,{kind:'activate',slot:0,choice:'destroy',target:at(0,2)});
  assert.ok(s.board[at(0,2)]);assert.equal(s.cards.w.equipment[0].uses,2);
  s.cards.w.equipment.pop();
  s=applyAction(s,{kind:'move',from:at(3,8),to:at(2,8)});
  s=applyAction(s,{kind:'move',from:at(3,0),to:at(2,0)});
  s.cards.b.cp=10;s=applyAction(s,{kind:'activate',slot:0,choice:'destroy',target:at(0,2)});
  assert.equal(s.board[at(0,2)],null);
});

test('absolute defense reflects a single target first and shield blocks a later area attack',()=>{
  let s=setup();s.cards.b.hand=['avada'];s.cards.w.equipment=[item('reflect'),item('shield')];
  s=applyAction(s,{kind:'card',cardId:'avada',target:at(0,2)});
  assert.ok(s.board[at(0,2)]);assert.equal(s.cards.w.equipment[0].uses,1);assert.equal(Boolean(s.cards.w.equipment[1].shieldUsed),false);
  s=applyAction(s,{kind:'move',from:at(4,8),to:at(3,8)});
  s=applyAction(s,{kind:'move',from:at(4,0),to:at(3,0)});
  s.cards.b.hand=['meteor'];s.cards.b.cp=10;s=applyAction(s,{kind:'card',cardId:'meteor',target:at(0,2)});
  assert.ok(s.board[at(0,2)]);assert.equal(s.cards.w.equipment[1].shieldUsed,true);
});

test('effect engine detects cycles and caps fan-out without exposing payloads',()=>{
  const cyclic={log:[]};
  const cycleHandlers=new Map([
    ['ON_A',[{id:'to-b',run:(_s,_event,emit)=>emit('ON_B')}]],
    ['ON_B',[{id:'to-a',run:(_s,_event,emit)=>emit('ON_A')}]]
  ]);
  createEffectEngine(cyclic,cycleHandlers).emit('ON_A');
  assert.deepEqual(cyclic.effectEvents.map(e=>e.type),['ON_A','ON_B']);
  assert.ok(cyclic.log.some(line=>line.includes('循環')));
  const state={log:[]};
  const registry=new Map([
    ['ON_START',[{id:'fan',run:(_s,_event,emit)=>{for(let i=0;i<20;i++)emit('ON_ITEM',{secret:i});}}]],
    ['ON_ITEM',[{id:'loop',run:(_s,_event,emit)=>emit('ON_START')}]]
  ]);
  createEffectEngine(state,registry,5).emit('ON_START');
  assert.equal(state.effectEvents.length,5);
  assert.ok(state.log.some(line=>line.includes('連鎖上限')));
  assert.ok(state.effectEvents.every(e=>!('secret' in e)));
});
