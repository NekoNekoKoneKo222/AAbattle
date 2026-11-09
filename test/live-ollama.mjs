// Optional live smoke test: AI_PROVIDER=ollama node test/live-ollama.mjs
import { generateFighter, validateArt } from '../src/generator.js';
import { createBattle, stepBattle } from '../src/battle.js';

const samples = [
  ['猫', ' /\\_/\\\n( o.o )\n > ^ <'],
  ['ロボット', ' [0_0]\n /|=|\\\n  / \\'],
  ['剣', '   /\\\n   ||\n   ||\n   ||\n  /__\\']
];
const fighters = [];
for (const [name, raw] of samples) {
  const result = await generateFighter(validateArt(raw), name, fighters.flatMap((f) => f.definition.skills.map((s) => s.name)));
  fighters.push({ id: name, name, art: raw, definition: result.definition });
  console.log(JSON.stringify({ name, elapsedMs: result.generationMs, definition: result.definition }));
}
const battle = createBattle({ id: 'cat', username: 'cat' }, fighters[0], { id: 'robot', username: 'robot' }, fighters[1], () => 0.4);
while (!battle.ended) stepBattle(battle);
const skillNames = fighters.slice(0, 2).flatMap((f) => f.definition.skills.map((s) => s.name));
const used = skillNames.filter((name) => battle.log.some((turn) => turn.lines.some((line) => line.includes(`「${name}」`))));
if (!used.length) throw new Error('自動戦闘で生成スキルが使われませんでした。');
console.log(JSON.stringify({ battleTurns: battle.turn, usedSkills: used, winnerId: battle.winnerId }));
