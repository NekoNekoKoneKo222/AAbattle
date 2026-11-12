import { randomUUID } from 'node:crypto';
import { awakeningReady, awaken } from './awakening.js';
import { applyStatus, status, removeStatus, clearStatuses, tickStatuses, statusSnapshot, STATUS_RULES } from './status-effects.js';
import { chooseTacticalMove } from './tactics.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function combatant(user, fighter) {
  return {
    userId: user.id, username: user.username, fighterId: fighter.id,
    name: fighter.name, art: fighter.art, definition: fighter.definition,
    hp: fighter.definition.stats.hp, maxHp: fighter.definition.stats.hp,
    shield: 0, poison: 0, burn: 0, bleed: 0, bleedDamage: 0,
    rupture: 0, silence: 0, silenceChance: 0, counterStance: 0, counterChance: 0, counterDamage: 0,
    weak: 0, boost: 0, stun: 0, lastStandUsed: false, cooldowns: [0, 0, 0],
    statuses: {}, freezeResist: 0, awakened: false, counterCount: 0, statusCount: 0,
    shieldBroken: 0, retaliationDamage: 0
  };
}

export function createBattle(playerA, fighterA, playerB, fighterB, rng = Math.random) {
  if (playerA.id === playerB.id) throw new Error('同じアカウント同士では対戦できません。');
  const left = combatant(playerA, fighterA);
  const right = combatant(playerB, fighterB);
  return { id: randomUUID(), fighters: [left, right], turn: 0, ended: false, winnerId: null, log: [], rng };
}

function chooseMove(attacker, defender, rng, used = new Set()) {
  const s = attacker.definition.skills;
  const available = s.map((move, index) => ({ move, index })).filter((v) => attacker.cooldowns[v.index] === 0 && !used.has(v.index) && !(status(attacker, 'seal') && status(attacker, 'seal').slot === v.index));
  if (!available.length) return { move: { name: '通常攻撃', kind: 'damage', power: 50, cooldown: 0 }, index: -1 };
  if (attacker.definition.tactics || ['defensive','counter','trickster','berserker','support','adaptive'].includes(attacker.definition.personality)) return chooseTacticalMove(attacker, defender, available, rng);
  const personality = attacker.definition.personality;
  const healthRatio = attacker.hp / attacker.maxHp;
  if (healthRatio < 0.43) {
    const rescue = available.find(({ move }) => hasEffect(move, 'heal', 'shield', 'cleanse'));
    if (rescue) return rescue;
  }
  if (personality === 'cautious' && defender.hp / defender.maxHp > 0.5) {
    const defense = available.find(({ move }) => hasEffect(move, 'shield', 'counter_stance') && attacker.shield < 15);
    if (defense) return defense;
  }
  if (defender.hp / defender.maxHp < 0.35) {
    const finisher = available.filter(({ move }) => hasEffect(move, 'damage', 'drain')).sort((a, b) => b.move.power - a.move.power)[0];
    if (finisher) return finisher;
  }
  if (personality === 'aggressive') {
    const damaging = available.filter(({ move }) => hasEffect(move, 'damage', 'drain', 'burn', 'poison', 'bleed', 'rupture', 'silence'));
    if (damaging.length) return damaging[Math.floor(rng() * damaging.length)];
  }
  return available[Math.floor(rng() * available.length)];
}

function hasEffect(move, ...types) {
  return (Array.isArray(move.effects) && move.effects.length ? move.effects.map((effect) => effect.type) : [move.kind])
    .some((type) => types.includes(type));
}

