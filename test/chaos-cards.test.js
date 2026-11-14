import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, applyAction, view } from '../src/chaos-shogi.js';
import { CARD_CATALOG, COMBOS, DEFAULT_DECK, validateDeck, canActivate, combosFor, startTurnCards } from '../src/chaos-cards.js';

const at=(x,y)=>y*9+x;
const setup=()=>{const s=newGame();s.board.fill(null);s.board[at(4,8)]={side:'b',type:'K',promoted:false};s.board[at(4,0)]={side:'w',type:'K',promoted:false};s.board[at(0,2)]={side:'w',type:'P',promoted:false};s.cards.b.deck=[];s.cards.w.deck=[];s.cards.b.hand=[];s.cards.w.hand=[];s.cards.b.cp=10;s.cards.w.cp=10;s.history=[];return s;};

test('starter deck defines working cards and combo data',()=>{
  const s=newGame();assert.equal(Object.keys(CARD_CATALOG).length,24);assert.equal(s.cards.b.deck.length+s.cards.b.hand.length,20);assert.ok(COMBOS.some(c=>c.id==='eternal-dobby'));
  const publicView=view(s);assert.ok(!publicView.cards.deck);assert.ok(!publicView.cards.w?.hand);assert.equal(publicView.cards.currentHand.length,4);
});
test('new equipment passives resolve only while equipped',()=>{
  const s=setup();s.cards.b.equipment=[{id:'taxOffice',uses:0,usedTurn:-1}];s.cards.b.cp=4;s.cards.w.cp=2;
  startTurnCards(s);assert.equal(s.cards.b.cp,7);assert.equal(s.cards.w.cp,1);
  s.cards.b.equipment=[];startTurnCards(s);assert.equal(s.cards.b.cp,9);assert.equal(s.cards.w.cp,1);
  s.cards.w.equipment=[{id:'reflect',uses:0,usedTurn:-1}];s.cards.b.hand=['avada'];
  let next=applyAction(s,{kind:'card',cardId:'avada',target:at(0,2)});assert.ok(next.board[at(0,2)]);assert.equal(next.cards.w.equipment[0].uses,1);
  next=setup();next.cards.b.hand=['avada'];next.cards.w.equipment=[{id:'immortal',uses:0,usedTurn:-1,revived:false}];next=applyAction(next,{kind:'card',cardId:'avada',target:at(0,2)});assert.ok(next.board[at(0,2)]);assert.equal(next.cards.w.equipment[0].revived,true);
});
test('copier, multiplication and stolen equipment obey server limits',()=>{
  let s=setup();s.cards.b.hand=['tax'];s.cards.b.equipment=[{id:'copier',uses:0,usedTurn:-1}];
  s=applyAction(s,{kind:'activate',slot:0,cardId:'tax'});assert.deepEqual(s.cards.b.hand,['tax','tax']);assert.throws(()=>applyAction(s,{kind:'activate',slot:0,cardId:'tax'}),/発動できません/);
  s=setup();s.board[at(0,6)]={side:'b',type:'P',promoted:false};s.cards.b.equipment=[{id:'multiply',uses:0,usedTurn:-1}];s=applyAction(s,{kind:'activate',slot:0,target:at(1,6)});assert.equal(s.board[at(1,6)].type,'P');
  s=setup();s.cards.b.equipment=[{id:'gianism',uses:0,usedTurn:-1}];s.cards.w.equipment=[{id:'infinity',uses:0,usedTurn:-1}];s=applyAction(s,{kind:'activate',slot:0,target:0});assert.equal(s.cards.w.equipment.length,0);assert.equal(s.cards.b.equipment[1].id,'infinity');
});
test('hourglass restores the prior action without restoring spent time or usage',()=>{
  let s=setup();s.cards.b.equipment=[{id:'hourglass',uses:0,usedTurn:-1}];s.cards.b.hand=['tax'];s.cards.w.cp=5;
  s=applyAction(s,{kind:'card',cardId:'tax'},s.turnStartedAt+100);assert.equal(s.cards.w.cp,3);
  s=applyAction(s,{kind:'activate',slot:0},s.turnStartedAt+100);assert.equal(s.cards.w.cp,5);assert.deepEqual(s.cards.b.hand,['tax']);assert.equal(s.cards.b.equipment[0].uses,1);assert.equal(s.cards.b.cp,7);assert.equal(s.undoSnapshot,undefined);
  assert.throws(()=>applyAction(s,{kind:'activate',slot:0}),/取り消せる|発動できません/);
});
test('custom decks must contain twenty real cards with at most two copies',()=>{
  assert.equal(validateDeck(DEFAULT_DECK).length,20);
  assert.throws(()=>validateDeck(DEFAULT_DECK.slice(1)),/20枚/);
  assert.throws(()=>validateDeck([...DEFAULT_DECK.slice(0,19),'imaginary']),/存在しない/);
  assert.throws(()=>validateDeck([...DEFAULT_DECK.slice(0,19),'avada']),/2枚/);
  const custom=[...DEFAULT_DECK.slice(0,18),'grant','insight'];const s=newGame({decks:{b:custom,w:DEFAULT_DECK}});
  assert.deepEqual([...s.cards.b.deck,...s.cards.b.hand].sort(),[...custom].sort());
});
test('new basic cards resolve CP, draw, discard, hand reinforcement, promotion and recycle',()=>{
  let s=setup();s.cards.b.hand=['grant'];s.cards.b.cp=4;s=applyAction(s,{kind:'card',cardId:'grant'});assert.equal(s.cards.b.cp,6);
  s=setup();s.cards.b.hand=['insight'];s.cards.b.deck=['grant','tax'];s=applyAction(s,{kind:'card',cardId:'insight'});assert.deepEqual([...s.cards.b.hand].sort(),['grant','tax']);
  s=setup();s.cards.b.hand=['amnesia'];s.cards.w.hand=['tax'];s=applyAction(s,{kind:'card',cardId:'amnesia'});assert.equal(s.cards.w.hand.length,0);assert.deepEqual(s.cards.w.grave,['tax']);
  s=setup();s.cards.b.hand=['reinforce'];s=applyAction(s,{kind:'card',cardId:'reinforce'});assert.equal(s.hands.b.P,1);
  s=setup();s.board[at(0,6)]={side:'b',type:'P',promoted:false};s.cards.b.hand=['promote'];s=applyAction(s,{kind:'card',cardId:'promote',target:at(0,6)});assert.equal(s.board[at(0,6)].promoted,true);
  s=setup();s.cards.b.hand=['recycle'];s.cards.b.grave=['avada'];s=applyAction(s,{kind:'card',cardId:'recycle'});assert.deepEqual(s.cards.b.hand,['avada']);
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
test('Dobby and Infinity lifecycle spends CP, limits each turn, and records combo transitions',()=>{
  let s=setup();s.cards.b.hand=['dobby','infinity'];s.cards.w.hand=['tax','grant'];
  s=applyAction(s,{kind:'card',cardId:'dobby',choice:'steal'});
  assert.equal(s.cards.b.equipment[0].uses,1);assert.equal(s.cards.w.hand.length,1);assert.equal(canActivate(s,'b',0),false);
  s=applyAction(s,{kind:'move',from:at(4,8),to:at(3,8)});
  s=applyAction(s,{kind:'move',from:at(4,0),to:at(3,0)});
  s.cards.b.cp=10;s=applyAction(s,{kind:'card',cardId:'infinity'});
  assert.ok(s.comboEvents.some(event=>event.id==='eternal-dobby'&&event.active));
  assert.ok(s.log.some(line=>line.includes('永久にドビーは悪い子が成立')));
  assert.equal(canActivate(s,'b',0),false);
  s.cards.b.cp=3;assert.equal(canActivate(s,'b',0),true);
  s=applyAction(s,{kind:'activate',slot:0,choice:'destroy',target:at(0,2)});
  assert.equal(s.board[at(0,2)],null);assert.equal(s.cards.b.cp,0);assert.equal(s.cards.b.equipment[0].uses,2);
  s.cards.b.cp=3;assert.throws(()=>applyAction(s,{kind:'activate',slot:0,choice:'steal'}),/発動できません/);
  s=applyAction(s,{kind:'move',from:at(3,8),to:at(2,8)});
  s.cards.w.hand=['dispel'];s.cards.w.cp=10;s=applyAction(s,{kind:'card',cardId:'dispel',target:1});
  assert.ok(s.comboEvents.some(event=>event.id==='eternal-dobby'&&!event.active));
  assert.equal(canActivate(s,'b',0),false);
  s=applyAction(s,{kind:'move',from:at(3,0),to:at(2,0)});
  s.cards.b.cp=10;s.cards.b.hand=['infinity'];s=applyAction(s,{kind:'card',cardId:'infinity'});
  assert.ok(s.comboEvents.some(event=>event.id==='eternal-dobby'&&event.active));
  s.cards.b.cp=3;s.cards.w.hand=['tax'];s=applyAction(s,{kind:'activate',slot:0,choice:'steal'});
  assert.equal(s.cards.w.hand.length,0);assert.equal(s.cards.b.equipment[0].uses,3);
  assert.equal(view(s).undoSnapshot,undefined);
});
test('Dobby rejects empty steals and king targeting without consuming its use',()=>{
  let s=setup();s.cards.b.hand=['dobby'];
  assert.throws(()=>applyAction(s,{kind:'card',cardId:'dobby',choice:'steal'}),/手札がない/);
  assert.throws(()=>applyAction(s,{kind:'card',cardId:'dobby',choice:'destroy',target:at(4,0)}),/王将以外/);
  assert.equal(s.cards.b.equipment.length,0);assert.deepEqual(s.cards.b.hand,['dobby']);
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
