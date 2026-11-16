import test from 'node:test';
import assert from 'node:assert/strict';
import { masteryLevel, applyMasteryFromReplay, applyAwakeningOnPlay, awakeningBonus } from '../src/chaos-progression.js';
import { AWAKENINGS } from '../src/chaos-awakenings.js';
import { CARD_CATALOG } from '../src/chaos-cards.js';
import { newGame, applyAction } from '../src/chaos-shogi.js';

const at=(x,y)=>y*9+x;
const awakened=(ids,collapse=false)=>{
  const s=newGame({collapse});
  s.onlineMode='casual';s.awakened={b:[...ids],w:[]};s.cards.b.cp=10;
  return s;
};

test('mastery levels progress at fixed thresholds',()=>{
  assert.equal(masteryLevel(0),1);
  assert.equal(masteryLevel(30),2);
  assert.equal(masteryLevel(90),3);
  assert.equal(masteryLevel(300),5);
  assert.equal(masteryLevel(2000),10);
});

test('server replay is authoritative for card XP and caps repeated uses per match',()=>{
  const user={coins:0,mastery:{}};
  const replay=Array.from({length:20},()=>({actor:'alice',action:{kind:'card',cardId:'grant'}}));
  replay.push({actor:'bob',action:{kind:'card',cardId:'insight'}});
  replay.push({actor:'alice',action:{kind:'move',from:1,to:2}});
  const rewards=applyMasteryFromReplay(user,{replay},'alice',{grant:{},insight:{}});
  assert.equal(user.mastery.grant,120);
  assert.equal(user.mastery.insight,undefined);
  assert.equal(user.coins,120);
  assert.equal(rewards[0].level,3);
});

test('all 90 existing cards have a documented, distinct and mechanically distinct awakening',()=>{
  const ids=Object.keys(CARD_CATALOG).sort();
  assert.equal(ids.length,90);
  assert.deepEqual(Object.keys(AWAKENINGS).sort(),ids);
  assert.equal(new Set(Object.values(AWAKENINGS).map(x=>JSON.stringify(x.steps))).size,ids.length);
  for(const id of ids){
    assert.equal(awakeningBonus(id),AWAKENINGS[id]);
    assert.ok(AWAKENINGS[id].description.length>10,id);
    assert.ok(AWAKENINGS[id].steps.every(s=>s[0]!=='cp'),id);
  }
  assert.equal(awakeningBonus('not-a-card'),null);
});

test('awakening is first-use only, never a generic CP refund, and is disabled in ranked',()=>{
  const s=awakened(['dobby','avada']);
  s.cards.b.cp=4;let draws=0;
  const run=()=>applyAwakeningOnPlay(s,'b','dobby',()=>{draws++;return true;},{cardId:'dobby'});
  assert.equal(run(),true);
  assert.equal(run(),false);
  assert.equal(s.cards.b.cp,4);
  assert.equal(draws,1);
  assert.deepEqual(s.cards.b.awakenedUsed,['dobby']);
  s.onlineMode='ranked';
  assert.equal(applyAwakeningOnPlay(s,'b','avada',()=>true,{target:at(0,2)}),false);
  assert.equal(s.cards.b.cp,4);
});

test('grant awakening saves delayed recovery instead of immediate CP refunds',()=>{
  let s=awakened(['grant']);
  s.cards.b.hand=['grant','grant'];s.cards.b.cp=8;
  s=applyAction(s,{kind:'card',cardId:'grant'});
  assert.equal(s.cards.b.cp,10);
  assert.equal(s.chaos.pendingBonus.b,3);
  assert.deepEqual(s.cards.b.awakenedUsed,['grant']);
  s=applyAction(s,{kind:'move',from:at(0,6),to:at(0,5)});
  s=applyAction(s,{kind:'move',from:at(0,2),to:at(0,3)});
  assert.equal(s.cards.b.cp,10);
  assert.equal(s.chaos.pendingBonus.b,undefined);
});

test('Avada awakening destroys a second adjacent enemy pawn',()=>{
  let s=awakened(['avada']);
  s.cards.b.hand=['avada'];
  s=applyAction(s,{kind:'card',cardId:'avada',target:at(0,2)});
  assert.equal(s.board[at(0,2)],null);
  assert.equal(s.board[at(1,2)],null);
  assert.ok(s.cards.b.awakenedUsed.includes('avada'));
});

test('warp awakening puts a one-hit guard on the teleported piece',()=>{
  let s=awakened(['warp']);
  s.cards.b.hand=['warp'];
  s=applyAction(s,{kind:'card',cardId:'warp',from:at(0,6),target:at(0,5)});
  assert.equal(s.board[at(0,5)].awakenGuard,1);
  s.turn='w';s.cards.w.hand=['avada'];s.cards.w.cp=10;
  s=applyAction(s,{kind:'card',cardId:'avada',target:at(0,5)});
  assert.equal(s.board[at(0,5)].type,'P');
  assert.equal(s.board[at(0,5)].awakenGuard,0);
});

test('shield awakening adds an additional protection charge',()=>{
  let s=awakened(['shield']);
  s.cards.b.hand=['shield'];
  s=applyAction(s,{kind:'card',cardId:'shield'});
  assert.equal(s.cards.b.equipment[0].shieldCharges,2);
  assert.equal(s.cards.b.equipment[0].shieldUses,undefined);
});

test('UNO awakening prepares a two-use counter',()=>{
  let s=awakened(['uno']);
  s.cards.b.hand=['uno'];
  s=applyAction(s,{kind:'card',cardId:'uno'});
  assert.equal(s.chaos.counters.b.uses,2);
  assert.equal(s.chaos.counters.b.awakened,true);
});

test('forced ending awakening breaks an otherwise tied material count in collapse mode',()=>{
  const normal=newGame({collapse:true});
  normal.cards.b.hand=['forced-ending'];normal.cards.b.cp=10;
  const plain=applyAction(normal,{kind:'card',cardId:'forced-ending'});
  assert.equal(plain.winner,null);
  let s=awakened(['forced-ending'],true);
  s.cards.b.hand=['forced-ending'];
  s=applyAction(s,{kind:'card',cardId:'forced-ending'});
  assert.equal(s.winner,'b');
  assert.equal(s.status,'finished');
});

test('shogi-over awakening can finish when the enemy has four pieces',()=>{
  let normal=newGame();
  normal.board.forEach((p,i)=>{if(p?.side==='w'&&!([at(4,0),at(0,2),at(1,2),at(2,2)].includes(i)))normal.board[i]=null;});
  normal.cards.b.hand=['shogi-over'];normal.cards.b.cp=10;
  assert.throws(()=>applyAction(normal,{kind:'card',cardId:'shogi-over'}),/4体以下|3体以下/);
  const s=awakened(['shogi-over']);
  s.board=normal.board.map(p=>p&&{...p});s.cards.b.hand=['shogi-over'];
  const result=applyAction(s,{kind:'card',cardId:'shogi-over'});
  assert.equal(result.winner,'b');
  assert.equal(result.status,'finished');
});
