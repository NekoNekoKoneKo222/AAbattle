import test from 'node:test';
import assert from 'node:assert/strict';
import { awardDuplicateMastery, DUPLICATE_MASTERY_COPIES, DUPLICATE_MASTERY_XP } from '../src/chaos-duplicates.js';
import { createChaosCollection, STARTER_DECK } from '../src/chaos-collection.js';

test('every ten duplicate copies of the SAME card grant exactly five mastery XP',()=>{
  const profile={mastery:{},duplicate_counts:{},coins:5500};
  assert.equal(DUPLICATE_MASTERY_COPIES,10);
  assert.equal(DUPLICATE_MASTERY_XP,5);
  for(let i=1;i<=9;i++){
    const result=awardDuplicateMastery(profile,'grant');
    assert.equal(result.masteryXp,0);
    assert.equal(result.duplicateProgress,i);
  }
  const tenth=awardDuplicateMastery(profile,'grant');
  assert.deepEqual(tenth,{duplicateCount:10,duplicateProgress:0,masteryXp:5});
  assert.equal(profile.mastery.grant,5);
  assert.equal(profile.coins,5500);
  // Different card does NOT share the progress of another card.
  assert.equal(awardDuplicateMastery(profile,'insight').masteryXp,0);
  for(let i=11;i<=20;i++)awardDuplicateMastery(profile,'grant');
  assert.equal(profile.mastery.grant,10);
  assert.equal(profile.duplicate_counts.grant,20);
  assert.equal(profile.duplicate_counts.insight,1);
});

test('duplicate mastery XP uses regular mastery level-up coins exactly once',()=>{
  const profile={mastery:{grant:25},duplicate_counts:{grant:9},coins:5500};
  const result=awardDuplicateMastery(profile,'grant');
  assert.equal(result.masteryXp,5);
  assert.equal(profile.mastery.grant,30);
  assert.equal(profile.coins,5560);
  const next=awardDuplicateMastery(profile,'grant');
  assert.equal(next.masteryXp,0);
  assert.equal(profile.coins,5560);
});

test('gacha-only duplicates are counted across packs and unaffected by shard conversion',async()=>{
  const store=createChaosCollection();
  await store.adminGrant('alice',{coins:100000});
  assert.equal((await store.profile('alice')).mastery.grant||0,0);
  const starter=new Set(STARTER_DECK);
  const drawn={};
  for(let n=0;n<20;n++){
    const result=await store.openPacks('alice',10);
    for(const pack of result.packs)for(const card of pack.cards){
      const alreadyOwned=(starter.has(card.id)||(drawn[card.id]||0)>0);
      assert.equal(card.isNew,!alreadyOwned);
      drawn[card.id]=(drawn[card.id]||0)+1;
      const duplicates=drawn[card.id]-(starter.has(card.id)?0:1);
      assert.equal(card.masteryXp,alreadyOwned&&duplicates%10===0?5:0);
    }
  }
  const before=await store.profile('alice');
  for(const [id,count] of Object.entries(drawn)){
    const expected=count-(starter.has(id)?0:1);
    assert.equal(before.duplicateCounts[id]||0,expected,id+' duplicate counter');
    assert.equal(before.mastery[id]||0,Math.floor(expected/10)*5,id+' mastery XP');
  }
  const recorded={...before.duplicateCounts},mastery={...before.mastery};
  await store.convertAll('alice');
  const after=await store.profile('alice');
  assert.deepEqual(after.duplicateCounts,recorded);
  assert.deepEqual(after.mastery,mastery);
  // Admin awards and crafting are not counted as gacha duplicates.
  await store.adminGrant('alice',{cardId:'grant',count:1});
  const admin=await store.profile('alice');
  assert.deepEqual(admin.duplicateCounts,recorded);
});
