import { randomUUID } from 'node:crypto';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function combatant(user, fighter) {
  return {
    userId: user.id, username: user.username, fighterId: fighter.id,
    name: fighter.name, art: fighter.art, definition: fighter.definition,
    hp: fighter.definition.stats.hp, maxHp: fighter.definition.stats.hp,
    shield: 0, poison: 0, weak: 0, cooldowns: [0, 0, 0]
  };
}

export function createBattle(playerA, fighterA, playerB, fighterB, rng = Math.random) {
  if (playerA.id === playerB.id) throw new Error('同じアカウント同士では対戦できません。');
  const left = combatant(playerA, fighterA);
  const right = combatant(playerB, fighterB);
  return { id: randomUUID(), fighters: [left, right], turn: 0, ended: false, winnerId: null, log: [], rng };
}

function chooseMove(attacker, defender, rng) {
  const s = attacker.definition.skills;
  const available = s.map((move, index) => ({ move, index })).filter((v) => attacker.cooldowns[v.index] === 0);
  if (!available.length) return { move: { name: '通常攻撃', kind: 'damage', power: 50, cooldown: 0 }, index: -1 };
  const personality = attacker.definition.personality;
  const healthRatio = attacker.hp / attacker.maxHp;
  if (healthRatio < 0.43) {
    const rescue = available.find(({ move }) => move.kind === 'heal' || move.kind === 'shield');
    if (rescue) return rescue;
  }
  if (personality === 'cautious' && defender.hp / defender.maxHp > 0.5) {
    const defense = available.find(({ move }) => move.kind === 'shield' && attacker.shield < 15);
    if (defense) return defense;
  }
  if (defender.hp / defender.maxHp < 0.35) {
    const finisher = available.filter(({ move }) => move.kind === 'damage').sort((a, b) => b.move.power - a.move.power)[0];
    if (finisher) return finisher;
  }
  if (personality === 'aggressive') {
    const damaging = available.filter(({ move }) => move.kind === 'damage');
    if (damaging.length) return damaging[Math.floor(rng() * damaging.length)];
  }
  return available[Math.floor(rng() * available.length)];
}

export function stepBattle(battle) {
  if (battle.ended) return null;
  battle.turn++;
  const { fighters, rng } = battle;
  const speedA = fighters[0].definition.stats.speed;
  const speedB = fighters[1].definition.stats.speed;
  // Speed influences who takes the first action; after that players alternate.
  const faster = speedA === speedB ? 0 : speedA > speedB ? 0 : 1;
  const activeIndex = (battle.turn - 1 + faster) % 2;
  const a = fighters[activeIndex];
  const d = fighters[1 - activeIndex];
  const lines = [];
  a.cooldowns = a.cooldowns.map((v) => Math.max(0, v - 1));
  if (a.poison > 0) {
    const dot = Math.max(3, Math.round(a.maxHp * 0.035));
    a.hp = Math.max(0, a.hp - dot);
    a.poison--;
    lines.push(`${a.name}は毒で${dot}ダメージ`);
  }
  if (a.definition.passive.kind === 'regen') {
    const amount = Math.max(1, Math.round(a.maxHp * a.definition.passive.chance / 3));
    const healed = Math.min(a.maxHp - a.hp, amount);
    a.hp += healed;
    if (healed) lines.push(`${a.name}の「${a.definition.passive.name}」で${healed}回復`);
  }
  if (a.hp > 0) {
    const { move, index } = chooseMove(a, d, rng);
    if (index >= 0) a.cooldowns[index] = move.cooldown + 1;
    lines.push(`${a.name}の「${move.name}」！`);
    if (move.kind === 'heal') {
      const heal = Math.min(a.maxHp - a.hp, Math.round(a.maxHp * move.power / 210));
      a.hp += heal;
      lines.push(`${a.name}のHPが${heal}回復`);
    } else if (move.kind === 'shield') {
      const gain = Math.round(move.power * 0.55);
      a.shield = clamp(a.shield + gain, 0, 100);
      lines.push(`${a.name}に${gain}の文字シールド`);
    } else {
      if (d.definition.passive.kind === 'dodge' && rng() < d.definition.passive.chance) {
        lines.push(`${d.name}の「${d.definition.passive.name}」！回避した！`);
      } else {
        const raw = Math.round((a.definition.stats.atk * (move.power / 60) + 8 - d.definition.stats.def * 0.38) * (a.weak ? 0.75 : 1));
        let damage = Math.max(4, raw);
        if (d.definition.passive.kind === 'armor') damage = Math.max(1, Math.round(damage * (1 - d.definition.passive.chance)));
        const absorbed = Math.min(d.shield, damage);
        d.shield -= absorbed;
        damage -= absorbed;
        d.hp = Math.max(0, d.hp - damage);
        lines.push(`${d.name}に${damage}ダメージ${absorbed ? `（シールドが${absorbed}吸収）` : ''}`);
        if (move.kind === 'poison') { d.poison = Math.max(d.poison, 3); lines.push(`${d.name}は毒状態になった`); }
        if (move.kind === 'weaken') { d.weak = 3; lines.push(`${d.name}の攻撃力が一時的に低下`); }
        if (damage > 0 && (d.definition.passive.kind === 'counter' || d.definition.passive.kind === 'thorns') && rng() < d.definition.passive.chance) {
          const counter = Math.max(2, Math.round(d.definition.stats.atk * 0.35));
          a.hp = Math.max(0, a.hp - counter);
          lines.push(`${d.name}の「${d.definition.passive.name}」！${counter}反撃ダメージ`);
        }
      }
    }
  }
  if (a.weak > 0) a.weak--;
  if (fighters.some((f) => f.hp <= 0) || battle.turn >= 48) {
    battle.ended = true;
    const [f0, f1] = fighters;
    const score = (f) => f.hp / f.maxHp + f.shield / 300;
    battle.winnerId = score(f0) === score(f1) ? (rng() < 0.5 ? f0.userId : f1.userId) : (score(f0) > score(f1) ? f0.userId : f1.userId);
    const winner = fighters.find((f) => f.userId === battle.winnerId);
    lines.push(`勝者：${winner.name}（${winner.username}）！`);
  }
  const state = {
    type: 'battle:turn', id: battle.id, turn: battle.turn, attackerId: a.userId,
    fighters: fighters.map(({ userId, hp, maxHp, shield, poison, weak }) => ({ userId, hp, maxHp, shield, poison, weak })),
    lines, ended: battle.ended, winnerId: battle.winnerId
  };
  battle.log.push(state);
  return state;
}
