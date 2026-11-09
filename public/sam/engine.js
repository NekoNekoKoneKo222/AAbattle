import { normalizeProgram, runProgram, resumeProgram } from './move-program.js';
export const STEP = 1 / 60;
export const WIDTH = 960;
export const HEIGHT = 540;
export const DEFAULT_STAGE = { name: 'SKYLINE', platforms: [
  { x: 120, y: 430, w: 720, h: 26 },
  { x: 205, y: 330, w: 160, h: 16 },
  { x: 595, y: 330, w: 160, h: 16 },
  { x: 410, y: 250, w: 140, h: 16 }
] };
export const DEFAULT_MOVE = { name: 'スケッチブロー', damage: 10, knockback: 7, range: 66, startup: 8, recovery: 18, cooldown: 12 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export function balanceMove(move) {
  const original = { ...move };
  const balanced = {
    ...move,
    damage: clamp(move.damage, 2, 25),
    knockback: clamp(move.knockback, 2, 18),
    range: clamp(move.range, 30, 150),
    startup: clamp(move.startup, 5, 45),
    recovery: clamp(move.recovery, 10, 45),
    cooldown: clamp(move.cooldown, 8, 90)
  };
  const pressure = balanced.damage * balanced.range / (balanced.startup + balanced.recovery + balanced.cooldown);
  if (pressure > 70) balanced.recovery = clamp(Math.ceil(balanced.recovery * pressure / 70), 10, 60);
  if (pressure < 8 && balanced.damage < 8) balanced.damage = 8;
  return { original, balanced };
}

export function createMatch({ mode = 'cpu', stage = DEFAULT_STAGE, move = DEFAULT_MOVE, free = false } = {}) {
  const attack = free ? balanceMove(move).original : balanceMove(move).balanced;
  const platforms = (stage.platforms || []).slice(0, 24).map((p) => ({
    x: clamp(p.x, 0, WIDTH), y: clamp(p.y, 80, HEIGHT - 20),
    w: clamp(p.w, 30, WIDTH), h: clamp(p.h, 8, 40)
  }));
  return { mode, free, stage: { name: String(stage.name || 'STAGE').slice(0, 24), platforms }, attack,
    program: normalizeProgram(move.program, !free), entities: [], scheduled: [],
    frame: 0, timer: 7 * 60 * 60, hitstop: 0, effect: null, winner: null,
    fighters: [makeFighter(270, 0, '#72f3c6'), makeFighter(690, 1, '#ff8d99')] };
}

function makeFighter(x, index, color) {
  return { x, y: 340, vx: 0, vy: 0, width: 42, height: 58, facing: index ? -1 : 1,
    color, damage: 0, stocks: 3, grounded: false, jumps: 0, stun: 0,
    shield: false, shieldPower: 100, invincible: 0, attackFrame: -1, attackType: 'normal',
    attackHit: false, cooldown: 0, dodge: 0, landing: 0, grab: 0,
    status: { burn: 0, slow: 0, silence: 0, counter: 0, reflect: 0, absorb: 0, buff: 0, gravity: 0, transform: 0 },
    counterPower: 0 };
}

function attackStats(match, fighter) {
  const base = match.attack;
  if (fighter.attackType === 'strong') return { ...base, damage: base.damage * 1.6, knockback: base.knockback * 1.5, startup: base.startup + 11, recovery: base.recovery + 11 };
  if (fighter.attackType === 'special') return { ...base, damage: base.damage * 1.25, range: base.range * 1.65, startup: base.startup + 7, recovery: base.recovery + 8 };
  if (fighter.attackType === 'air') return { ...base, damage: base.damage * 0.85, startup: Math.max(4, base.startup - 2) };
  return base;
}

export function cpuInput(match, index = 1, difficulty = 'normal') {
  const self = match.fighters[index];
  const enemy = match.fighters[1 - index];
  const gap = enemy.x - self.x;
  const distance = Math.abs(gap);
  const speed = { beginner: 0.3, normal: 0.65, hard: 0.85, expert: 1 }[difficulty] || 0.65;
  const react = Math.max(5, Math.round(27 * (1 - speed)));
  const decision = match.frame % react === 0;
  return {
    left: gap < -44, right: gap > 44, dash: distance > 220,
    jump: self.grounded && (self.x < 130 || self.x > 830 || (distance < 140 && enemy.y < self.y - 35)),
    attack: decision && distance < match.attack.range + 20,
    special: decision && distance >= match.attack.range && distance < match.attack.range * 1.7,
    shield: decision && enemy.attackFrame >= 0 && distance < 110,
    dodge: decision && self.damage > 55 && enemy.attackFrame >= 0 && distance < 70
  };
}

export function stepMatch(match, inputs = [{}, {}]) {
  if (match.winner !== null) return match;
  match.frame++;
  match.actionBudget = match.free ? 12 : 6;
  match.timer = Math.max(0, match.timer - 1);
  if (match.timer === 0) for (let index = 0; index < 2; index++) runProgram(match, index, 'timer', applyAction);
  if (match.effect && match.frame - match.effect.frame > 18) match.effect = null;
  if (match.hitstop > 0) { match.hitstop--; return match; }
  resumeProgram(match, applyAction);
  for (let index = 0; index < 2; index++) updateFighter(match, index, inputs[index] || {});
  for (let index = 0; index < 2; index++) resolveAttack(match, index);
  updateEntities(match);
  if (match.timer === 0) {
    const [a, b] = match.fighters;
    match.winner = a.stocks === b.stocks ? (a.damage <= b.damage ? 0 : 1) : (a.stocks > b.stocks ? 0 : 1);
  }
  return match;
}

function updateFighter(match, index, input) {
  const f = match.fighters[index];
  if (f.stocks <= 0) return;
  if (f.invincible) f.invincible--;
  if (f.stun) f.stun--;
  if (f.cooldown) f.cooldown--;
  if (f.dodge) f.dodge--;
  if (f.landing) f.landing--;
  if (f.grab) f.grab--;
  for (const key of Object.keys(f.status)) if (f.status[key] > 0) f.status[key]--;
  if (f.status.burn && match.frame % 30 === 0) f.damage = clamp(f.damage + 1, 0, 999);
  f.shield = Boolean(input.shield && f.grounded && f.shieldPower > 0 && !f.stun && f.attackFrame < 0);
  f.shieldPower = clamp(f.shieldPower + (f.shield ? -0.35 : 0.16), 0, 100);
  if (f.shieldPower <= 0 && f.shield) { f.shield = false; f.stun = 90; }
  if (!f.stun && !f.shield) {
    const axis = Number(Boolean(input.right)) - Number(Boolean(input.left));
    const speed = (input.dash ? 6.8 : 4.5) * (f.status.slow ? .55 : 1) * (f.status.transform ? 1.2 : 1);
    f.vx += (axis * speed - f.vx) * (f.grounded ? 0.32 : 0.13);
    if (axis) f.facing = axis;
    if (input.jump && (f.grounded || f.jumps < 2) && !f.landing) {
      f.vy = f.grounded ? -12 : -10;
      f.jumps = f.grounded ? 1 : f.jumps + 1;
      f.grounded = false;
    }
    if (input.down && !f.grounded) f.vy += 0.7;
    if (input.dodge && !f.dodge && f.cooldown === 0) { f.dodge = 14; f.invincible = Math.max(f.invincible, 11); f.cooldown = 38; f.vx = f.facing * 9; }
    if (input.grab && f.grounded && !f.grab && f.attackFrame < 0 && !f.cooldown) {
      f.grab = 16; f.cooldown = 32;
      const enemy = match.fighters[1 - index];
      if (Math.abs(enemy.x - f.x) < 54 && Math.abs(enemy.y - f.y) < 55 && !enemy.invincible) {
        enemy.shield = false;
        hit(match, index, 1 - index, 5, 8, true);
      }
    }
    if (f.attackFrame < 0 && f.cooldown === 0 && !f.landing) {
      const type = input.special && !f.status.silence ? 'special' : input.strong ? 'strong' : input.attack ? (f.grounded ? 'normal' : 'air') : null;
      if (type) { f.attackType = type; f.attackFrame = 0; f.attackHit = false; }
    }
  }
  if (f.attackFrame >= 0) {
    f.attackFrame++;
    const attack = attackStats(match, f);
    if (f.attackFrame === attack.startup) runProgram(match, index, 'activate', applyAction);
    if (f.attackFrame > attack.startup + attack.recovery + 5) {
      if (!f.attackHit) runProgram(match, index, 'miss', applyAction);
      f.attackFrame = -1;
      f.cooldown = attack.cooldown;
    }
  }
  const oldBottom = f.y + f.height / 2;
  const oldX = f.x;
  f.vy = clamp(f.vy + (f.status.gravity ? .9 : .56), -18, 16);
  f.x += f.vx;
  f.y += f.vy;
  const wasGrounded = f.grounded;
  f.grounded = false;
  if (f.vy >= 0) for (const p of match.stage.platforms) {
    if (oldBottom <= p.y + 9 && f.y + f.height / 2 >= p.y &&
        f.x + f.width / 2 > p.x && f.x - f.width / 2 < p.x + p.w) {
      f.y = p.y - f.height / 2;
      f.vy = 0;
      f.grounded = true;
      f.jumps = 0;
      if (oldBottom < p.y - 10) f.landing = Math.max(f.landing, 3);
      break;
    }
  }
  if (!wasGrounded && f.grounded) runProgram(match, index, 'land', applyAction);
  if (!f.grounded && (f.x < 12 || f.x > WIDTH - 12) && f.vy > 0 && f.y < HEIGHT - 80) {
    f.x = clamp(f.x, 12, WIDTH - 12);
    f.vx = -f.vx * 0.6;
    if (!f.stun && input.jump) { f.vy = -10; f.jumps = 1; }
  }
  if (f.x < -100 || f.x > WIDTH + 100 || f.y > HEIGHT + 110 || f.y < -170) {
    runProgram(match, index, 'ko', applyAction);
    f.stocks--;
    match.effect = { x: oldX, y: f.y, frame: match.frame, kind: 'ko' };
    if (f.stocks <= 0) { match.winner = 1 - index; return; }
    const remaining = f.stocks;
    Object.assign(f, makeFighter(index ? 690 : 270, index, f.color));
    f.stocks = remaining;
    f.invincible = 120;
  }
}

function resolveAttack(match, index) {
  const f = match.fighters[index];
  const enemy = match.fighters[1 - index];
  if (f.attackFrame < 0 || f.attackHit || enemy.stocks <= 0) return;
  const attack = attackStats(match, f);
  if (f.attackFrame < attack.startup || f.attackFrame > attack.startup + 5) return;
  const distance = (enemy.x - f.x) * f.facing;
  if (distance < -14 || distance > attack.range || Math.abs(enemy.y - f.y) > 58) return;
  f.attackHit = true;
  if (enemy.invincible) return;
  if (enemy.shield) {
    enemy.shieldPower = Math.max(0, enemy.shieldPower - attack.damage * 1.7);
    enemy.vx += f.facing * 2;
    match.effect = { x: enemy.x, y: enemy.y, frame: match.frame, kind: 'block' };
    return;
  }
  hit(match, index, 1 - index, attack.damage, attack.knockback);
  runProgram(match, index, 'hit', applyAction);
}

function hit(match, attacker, victim, damage, knockback, throwHit = false) {
  const f = match.fighters[attacker];
  const enemy = match.fighters[victim];
  if (enemy.invincible || enemy.stocks <= 0) return;
  if (enemy.status.absorb) { enemy.damage = Math.max(0, enemy.damage - damage * .5); enemy.status.absorb = 0; return; }
  if (enemy.status.reflect) { enemy.status.reflect = 0; hit(match, victim, attacker, damage * .6, knockback * .6); return; }
  if (f.status.buff) damage *= 1.3;
  enemy.damage = clamp(enemy.damage + damage, 0, 999);
  const force = (knockback + enemy.damage * 0.11) * (throwHit ? 1.1 : 1);
  enemy.vx = f.facing * force * 0.65;
  enemy.vy = -Math.max(5, force * 0.72);
  enemy.stun = Math.round(clamp(force * 1.5, 8, 48));
  enemy.attackFrame = -1;
  enemy.grounded = false;
  match.hitstop = Math.round(clamp(damage / 3, 3, 10));
  match.effect = { x: enemy.x, y: enemy.y, frame: match.frame, kind: 'hit' };
  if (enemy.status.counter) { const power = enemy.counterPower || 5; enemy.status.counter = 0; hit(match, victim, attacker, power, Math.max(3, power / 2)); }
  runProgram(match, victim, 'attacked', applyAction);
}

function applyAction(match, owner, node) {
  if (match.actionBudget <= 0) return;
  match.actionBudget--;
  const self = match.fighters[owner], enemy = match.fighters[1 - owner];
  const power = Math.max(1, node.value), range = node.range, duration = node.duration;
  const close = Math.abs(self.x - enemy.x) <= range && Math.abs(self.y - enemy.y) <= 90;
  const effect = (kind, x = enemy.x, y = enemy.y) => { match.effect = { kind, x, y, frame: match.frame }; };
  if (node.action === 'damage' && close) hit(match, owner, 1 - owner, power, Math.max(3, power / 2));
  else if (['projectile','laser','explosion','mine','turret','summon'].includes(node.action)) {
    if (match.entities.length >= 16) return;
    const kind = node.action;
    match.entities.push({ kind, owner, x: self.x + self.facing * 32, y: self.y,
      vx: self.facing * (kind === 'projectile' ? 8 : kind === 'summon' ? 3 : 0),
      ttl: Math.min(duration, kind === 'laser' || kind === 'explosion' ? 12 : 180),
      damage: power, range: Math.min(range, kind === 'explosion' ? 110 : 500),
      nextHit: match.frame + (kind === 'mine' ? 18 : 0), hits: 0 });
    effect(kind, self.x, self.y);
  } else if (node.action === 'teleport') { self.x = clamp(self.x + self.facing * range, 20, WIDTH - 20); effect('teleport', self.x, self.y); }
  else if (node.action === 'heal') { self.damage = Math.max(0, self.damage - power); effect('heal', self.x, self.y); }
  else if (node.action === 'shield') { self.shieldPower = Math.min(100, self.shieldPower + power); effect('shield', self.x, self.y); }
  else if ((node.action === 'push' || node.action === 'pull') && close) { enemy.vx += self.facing * (node.action === 'push' ? 1 : -1) * Math.min(12, power); effect(node.action); }
  else if (['slow','burn','silence','gravity'].includes(node.action) && close) { enemy.status[node.action] = Math.max(enemy.status[node.action], duration); effect(node.action); }
  else if (['counter','reflect','absorb','buff','transform'].includes(node.action)) { self.status[node.action] = Math.max(self.status[node.action], duration); if (node.action === 'counter') self.counterPower = power; effect(node.action, self.x, self.y); }
}

function updateEntities(match) {
  for (const entity of match.entities) {
    entity.x += entity.vx;
    entity.ttl--;
    if (match.frame < entity.nextHit) continue;
    const enemy = match.fighters[1 - entity.owner];
    const radius = entity.kind === 'explosion' ? entity.range : entity.kind === 'laser' ? entity.range : 30;
    const inRange = entity.kind === 'laser'
      ? (enemy.x - entity.x) * match.fighters[entity.owner].facing >= 0 && Math.abs(enemy.x - entity.x) <= radius && Math.abs(enemy.y - entity.y) < 48
      : Math.abs(enemy.x - entity.x) <= radius && Math.abs(enemy.y - entity.y) <= (entity.kind === 'explosion' ? radius : 72);
    if (inRange && enemy.stocks > 0 && !enemy.invincible) {
      if (enemy.shield) { enemy.shieldPower = Math.max(0, enemy.shieldPower - entity.damage); match.effect = { x: enemy.x, y: enemy.y, frame: match.frame, kind: 'block' }; }
      else hit(match, entity.owner, 1 - entity.owner, entity.damage, Math.max(3, entity.damage / 2));
      entity.hits++;
      entity.nextHit = match.frame + 30;
      if (['projectile','laser','explosion','mine'].includes(entity.kind)) entity.ttl = 0;
    }
  }
  match.entities = match.entities.filter((entity) => entity.ttl > 0 && entity.x > -50 && entity.x < WIDTH + 50 && entity.hits < 3);
}
