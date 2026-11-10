import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ShiftStore } from '../src/shift-store.js';
import { ShiftPartyManager } from '../src/shift-party.js';
import { defaultPlayerModel } from '../shift-arena/packages/shared/dist/index.js';

const user = (name) => ({ id: randomUUID(), username: name });
test('custom model is stored per account and validated on the server', async () => {
  const store = new ShiftStore(), alice = user('Alice'), bob = user('Bob');
  const model = defaultPlayerModel();
  await store.saveModel(alice, model);
  assert.equal((await store.getModel(alice.id)).bones[0].name, 'body');
  assert.equal(await store.getModel(bob.id), null);
  await assert.rejects(store.saveModel(alice, { ...model, bones: [] }), /骨/);
  await store.clearModel(alice);
  assert.equal(await store.getModel(alice.id), null);
});
test('character road unlock is serialized, keeps surplus, and rejects unowned selection', async () => {
  const store = new ShiftStore(), alice = user('Alice');
  assert.deepEqual((await store.getProfile(alice)).owned_characters, ['rei']);
  await assert.rejects(store.setSelected(alice, 'gald'), /未所持/);
  await assert.rejects(store.unlock(alice), /不足/);
  await store.withProfile(alice, profile => { profile.credits = 250; });
  const results = await Promise.allSettled([store.unlock(alice), store.unlock(alice)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const profile = await store.getProfile(alice);
  assert.equal(profile.credits, 50);
  assert.deepEqual(profile.owned_characters, ['rei', 'gald']);
  await store.setSelected(alice, 'gald');
  assert.equal((await store.getProfile(alice)).selected_character, 'gald');
});

test('loadout is validated and persists for a character', async () => {
  const store = new ShiftStore(), alice = user('Alice');
  await store.getProfile(alice);
  await assert.rejects(store.setLoadout(alice, 'rei', 'invalid', 'ammo_return'), /無効/);
  await store.setLoadout(alice, 'rei', 'energy_shield', 'ammo_return');
  assert.deepEqual((await store.getProfile(alice)).loadouts.rei, { skill: 'energy_shield', passive: 'ammo_return' });
});

test('mastery skins require a claimed reward and remain equipped', async () => {
  const store = new ShiftStore(), alice = user('Alice');
  await store.getProfile(alice);
  await assert.rejects(store.equipMasterySkin(alice, 'rei', 'skin'), /獲得/);
  await store.withProfile(alice, profile => { profile.mastery.rei = { xp: 22000, stats: {}, claimed: [] }; });
  await store.claimMastery(alice, 'rei', 'skin');
  await store.equipMasterySkin(alice, 'rei', 'skin');
  assert.equal((await store.getProfile(alice)).mastery.rei.equipped_skin, 'skin');
  await assert.rejects(store.equipMasterySkin(alice, 'rei', 'master_skin'), /獲得/);
  await store.equipMasterySkin(alice, 'rei', null);
  assert.equal((await store.getProfile(alice)).mastery.rei.equipped_skin, null);
});

test('match rewards are idempotent and missions and mastery cannot be claimed twice', async () => {
  const store = new ShiftStore(), alice = user('Alice');
  const result = { matchId: randomUUID(), character: 'rei', won: true, source: 'online', seconds: 60, kills: 2, objective: 30, ultimates: 5, hits: 8, terminal: 1 };
  const first = await store.awardMatch(alice, result);
  const second = await store.awardMatch(alice, result);
  assert.equal(first.credited, true);
  assert.equal(second.credited, false);
  assert.equal((await store.getProfile(alice)).credits, 65);
  await store.claimMission(alice, 'win1');
  await assert.rejects(store.claimMission(alice, 'win1'), /受け取り済み/);
  await store.withProfile(alice, profile => { profile.mastery.rei.xp = 2100; });
  await store.claimMastery(alice, 'rei', 'icon');
  await assert.rejects(store.claimMastery(alice, 'rei', 'icon'), /受け取り済み/);
  const practice = await store.awardMatch(alice, { ...result, matchId: randomUUID(), source: 'training' });
  assert.equal(practice.credited, false);
});

test('friends support request, accept, remove and block', async () => {
  const store = new ShiftStore(), alice = user('Alice'), bob = user('Bob');
  await store.getProfile(alice); await store.getProfile(bob);
  const request = await store.friendRequest(alice, bob.id);
  assert.equal((await store.friendState(bob)).requests.length, 1);
  await store.decideFriend(bob, request.id, true);
  assert.equal(await store.areFriends(alice.id, bob.id), true);
  await store.unfriend(alice, bob.id);
  assert.equal(await store.areFriends(alice.id, bob.id), false);
  await store.block(bob, alice.id);
  await assert.rejects(store.friendRequest(alice, bob.id), /申請できません/);
});

test('party invites, same-team membership, capacity and retention', () => {
  const manager = new ShiftPartyManager(), alice = user('Alice'), bob = user('Bob'), carol = user('Carol'), dave = user('Dave');
  manager.create(alice);
  for (const friend of [bob, carol]) manager.join(friend, manager.invite(alice, friend).id);
  assert.equal(manager.sameParty(alice.id, carol.id), true);
  assert.throws(() => manager.invite(alice, dave), /満員/);
  for (const member of [alice, bob, carol]) manager.setReady(member, true, 'rei');
  manager.setMatch(alice, 'ABC123');
  assert.equal(manager.view(bob.id).party.roomCode, 'ABC123');
  manager.leave(bob);
  assert.equal(manager.view(alice.id).party.members.length, 2);
});
