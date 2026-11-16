import test from 'node:test';
import assert from 'node:assert/strict';
import { masteryLevel, applyMasteryFromReplay, applyAwakeningOnPlay, awakeningBonus } from '../src/chaos-progression.js';
import { newGame, applyAction } from '../src/chaos-shogi.js';

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

test('awakening gives a distinct one-shot bonus and stays disabled in ranked',()=>{
  const s=newGame();s.onlineMode='casual';s.awakened={b:['dobby','avada'],w:[]};
  s.cards.b.cp=4;
  let draws=0;
  const run=()=>applyAwakeningOnPlay(s,'b','dobby',()=>{draws++;return true;});
  assert.equal(run(),true);
  assert.equal(run(),false);
  assert.equal(s.cards.b.cp,6);
  assert.equal(draws,1);
  assert.match(awakeningBonus('meteor').description,/ドロー/);
  s.onlineMode='ranked';
  assert.equal(applyAwakeningOnPlay(s,'b','avada',()=>true),false);
  assert.equal(s.cards.b.cp,6);
});

test('awakening fires once on the first real card use, including equipment',()=>{
  let s=newGame();s.onlineMode='casual';s.awakened={b:['grant'],w:[]};
  s.cards.b.hand=['grant','grant'];s.cards.b.cp=8;
  s=applyAction(s,{kind:'card',cardId:'grant'});
  assert.equal(s.cards.b.cp,10);
  assert.deepEqual(s.cards.b.awakenedUsed,['grant']);
});
