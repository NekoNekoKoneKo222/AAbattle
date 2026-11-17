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
  const store=createChaosCollection();assert.equal((await store.claimDaily('alice')).coins,5750);await assert.rejects(store.claimDaily('alice'),/受け取り済み/);
  await assert.rejects(store.checkOwned('alice',[...DEFAULT_DECK.slice(0,19),'world-end']),/所持枚数/);
  const saved=await store.saveDeck('alice',{name:'テスト',cards:STARTER_DECK});assert.equal(saved.decks.length,2);
  const bad=[...DEFAULT_DECK];bad[0]='world-end';await assert.rejects(store.saveDeck('alice',{name:'不正',cards:bad}),/所持枚数/);
  await assert.rejects(store.convert('alice','grant'),/3枚目/);
});

test('finished online match awards once and saves replay and rating',async()=>{
  const store=createChaosCollection(),match={room:{mode:'ranked',code:'ABCD1234'},game:{id:'game-1',winner:'b',reason:'投了'},teams:{b:[{id:'alice',username:'alice'}],w:[{id:'bob',username:'bob'}]},replay:[{revision:0},{revision:1}]};
  assert.deepEqual(await store.settle(match),{alice:1025,bob:975});await store.settle(match);
  const alice=await store.profile('alice'),bob=await store.profile('bob');assert.equal(alice.coins,5720);assert.equal(bob.coins,5660);assert.equal(alice.wins,1);assert.equal(bob.losses,1);assert.equal(alice.matches.length,1);assert.equal((await store.replay('alice','game-1')).events.length,2);await assert.rejects(store.replay('eve','game-1'),/見つかりません/);
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

test('another player card showcase includes only owned cards and equipped cosmetics',async()=>{
  const store=createChaosCollection();
  const showcase=await store.cardShowcase('alice');
  assert.equal(showcase.cards.grant,2);
  assert.equal(showcase.skins.grant,'default');
  assert.deepEqual(Object.keys(showcase).sort(),['cards','skins','title']);
  assert.equal(showcase.title,'見習い棋士');
  await store.adminGrant('alice',{cardId:'grant',count:1});
  assert.equal((await store.cardShowcase('alice')).cards.grant,3);
});

test('mastery XP is earned from actual online card plays, rewards coins, and rejects duplicate settlement',async()=>{
  const store=createChaosCollection();
  const match={room:{mode:'casual',code:'E5BCA123'},game:{id:'game-mastery-1',winner:'b',reason:'詰み'},teams:{b:[{id:'alice',username:'alice'}],w:[{id:'bob',username:'bob'}]},replay:[
    {actor:'alice',action:{kind:'card',cardId:'grant'}},
    {actor:'alice',action:{kind:'card',cardId:'grant'}},
    {actor:'alice',action:{kind:'card',cardId:'grant'}},
    {actor:'alice',action:{kind:'card',cardId:'grant'}},
    {actor:'alice',action:{kind:'move',from:0,to:1}},
    {actor:'bob',action:{kind:'card',cardId:'insight'}}
  ]};
  await store.settle(match);
  let a=await store.profile('alice');
  assert.equal(a.mastery.grant,120);
  assert.equal(a.awakened.length,0);
  assert.equal(a.coins,5840); // base 5500 + win 120 + first win 100 + two mastery levels * 60
  await store.settle(match);
  a=await store.profile('alice');
  assert.equal(a.mastery.grant,120);
  assert.equal(a.coins,5840);
  assert.equal((await store.profile('bob')).mastery.insight,40);
});

test('card crafting and awakenings validate inventory, shards and required mastery',async()=>{
  const store=createChaosCollection();
  await assert.rejects(store.craftCard('alice','missing'),/存在しない/);
  await assert.rejects(store.craftCard('alice','dobby'),/欠片/);
  await assert.rejects(store.awakenCard('alice','dobby'),/所持カード/);
  await assert.rejects(store.awakenCard('alice','grant'),/Lv.5/);
  // A new card can be crafted when sufficient shards are obtained.
  for(let i=0;i<10;i++)await store.adminGrant('alice',{cardId:'dobby',count:1});
  await store.convert('alice','dobby','all');
  const crafted=await store.craftCard('alice','snatch');
  assert.equal(crafted.cards.snatch,1);
  assert.equal(crafted.shards,150*8-90);
  await assert.rejects(store.awakenCard('alice','snatch'),/Lv.5/);
});

test('real matches level card mastery and unlock a persistent awakening without touching inventory',async()=>{
  const store=createChaosCollection(),user='alice';
  await store.adminGrant(user,{cardId:'grant',count:20});
  await store.adminGrant(user,{cardId:'grant',count:5});
  await store.convert(user,'grant','all');
  for(let i=0;i<8;i++){
    await store.settle({
      room:{mode:'casual',code:'LEVEL'+i},
      game:{id:'level-'+i,winner:'b',reason:'投了'},
      teams:{b:[{id:user,username:user}],w:[{id:'bob',username:'bob'}]},
      replay:[{actor:user,action:{kind:'card',cardId:'grant'}}]
    });
  }
  const before=await store.profile(user);
  assert.equal(before.mastery.grant,320);
  assert.ok(before.shards>=120);
  assert.equal(before.cards.grant,2);
  const after=await store.awakenCard(user,'grant');
  assert.ok(after.awakened.includes('grant'));
  assert.equal(after.shards,before.shards-120);
  assert.equal(after.cards.grant,2);
  await assert.rejects(store.awakenCard(user,'grant'),/覚醒済み/);
});
