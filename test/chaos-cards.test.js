import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, applyAction, view } from '../src/chaos-shogi.js';
import { CARD_CATALOG, COMBOS, canActivate, combosFor } from '../src/chaos-cards.js';

const at=(x,y)=>y*9+x;
const setup=()=>{const s=newGame();s.board.fill(null);s.board[at(4,8)]={side:'b',type:'K',promoted:false};s.board[at(4,0)]={side:'w',type:'K',promoted:false};s.board[at(0,2)]={side:'w',type:'P',promoted:false};s.cards.b.deck=[];s.cards.w.deck=[];s.cards.b.hand=[];s.cards.w.hand=[];s.cards.b.cp=10;s.cards.w.cp=10;s.history=[];return s;};

test('starter deck defines ten working cards and combo data',()=>{
  const s=newGame();assert.equal(Object.keys(CARD_CATALOG).length,10);assert.equal(s.cards.b.deck.length+s.cards.b.hand.length,20);assert.ok(COMBOS.some(c=>c.id==='eternal-dobby'));
  const publicView=view(s);assert.ok(!publicView.cards.deck);assert.ok(!publicView.cards.w?.hand);assert.equal(publicView.cards.currentHand.length,4);
});
test('card CP, one hand card per turn, and equipment slots are server validated',()=>{
  let s=setup();s.cards.b.hand=['avada'];s.cards.b.cp=3;assert.throws(()=>applyAction(s,{kind:'card',cardId:'avada',target:at(0,2)}),/CP/);assert.equal(s.board[at(0,2)].type,'P');
  s.cards.b.cp=10;s=applyAction(s,{kind:'card',cardId:'avada',target:at(0,2)});assert.equal(s.board[at(0,2)],null);assert.equal(s.cards.b.cp,6);assert.equal(s.cards.b.hand.length,0);
  s.cards.b.hand=['tax'];assert.throws(()=>applyAction(s,{kind:'card',cardId:'tax'}),/すでに/);
  const full=setup();full.cards.b.hand=['greed'];full.cards.b.equipment=[{id:'dobby',uses:1,usedTurn:0},{id:'infinity',uses:0,usedTurn:0},{id:'shield',uses:0,usedTurn:0}];assert.throws(()=>applyAction(full,{kind:'card',cardId:'greed'}),/交換/);
  const replaced=applyAction(full,{kind:'card',cardId:'greed',replaceSlot:1});assert.equal(replaced.cards.b.equipment.length,3);assert.ok(!combosFor(replaced,'b').some(c=>c.id==='eternal-dobby'));
});
test('Dobby is spent, Infinity re-enables it, removal disables it, re-equipping restores it',()=>{
  let s=setup();s.cards.b.hand=['dobby','infinity'];s.cards.w.hand=['tax','shield'];
  s=applyAction(s,{kind:'card',cardId:'dobby',choice:'steal'});assert.equal(s.cards.b.equipment[0].uses,1);assert.equal(s.cards.w.hand.length,1);assert.throws(()=>applyAction(s,{kind:'activate',slot:0,choice:'destroy',target:at(0,2)}),/発動できません/);
  s=applyAction(s,{kind:'move',from:at(4,8),to:at(3,8),promote:false});s=applyAction(s,{kind:'move',from:at(4,0),to:at(3,0),promote:false});
  s.cards.b.cp=10;s=applyAction(s,{kind:'card',cardId:'infinity'});assert.ok(combosFor(s,'b').some(c=>c.id==='eternal-dobby'));assert.equal(canActivate(s,'b',0),false);s.cards.b.cp=3;assert.ok(canActivate(s,'b',0));
  s=applyAction(s,{kind:'activate',slot:0,choice:'destroy',target:at(0,2)});assert.equal(s.board[at(0,2)],null);assert.equal(s.cards.b.equipment[0].uses,2);assert.equal(canActivate(s,'b',0),false);
  s.cards.b.equipment.splice(1,1);assert.equal(canActivate(s,'b',0),false);s.cards.b.equipment.push({id:'infinity',uses:0,usedTurn:-1});assert.equal(canActivate(s,'b',0),false);
  s.cards.b.turnSerial++;s.cards.b.cp=3;assert.equal(canActivate(s,'b',0),true);
});
test('Greed draws on steal, shield prevents first card destruction, and king cannot be targeted',()=>{
  let s=setup();s.cards.b.hand=['dobby'];s.cards.b.deck=['tax'];s.cards.b.equipment.push({id:'greed',uses:0,usedTurn:-1});s.cards.w.hand=['shield'];
  s=applyAction(s,{kind:'card',cardId:'dobby',choice:'steal'});assert.equal(s.cards.b.hand.length,2);
  const shielded=setup();shielded.cards.b.hand=['avada'];shielded.cards.w.equipment.push({id:'shield',uses:0,usedTurn:-1,shieldUsed:false});
  const after=applyAction(shielded,{kind:'card',cardId:'avada',target:at(0,2)});assert.ok(after.board[at(0,2)]);assert.equal(after.cards.w.equipment[0].shieldUsed,true);
  const king=setup();king.cards.b.hand=['avada'];assert.throws(()=>applyAction(king,{kind:'card',cardId:'avada',target:at(4,0)}),/王将以外/);
});
test('rule card grants two moves and enemy dispel turns off the Dobby combo',()=>{
  let s=setup();s.cards.b.hand=['double'];s=applyAction(s,{kind:'card',cardId:'double'});assert.equal(s.movesLeft,2);
  s=applyAction(s,{kind:'move',from:at(4,8),to:at(3,8),promote:false});assert.equal(s.turn,'b');assert.equal(s.movesLeft,1);
  s=applyAction(s,{kind:'move',from:at(3,8),to:at(2,8),promote:false});assert.equal(s.turn,'w');
  let combo=setup();combo.cards.b.hand=['dobby','infinity'];combo.cards.w.hand=['tax'];combo=applyAction(combo,{kind:'card',cardId:'dobby',choice:'steal'});combo=applyAction(combo,{kind:'move',from:at(4,8),to:at(3,8),promote:false});combo=applyAction(combo,{kind:'move',from:at(4,0),to:at(3,0),promote:false});combo.cards.b.cp=10;combo=applyAction(combo,{kind:'card',cardId:'infinity'});assert.ok(combosFor(combo,'b').length);
  combo=applyAction(combo,{kind:'move',from:at(3,8),to:at(2,8),promote:false});combo.cards.w.hand=['dispel'];combo.cards.w.cp=10;combo=applyAction(combo,{kind:'card',cardId:'dispel',target:1});assert.equal(combosFor(combo,'b').length,0);
  combo=applyAction(combo,{kind:'move',from:at(3,0),to:at(2,0),promote:false});combo.cards.b.cp=10;assert.equal(canActivate(combo,'b',0),false);combo.cards.b.hand=['infinity'];combo=applyAction(combo,{kind:'card',cardId:'infinity'});combo.cards.b.cp=3;assert.equal(canActivate(combo,'b',0),true);
});
