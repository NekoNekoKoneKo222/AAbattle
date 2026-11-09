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

function statusBattle(effect, defenderPassive = { name: '装甲', kind: 'armor', chance: 0 }) {
  const offense = {
    ...definition, stats: { hp: 160, atk: 40, def: 8, speed: 90 },
    skills: [
      { name: '状態技', kind: effect.type, power: effect.power, cooldown: 1, effects: [effect] },
      { name: '追撃', kind: 'damage', power: 60, cooldown: 1, effects: [{ type: 'damage', power: 60, chance: 100, duration: 1 }] },
      { name: '回復', kind: 'heal', power: 20, cooldown: 3 }
    ]
  };
  const defense = {
    ...definition, personality: 'cautious', stats: { hp: 200, atk: 8, def: 5, speed: 20 },
    skills: [
      { name: '小回復', kind: 'heal', power: 15, cooldown: 1 },
      { name: '守り', kind: 'shield', power: 15, cooldown: 3 },
      { name: '補助', kind: 'boost', power: 15, cooldown: 3 }
    ], passive: defenderPassive
  };
  const fighter = (id, def) => ({ id, name: id, art: 'o', definition: def });
  return createBattle({ id: 'one', username: 'a' }, fighter('attacker', offense),
    { id: 'two', username: 'b' }, fighter('defender', defense), () => 0);
}

test('bleed deals its configured 1-5 damage on affected turns', () => {
  const battle = statusBattle({ type: 'bleed', power: 5, chance: 100, duration: 2 });
  const first = stepBattle(battle);
  assert.equal(first.fighters[1].bleed, 2);
  const second = stepBattle(battle);
  assert.match(second.lines.join(' '), /出血で5ダメージ/);
  assert.equal(second.fighters[1].bleed, 1);
});

test('bleed application and silence action loss respect their configured chances', () => {
  const bleedBattle = statusBattle({ type: 'bleed', power: 5, chance: 40, duration: 2 });
  const rolls = [0, 0.5];
  bleedBattle.rng = () => rolls.shift() ?? 0;
  stepBattle(bleedBattle);
  assert.equal(bleedBattle.fighters[1].bleed, 0);

  const silenceBattle = statusBattle({ type: 'silence', power: 15, chance: 25, duration: 1 });
  stepBattle(silenceBattle);
  silenceBattle.rng = () => 0.99;
  const turn = stepBattle(silenceBattle);
  assert.ok(!turn.lines.some((line) => line.includes('沈黙で行動できない')));
});

test('rupture adds rounded 10 percent after an attack deals at least 10 HP damage', () => {
  const battle = statusBattle({ type: 'rupture', power: 20, chance: 100, duration: 1 });
  stepBattle(battle);
  stepBattle(battle);
  const hit = stepBattle(battle);
  const base = Number(hit.lines.join(' ').match(/defenderに(\d+)ダメージ/)?.[1]);
  const extra = Number(hit.lines.join(' ').match(/破裂で追加(\d+)ダメージ/)?.[1]);
  assert.ok(base >= 10);
  assert.equal(extra, Math.round(base / 10));
});

test('silence prevents an action at the configured chance', () => {
  const battle = statusBattle({ type: 'silence', power: 15, chance: 50, duration: 1 });
  stepBattle(battle);
  const turn = stepBattle(battle);
  assert.match(turn.lines.join(' '), /沈黙で行動できない/);
  assert.equal(turn.fighters[1].silence, 0);
});

test('counter stance returns configured damage on an incoming hit', () => {
  const battle = statusBattle({ type: 'counter_stance', power: 17, chance: 80, duration: 1 });
  const counterUser = battle.fighters[0];
  const other = battle.fighters[1];
  // Give the slower fighter the stance so the faster fighter strikes into it.
  counterUser.definition.skills[0] = { name: '攻撃', kind: 'damage', power: 60, cooldown: 1 };
  other.definition.skills[0] = { name: '反撃態勢', kind: 'counter_stance', power: 17, cooldown: 1,
    effects: [{ type: 'counter_stance', power: 17, chance: 80, duration: 1 }] };
  other.definition.personality = 'cautious';
  stepBattle(battle);
  stepBattle(battle);
  const before = battle.fighters[0].hp;
  const turn = stepBattle(battle);
  assert.match(turn.lines.join(' '), /反撃態勢！17反撃ダメージ/);
  assert.equal(battle.fighters[0].hp, before - 17);
  const miss = statusBattle({ type: 'counter_stance', power: 17, chance: 80, duration: 1 });
  miss.fighters[0].definition.skills[0] = { name: '攻撃', kind: 'damage', power: 60, cooldown: 1 };
  miss.fighters[1].definition.skills[0] = { name: '反撃態勢', kind: 'counter_stance', power: 17, cooldown: 1,
    effects: [{ type: 'counter_stance', power: 17, chance: 80, duration: 1 }] };
  stepBattle(miss);
  stepBattle(miss);
  miss.rng = () => 0.99;
  assert.ok(!stepBattle(miss).lines.some((line) => line.includes('反撃態勢！')));
});

test('last stand revives at 1 percent HP once, then a second defeat ends the fight', () => {
  const battle = statusBattle({ type: 'damage', power: 90, chance: 100, duration: 1 },
    { name: 'ラストスタンド', kind: 'laststand', chance: 1 });
  battle.fighters[0].definition.stats.atk = 250;
  const first = stepBattle(battle);
  assert.match(first.lines.join(' '), /1%で復活/);
  assert.equal(first.fighters[1].hp, 2);
  assert.equal(first.ended, false);
  stepBattle(battle);
  const third = stepBattle(battle);
  assert.equal(third.ended, true);
  assert.equal(third.fighters[1].hp, 0);
  assert.equal(third.lines.filter((line) => line.includes('復活')).length, 0);
});
