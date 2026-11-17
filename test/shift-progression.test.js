import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ShiftStore, isShiftAdminUser } from '../src/shift-store.js';
import { normalizeAccountUsername } from '../src/account-username.js';
import { ShiftPartyManager } from '../src/shift-party.js';
import { defaultPlayerModel, characterRoad, roadRerollCost } from '../shift-arena/packages/shared/dist/index.js';

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


test('new player must win verified battle before one-time randomized character grant',async()=>{
  const store=new ShiftStore(),alice=user('BeginnerWinner');
  await assert.rejects(store.grantBeginnerBattleWin(alice),/チュートリアル/);
  await store.completeTutorial(alice);
  const first=await store.grantBeginnerBattleWin(alice);
  assert.equal(first.profile.economy.beginner_claimed,true);
  assert.ok(['SPARK','BRIGHT','FLARE','NOVA','THE_SUN'].includes(first.reward.rarity));
  assert.equal(first.profile.owned_characters.length,2);
  const again=await store.grantBeginnerBattleWin(alice);
  assert.equal(again.alreadyClaimed,true);
  assert.equal((await store.getProfile(alice)).owned_characters.length,2);
  assert.equal(again.reward.character,first.reward.character);
});
test('sun power and coins are charged atomically for level upgrades',async()=>{
  const store=new ShiftStore(),alice=user('PowerLearner');
  let p=await store.getProfile(alice);
  assert.equal(p.economy.levels.rei,undefined);
  await store.upgradeHero(alice,'rei');
  p=await store.getProfile(alice);
  assert.equal(p.economy.levels.rei,2);
  assert.equal(p.economy.coins,215);
  assert.equal(p.economy.sun_power,120);
  await assert.rejects(store.upgradeHero(alice,'frost'),/未所持/);
  await store.withProfile(alice,x=>{x.economy.coins=0;});
  await assert.rejects(store.upgradeHero(alice,'rei'),/不足/);
  assert.equal((await store.getProfile(alice)).economy.levels.rei,2);
});
test('drops are server rolled and paid solar skins use only stored diamonds',async()=>{
  const store=new ShiftStore(),alice=user('DropLearner');
  await store.getProfile(alice);
  const opened=await store.openSunDrop(alice,'sun');
  assert.equal(opened.rewards.length,1);
  await assert.rejects(store.openSunDrop(alice,'sun'),/ありません/);
  await assert.rejects(store.buySunSkin(alice,'rei'),/不足/);
  await store.withProfile(alice,x=>{x.economy.diamonds=60;});
  await store.buySunSkin(alice,'rei');
  await store.equipMasterySkin(alice,'rei','sun_skin');
  const p=await store.getProfile(alice);
  assert.equal(p.economy.diamonds,0);
  assert.equal(p.mastery.rei.equipped_skin,'sun_skin');
  await assert.rejects(store.buySunSkin(alice,'rei'),/購入済み/);
});

