import test from 'node:test';
import assert from 'node:assert/strict';
import { createChaosCollection, drawPack, packTargets, STARTER_DECK } from '../src/chaos-collection.js';
import { CARD_CATALOG, DEFAULT_DECK } from '../src/chaos-cards.js';

test('packs use server catalog, guarantee rare fifth card, and cannot overspend',async()=>{
  for(let i=0;i<100;i++){const pack=drawPack();assert.equal(pack.length,5);assert.ok(pack.every(id=>CARD_CATALOG[id]));assert.notEqual(CARD_CATALOG[pack[4]].rarity,'common');}
  const store=createChaosCollection(),before=await store.profile('alice');assert.equal(before.coins,500);assert.equal(before.cards.dobby||0,0);assert.equal(before.cards.infinity||0,0);assert.equal(STARTER_DECK.length,20);assert.equal(packTargets().normalSlotPercent,0.5);assert.equal(packTargets().guaranteedSlotPercent,1.5);
  const found=new Set();for(let i=0;i<1000&&found.size<2;i++)for(const id of drawPack())if(id==='dobby'||id==='infinity')found.add(id);assert.deepEqual([...found].sort(),['dobby','infinity']);
  const opened=await store.openPacks('alice',1);assert.equal(opened.packs.length,1);assert.equal(opened.profile.coins,250);assert.equal(opened.profile.pulls.length,1);
  await assert.rejects(store.openPacks('alice',10),/コイン/);assert.equal((await store.profile('alice')).coins,250);
});

test('daily reward is once per day; decks require ownership; duplicate conversion preserves two',async()=>{
  const store=createChaosCollection();assert.equal((await store.claimDaily('alice')).coins,600);await assert.rejects(store.claimDaily('alice'),/受け取り済み/);
  await assert.rejects(store.checkOwned('alice',[...DEFAULT_DECK.slice(0,19),'world-end']),/所持枚数/);
  const saved=await store.saveDeck('alice',{name:'テスト',cards:STARTER_DECK});assert.equal(saved.decks.length,2);
  const bad=[...DEFAULT_DECK];bad[0]='world-end';await assert.rejects(store.saveDeck('alice',{name:'不正',cards:bad}),/所持枚数/);
  await assert.rejects(store.convert('alice','grant'),/3枚目/);
});

test('finished online match awards once and saves replay and rating',async()=>{
  const store=createChaosCollection(),match={room:{mode:'ranked',code:'ABCD1234'},game:{id:'game-1',winner:'b',reason:'投了'},teams:{b:[{id:'alice',username:'alice'}],w:[{id:'bob',username:'bob'}]},replay:[{revision:0},{revision:1}]};
  assert.deepEqual(await store.settle(match),{alice:1025,bob:975});await store.settle(match);
  const alice=await store.profile('alice'),bob=await store.profile('bob');assert.equal(alice.coins,610);assert.equal(bob.coins,580);assert.equal(alice.wins,1);assert.equal(bob.losses,1);assert.equal(alice.matches.length,1);assert.equal((await store.replay('alice','game-1')).events.length,2);await assert.rejects(store.replay('eve','game-1'),/見つかりません/);
});
