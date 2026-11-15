import test from 'node:test';
import assert from 'node:assert/strict';
import { createChaosCollection, drawPack, packTargets, STARTER_DECK } from '../src/chaos-collection.js';
import { CARD_CATALOG, DEFAULT_DECK } from '../src/chaos-cards.js';
import { SKIN_CATALOG } from '../src/chaos-skins.js';

test('packs use server catalog, guarantee rare fifth card, and cannot overspend',async()=>{
  for(let i=0;i<100;i++){const pack=drawPack();assert.equal(pack.length,5);assert.ok(pack.every(id=>CARD_CATALOG[id]));assert.notEqual(CARD_CATALOG[pack[4]].rarity,'common');}
  const store=createChaosCollection(),before=await store.profile('alice');assert.equal(before.coins,5500);assert.equal(before.cards.dobby||0,0);assert.equal(before.cards.infinity||0,0);assert.equal(STARTER_DECK.length,20);assert.equal(packTargets().normalSlotPercent,0.5);assert.equal(packTargets().guaranteedSlotPercent,1.5);
  const found=new Set();for(let i=0;i<1000&&found.size<2;i++)for(const id of drawPack())if(id==='dobby'||id==='infinity')found.add(id);assert.deepEqual([...found].sort(),['dobby','infinity']);
  const opened=await store.openPacks('alice',1);assert.equal(opened.packs.length,1);assert.equal(opened.profile.coins,5250);assert.equal(opened.profile.pulls.length,1);
  const ten=await store.openPacks('alice',10);assert.equal(ten.packs.length,10);assert.equal(ten.profile.coins,2750);
});

test('daily reward is once per day; decks require ownership; duplicate conversion preserves two',async()=>{
  const store=createChaosCollection();assert.equal((await store.claimDaily('alice')).coins,5600);await assert.rejects(store.claimDaily('alice'),/受け取り済み/);
  await assert.rejects(store.checkOwned('alice',[...DEFAULT_DECK.slice(0,19),'world-end']),/所持枚数/);
  const saved=await store.saveDeck('alice',{name:'テスト',cards:STARTER_DECK});assert.equal(saved.decks.length,2);
  const bad=[...DEFAULT_DECK];bad[0]='world-end';await assert.rejects(store.saveDeck('alice',{name:'不正',cards:bad}),/所持枚数/);
  await assert.rejects(store.convert('alice','grant'),/3枚目/);
});

test('finished online match awards once and saves replay and rating',async()=>{
  const store=createChaosCollection(),match={room:{mode:'ranked',code:'ABCD1234'},game:{id:'game-1',winner:'b',reason:'投了'},teams:{b:[{id:'alice',username:'alice'}],w:[{id:'bob',username:'bob'}]},replay:[{revision:0},{revision:1}]};
  assert.deepEqual(await store.settle(match),{alice:1025,bob:975});await store.settle(match);
  const alice=await store.profile('alice'),bob=await store.profile('bob');assert.equal(alice.coins,5610);assert.equal(bob.coins,5580);assert.equal(alice.wins,1);assert.equal(bob.losses,1);assert.equal(alice.matches.length,1);assert.equal((await store.replay('alice','game-1')).events.length,2);await assert.rejects(store.replay('eve','game-1'),/見つかりません/);
});

test('card skins spend shards once, require ownership, and do not change ranked card rules',async()=>{
  const store=createChaosCollection(),id='alice';
  assert.equal((await store.profile(id)).skins.grant,undefined);
  assert.equal(await store.equippedSkin(id,'grant'),'default');
  await assert.rejects(store.buySkin(id,'grant','gold'),/欠片/);
  await assert.rejects(store.buySkin(id,'dobby','gold'),/所持/);
  await assert.rejects(store.equipSkin(id,'grant','gold'),/未解放/);
  assert.equal(SKIN_CATALOG.gold.cost,25);
  for(let i=0;i<25;i++){
    await store.adminGrant(id,{cardId:'grant',count:1});
    await store.convert(id,'grant');
  }
  const before=await store.profile(id);
  const bought=await store.buySkin(id,'grant','gold');
  assert.equal(bought.shards,before.shards-25);
  assert.equal(bought.cards.grant,before.cards.grant);
  assert.equal(await store.equippedSkin(id,'grant'),'gold');
  await assert.rejects(store.buySkin(id,'grant','gold'),/解放済み/);
  await store.equipSkin(id,'grant','default');
  assert.equal(await store.equippedSkin(id,'grant'),'default');
  await store.equipSkin(id,'grant','gold');
  assert.equal((await store.profile(id)).skins.grant.equipped,'gold');
  assert.deepEqual((await store.profile(id)).decks[0].cards,STARTER_DECK);
});

test('bulk conversion exchanges all excess cards once and preserves two copies',async()=>{
  const store=createChaosCollection(),id='alice';
  await store.adminGrant(id,{cardId:'grant',count:4});
  await store.adminGrant(id,{cardId:'insight',count:3});
  const first=await store.convert(id,'grant','all');
  assert.equal(first.count,4);
  assert.equal(first.profile.cards.grant,2);
  await assert.rejects(store.convert(id,'grant','all'),/3枚目/);
  const second=await store.convertAll(id);
  assert.equal(second.count,3);
  assert.equal(second.profile.cards.insight,2);
  assert.equal(second.profile.shards,first.amount+second.amount);
  await assert.rejects(store.convertAll(id),/余剰カード/);
});
