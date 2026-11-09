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
    frame: 0, timer: 7 * 60 * 60, hitstop: 0, effect: null, winner: null,
    fighters: [makeFighter(270, 0, '#72f3c6'), makeFighter(690, 1, '#ff8d99')] };
}

function makeFighter(x, index, color) {
  return { x, y: 340, vx: 0, vy: 0, width: 42, height: 58, facing: index ? -1 : 1,
    color, damage: 0, stocks: 3, grounded: false, jumps: 0, stun: 0,
    shield: false, shieldPower: 100, invincible: 0, attackFrame: -1, attackType: 'normal',
    attackHit: false, cooldown: 0, dodge: 0, landing: 0, grab: 0 };
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
  match.timer = Math.max(0, match.timer - 1);
  if (match.effect && match.frame - match.effect.frame > 18) match.effect = null;
  if (match.hitstop > 0) { match.hitstop--; return match; }
  for (let index = 0; index < 2; index++) updateFighter(match, index, inputs[index] || {});
  for (let index = 0; index < 2; index++) resolveAttack(match, index);
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
  f.shield = Boolean(input.shield && f.grounded && f.shieldPower > 0 && !f.stun && f.attackFrame < 0);
  f.shieldPower = clamp(f.shieldPower + (f.shield ? -0.35 : 0.16), 0, 100);
  if (f.shieldPower <= 0 && f.shield) { f.shield = false; f.stun = 90; }
  if (!f.stun && !f.shield) {
    const axis = Number(Boolean(input.right)) - Number(Boolean(input.left));
    const speed = input.dash ? 6.8 : 4.5;
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
      const type = input.special ? 'special' : input.strong ? 'strong' : input.attack ? (f.grounded ? 'normal' : 'air') : null;
      if (type) { f.attackType = type; f.attackFrame = 0; f.attackHit = false; }
    }
  }
  if (f.attackFrame >= 0) {
    f.attackFrame++;
    const attack = attackStats(match, f);
    if (f.attackFrame > attack.startup + attack.recovery + 5) {
      f.attackFrame = -1;
      f.cooldown = attack.cooldown;
    }
  }
  const oldBottom = f.y + f.height / 2;
  const oldX = f.x;
  f.vy = clamp(f.vy + 0.56, -18, 16);
  f.x += f.vx;
  f.y += f.vy;
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
  if (!f.grounded && (f.x < 12 || f.x > WIDTH - 12) && f.vy > 0 && f.y < HEIGHT - 80) {
    f.x = clamp(f.x, 12, WIDTH - 12);
    f.vx = -f.vx * 0.6;
    if (!f.stun && input.jump) { f.vy = -10; f.jumps = 1; }
  }
  if (f.x < -100 || f.x > WIDTH + 100 || f.y > HEIGHT + 110 || f.y < -170) {
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
}

function hit(match, attacker, victim, damage, knockback, throwHit = false) {
  const f = match.fighters[attacker];
  const enemy = match.fighters[victim];
  enemy.damage = clamp(enemy.damage + damage, 0, 999);
  const force = (knockback + enemy.damage * 0.11) * (throwHit ? 1.1 : 1);
  enemy.vx = f.facing * force * 0.65;
  enemy.vy = -Math.max(5, force * 0.72);
  enemy.stun = Math.round(clamp(force * 1.5, 8, 48));
  enemy.attackFrame = -1;
  enemy.grounded = false;
  match.hitstop = Math.round(clamp(damage / 3, 3, 10));
  match.effect = { x: enemy.x, y: enemy.y, frame: match.frame, kind: 'hit' };
}
