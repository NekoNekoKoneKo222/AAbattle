import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArt, normalizeDefinition, generateFighter } from '../src/generator.js';

test('ASCII art keeps every backslash, space, and newline', () => {
  const art = ' /\\_/\\\n( o.o )\n > ^ <';
  assert.equal(validateArt(art), art);
  assert.throws(() => validateArt('cat\tcat'), /タブ/);
  assert.throws(() => validateArt('x'.repeat(53)), /52/);
});

test('generated abilities are within the safe battle vocabulary and budget', () => {
  const generated = normalizeDefinition({
    stats: { hp: 100000, atk: 90000, def: 90000, speed: 99999 },
    skills: [{ name: '超即死', kind: 'execute_arbitrary_code', power: 99999, cooldown: 0 }],
    passive: { kind: 'invincible', chance: 100 }
  }, 'テスト');
  assert.ok(generated.stats.hp <= 260);
  assert.ok(generated.stats.atk <= 42);
  assert.ok(generated.skills[0].power <= 90);
  assert.equal(generated.skills[0].kind, 'damage');
  assert.equal(generated.passive.kind, 'dodge');
});

test('without API credentials, fighter generation is explicitly local', async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await generateFighter(' /\\_/\\\n( o.o )\n > ^ <', 'ねこ');
    assert.equal(result.mode, 'local');
    assert.equal(result.definition.skills.length, 3);
    assert.equal(result.definition.archetype, '俊敏な猫');
  } finally {
    if (previous) process.env.GEMINI_API_KEY = previous;
  }
});

test('Gemini API invents unique skills, effects and passives from the AA', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'mock-gemini-api-key';
  delete process.env.GEMINI_MODEL;
  const requests = [];
  const draft = {
    title: '月影の猫', archetype: '月光を折り曲げる猫', personality: 'opportunistic',
    stats: { hp: 160, atk: 28, def: 17, speed: 80 },
    skills: [
      { name: '三日月の爪跡', description: '月の断片で敵を裂き、火傷を残す', cooldown: 2,
        effects: [{ type: 'damage', power: 65, chance: 100, duration: 1 }, { type: 'burn', power: 20, chance: 75, duration: 2 }] },
      { name: '夜空の抜け道', description: '猫の輪郭を薄めて耐える', cooldown: 3,
        effects: [{ type: 'shield', power: 45, chance: 100, duration: 1 }] },
      { name: '星屑の追い風', description: '自己強化と小回復を行う', cooldown: 4,
        effects: [{ type: 'boost', power: 30, chance: 100, duration: 2 }, { type: 'heal', power: 25, chance: 100, duration: 1 }] }
    ],
    passive: { name: '月明かりの執念', description: '窮地で攻撃力が上がる', kind: 'berserk', chance: 16 }
  };
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(draft) }] } }] }) };
  };
  try {
    const art = ' /\\_/\\\n( o.o )\n > ^ <';
    const result = await generateFighter(art, 'ツキネコ', ['ねこパンチ']);
    assert.equal(result.mode, 'gemini');
    assert.equal(result.definition.skills.length, 3);
    assert.equal(result.definition.passive.kind, 'berserk');
    assert.equal(result.definition.skills[0].name, '三日月の爪跡');
    assert.deepEqual(result.definition.skills[0].effects.map((effect) => effect.type), ['damage', 'burn']);
    assert.deepEqual(result.definition.skills[2].effects.map((effect) => effect.type), ['boost', 'heal']);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /models\/gemini-3\.5-flash-lite:generateContent/);
    assert.equal(requests[0].init.headers['x-goog-api-key'], 'mock-gemini-api-key');
    const body = JSON.parse(requests[0].init.body);
    assert.match(body.contents[0].parts[0].text, /ねこパンチ/);
    assert.match(body.contents[0].parts[0].text, /\/\\_\/\\/);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  }
});

test('Gemini regenerates a duplicate ability instead of storing it', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'mock-gemini-api-key';
  let calls = 0;
  const draft = {
    stats: { hp: 160, atk: 30, def: 20, speed: 65 }, personality: 'aggressive',
    skills: [
      { name: '前の技', description: '過去と同じ', cooldown: 2, effects: [{ type: 'damage', power: 65 }] },
      { name: '無敵の羽', description: '羽を盾にする', cooldown: 3, effects: [{ type: 'shield', power: 45 }] },
      { name: '毒の足跡', description: '毒をまく', cooldown: 4, effects: [{ type: 'poison', power: 50 }] }
    ], passive: { name: '逆風の加速', description: '窮地で攻撃力が上がる', kind: 'berserk', chance: 15 }
  };
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      ...draft,
      skills: calls === 1 ? draft.skills : [{ ...draft.skills[0], name: '新しい技' }, { ...draft.skills[1], name: '勝手に変えた羽' }, draft.skills[2]]
    }) }] } }] }) };
  };
  try {
    const result = await generateFighter('(@_@)', '羽', ['前の技']);
    assert.equal(result.mode, 'gemini');
    assert.equal(result.definition.skills[0].name, '新しい技');
    assert.equal(result.definition.skills[1].name, '無敵の羽');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
