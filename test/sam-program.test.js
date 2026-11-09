import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProgram } from '../public/sam/move-program.js';
import { createMatch, stepMatch } from '../public/sam/engine.js';

const eventAction = (action, value = 8) => ({ nodes: [
  { id: 'n1', kind: 'event', event: 'activate', next: 'n2' },
  { id: 'n2', kind: 'action', action, value, range: 250, duration: 90, chance: 100 }
] });

test('program validates node vocabulary, links and size', () => {
  assert.throws(() => normalizeProgram({ nodes: [{ id: 'n1', kind: 'action', action: 'javascript' }] }));
  assert.throws(() => normalizeProgram({ nodes: [{ id: 'n1', kind: 'event', event: 'activate', next: 'n3' }] }));
  assert.throws(() => normalizeProgram({ nodes: Array.from({ length: 17 }, (_, i) => ({ id: `n${i + 1}`, kind: 'action', action: 'damage' })) }));
  assert.equal(normalizeProgram(eventAction('damage', 999), true).nodes[1].value, 25);
});

test('projectile travels and damages an opponent in the same match engine', () => {
  const match = createMatch({ mode: 'training', move: { damage: 2, range: 30, program: eventAction('projectile') } });
  match.fighters[0].x = 300; match.fighters[1].x = 450;
  match.fighters[0].grounded = true; match.fighters[1].grounded = true;
  for (let i = 0; i < 45; i++) stepMatch(match, [{ attack: i === 0 }, {}]);
  assert.ok(match.fighters[1].damage >= 8);
});

test('wait node schedules a later action and bounded cycles finish', () => {
  const match = createMatch({ mode: 'training', move: { program: { nodes: [
    { id: 'n1', kind: 'event', event: 'activate', next: 'n2' },
    { id: 'n2', kind: 'wait', value: 5, next: 'n3' },
    { id: 'n3', kind: 'action', action: 'heal', value: 10, next: 'n2' }
  ] } } });
  match.fighters[0].damage = 60; match.fighters[0].grounded = true;
  for (let i = 0; i < 8; i++) stepMatch(match, [{ attack: i === 0 }, {}]);
  assert.equal(match.fighters[0].damage, 60);
  for (let i = 0; i < 30; i++) stepMatch(match, [{}, {}]);
  assert.ok(match.fighters[0].damage < 60);
  assert.ok(match.scheduled.length <= 32);
});

test('normal matches cap repeated actions in one frame', () => {
  const match = createMatch({ move: { program: { nodes: [
    { id: 'n1', kind: 'event', event: 'activate', next: 'n2' },
    { id: 'n2', kind: 'repeat', value: 3, next: 'n3', alternate: 'n4' },
    { id: 'n3', kind: 'action', action: 'heal', value: 25 },
    { id: 'n4', kind: 'repeat', value: 3, next: 'n3', alternate: 'n5' },
    { id: 'n5', kind: 'repeat', value: 3, next: 'n3' }
  ] } } });
  match.fighters[0].damage = 200;
  for (let i = 0; i < 8; i++) stepMatch(match, [{ attack: i === 0 }, {}]);
  assert.equal(match.fighters[0].damage, 50);
});
