import test from 'node:test';
import assert from 'node:assert/strict';
import { listPveEnemies, PVE_DIFFICULTIES, runPveBattle } from '../src/pve.js';
import { MemoryStore } from '../src/store.js';

const player = { id: 'user-1', username: 'Tester' };
const fighter = {
  id: 'fighter-1', owner_id: player.id, name: 'TEST CAT', art: ' /\_/\\\n( o.o )',
  definition: {
    title: 'TEST CAT', archetype: '猫', personality: 'aggressive',
    stats: { hp: 145, atk: 31, def: 15, speed: 60 },
    skills: [
      { name: '爪', kind: 'damage', power: 65, cooldown: 1 },
      { name: '回復', kind: 'heal', power: 40, cooldown: 2 },
      { name: '突進', kind: 'damage', power: 70, cooldown: 3 }
    ], passive: { name: '集中', kind: 'regen', chance: 0.09 }
  }
};

test('PvE enemies provide four difficulty tiers and safe public summaries', () => {
  assert.deepEqual(PVE_DIFFICULTIES, ['easy', 'normal', 'hard', 'boss']);
  const enemies = listPveEnemies();
  assert.equal(enemies.length, 4);
  assert.ok(enemies.every((enemy) => enemy.art && enemy.stats.hp > 0 && enemy.description));
  assert.ok(enemies.every((enemy) => enemy.skills.length === 3 && enemy.passive.name));
  assert.ok(enemies.every((enemy) => enemy.skills.every((skill) => Number.isInteger(skill.cooldown) && skill.effects.length > 0)));
  assert.ok(enemies.every((enemy) => !Object.hasOwn(enemy, 'definition')));
});

test('PvE uses the real automatic battle engine and terminates for every tier', async () => {
  const store = new MemoryStore();
  for (const difficulty of PVE_DIFFICULTIES) {
    const battle = runPveBattle(player, fighter, difficulty, () => 0.42);
    assert.equal(battle.difficulty, difficulty);
    assert.equal(battle.fighters.length, 2);
    assert.equal(battle.fighters[0].name, fighter.name);
    assert.equal(battle.fighters[1].username, 'CPU');
    assert.equal(battle.log.length, battle.turns);
    assert.ok(battle.turns >= 1 && battle.turns <= 48);
    assert.equal(battle.log.at(-1).ended, true);
    assert.equal(battle.log.at(-1).winnerId, battle.winnerId);
    assert.equal(battle.log.some((turn) => turn.lines.some((line) => line.includes('の「'))), true);
    await store.savePveMatch(player.id, fighter, battle);
  }
  const history = await store.pveHistoryForUser(player.id);
  assert.equal(history.wins + history.losses, 4);
  assert.equal(history.matches.length, 4);
  assert.ok(history.matches.every((match) => !Object.hasOwn(match, 'transcript')));
  assert.equal((await store.historyForUser(player.id)).length, 0);
});

test('unsupported PvE difficulty is rejected', () => {
  assert.throws(() => runPveBattle(player, fighter, 'insane'), /PvE難易度/);
});