function reviveIfLastStand(fighter, lines) {
  if (fighter.hp <= 0 && status(fighter, 'endure')) {
    removeStatus(fighter, 'endure'); fighter.hp = 1; lines.push(`${fighter.name}は不屈で踏みとどまった！`); return;
  }
  if (fighter.hp > 0 || fighter.lastStandUsed || fighter.definition.passive.kind !== 'laststand') return;
  fighter.lastStandUsed = true;
  fighter.hp = Math.max(1, Math.round(fighter.maxHp * 0.01));
  lines.push(`${fighter.name}の「${fighter.definition.passive.name}」！最大HPの1%で復活した！`);
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
  const reactions = [];
  const freshStatuses = new Set();
  if (awakeningReady(a, battle.turn)) awaken(a, lines);
  a.cooldowns = a.cooldowns.map((v) => Math.max(0, v - (status(a, 'haste') ? 2 : 1)));
  if (a.poison > 0) {
    const dot = Math.max(3, Math.round(a.maxHp * 0.035));
    a.hp = Math.max(0, a.hp - dot);
    a.poison--;
    lines.push(`${a.name}は毒で${dot}ダメージ`);
    reviveIfLastStand(a, lines);
  }
  if (a.burn > 0) {
    const dot = Math.max(2, Math.round(a.maxHp * 0.027));
    a.hp = Math.max(0, a.hp - dot);
    a.burn--;
    lines.push(`${a.name}は火傷で${dot}ダメージ`);
    reviveIfLastStand(a, lines);
  }
  if (a.hp > 0 && status(a, 'regeneration')) {
    const gained = Math.min(a.maxHp - a.hp, Math.max(1, Math.round(a.maxHp * status(a, 'regeneration').power / 100)));
    a.hp += gained; if (gained) lines.push(`${a.name}は再生で${gained}回復`);
  }
  if (a.bleed > 0) {
    const dot = clamp(a.bleedDamage, 1, 5);
    a.hp = Math.max(0, a.hp - dot);
    a.bleed--;
    if (!a.bleed) a.bleedDamage = 0;
    lines.push(`${a.name}は出血で${dot}ダメージ`);
    reviveIfLastStand(a, lines);
  }
  if (a.definition.passive.kind === 'cleanser' && (a.poison || a.burn || a.bleed || a.rupture || a.silence || a.weak) && rng() < a.definition.passive.chance) {
    a.poison = 0; a.burn = 0; a.bleed = 0; a.bleedDamage = 0; a.rupture = 0; a.silence = 0; a.silenceChance = 0; a.weak = 0; clearStatuses(a);
    lines.push(`${a.name}の「${a.definition.passive.name}」！状態異常を取り除いた`);
  }
  if (a.hp > 0 && a.definition.passive.kind === 'fortify') {
    const gain = Math.max(1, Math.round(a.definition.passive.chance * 35));
    a.shield = clamp(a.shield + gain, 0, 100);
    lines.push(`${a.name}の「${a.definition.passive.name}」でシールド+${gain}`);
  }
  if (a.hp > 0 && a.definition.passive.kind === 'regen') {
    const amount = Math.max(1, Math.round(a.maxHp * a.definition.passive.chance / 3));
    const healed = Math.min(a.maxHp - a.hp, amount);
    a.hp += healed;
    if (healed) lines.push(`${a.name}の「${a.definition.passive.name}」で${healed}回復`);
  }
  const silenced = a.silence > 0 && rng() * 100 < a.silenceChance;
  if (a.silence > 0) a.silence--;
  if (a.hp > 0 && status(a, 'freeze')) {
    removeStatus(a, 'freeze'); a.freezeResist = 2; lines.push(`${a.name}は凍結して行動できない！`);
  } else if (a.hp > 0 && status(a, 'shock') && rng() * 100 < status(a, 'shock').power) {
    lines.push(`${a.name}は感電して行動に失敗した！`);
  } else if (a.hp > 0 && a.stun > 0) {
    a.stun = 0;
    lines.push(`${a.name}は気絶して行動できない！`);
  } else if (a.hp > 0 && silenced) {
    lines.push(`${a.name}は沈黙で行動できない！`);
  } else if (a.hp > 0) {
    const usableCount = a.definition.skills.filter((_, index) => a.cooldowns[index] === 0 && !(status(a, 'seal') && status(a, 'seal').slot === index)).length;
    const used = new Set();
    // Sharing one action lowers each move's output; short cooldowns trade power for frequency.
    const comboScale = 1 / (1 + 0.5 * (Math.max(1, usableCount) - 1));
    for (let action = 0; action < Math.max(1, usableCount) && a.hp > 0 && d.hp > 0; action++) {
    const targetLastStandUsed = d.lastStandUsed;
    let { move, index, reason } = chooseMove(a, d, rng, used);
    if (status(a, 'glitch') && rng() * 100 < status(a, 'glitch').power) {
      const alternatives = a.definition.skills.map((skill, i) => ({ move: skill, index: i })).filter(v => v.index !== index && a.cooldowns[v.index] === 0 && !used.has(v.index));
      if (alternatives.length) { ({ move, index } = alternatives[Math.floor(rng() * alternatives.length)]); reason = '文字化けで別の技を選択'; }
    }
    if (index >= 0) used.add(index);
    if (index >= 0) a.cooldowns[index] = move.cooldown + 1;
    lines.push(`${a.name}の「${move.name}」！`);
    if (reason) lines.push(`[AI DECISION] ${reason}`);
    const effects = Array.isArray(move.effects) && move.effects.length ? move.effects : [{ type: move.kind, power: move.power, chance: 100, duration: 3 }];
    const cooldownScale = index < 0 ? 1 : [1, 0.55, 0.75, 1, 1.1, 1.15][clamp(move.cooldown, 1, 5)];
    const scale = (effects.length > 1 ? 0.65 : 1) * comboScale * cooldownScale;
    for (const effect of effects) {
      if (a.hp <= 0 || d.hp <= 0 || (!targetLastStandUsed && d.lastStandUsed)) break;
      if (!['silence', 'counter_stance'].includes(effect.type) && !STATUS_RULES[effect.type] && rng() * 100 >= (effect.chance ?? 100)) { lines.push('追加効果は発動しなかった'); continue; }
      const power = clamp(effect.power ?? move.power ?? 50, 15, 90) * scale;
      const duration = clamp(effect.duration ?? 3, 1, 3);
      if (effect.type === 'heal') {
        const healed = Math.min(a.maxHp - a.hp, Math.round(a.maxHp * power / 210 * (status(a, 'curse') ? .5 : 1)));
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
        a.poison = 0; a.burn = 0; a.bleed = 0; a.bleedDamage = 0; a.rupture = 0; a.silence = 0; a.silenceChance = 0; a.weak = 0; clearStatuses(a);
        lines.push(`${a.name}は状態異常を取り除いた`);
      } else if (effect.type === 'counter_stance') {
        a.counterStance = Math.max(a.counterStance, duration + 1);
        a.counterChance = clamp(effect.chance ?? 30, 5, 80);
        a.counterDamage = clamp(effect.power ?? 10, 1, 30);
        lines.push(`${a.name}は反撃態勢になった（反撃${a.counterChance}% / ${a.counterDamage}ダメージ）`);
      } else if (STATUS_RULES[effect.type]) {
        const friendly = ['reflect','haste','focus','harden','regeneration','parry','shield_counter','retaliation','just_guard','endure'].includes(effect.type);
        const target = friendly ? a : d;
        if (applyStatus(target, effect, rng)) {
          if (!friendly) a.statusCount++;
          if (friendly) freshStatuses.add(effect.type);
          lines.push(`${target.name}に${STATUS_RULES[effect.type].name}（${status(target, effect.type).remaining}ターン）`);
        } else lines.push('追加効果は発動しなかった');
      } else {
        if (d.definition.passive.kind === 'dodge' && rng() < d.definition.passive.chance) {
          lines.push(`${d.name}の「${d.definition.passive.name}」！回避した！`);
          continue;
        }
        if (status(a, 'blind') && rng() * 100 < status(a, 'blind').power) { lines.push(`${a.name}の攻撃は盲目で外れた！`); continue; }
        if (effect.type === 'bleed') {
          d.bleed = Math.max(d.bleed, duration);
          d.bleedDamage = Math.max(d.bleedDamage, clamp(effect.power ?? 1, 1, 5));
          a.statusCount++; lines.push(`${d.name}は出血した（毎ターン${d.bleedDamage}ダメージ）`);
          continue;
        }
        if (effect.type === 'rupture') {
          d.rupture = Math.max(d.rupture, duration + 1);
          a.statusCount++; lines.push(`${d.name}は破裂状態になった`);
          continue;
        }
        if (effect.type === 'silence') {
          d.silence = Math.max(d.silence, duration);
          d.silenceChance = clamp(effect.chance ?? 25, 5, 50);
          a.statusCount++; lines.push(`${d.name}は沈黙した（行動不能${d.silenceChance}%）`);
          continue;
        }
        const lowHpBoost = a.definition.passive.kind === 'berserk' && a.hp / a.maxHp < 0.45 ? 1 + a.definition.passive.chance : 1;
        const effectiveDef = d.definition.stats.def * (1 - Math.min(.3, (status(d, 'corrosion')?.stacks || 0) * (status(d, 'corrosion')?.power || 0) / 100));
        const raw = (a.definition.stats.atk * (power / 60) + 8 - effectiveDef * 0.38) *
          (a.weak || status(a, 'fear') ? 0.75 : 1) * (a.boost ? 1.2 : 1) * lowHpBoost * (status(a, 'focus') ? 1.2 : 1);
        let damage = Math.max(2, Math.round(raw * (effect.type === 'stun' ? 0.5 : 1)));
        if (d.definition.passive.kind === 'armor') damage = Math.max(1, Math.round(damage * (1 - d.definition.passive.chance)));
        if (status(d, 'harden')) damage = Math.max(1, Math.round(damage * (1 - status(d, 'harden').power / 100)));
        let parried = false;
        if (status(d, 'parry') && rng() * 100 < status(d, 'parry').chance) { damage = Math.max(1, Math.round(damage * .5)); parried = true; }
        if (status(d, 'just_guard') && rng() * 100 < status(d, 'just_guard').chance) { damage = Math.max(1, Math.round(damage * .3)); lines.push(`${d.name}のジャストガード！`); }
        const absorbed = Math.min(d.shield, damage);
        d.shield -= absorbed;
        d.shieldBroken += absorbed;
        damage -= absorbed;
        const beforeHp = d.hp;
        d.hp = Math.max(0, d.hp - damage);
        const actualDamage = beforeHp - d.hp;
        lines.push(`${d.name}に${actualDamage}ダメージ${absorbed ? `（シールドが${absorbed}吸収）` : ''}`);
        if (d.rupture > 0 && actualDamage >= 10) {
          const extra = Math.round(actualDamage / 10);
          d.hp = Math.max(0, d.hp - extra);
          lines.push(`${d.name}の破裂で追加${extra}ダメージ`);
        }
        reviveIfLastStand(d, lines);
        if (awakeningReady(d, battle.turn)) awaken(d, lines);
        if (effect.type === 'poison') { d.poison = Math.max(d.poison, duration); a.statusCount++; lines.push(`${d.name}は毒状態になった`); }
        if (effect.type === 'weaken') { d.weak = Math.max(d.weak, duration); a.statusCount++; lines.push(`${d.name}の攻撃性能が低下した`); }
        if (effect.type === 'burn') { d.burn = Math.max(d.burn, duration); a.statusCount++; lines.push(`${d.name}は火傷した`); }
        if (effect.type === 'stun') { d.stun = 1; a.statusCount++; lines.push(`${d.name}は気絶した`); }
        if (effect.type === 'drain' && actualDamage > 0) {
          const healed = Math.min(a.maxHp - a.hp, Math.round(actualDamage * 0.35));
          a.hp += healed;
          lines.push(`${a.name}は${healed}HP吸収した`);
        }
        if (a.definition.passive.kind === 'lifesteal' && actualDamage > 0) {
          const healed = Math.min(a.maxHp - a.hp, Math.max(1, Math.round(actualDamage * a.definition.passive.chance)));
          a.hp += healed;
          lines.push(`${a.name}の「${a.definition.passive.name}」で${healed}回復`);
        }
        let reacted = false;
        if (d.hp > 0 && parried) { const counter = Math.min(20, Math.max(2, Math.round(d.definition.stats.atk * .35))); a.hp = Math.max(0, a.hp - counter); lines.push(`${d.name}のパリィ反撃！${counter}ダメージ`); reactions.push({isReaction:true,type:'parry',sourceId:d.userId,targetId:a.userId,damage:counter}); reviveIfLastStand(a, lines); d.counterCount++; reacted = true; }
        if (!reacted && d.hp > 0 && absorbed > 0 && status(d, 'shield_counter')) { const counter = Math.min(20, status(d, 'shield_counter').power); a.hp = Math.max(0, a.hp - counter); lines.push(`${d.name}のシールドカウンター！${counter}ダメージ`); reactions.push({isReaction:true,type:'shield_counter',sourceId:d.userId,targetId:a.userId,damage:counter}); reviveIfLastStand(a, lines); d.counterCount++; reacted = true; }
        if (d.hp > 0 && actualDamage > 0 && status(d, 'retaliation')) {
          d.retaliationDamage = Math.min(50, d.retaliationDamage + actualDamage);
          if (!reacted && d.retaliationDamage >= 20) {
            const counter = Math.min(25, Math.round(d.retaliationDamage * .5)); d.retaliationDamage = 0;
            a.hp = Math.max(0, a.hp - counter); lines.push(`${d.name}の報復！${counter}ダメージ`);
            reactions.push({isReaction:true,type:'retaliation',sourceId:d.userId,targetId:a.userId,damage:counter});
            reviveIfLastStand(a, lines); d.counterCount++; reacted = true;
          }
        }
        if (!reacted && d.hp > 0 && actualDamage > 0 && status(d, 'reflect')) { const counter = Math.min(20, Math.round(actualDamage * status(d, 'reflect').power / 100)); a.hp = Math.max(0, a.hp - counter); lines.push(`${d.name}の反射！${counter}ダメージ`); reactions.push({isReaction:true,type:'reflect',sourceId:d.userId,targetId:a.userId,damage:counter}); reviveIfLastStand(a, lines); d.counterCount++; reacted = true; }
        if (!reacted && d.hp > 0 && d.counterStance > 0 && rng() * 100 < d.counterChance) {
          const counterAbsorbed = Math.min(a.shield, d.counterDamage);
          a.shield -= counterAbsorbed;
          const counter = d.counterDamage - counterAbsorbed;
          a.hp = Math.max(0, a.hp - counter);
          lines.push(`${d.name}の反撃態勢！${counter}反撃ダメージ`);
          reactions.push({isReaction:true,type:'counter_stance',sourceId:d.userId,targetId:a.userId,damage:counter});
          reviveIfLastStand(a, lines);
          reacted = true;
          d.counterCount++;
        }
        if (!reacted && d.hp > 0 && actualDamage > 0 && (d.definition.passive.kind === 'counter' || d.definition.passive.kind === 'thorns') && rng() < d.definition.passive.chance) {
          const counter = Math.max(2, Math.round(d.definition.stats.atk * 0.35));
          a.hp = Math.max(0, a.hp - counter);
          lines.push(`${d.name}の「${d.definition.passive.name}」！${counter}反撃ダメージ`);
          reactions.push({isReaction:true,type:d.definition.passive.kind,sourceId:d.userId,targetId:a.userId,damage:counter});
          reviveIfLastStand(a, lines);
          d.counterCount++;
        }
      }
    }
    // A revival interrupts the remaining combo so Last Stand grants a real survival window.
    if (!targetLastStandUsed && d.lastStandUsed) break;
    }
  }
  if (a.weak > 0) a.weak--;
  if (a.boost > 0) a.boost--;
  if (a.rupture > 0) a.rupture--;
  if (a.counterStance > 0) a.counterStance--;
  tickStatuses(a, freshStatuses);
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
    fighters: fighters.map((fighter) => {
      const { userId, name, art, awakened, hp, maxHp, shield, poison, burn, bleed, bleedDamage, rupture, silence, silenceChance, counterStance, counterChance, counterDamage, weak, boost, stun, lastStandUsed, counterCount, statusCount } = fighter;
      return { userId, name, art, awakened, hp, maxHp, shield, poison, burn, bleed, bleedDamage, rupture, silence, silenceChance, counterStance, counterChance, counterDamage, weak, boost, stun, lastStandUsed, counterCount, statusCount, statuses: statusSnapshot(fighter) };
    }),
    lines, reactions, ended: battle.ended, winnerId: battle.winnerId
  };
  battle.log.push(state);
  return state;
}
