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
