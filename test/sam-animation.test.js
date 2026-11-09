import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_STATES, normalizeAnimations, animationFrameAt, fighterAnimationState } from '../public/sam/animation.js';

const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');

test('animation project is bounded and frames loop at the selected FPS', () => {
  const animations = normalizeAnimations({ walk: { fps: 10, loop: true,
    frames: [{ png }, { png: png + 'AA' }, { png: png + 'AAA' }] } });
  assert.equal(ANIMATION_STATES.length, 12);
  assert.equal(animationFrameAt(animations, 'walk', 0), animations.walk.frames[0]);
  assert.equal(animationFrameAt(animations, 'walk', 6), animations.walk.frames[1]);
  assert.equal(animationFrameAt(animations, 'walk', 18), animations.walk.frames[0]);
  assert.equal(animationFrameAt(animations, 'jump', 0), null);
});

test('missing animation uses idle and invalid data is removed', () => {
  const animations = normalizeAnimations({ idle: { fps: 99, frames: [{ png, pivot: { x: 90, y: -5 } }, { png: 'unsafe' }] } });
  assert.equal(animations.idle.fps, 30);
  assert.equal(animations.idle.frames.length, 1);
  assert.equal(animations.idle.frames[0].pivot.x, 64);
  assert.equal(animations.idle.frames[0].pivot.y, 0);
  assert.equal(animationFrameAt(animations, 'attack', 30), animations.idle.frames[0]);
});

test('fighter movement and combat states choose the matching clip', () => {
  const fighter = { stocks: 3, grounded: true, vx: 0, vy: 0, attackFrame: -1, stun: 0, dodge: 0, shield: false };
  assert.equal(fighterAnimationState(fighter, null), 'idle');
  fighter.vx = 6;
  assert.equal(fighterAnimationState(fighter, null), 'run');
  fighter.attackFrame = 2; fighter.attackType = 'special';
  assert.equal(fighterAnimationState(fighter, null), 'special');
  fighter.stun = 5;
  assert.equal(fighterAnimationState(fighter, null), 'hurt');
  fighter.stocks = 0;
  assert.equal(fighterAnimationState(fighter, null), 'ko');
});
