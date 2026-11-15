import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalActions, applyAction, inCheck, expire, cpuAction } from '../src/chaos-shogi.js';

const at=(x,y)=>y*9+x;
const blank=()=>{const s=newGame();s.board.fill(null);s.board[at(4,8)]={side:'b',type:'K',promoted:false};s.board[at(4,0)]={side:'w',type:'K',promoted:false};s.hands.b={K:0,R:0,B:0,G:0,S:0,N:0,L:0,P:0};s.hands.w={...s.hands.b};s.history=[];return s;};

test('standard start and server legal actions',()=>{
  const s=newGame();assert.equal(s.board[at(4,8)].type,'K');assert.equal(s.board[at(4,0)].side,'w');
  const actions=legalActions(s);assert.ok(actions.length>=25);assert.ok(actions.some(a=>a.from===at(4,6)&&a.to===at(4,5)));
  assert.throws(()=>applyAction(s,{kind:'move',from:at(4,6),to:at(4,3),promote:false}),/指せません/);
  const n=applyAction(s,{kind:'move',from:at(4,6),to:at(4,5),promote:false});assert.equal(n.turn,'w');assert.equal(n.board[at(4,5)].type,'P');assert.equal(s.board[at(4,6)].type,'P');
});
test('promotion, capture, and hand drops obey shogi restrictions',()=>{
  const s=blank();s.board[at(0,3)]={side:'b',type:'P',promoted:false};s.board[at(0,2)]={side:'w',type:'S',promoted:false};
  const actions=legalActions(s).filter(a=>a.from===at(0,3)&&a.to===at(0,2));assert.deepEqual(actions.map(a=>a.promote),[false,true]);
  const n=applyAction(s,{kind:'move',from:at(0,3),to:at(0,2),promote:true});assert.equal(n.board[at(0,2)].promoted,true);assert.equal(n.hands.b.S,1);
  n.turn='b';assert.ok(legalActions(n).some(a=>a.kind==='drop'&&a.type==='S'));
  n.hands.b.P=1;n.board[at(0,5)]={side:'b',type:'P',promoted:false};assert.ok(!legalActions(n).some(a=>a.kind==='drop'&&a.type==='P'&&a.to%9===0));
  assert.ok(!legalActions(n).some(a=>a.kind==='drop'&&a.type==='P'&&Math.floor(a.to/9)===0));
});
test('own king cannot be exposed and checkmate ends the game',()=>{
  const s=blank();s.board[at(4,7)]={side:'b',type:'G',promoted:false};s.board[at(4,1)]={side:'w',type:'R',promoted:false};
  assert.equal(inCheck(s,'b'),false);assert.ok(!legalActions(s).some(a=>a.from===at(4,7)&&a.to===at(3,7)));
  const m=blank();m.board[at(4,2)]={side:'b',type:'R',promoted:false};m.board[at(3,1)]={side:'b',type:'R',promoted:false};m.board[at(5,1)]={side:'b',type:'R',promoted:false};
  const next=applyAction(m,{kind:'move',from:at(4,2),to:at(4,1),promote:false});assert.equal(next.status,'finished');assert.equal(next.reason,'詰み');assert.equal(next.winner,'b');
});
test('resignation, timeout, and CPU use server actions',()=>{
  const s=newGame({cpu:true,minutes:1});const cpu=cpuAction({...s,turn:'w'});assert.ok(cpu);
  const resigned=applyAction(s,{kind:'resign'});assert.equal(resigned.winner,'w');assert.equal(resigned.reason,'投了');
  s.turnStartedAt-=61000;expire(s);assert.equal(s.status,'finished');assert.equal(s.reason,'時間切れ');
});
test('mandatory promotion and pawn-drop mate are enforced',()=>{
  const promote=blank();promote.board[at(0,1)]={side:'b',type:'P',promoted:false};
  assert.deepEqual(legalActions(promote).filter(a=>a.from===at(0,1)&&a.to===at(0,0)).map(a=>a.promote),[true]);
  const mate=blank();mate.board[at(3,1)]={side:'b',type:'R',promoted:false};mate.board[at(5,1)]={side:'b',type:'R',promoted:false};mate.board[at(2,2)]={side:'b',type:'G',promoted:false};mate.board[at(6,2)]={side:'b',type:'G',promoted:false};mate.hands.b.P=1;
  assert.ok(!legalActions(mate).some(a=>a.kind==='drop'&&a.type==='P'&&a.to===at(4,1)));
});
