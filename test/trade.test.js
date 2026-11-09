import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, TradeError } from '../src/store.js';

const definition = {
  title: 'AA', archetype: '猫', personality: 'cautious',
  stats: { hp: 130, atk: 30, def: 10, speed: 60 },
  skills: [{ name: '技', kind: 'damage', power: 50, cooldown: 2 }],
  passive: { name: '個性', kind: 'dodge', chance: 0.1 }
};

async function setup() {
  const store = new MemoryStore();
  const alice = await store.createUser('Alice', 'alice', 'test-hash');
  const bob = await store.createUser('Bob', 'bob', 'test-hash');
  const claire = await store.createUser('Claire', 'claire', 'test-hash');
  const cat = await store.saveFighter(alice.id, '猫', ' /\\_/\\', definition, 'gemini');
  const robot = await store.saveFighter(bob.id, 'ロボット', '[o_o]', definition, 'local');
  const star = await store.saveFighter(claire.id, '星', '*-*', definition, 'local');
  return { store, alice, bob, claire, cat, robot, star };
}

test('trade requires recipient approval and swaps both fighters without changing their AA or stats', async () => {
  const { store, alice, bob, cat, robot } = await setup();
  const lookup = await store.publicFighters('bob');
  assert.equal(lookup.username, 'Bob');
  assert.equal(lookup.fighters[0].name, 'ロボット');
  assert.equal(lookup.fighters[0].definition.stats.hp, 130);
  const trade = await store.createTrade(alice.id, 'bob', cat.id, robot.id);
  assert.equal(trade.status, 'pending');
  assert.equal((await store.getFighter(cat.id)).owner_id, alice.id);
  await assert.rejects(store.decideTrade(trade.id, alice.id, 'accept'), (e) => e instanceof TradeError && e.statusCode === 403);
  const accepted = await store.decideTrade(trade.id, bob.id, 'accept');
  assert.equal(accepted.status, 'accepted');
  assert.equal((await store.getFighter(cat.id)).owner_id, bob.id);
  assert.equal((await store.getFighter(robot.id)).owner_id, alice.id);
  assert.equal((await store.getFighter(cat.id)).art, ' /\\_/\\');
  assert.equal((await store.getFighter(cat.id)).definition.stats.hp, 130);
  await assert.rejects(store.decideTrade(trade.id, bob.id, 'accept'), /終了/);
  assert.equal((await store.listTrades(bob.id))[0].status, 'accepted');
});

test('trade can be declined or cancelled; stale ownership cannot be traded twice', async () => {
  const { store, alice, bob, claire, cat, robot, star } = await setup();
  const declined = await store.createTrade(alice.id, 'bob', cat.id, robot.id);
  assert.equal((await store.decideTrade(declined.id, bob.id, 'decline')).status, 'declined');
  const cancelled = await store.createTrade(alice.id, 'bob', cat.id, robot.id);
  assert.equal((await store.decideTrade(cancelled.id, alice.id, 'cancel')).status, 'cancelled');
  await assert.rejects(store.decideTrade(cancelled.id, bob.id, 'accept'), /終了/);

  const first = await store.createTrade(alice.id, 'bob', cat.id, robot.id);
  const second = await store.createTrade(alice.id, 'claire', cat.id, star.id);
  await assert.rejects(store.createTrade(alice.id, 'bob', cat.id, robot.id), /すでに/);
  await store.decideTrade(first.id, bob.id, 'accept');
  await assert.rejects(store.decideTrade(second.id, claire.id, 'accept'), /所有者が変わった/);
  assert.equal((await store.getFighter(star.id)).owner_id, claire.id);
  await assert.rejects(store.createTrade(bob.id, 'bob', cat.id, robot.id), /自分自身/);
});

test('expired trade cannot be approved and remains visible in history', async () => {
  const { store, alice, bob, cat, robot } = await setup();
  const offer = await store.createTrade(alice.id, 'bob', cat.id, robot.id);
  store.trades.get(offer.id).expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await store.listTrades(bob.id))[0].status, 'expired');
  await assert.rejects(store.decideTrade(offer.id, bob.id, 'accept'), /期限切れ/);
});
