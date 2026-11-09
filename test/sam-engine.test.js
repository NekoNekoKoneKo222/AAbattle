import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceMove, createMatch, cpuInput, stepMatch } from '../public/sam/engine.js';

test('normal matches limit extreme moves while free matches keep originals', () => {
  const move = { damage: 999, knockback: 90, range: 500, startup: 1, recovery: 0, cooldown: 0 };
  const { original, balanced } = balanceMove(move);
  assert.equal(original.damage, 999);
  assert.ok(balanced.damage <= 25);
  assert.ok(balanced.range <= 150);
  assert.ok(balanced.startup >= 5);
  assert.equal(createMatch({ move, free: false }).attack.damage, balanced.damage);
  assert.equal(createMatch({ move, free: true }).attack.damage, 999);
});

test('drawn stage platforms catch falling fighters and KO reduces stocks', () => {
  const match = createMatch();
  for (let i = 0; i < 60; i++) stepMatch(match);
  assert.equal(match.fighters[0].grounded, true);
  assert.equal(match.fighters[0].y, 430 - match.fighters[0].height / 2);
  match.fighters[0].y = 700;
  stepMatch(match);
  assert.equal(match.fighters[0].stocks, 2);
  match.fighters[0].y = 700;
  stepMatch(match);
  match.fighters[0].y = 700;
  stepMatch(match);
  assert.equal(match.winner, 1);
});

test('hit raises damage and knockback, and shield blocks damage', () => {
  const match = createMatch();
  const [a, b] = match.fighters;
  a.x = 420; b.x = 470; a.y = b.y = 401;
  a.grounded = b.grounded = true;
  for (let i = 0; i < 12; i++) stepMatch(match, [{ attack: true }, {}]);
  assert.ok(b.damage > 0);
  assert.ok(b.vx > 0);
  const shielded = createMatch();
  shielded.fighters[0].x = 420; shielded.fighters[1].x = 470;
  shielded.fighters[0].y = shielded.fighters[1].y = 401;
  shielded.fighters[0].grounded = shielded.fighters[1].grounded = true;
  for (let i = 0; i < 12; i++) stepMatch(shielded, [{ attack: true }, { shield: true }]);
  assert.equal(shielded.fighters[1].damage, 0);
  assert.ok(shielded.fighters[1].shieldPower < 100);
});

test('CPU moves toward an opponent and attacks within range', () => {
  const match = createMatch();
  assert.equal(cpuInput(match, 1).left, true);
  match.fighters[1].x = match.fighters[0].x + 50;
  assert.equal(cpuInput(match, 1).attack, true);
});
