import { randomUUID } from 'node:crypto';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function combatant(user, fighter) {
  return {
    userId: user.id, username: user.username, fighterId: fighter.id,
    name: fighter.name, art: fighter.art, definition: fighter.definition,
    hp: fighter.definition.stats.hp, maxHp: fighter.definition.stats.hp,
    shield: 0, poison: 0, burn: 0, weak: 0, boost: 0, stun: 0, cooldowns: [0, 0, 0]
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
    const rescue = available.find(({ move }) => hasEffect(move, 'heal', 'shield', 'cleanse'));
    if (rescue) return rescue;
  }
  if (personality === 'cautious' && defender.hp / defender.maxHp > 0.5) {
    const defense = available.find(({ move }) => hasEffect(move, 'shield') && attacker.shield < 15);
    if (defense) return defense;
  }
  if (defender.hp / defender.maxHp < 0.35) {
    const finisher = available.filter(({ move }) => hasEffect(move, 'damage', 'drain')).sort((a, b) => b.move.power - a.move.power)[0];
    if (finisher) return finisher;
  }
  if (personality === 'aggressive') {
    const damaging = available.filter(({ move }) => hasEffect(move, 'damage', 'drain', 'burn', 'poison'));
    if (damaging.length) return damaging[Math.floor(rng() * damaging.length)];
  }
  return available[Math.floor(rng() * available.length)];
}

function hasEffect(move, ...types) {
  return (Array.isArray(move.effects) && move.effects.length ? move.effects.map((effect) => effect.type) : [move.kind])
    .some((type) => types.includes(type));
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
  if (a.burn > 0) {
    const dot = Math.max(2, Math.round(a.maxHp * 0.027));
    a.hp = Math.max(0, a.hp - dot);
    a.burn--;
    lines.push(`${a.name}は火傷で${dot}ダメージ`);
  }
  if (a.definition.passive.kind === 'cleanser' && (a.poison || a.burn || a.weak) && rng() < a.definition.passive.chance) {
    a.poison = 0; a.burn = 0; a.weak = 0;
    lines.push(`${a.name}の「${a.definition.passive.name}」！状態異常を取り除いた`);
  }
  if (a.definition.passive.kind === 'fortify') {
    const gain = Math.max(1, Math.round(a.definition.passive.chance * 35));
    a.shield = clamp(a.shield + gain, 0, 100);
    lines.push(`${a.name}の「${a.definition.passive.name}」でシールド+${gain}`);
  }
  if (a.definition.passive.kind === 'regen') {
    const amount = Math.max(1, Math.round(a.maxHp * a.definition.passive.chance / 3));
    const healed = Math.min(a.maxHp - a.hp, amount);
    a.hp += healed;
    if (healed) lines.push(`${a.name}の「${a.definition.passive.name}」で${healed}回復`);
  }
  if (a.hp > 0 && a.stun > 0) {
    a.stun = 0;
    lines.push(`${a.name}は気絶して行動できない！`);
  } else if (a.hp > 0) {
    const { move, index } = chooseMove(a, d, rng);
    if (index >= 0) a.cooldowns[index] = move.cooldown + 1;
    lines.push(`${a.name}の「${move.name}」！`);
    const effects = Array.isArray(move.effects) && move.effects.length ? move.effects : [{ type: move.kind, power: move.power, chance: 100, duration: 3 }];
    const scale = effects.length > 1 ? 0.65 : 1;
    for (const effect of effects) {
      if (a.hp <= 0 || d.hp <= 0) break;
      if (rng() * 100 >= (effect.chance ?? 100)) { lines.push('追加効果は発動しなかった'); continue; }
      const power = clamp(effect.power ?? move.power ?? 50, 15, 90) * scale;
      const duration = clamp(effect.duration ?? 3, 1, 3);
      if (effect.type === 'heal') {
        const healed = Math.min(a.maxHp - a.hp, Math.round(a.maxHp * power / 210));
        a.hp += healed;
        lines.push(`${a.name}が${healed}回復した`);
      } else if (effect.type === 'shield') {
        const gain = Math.round(power * 0.55);
        a.shield = clamp(a.shield + gain, 0, 100);
        lines.push(`${a.name}にシールド+${gain}`);
      } else if (effect.type === 'boost') {
        a.boost = Math.max(a.boost, duration + 1);
        lines.push(`${a.name}の攻撃性能が上昇した`);
      } else if (effect.type === 'cleanse') {
        a.poison = 0; a.burn = 0; a.weak = 0;
        lines.push(`${a.name}は状態異常を取り除いた`);
      } else {
        if (d.definition.passive.kind === 'dodge' && rng() < d.definition.passive.chance) {
          lines.push(`${d.name}の「${d.definition.passive.name}」！回避した！`);
          continue;
        }
        const lowHpBoost = a.definition.passive.kind === 'berserk' && a.hp / a.maxHp < 0.45 ? 1 + a.definition.passive.chance : 1;
        const raw = (a.definition.stats.atk * (power / 60) + 8 - d.definition.stats.def * 0.38) *
          (a.weak ? 0.75 : 1) * (a.boost ? 1.2 : 1) * lowHpBoost;
        let damage = Math.max(2, Math.round(raw * (effect.type === 'stun' ? 0.5 : 1)));
        if (d.definition.passive.kind === 'armor') damage = Math.max(1, Math.round(damage * (1 - d.definition.passive.chance)));
        const absorbed = Math.min(d.shield, damage);
        d.shield -= absorbed;
        damage -= absorbed;
        d.hp = Math.max(0, d.hp - damage);
        lines.push(`${d.name}に${damage}ダメージ${absorbed ? `（シールドが${absorbed}吸収）` : ''}`);
        if (effect.type === 'poison') { d.poison = Math.max(d.poison, duration); lines.push(`${d.name}は毒状態になった`); }
        if (effect.type === 'weaken') { d.weak = Math.max(d.weak, duration); lines.push(`${d.name}の攻撃性能が低下した`); }
        if (effect.type === 'burn') { d.burn = Math.max(d.burn, duration); lines.push(`${d.name}は火傷した`); }
        if (effect.type === 'stun') { d.stun = 1; lines.push(`${d.name}は気絶した`); }
        if (effect.type === 'drain' && damage > 0) {
          const healed = Math.min(a.maxHp - a.hp, Math.round(damage * 0.35));
          a.hp += healed;
          lines.push(`${a.name}は${healed}HP吸収した`);
        }
        if (a.definition.passive.kind === 'lifesteal' && damage > 0) {
          const healed = Math.min(a.maxHp - a.hp, Math.max(1, Math.round(damage * a.definition.passive.chance)));
          a.hp += healed;
          lines.push(`${a.name}の「${a.definition.passive.name}」で${healed}回復`);
        }
        if (damage > 0 && (d.definition.passive.kind === 'counter' || d.definition.passive.kind === 'thorns') && rng() < d.definition.passive.chance) {
          const counter = Math.max(2, Math.round(d.definition.stats.atk * 0.35));
          a.hp = Math.max(0, a.hp - counter);
          lines.push(`${d.name}の「${d.definition.passive.name}」！${counter}反撃ダメージ`);
        }
      }
    }
  }
  if (a.weak > 0) a.weak--;
  if (a.boost > 0) a.boost--;
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
    fighters: fighters.map(({ userId, hp, maxHp, shield, poison, burn, weak, boost, stun }) => ({ userId, hp, maxHp, shield, poison, burn, weak, boost, stun })),
    lines, ended: battle.ended, winnerId: battle.winnerId
  };
  battle.log.push(state);
  return state;
}
