export const TACTIC_KEYS = ['aggression', 'defensePriority', 'healPriority', 'debuffPriority', 'counterPriority', 'finisherPriority', 'riskTolerance'];
const presets = {
  aggressive:[85,25,25,35,25,80,75], defensive:[30,85,65,35,45,40,20], counter:[40,70,35,30,90,55,35],
  trickster:[40,35,30,90,45,55,55], berserker:[85,15,20,35,30,85,95], support:[30,65,95,35,35,35,20],
  opportunistic:[55,45,45,60,45,85,50], adaptive:[55,55,55,55,55,55,50], cautious:[35,75,65,40,55,50,20]
};
export function normalizeTactics(input, personality) {
  const base = presets[personality] || presets.opportunistic;
  return Object.fromEntries(TACTIC_KEYS.map((key, index) => [key,
    Number.isFinite(Number(input?.[key])) ? Math.max(0, Math.min(100, Math.round(Number(input[key])))) : base[index]]));
}
const types = (move) => (move.effects?.length ? move.effects.map(effect => effect.type) : [move.kind]);
export function chooseTacticalMove(attacker, defender, available, rng = Math.random) {
  const t = normalizeTactics(attacker.definition.tactics, attacker.definition.personality);
  let best = null;
  for (const candidate of available) {
    const move = candidate.move;
    const kinds = types(move);
    const hp = attacker.hp / attacker.maxHp;
    const enemyHp = defender.hp / defender.maxHp;
    const estimatedDamage = Math.max(2, Math.round(attacker.definition.stats.atk * move.power / 60 + 8 - defender.definition.stats.def * .38));
    let score = 20 + (rng() - .5) * 10;
    let reason = '状況に合わせた技を選択';
    if (kinds.some(k => ['damage','drain','burn','poison','bleed','stun'].includes(k))) { score += t.aggression * .35 + estimatedDamage * .3; reason = '攻撃を優先'; }
    if (kinds.some(k => ['shield','harden','just_guard','parry'].includes(k))) { score += t.defensePriority * .35 * (1 - attacker.shield / 100); reason = '防御を優先'; }
    if (kinds.includes('heal') || kinds.includes('regeneration')) { score += t.healPriority * .65 * (1 - hp); reason = 'HP回復を優先'; }
    if (kinds.some(k => ['counter_stance','shield_counter','retaliation','reflect'].includes(k))) { score += t.counterPriority * .4; reason = '反撃を優先'; }
    if (kinds.some(k => ['poison','burn','blind','corrosion','curse','fear','glitch','seal','shock','freeze','weaken'].includes(k))) { score += t.debuffPriority * (defender.poison || defender.burn ? .12 : .36); reason = '状態異常を優先'; }
    if (estimatedDamage >= defender.hp && kinds.some(k => ['damage','drain'].includes(k))) { score += t.finisherPriority * .8; reason = '敵を倒せる技を選択'; }
    if (attacker.statuses?.fear && kinds.some(k => ['shield','heal','parry','harden'].includes(k))) score += 25;
    if (attacker.definition.personality === 'berserker' && hp < .4 && kinds.includes('damage')) score += 25;
    if (attacker.definition.personality === 'counter' && kinds.includes('counter_stance')) score += 25;
    if (attacker.definition.personality === 'opportunistic' && enemyHp < .4 && kinds.includes('damage')) score += 18;
    score -= move.cooldown * (100 - t.riskTolerance) * .07;
    if (!best || score > best.score) best = { ...candidate, score, reason };
  }
  return best;
}
