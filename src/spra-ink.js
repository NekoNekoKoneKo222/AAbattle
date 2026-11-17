// Server-authoritative organic ink surface for the SPRA top-down arena.
// Eight coverage samples per world unit give smooth-edged turf and accurate scoring.
export const INK_SCALE = 8;

export function createInkSurface(width, height, walls = []) {
  const pixelWidth = width * INK_SCALE;
  const pixelHeight = height * INK_SCALE;
  const paint = new Uint8Array(pixelWidth * pixelHeight);
  const changed = new Map();
  const counts = [0, 0];

  const valid = (x, y) => x >= 1 && y >= 1 && x < width - 1 && y < height - 1 &&
    !walls.some(w => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h);
  let paintable = 0;
  for (let iy = 0; iy < pixelHeight; iy++) {
    for (let ix = 0; ix < pixelWidth; ix++) {
      if (valid((ix + 0.5) / INK_SCALE, (iy + 0.5) / INK_SCALE)) paintable++;
    }
  }

  function mark(ix, iy, team) {
    if (team !== 0 && team !== 1) return;
    if (ix < 0 || iy < 0 || ix >= pixelWidth || iy >= pixelHeight) return;
    if (!valid((ix + 0.5) / INK_SCALE, (iy + 0.5) / INK_SCALE)) return;
    const index = iy * pixelWidth + ix;
    const value = team + 1;
    const previous = paint[index];
    if (previous === value) return;
    if (previous) counts[previous - 1]--;
    counts[team]++;
    paint[index] = value;
    changed.set(index, value);
  }
  function seedRandom(seed, index) {
    const n = Math.sin(seed * 1.173 + index * 76.91 + 0.43) * 43758.5453;
    return n - Math.floor(n);
  }

  // Shape stamps: rotated, asymmetrical, and band-limited to avoid block outlines.
  function ellipse(x, y, radius, team, direction = 0, stretch = 1, seed = 1) {
    if (![x, y, radius, direction, stretch].every(Number.isFinite) || radius <= 0) return;
    const rx = radius * Math.max(0.5, stretch);
    const ry = radius / Math.sqrt(Math.max(0.5, stretch));
    const reach = Math.max(rx, ry) * 1.28;
    const x0 = Math.max(0, Math.floor((x - reach) * INK_SCALE));
    const y0 = Math.max(0, Math.floor((y - reach) * INK_SCALE));
    const x1 = Math.min(pixelWidth - 1, Math.ceil((x + reach) * INK_SCALE));
    const y1 = Math.min(pixelHeight - 1, Math.ceil((y + reach) * INK_SCALE));
    const cs = Math.cos(direction), sn = Math.sin(direction);
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        const dx = (ix + 0.5) / INK_SCALE - x;
        const dy = (iy + 0.5) / INK_SCALE - y;
        const u = (dx * cs + dy * sn) / rx;
        const v = (-dx * sn + dy * cs) / ry;
        const angle = Math.atan2(v, u);
        const edge = 1 + 0.11 * Math.sin(3 * angle + seed * 0.47) +
          0.08 * Math.sin(7 * angle - seed * 0.27) +
          0.04 * Math.cos(11 * angle + seed * 0.13);
        if (u * u + v * v <= edge * edge) mark(ix, iy, team);
      }
    }
  }

  // Splashes have a body, directional fingers and detached small droplets.
  function impact(x, y, radius, team, direction = 0, seed = 1, style = 'impact') {
    const forward = style === 'shooter' ? 1.35 : style === 'roller' ? 1.15 : 1;
    ellipse(x, y, radius * (style === 'bomb' ? 1.0 : 0.79), team, direction, forward, seed);
    const fingers = style === 'bomb' ? 12 : style === 'roller' ? 6 : 8;
    for (let i = 0; i < fingers; i++) {
      const jitter = (seedRandom(seed, i + 1) - 0.5) * 0.5;
      const angle = direction + (i / fingers) * Math.PI * 2 + jitter;
      const reach = radius * (0.65 + 0.55 * seedRandom(seed, i + 21));
      const offset = radius * (0.36 + 0.32 * seedRandom(seed, i + 31));
      const width = radius * (0.15 + 0.16 * seedRandom(seed, i + 41));
      ellipse(x + Math.cos(angle) * offset, y + Math.sin(angle) * offset,
        width, team, angle, reach / Math.max(width * 2, 0.1), seed + i + 2);
    }
    const drops = style === 'bomb' ? 22 : style === 'roller' ? 8 : 14;
    for (let i = 0; i < drops; i++) {
      const a = seedRandom(seed, i + 110) * Math.PI * 2;
      const d = radius * (0.74 + 0.63 * seedRandom(seed, i + 140));
      const r = radius * (0.035 + 0.09 * seedRandom(seed, i + 180));
      ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, r, team, a, 1.1, seed + i);
    }
  }

  // Continuous roller bands and intermittent shooter droplets are distinct.
  function trail(x0, y0, x1, y1, radius, team, seed = 1, continuous = false) {
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length < 0.1) return;
    const direction = Math.atan2(y1 - y0, x1 - x0);
    const step = continuous ? Math.max(0.15, radius * 0.62) : Math.max(0.43, radius * 2.4);
    const steps = Math.min(100, Math.max(1, Math.ceil(length / step)));
    for (let i = 0; i <= steps; i++) {
      if (!continuous && seedRandom(seed, i + 215) < 0.27) continue;
      const t = i / steps;
      const side = (seedRandom(seed, i + 251) - 0.5) * radius * (continuous ? 0.3 : 1.5);
      const x = x0 + (x1 - x0) * t - Math.sin(direction) * side;
      const y = y0 + (y1 - y0) * t + Math.cos(direction) * side;
      const r = radius * (continuous ? 1 : 0.48 + seedRandom(seed, i + 264) * 0.72);
      ellipse(x, y, r, team, direction, continuous ? 1.28 : 1.8, seed + i);
    }
  }

  function sample(x, y) {
    if (!Number.isFinite(x + y)) return 0;
    const ix = Math.floor(x * INK_SCALE), iy = Math.floor(y * INK_SCALE);
    return ix < 0 || iy < 0 || ix >= pixelWidth || iy >= pixelHeight ? 0 :
      paint[iy * pixelWidth + ix];
  }
  function score() {
    return counts.map(count => Math.round(1000 * count / Math.max(1, paintable)) / 10);
  }
  // Ordered run lengths compress contiguous same-colour subpixels in network deltas.
  function flush() {
    if (!changed.size) return [];
    const indices = [...changed.keys()].sort((a, b) => a - b);
    const runs = [];
    let start = indices[0], last = start, value = changed.get(start), length = 1;
    for (let i = 1; i < indices.length; i++) {
      const index = indices[i], color = changed.get(index);
      if (index === last + 1 && color === value) {
        last = index;
        length++;
      } else {
        runs.push(start, length, value);
        start = last = index;
        value = color;
        length = 1;
      }
    }
    runs.push(start, length, value);
    changed.clear();
    return runs;
  }
  function clear() {
    paint.fill(0);
    counts[0] = counts[1] = 0;
    changed.clear();
  }
  return {
    width: pixelWidth, height: pixelHeight, paint, counts, paintable,
    impact, trail, sample, score, flush, clear,
    snapshot: () => Buffer.from(paint).toString('base64')
  };
}
