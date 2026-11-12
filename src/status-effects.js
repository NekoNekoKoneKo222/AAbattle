export const STATUS_RULES = Object.freeze({
  shock: { name:'感電', maxDuration:2, maxStacks:1, maxPower:30, clear:'期限・浄化' },
  freeze: { name:'凍結', maxDuration:1, maxStacks:1, maxPower:1, clear:'次の行動・浄化' },
  blind: { name:'盲目', maxDuration:3, maxStacks:1, maxPower:30, clear:'期限・浄化' },
  corrosion: { name:'腐食', maxDuration:3, maxStacks:3, maxPower:10, clear:'期限・浄化' },
  curse: { name:'呪い', maxDuration:3, maxStacks:1, maxPower:50, clear:'期限・浄化' },
  fear: { name:'恐怖', maxDuration:3, maxStacks:1, maxPower:25, clear:'期限・浄化' },
  glitch: { name:'文字化け', maxDuration:3, maxStacks:1, maxPower:50, clear:'期限・浄化' },
  seal: { name:'スキル封印', maxDuration:2, maxStacks:1, maxPower:1, clear:'期限・浄化' },
  reflect: { name:'反射', maxDuration:3, maxStacks:1, maxPower:25, clear:'期限・浄化' },
  haste: { name:'加速', maxDuration:3, maxStacks:1, maxPower:20, clear:'期限・浄化' },
  focus: { name:'集中', maxDuration:3, maxStacks:1, maxPower:20, clear:'期限・浄化' },
  harden: { name:'硬化', maxDuration:3, maxStacks:1, maxPower:25, clear:'期限・浄化' },
  regeneration: { name:'再生', maxDuration:3, maxStacks:1, maxPower:12, clear:'期限・浄化' },
  parry: { name:'パリィ', maxDuration:3, maxStacks:1, maxPower:25, clear:'期限・浄化' },
  shield_counter: { name:'シールドカウンター', maxDuration:3, maxStacks:1, maxPower:20, clear:'期限・浄化' },
  retaliation: { name:'報復', maxDuration:3, maxStacks:1, maxPower:25, clear:'期限・浄化' },
  just_guard: { name:'ジャストガード', maxDuration:3, maxStacks:1, maxPower:70, clear:'期限・浄化' },
  endure: { name:'不屈', maxDuration:3, maxStacks:1, maxPower:1, clear:'致命傷・期限・浄化' }
});

export function applyStatus(fighter, effect, rng = Math.random) {
  const rule = STATUS_RULES[effect.type];
  if (!rule || rng() * 100 >= (effect.chance ?? 100)) return false;
  fighter.statuses ||= {};
  if (effect.type === 'freeze' && fighter.freezeResist > 0) return false;
  const previous = fighter.statuses[effect.type];
  const stacks = Math.min(rule.maxStacks, (previous?.stacks || 0) + 1);
  const power = Math.min(rule.maxPower, Math.max(1, Math.round(Number(effect.power) || 1)));
  fighter.statuses[effect.type] = {
    id: effect.type, name: rule.name, power: Math.max(previous?.power || 0, power),
    chance: Math.min(100, Math.max(5, Number(effect.chance) || 100)),
    remaining: Math.min(rule.maxDuration, Math.max(previous?.remaining || 0, Number(effect.duration) || 2)),
    stacks, maxStacks: rule.maxStacks, clear: rule.clear,
    ...(effect.type === 'seal' ? { slot: Math.max(0, Math.min(3, Number(effect.slot) || 0)) } : {})
  };
  return true;
}

export const status = (fighter, id) => fighter.statuses?.[id] || null;
export const removeStatus = (fighter, id) => { if (fighter.statuses) delete fighter.statuses[id]; };
export function clearStatuses(fighter) { fighter.statuses = {}; }
export function tickStatuses(fighter, skip = new Set()) {
  if (fighter.freezeResist > 0) fighter.freezeResist--;
  for (const [id, effect] of Object.entries(fighter.statuses || {})) {
    if (skip.has(id)) continue;
    effect.remaining--;
    if (effect.remaining <= 0) delete fighter.statuses[id];
  }
}
export function statusSnapshot(fighter) {
  const modern = Object.values(fighter.statuses || {}).map(({ id, name, power, chance, remaining, stacks, maxStacks, clear, slot }) => ({ id, name, power, chance, remaining, stacks, maxStacks, clear, ...(slot === undefined ? {} : { slot }) }));
  const old = [
    ['poison','毒',fighter.poison,3,100], ['burn','火傷',fighter.burn,3,100], ['bleed','出血',fighter.bleed,fighter.bleedDamage,100],
    ['rupture','破裂',fighter.rupture,10,100], ['silence','沈黙',fighter.silence,1,fighter.silenceChance],
    ['counter_stance','反撃態勢',fighter.counterStance,fighter.counterDamage,fighter.counterChance],
    ['weaken','弱体',fighter.weak,25,100], ['boost','強化',fighter.boost,20,100]
  ].filter(([, , remaining]) => remaining > 0).map(([id,name,remaining,power,chance]) => ({id,name,power,chance,remaining,stacks:1,maxStacks:1,clear:'期限・浄化'}));
  return [...modern,...old];
}
