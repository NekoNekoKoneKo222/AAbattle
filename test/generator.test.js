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
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await generateFighter(' /\\_/\\\n( o.o )\n > ^ <', 'ねこ');
    assert.equal(result.mode, 'local');
    assert.equal(result.definition.skills.length, 3);
    assert.equal(result.definition.archetype, '俊敏な猫');
  } finally {
    if (previous) process.env.OPENAI_API_KEY = previous;
  }
});