test('runtime profile startup and power upgrade work without ALTER TABLE privilege', async () => {
  const alice = user('NoDDLUser');
  const stored = {
    user_id: alice.id, display_name: alice.username, selected_character: 'rei',
    owned_characters: ['rei'], credits: 0, prestige: 0, road_target: 'gald',
    loadouts: { rei: { skill: 'energy_shield', passive: 'ammo_return' } },
    mastery: {}, missions: {}, mission_day: '2026-11-17',
    first_win_day: null, solo_day: null, solo_count: 0,
  };
  const statements = [];
  let lastUpdate = null;
  const client = {
    async query(sql, args = []) {
      statements.push(sql);
      if (sql.startsWith('SELECT * FROM shift_profiles')) return { rows: [structuredClone(stored)] };
      if (sql.startsWith('UPDATE shift_profiles')) {
        lastUpdate = { sql, args };
        stored.loadouts = JSON.parse(args[7]);
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = {
    async query(sql) {
      statements.push(sql);
      if (!sql.startsWith('SELECT to_regclass')) throw new Error('DDL or unexpected query at startup: ' + sql);
      return { rows: [{ profiles: 'shift_profiles', rewards: 'shift_reward_transactions', requests: 'shift_friend_requests', friends: 'shift_friendships', blocks: 'shift_blocks', models: 'shift_models' }] };
    },
    async connect() { return client; },
  };
  const store = new ShiftStore(pool);
  await store.init();
  const upgraded = await store.upgradeHero(alice, 'rei');
  assert.equal(upgraded.profile.economy.levels.rei, 2);
  assert.equal(upgraded.profile.economy.coins, 215);
  assert.equal(upgraded.profile.economy.sun_power, 120);
  assert.ok(lastUpdate);
  assert.doesNotMatch(lastUpdate.sql, /economy\s*=/);
  assert.equal(lastUpdate.args.length, 14);
  assert.equal(stored.loadouts.__shift_solar_economy_v1.levels.rei, 2);
  assert.equal(stored.loadouts.rei.skill, 'energy_shield');
  const restartedStore = new ShiftStore(pool);
  const persisted = await restartedStore.getProfile(alice);
  assert.equal(persisted.economy.levels.rei, 2);
  assert.equal(persisted.economy.coins, 215);
  assert.equal(persisted.loadouts.__shift_solar_economy_v1, undefined);
  assert.ok(statements.every(sql => !/ALTER\s+TABLE/i.test(sql)));
});

test('solar gear equipment requires Lv8 and Lv10 and rejects duplicate gear',async()=>{
  const store=new ShiftStore(),player=user('ProgressionGear');
  await store.getProfile(player);
  await assert.rejects(store.setLoadout(player,'rei','dash','combo_speed','sun_stride',null),/レベル/);
  await store.withProfile(player,p=>{p.economy.levels.rei=8;});
  await store.setLoadout(player,'rei','dash','combo_speed','sun_stride',null);
  await assert.rejects(store.setLoadout(player,'rei','dash','combo_speed','sun_stride','sun_plating'),/レベル/);
  await store.withProfile(player,p=>{p.economy.levels.rei=10;});
  await assert.rejects(store.setLoadout(player,'rei','dash','combo_speed','sun_stride','sun_stride'),/同じギア/);
  await store.setLoadout(player,'rei','dash','combo_speed','sun_stride','sun_plating');
  assert.deepEqual((await store.getProfile(player)).loadouts.rei,{skill:'dash',passive:'combo_speed',gear1:'sun_stride',gear2:'sun_plating'});
});


test('character road consumes CREDITS only, with rarity-scaled reroll pricing',async()=>{
  const store=new ShiftStore(),player=user('reroller');
  await store.getProfile(player);
  await assert.rejects(store.rerollRoad(player),/クレジットが不足/);
  const before=await store.getProfile(player),original=before.road_target;
  const price=roadRerollCost(characterRoad[original].rarity);
  await store.withProfile(player,p=>{p.credits=1000;});
  const rolled=await store.rerollRoad(player);
  assert.equal(rolled.cost,price);
  assert.notEqual(rolled.character,original);
  assert.equal(rolled.profile.credits,1000-price);
  assert.ok(!rolled.profile.owned_characters.includes(rolled.character));
  assert.ok(rolled.profile.road_tier.includes(rolled.character));
  assert.ok(characterRoad[rolled.character]);
  await store.setTarget(player,rolled.character);
  const value=await store.getProfile(player);
  assert.equal(value.road_target,rolled.character);
  // A successful reroll does not unlock or upgrade anything.
  assert.deepEqual(value.owned_characters,['rei']);
  assert.equal(Object.hasOwn(value.economy,'cash'),false);
});

test('rarity costs rise monotonically without introducing a new currency',()=>{
  const list=['SPARK','BRIGHT','FLARE','NOVA','THE_SUN'];
  const amounts=list.map(rarity=>roadRerollCost(rarity));
  assert.deepEqual(amounts,[20,40,80,160,320]);
  for(let i=1;i<amounts.length;i++)assert.ok(amounts[i]>amounts[i-1]);
});

test('admin item grants require authenticated administrator identity and validate every amount',async()=>{
  const store=new ShiftStore();
  const admin={...user('nekonekokoneko'),username_key:'nekonekokoneko'};
  const forged={...user('nekonekokoneko'),username_key:'otheruser'};
  const target={...user('targetplayer'),username_key:'targetplayer'};
  await store.getProfile(target);
  assert.equal(isShiftAdminUser(admin),true);
  assert.equal(isShiftAdminUser(forged),false);
  assert.throws(()=>store.adminGrant(forged,target,'coins',1000),/管理者権限/);
  assert.throws(()=>store.adminGrant(admin,target,'unknown',1000),/不正なアイテム/);
  assert.throws(()=>store.adminGrant(admin,target,'coins',-1),/数量/);
  assert.throws(()=>store.adminGrant(admin,target,'coins',1.2),/数量/);
  assert.throws(()=>store.adminGrant(admin,target,'coins',1e10),/数量/);
  await store.adminGrant(admin,target,'coins',1000);
  await store.adminGrant(admin,target,'credits',500);
  await store.adminGrant(admin,target,'sun_power',200);
  await store.adminGrant(admin,target,'diamonds',10);
  await store.adminGrant(admin,target,'sun',2);
  await store.adminGrant(admin,target,'glitch',3);
  let p=await store.getProfile(target);
  assert.equal(p.economy.coins,1250);
  assert.equal(p.credits,500);
  assert.equal(p.economy.sun_power,340);
  assert.equal(p.economy.diamonds,10);
  assert.equal(p.economy.drops.sun,3);
  assert.equal(p.economy.drops.glitch,3);
  await store.adminGrant(admin,target,'hero',1,'gald');
  await store.adminGrant(admin,target,'sun_skin',1,'gald');
  p=await store.getProfile(target);
  assert.ok(p.owned_characters.includes('gald'));
  assert.ok(p.economy.skins.gald.includes('sun_skin'));
  await assert.rejects(store.adminGrant(admin,target,'hero',1,'gald'),/所持/);
});


test('admin recipient username accepts every valid registered username format',()=>{
  assert.deepEqual(normalizeAccountUsername('nekonekokoneko'),{username:'nekonekokoneko',key:'nekonekokoneko'});
  assert.deepEqual(normalizeAccountUsername('NekoNekoKoneko'),{username:'NekoNekoKoneko',key:'nekonekokoneko'});
  assert.deepEqual(normalizeAccountUsername('  USER_120  '),{username:'USER_120',key:'user_120'});
  assert.deepEqual(normalizeAccountUsername('１２３Ａｂｃ'),{username:'123Abc',key:'123abc'});
  assert.deepEqual(normalizeAccountUsername('たぬき太郎'),{username:'たぬき太郎',key:'たぬき太郎'});
  assert.equal(normalizeAccountUsername('a'),null);
  assert.equal(normalizeAccountUsername('Invalid-Dash'),null);
  assert.equal(normalizeAccountUsername('username with spaces'),null);
  assert.equal(normalizeAccountUsername('x'.repeat(21)),null);
  assert.equal(normalizeAccountUsername(null),null);
});
