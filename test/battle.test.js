import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle, stepBattle } from '../src/battle.js';

const definition = {
  personality: 'aggressive',
  stats: { hp: 110, atk: 40, def: 7, speed: 80 },
  skills: [
    { name: '刺突', kind: 'damage', power: 90, cooldown: 1 },
    { name: '斬撃', kind: 'damage', power: 78, cooldown: 1 },
    { name: '強撃', kind: 'damage', power: 88, cooldown: 1 }
  ], passive: { name: '装甲', kind: 'armor', chance: 0.1 }
};

test('fully automatic fight determines a winner and records each turn', () => {
  const one = { id: 'one', username: 'alice' };
  const two = { id: 'two', username: 'bob' };
  const fighter = (id) => ({ id, name: id, art: '/\\', definition });
  const fight = createBattle(one, fighter('cat'), two, fighter('robot'), () => 0.3);
  let state;
  while (!fight.ended) state = stepBattle(fight);
  assert.ok(state.ended);
  assert.ok(['one', 'two'].includes(fight.winnerId));
  assert.ok(fight.log.length < 48);
  assert.equal(fight.log.length, fight.turn);
  assert.match(state.lines.at(-1), /勝者/);
});

test('one account cannot match itself', () => {
  const player = { id: 'same', username: 'alice' };
  const fighter = { id: 'f', name: 'fighter', art: 'o', definition };
  assert.throws(() => createBattle(player, fighter, player, fighter), /同じアカウント/);
});

test('Gemini combined skill effects cause real status changes in automatic combat', () => {
  const attacker = {
    ...definition, stats: { hp: 150, atk: 32, def: 12, speed: 90 },
    skills: [
      { name: '星の足跡', kind: 'damage', power: 65, cooldown: 2,
        effects: [{ type: 'damage', power: 65, chance: 100, duration: 1 }, { type: 'burn', power: 24, chance: 100, duration: 2 }] },
      { name: '紙の盾', kind: 'shield', power: 50, cooldown: 3,
        effects: [{ type: 'shield', power: 50, chance: 100, duration: 1 }] },
      { name: '心の回復', kind: 'heal', power: 45, cooldown: 3,
        effects: [{ type: 'heal', power: 45, chance: 100, duration: 1 }] }
    ]
  };
  const defender = { ...definition, stats: { hp: 200, atk: 25, def: 9, speed: 25 } };
  const fighter = (id, def) => ({ id, name: id, art: 'o', definition: def });
  const fight = createBattle({ id: 'one', username: 'alice' }, fighter('attacker', attacker),
    { id: 'two', username: 'bob' }, fighter('defender', defender), () => 0);
  const first = stepBattle(fight);
  assert.match(first.lines.join(' '), /星の足跡/);
  assert.match(first.lines.join(' '), /火傷した/);
  assert.equal(first.fighters[1].burn, 2);
  assert.ok(first.fighters[1].hp < 200);
  const second = stepBattle(fight);
  assert.match(second.lines.join(' '), /火傷で/);
  assert.equal(second.fighters[1].burn, 1);
});
