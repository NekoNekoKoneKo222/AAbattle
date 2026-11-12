const CONDITIONS = new Set(['hp_below', 'turn', 'counter', 'status', 'shield_broken']);
const PERSONALITIES = new Set(['aggressive', 'cautious', 'opportunistic', 'defensive', 'counter', 'trickster', 'berserker', 'support', 'adaptive']);
const number = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
const label = (value, fallback) => typeof value === 'string' && value.trim() && !/[<>\u0000-\u001f]/.test(value) ? value.trim().slice(0, 28) : fallback;

export function normalizeAwakening(input, art, normalName, normalizeSkill) {
  if (!art) return null;
  const source = input && typeof input === 'object' ? input : {};
  const condition = CONDITIONS.has(source.condition?.type) ? source.condition.type : 'hp_below';
  const defaults = { hp_below: 35, turn: 5, counter: 2, status: 2, shield_broken: 30 };
  const max = { hp_below: 50, turn: 12, counter: 5, status: 5, shield_broken: 100 };
  const min = { hp_below: 20, turn: 3, counter: 1, status: 1, shield_broken: 10 };
  return {
    name: label(source.name, `${normalName}・覚醒`), art,
    condition: { type: condition, value: number(source.condition?.value, min[condition], max[condition], defaults[condition]) },
    bonus: {
      atk: number(source.bonus?.atk, 0, 15, 12),
      def: number(source.bonus?.def, 0, 15, 8),
      speed: number(source.bonus?.speed, 0, 10, 5)
    },
    skill: normalizeSkill(source.skill || {
      name: '覚醒の一撃', description: '姿を変えて強力な一撃を放つ',
      cooldown: 3, effects: [{ type: 'damage', power: 72, chance: 100, duration: 1 }]
    }),
    personality: PERSONALITIES.has(source.personality) ? source.personality : null
  };
}

export function awakeningReady(fighter, turn) {
  const awakening = fighter.definition?.awakening;
  if (!awakening || fighter.awakened || fighter.hp <= 0) return false;
  const { type, value } = awakening.condition;
  if (type === 'hp_below') return fighter.hp * 100 <= fighter.maxHp * value;
  if (type === 'turn') return turn >= value;
  if (type === 'counter') return fighter.counterCount >= value;
  if (type === 'status') return fighter.statusCount >= value;
  if (type === 'shield_broken') return fighter.shieldBroken >= value;
  return false;
}

export function awaken(fighter, lines) {
  const data = fighter.definition.awakening;
  fighter.awakened = true;
  fighter.name = data.name;
  fighter.art = data.art;
  const stats = fighter.definition.stats;
  fighter.definition = {
    ...fighter.definition,
    personality: data.personality || fighter.definition.personality,
    stats: {
      ...stats,
      atk: Math.min(48, Math.round(stats.atk * (1 + data.bonus.atk / 100))),
      def: Math.min(39, Math.round(stats.def * (1 + data.bonus.def / 100))),
      speed: Math.min(105, Math.round(stats.speed * (1 + data.bonus.speed / 100)))
    },
    skills: [...fighter.definition.skills, data.skill]
  };
  fighter.cooldowns.push(0);
  lines.push(`>>> AWAKENING DETECTED：${fighter.name}へ覚醒！ ATK +${data.bonus.atk}% / DEF +${data.bonus.def}% / SPD +${data.bonus.speed}%`);
  lines.push(`覚醒専用スキル「${data.skill.name}」が解禁された！`);
}

export function hideAwakening(definition, seen = false) {
  if (!definition || seen || !definition.awakening) return definition;
  const { awakening, ...visible } = definition;
  return visible;
}
