import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSamMove } from '../src/sam-ai.js';

const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64');

test('Gemini move generation sends image data and validates game bounds', async () => {
  const result = await generateSamMove({ attackArt: png, name: '炎の剣', description: '炎で攻撃' }, {
    key: 'test-key', model: 'test-model', fetcher: async (url, init) => {
      assert.match(url, /test-model:generateContent$/);
      assert.equal(init.headers['x-goog-api-key'], 'test-key');
      const body = JSON.parse(init.body);
      assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/png');
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        name: '火炎斬り', description: '炎を前方へ飛ばす', damage: 9999, knockback: 12,
        range: 180, startup: 20, recovery: 28, cooldown: 35
      }) }] } }] }), { status: 200 });
    }
  });
  assert.equal(result.provider, 'gemini');
  assert.equal(result.move.damage, 999);
  assert.equal(result.balance.balanced.damage, 25);
});

test('Gemini move generation rejects missing credentials and invalid image data', async () => {
  await assert.rejects(generateSamMove({ attackArt: png }, { key: '' }), /キー/);
  await assert.rejects(generateSamMove({ attackArt: 'data:image/png;base64,AAAA' }, { key: 'test' }), /PNG/);
});

test('Gemini move generation accepts a larger character drawing alongside the move image', async () => {
  const character = 'data:image/png;base64,' + Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(30000)
  ]).toString('base64');
  const result = await generateSamMove({ attackArt: png, characterArt: character }, {
    key: 'test', fetcher: async (_url, init) => {
      const parts = JSON.parse(init.body).contents[0].parts;
      assert.equal(parts.length, 3);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        name: '星', description: '光の攻撃', damage: 10, knockback: 6, range: 65, startup: 8, recovery: 18, cooldown: 12
      }) }] } }] }), { status: 200 });
    }
  });
  assert.equal(result.move.name, '星');
});
