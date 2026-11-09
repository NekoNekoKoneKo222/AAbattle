export const EVENTS = ['activate', 'hit', 'miss', 'attacked', 'land', 'ko', 'timer'];
export const CONDITIONS = ['distance_lt', 'damage_gte', 'airborne', 'enemy_airborne', 'chance', 'enemy_burning'];
export const ACTIONS = ['damage', 'projectile', 'laser', 'explosion', 'mine', 'turret', 'summon',
  'teleport', 'heal', 'shield', 'push', 'pull', 'slow', 'burn', 'silence', 'counter',
  'reflect', 'absorb', 'buff', 'gravity', 'transform'];
export const KINDS = ['event', 'condition', 'action', 'wait', 'repeat', 'random', 'parallel'];
export const MAX_NODES = 16;
export const MAX_STEPS = 32;
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;

export function normalizeProgram(value, balanced = false) {
  if (value == null) return { version: 1, nodes: [] };
  if (!value || typeof value !== 'object' || !Array.isArray(value.nodes) || value.nodes.length > MAX_NODES) {
    throw new Error('技プログラムは16ノード以内にしてください。');
  }
  const ids = new Set();
  const nodes = value.nodes.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        typeof entry.id !== 'string' || !/^n[1-9][0-9]{0,2}$/.test(entry.id) || ids.has(entry.id) ||
        !KINDS.includes(entry.kind)) throw new Error('技ノードの種類または番号が不正です。');
    ids.add(entry.id);
    const node = { id: entry.id, kind: entry.kind,
      next: typeof entry.next === 'string' ? entry.next : null,
      alternate: typeof entry.alternate === 'string' ? entry.alternate : null,
      value: clamp(entry.value, 0, balanced ? 25 : 100, 10),
      range: clamp(entry.range, 10, balanced ? 150 : 500, 80),
      duration: clamp(entry.duration, 1, balanced ? 120 : 180, 60),
      chance: clamp(entry.chance, 1, 100, 100) };
    if (node.kind === 'event') {
      if (!EVENTS.includes(entry.event)) throw new Error('技イベントが不正です。');
      node.event = entry.event;
    }
    if (node.kind === 'condition') {
      if (!CONDITIONS.includes(entry.test)) throw new Error('技の条件が不正です。');
      node.test = entry.test;
    }
    if (node.kind === 'action') {
      if (!ACTIONS.includes(entry.action)) throw new Error('技の効果が不正です。');
      node.action = entry.action;
    }
    if (node.kind === 'repeat') node.value = clamp(entry.value, 1, 3, 2);
    if (node.kind === 'wait') node.value = clamp(entry.value, 1, 90, 15);
    if (node.kind === 'random') node.value = clamp(entry.value, 1, 99, 50);
    return node;
  });
  for (const node of nodes) {
    if (node.next && !ids.has(node.next)) throw new Error('接続先のノードが見つかりません。');
    if (node.alternate && !ids.has(node.alternate)) throw new Error('分岐先のノードが見つかりません。');
  }
  return { version: 1, nodes };
}

export function runProgram(match, owner, event, action) {
  if (match.programRunning) return;
  const nodes = match.program?.nodes || [];
  if (!nodes.length) return;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const pending = nodes.filter((node) => node.kind === 'event' && node.event === event && node.next)
    .map((node) => ({ id: node.next, owner }));
  match.programRunning = true;
  try { execute(match, byId, pending, action); } finally { match.programRunning = false; }
}

export function resumeProgram(match, action) {
  if (!match.scheduled?.length) return;
  const ready = match.scheduled.filter((item) => item.due <= match.frame);
  match.scheduled = match.scheduled.filter((item) => item.due > match.frame);
  if (!ready.length) return;
  const byId = new Map((match.program?.nodes || []).map((node) => [node.id, node]));
  if (match.programRunning) return;
  match.programRunning = true;
  try { execute(match, byId, ready, action); } finally { match.programRunning = false; }
}

function execute(match, byId, pending, action) {
  let steps = 0;
  while (pending.length && steps++ < MAX_STEPS) {
    const item = pending.shift();
    const node = byId.get(item.id);
    if (!node) continue;
    const next = (id) => { if (id) pending.push({ id, owner: item.owner }); };
    const self = match.fighters[item.owner];
    const enemy = match.fighters[1 - item.owner];
    if (!self || !enemy || self.stocks <= 0) continue;
    if (node.kind === 'condition') {
      const distance = Math.abs(self.x - enemy.x);
      const passed = {
        distance_lt: distance < node.value,
        damage_gte: self.damage >= node.value,
        airborne: !self.grounded,
        enemy_airborne: !enemy.grounded,
        chance: (match.frame * 37 + item.owner * 53 + steps * 17) % 100 < node.value,
        enemy_burning: enemy.status?.burn > 0
      }[node.test];
      next(passed ? node.next : node.alternate);
    } else if (node.kind === 'action') {
      if ((match.frame * 31 + item.owner * 43 + steps * 19) % 100 < node.chance) action(match, item.owner, node);
      next(node.next);
    } else if (node.kind === 'wait') {
      match.scheduled ||= [];
      if (node.next && match.scheduled.length < 32) match.scheduled.push({ id: node.next, owner: item.owner, due: match.frame + node.value });
    } else if (node.kind === 'repeat') {
      const target = byId.get(node.next);
      if (target?.kind === 'action') for (let count = 0; count < node.value && steps < MAX_STEPS; count++) {
        steps++; action(match, item.owner, target);
      }
      next(node.alternate);
    } else if (node.kind === 'random') next((match.frame * 29 + steps * 47) % 100 < node.value ? node.next : node.alternate);
    else if (node.kind === 'parallel') { next(node.next); next(node.alternate); }
    else if (node.kind === 'event') next(node.next);
  }
}
