import test from 'node:test';
import assert from 'node:assert/strict';
import { createChaosCollection } from '../src/chaos-collection.js';
import { AWAKENINGS } from '../src/chaos-awakenings.js';
import { ULTIMATE_RECIPES } from '../src/chaos-ultimate.js';
import { CARD_CATALOG } from '../src/chaos-cards.js';
import { newGame, applyAction } from '../src/chaos-shogi.js';
import { masteryLevel } from '../src/chaos-progression.js';
import { TITLE_CATALOG } from '../src/chaos-titles.js';

const at=(x,y)=>y*9+x;

test('ultimate awakening II is a separate recipe for each of the 90 existing cards',()=>{
  assert.deepEqual(Object.keys(ULTIMATE_RECIPES).sort(),Object.keys(AWAKENINGS).sort());
  assert.deepEqual(Object.keys(ULTIMATE_RECIPES).sort(),Object.keys(CARD_CATALOG).sort());
  assert.equal(Object.keys(ULTIMATE_RECIPES).length,90);
  for(const [id,recipe] of Object.entries(ULTIMATE_RECIPES)){
    assert.ok(recipe.description.length>8,id);
    assert.ok(recipe.steps.length>=1,id);
    assert.notDeepEqual(recipe.steps,AWAKENINGS[id].steps,id);
  }
});

test('normal awakening and ultimate awakening II stack on the first successful card use',()=>{
  let s=newGame();
  s.onlineMode='casual';s.awakened={b:['avada'],w:[]};s.ultimate={b:['avada'],w:[]};
  s.cards.b.hand=['avada'];s.cards.b.cp=10;
  s.board[at(0,3)]={side:'w',type:'P',promoted:false};
  s=applyAction(s,{kind:'card',cardId:'avada',target:at(0,2)});
  assert.equal(s.board[at(0,2)],null);
  assert.equal(s.board[at(1,2)],null);
  assert.equal(s.board[at(0,3)],null);
  assert.deepEqual(s.cards.b.awakenedUsed,['avada']);
  assert.match(s.log.join(' '),/究極覚醒Ⅱが発動/);
});

test('ultimate awakening II remains disabled in ranked games',()=>{
  let s=newGame();
  s.onlineMode='ranked';s.awakened={b:['avada'],w:[]};s.ultimate={b:['avada'],w:[]};
  s.cards.b.hand=['avada'];s.cards.b.cp=10;s.board[at(0,3)]={side:'w',type:'P',promoted:false};
  s=applyAction(s,{kind:'card',cardId:'avada',target:at(0,2)});
  assert.ok(s.board[at(1,2)]);
  assert.ok(s.board[at(0,3)]);
  assert.ok(!s.cards.b.awakenedUsed?.includes('avada'));
});

test('mastery level 10 + regular awakening + 400 shards are required for ultimate II, titles are equippable',async()=>{
  const store=createChaosCollection(),id='alice';
  await assert.rejects(store.ultimateAwakenCard(id,'grant'),/通常覚醒/);
  for(let i=0;i<6;i++)await store.adminGrant(id,{cardId:'grant',count:20});
  await store.convert(id,'grant','all');
  for(let i=0;i<12;i++){
    await store.settle({room:{mode:'casual',code:'T'+i},game:{id:'lvl10-'+i,winner:'b',reason:'詰み'},
      teams:{b:[{id,username:id}],w:[{id:'bob',username:'bob'}]},
      replay:Array.from({length:3},()=>({actor:id,action:{kind:'card',cardId:'grant'}}))});
  }
  const before=await store.profile(id);
  assert.equal(masteryLevel(before.mastery.grant),10);
  assert.ok(before.shards>=520);
  const regular=await store.awakenCard(id,'grant');
  assert.ok(regular.awakened.includes('grant'));
  const result=await store.ultimateAwakenCard(id,'grant');
  assert.ok(result.ultimate.includes('grant'));
  assert.equal(result.shards,before.shards-120-400);
  assert.ok(result.titles.owned.includes('grandmaster'));
  const equipped=await store.equipTitle(id,'grandmaster');
  assert.equal(equipped.titles.display,TITLE_CATALOG.grandmaster.name);
  await assert.rejects(store.ultimateAwakenCard(id,'grant'),/解放済み/);
  await assert.rejects(store.equipTitle(id,'nightmare'),/未解放/);
});

test('boss clear rewards both participants once and unlocks boss/duo titles',async()=>{
  const store=createChaosCollection();
  const runId='boss-00000000-0000-4000-8000-000000000001';
  const first=await store.rewardBoss('alice',{runId,bossId:'guardian',players:2});
  const second=await store.rewardBoss('alice',{runId,bossId:'guardian',players:2});
  assert.equal(first.duplicate,false);
  assert.equal(second.duplicate,true);
  const p=await store.profile('alice');
  assert.equal(p.coins,5500+300);
  assert.equal(p.shards,60);
  assert.equal(p.boss.clears.guardian,1);
  assert.equal(p.boss.duoClears,1);
  assert.ok(p.titles.owned.includes('bossHunter'));
  assert.ok(p.titles.owned.includes('duo'));
  assert.ok(p.titles.owned.includes('guardian'));
  await assert.rejects(store.rewardBoss('alice',{runId:'not-valid',bossId:'guardian'}),/不正/);
});
