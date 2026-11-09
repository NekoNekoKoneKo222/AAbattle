export const ANIMATION_STATES = ['idle', 'walk', 'run', 'jump', 'fall', 'attack', 'special', 'shield', 'dodge', 'hurt', 'ko', 'victory'];
const png = (value) => typeof value === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]{1,90000}$/.test(value);
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || min));

export function normalizeAnimations(value) {
  const result = {};
  for (const state of ANIMATION_STATES) {
    const entry = value?.[state];
    if (!entry || !Array.isArray(entry.frames)) continue;
    const frames = entry.frames.slice(0, 16).filter((frame) => frame && png(frame.png)).map((frame) => ({
      png: frame.png,
      layers: Array.isArray(frame.layers) ? frame.layers.slice(0, 6).filter((layer) => layer && png(layer.src)).map((layer) => ({
        src: layer.src, name: String(layer.name || 'レイヤー').slice(0, 24), visible: layer.visible !== false
      })) : [],
      pivot: { x: clamp(frame.pivot?.x ?? 32, 0, 64), y: clamp(frame.pivot?.y ?? 36, 0, 64) }
    }));
    if (frames.length) result[state] = { fps: clamp(entry.fps, 1, 30), loop: entry.loop !== false, frames };
  }
  return result;
}

export function animationFrameAt(animations, state, tick) {
  const clip = animations?.[state]?.frames?.length ? animations[state] : animations?.idle;
  if (!clip?.frames?.length) return null;
  const elapsed = Math.max(0, Math.floor(tick / (60 / clip.fps)));
  const index = clip.loop ? elapsed % clip.frames.length : Math.min(elapsed, clip.frames.length - 1);
  return clip.frames[index];
}

export function fighterAnimationState(fighter, winner) {
  if (fighter.stocks <= 0) return 'ko';
  if (winner !== null && winner !== undefined) return 'victory';
  if (fighter.stun) return 'hurt';
  if (fighter.dodge) return 'dodge';
  if (fighter.shield) return 'shield';
  if (fighter.attackFrame >= 0) return fighter.attackType === 'special' ? 'special' : 'attack';
  if (!fighter.grounded) return fighter.vy < 0 ? 'jump' : 'fall';
  if (Math.abs(fighter.vx) > 5) return 'run';
  if (Math.abs(fighter.vx) > 1) return 'walk';
  return 'idle';
}
