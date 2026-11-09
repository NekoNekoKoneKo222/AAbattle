import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFighter, generationMode, ollamaStatus, validateAiDraft } from '../src/generator.js';
import { createBattle, stepBattle } from '../src/battle.js';

const draft = {
  title: '星猫の番人', archetype: '夜を渡る猫', personality: 'opportunistic',
  stats: { hp: 9999, atk: 30, def: 14, speed: 80 },
  skills: [
    { name: '月影の爪', description: '爪で斬り、光で目をくらます', cooldown: 2,
      effects: [{ type: 'damage', power: 70, chance: 100, duration: 1 }, { type: 'stun', power: 20, chance: 25, duration: 1 }] },
    { name: '星屑の毛布', description: '毛並みで身を守る', cooldown: 3,
      effects: [{ type: 'shield', power: 45, chance: 100, duration: 2 }] },
    { name: '夜風の歩幅', description: '足取りで力を蓄える', cooldown: 4,
      effects: [{ type: 'boost', power: 30, chance: 90, duration: 2 }, { type: 'heal', power: 20, chance: 80, duration: 1 }] }
  ],
  passive: { name: '月夜の身軽さ', description: '夜に素早く避ける', kind: 'dodge', chance: 16 }
};

test('explicit provider selection and legacy Gemini fallback', () => {
  const old = { provider: process.env.AI_PROVIDER, gemini: process.env.GEMINI_API_KEY };
  try {
    process.env.AI_PROVIDER = 'ollama';
    assert.equal(generationMode(), 'ollama');
    process.env.AI_PROVIDER = 'local';
    process.env.GEMINI_API_KEY = 'legacy-key';
    assert.equal(generationMode(), 'local');
    delete process.env.AI_PROVIDER;
    assert.equal(generationMode(), 'gemini');
  } finally {
    if (old.provider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = old.provider;
    if (old.gemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old.gemini;
  }
});

test('similar names and repeated effect combinations are rejected', () => {
  assert.throws(() => validateAiDraft(draft, ['月影ノ爪'], 'Ollama'), /重複/);
  const repeated = structuredClone(draft);
  repeated.skills[2].effects = [{ type: 'shield', power: 40, chance: 100, duration: 2 }];
  assert.throws(() => validateAiDraft(repeated, [], 'Ollama'), /効果構成が重複/);
});

test('Ollama schema request retries invalid output and generated skills work in battle', async () => {
  const old = process.env.AI_PROVIDER;
  const previousFetch = globalThis.fetch;
  process.env.AI_PROVIDER = 'ollama';
  let calls = 0;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    calls++;
    const output = calls === 1 ? { ...draft, skills: [draft.skills[0], draft.skills[0], draft.skills[2]] } : draft;
    return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify(output) } }) };
  };
  try {
    const result = await generateFighter(' /\\_/\\\n( o.o )\n > ^ <', 'ねこ', ['過去の技']);
    assert.equal(result.mode, 'ollama');
    assert.equal(calls, 2);
    assert.equal(result.definition.skills.length, 3);
    assert.equal(result.definition.stats.hp <= 260, true);
    assert.equal(requests[0].url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(requests[0].body.stream, false);
    assert.equal(requests[0].body.model, 'qwen2.5:3b');
    assert.equal(requests[0].body.format.properties.skills.minItems, 3);
    assert.match(requests[0].body.messages[1].content, /過去の技/);
    const fighter = { id: 'a', name: 'ねこ', art: 'cat', definition: result.definition };
    const enemy = { ...fighter, id: 'b', name: '敵' };
    const battle = createBattle({ id: 'a', username: 'a' }, fighter, { id: 'b', username: 'b' }, enemy, () => 0.4);
    while (!battle.ended) stepBattle(battle);
    assert.ok(battle.log.some((turn) => turn.lines.some((line) => line.includes('月影の爪'))));
  } finally {
    globalThis.fetch = previousFetch;
    if (old === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = old;
  }
});

test('Ollama stopped and missing model report clear failures', async () => {
  const old = process.env.AI_PROVIDER;
  const previousFetch = globalThis.fetch;
  process.env.AI_PROVIDER = 'ollama';
  try {
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    assert.deepEqual(await ollamaStatus(), { connected: false, model: 'qwen2.5:3b', installed: false });
    await assert.rejects(generateFighter('cat', '猫'), /Ollamaへ接続できません/);
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    await assert.rejects(generateFighter('cat', '猫'), /ollama pull qwen2.5:3b/);
  } finally {
    globalThis.fetch = previousFetch;
    if (old === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = old;
  }
});
