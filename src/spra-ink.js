// Server-authoritative organic ink surface for the SPRA top-down arena.
// Four coverage samples per world unit give smooth-edged turf and accurate scoring.
export const INK_SCALE = 4;

export function createInkSurface(width, height, walls = []) {
  const pixelWidth = width * INK_SCALE;
  const pixelHeight = height * INK_SCALE;
  const paint = new Uint8Array(pixelWidth * pixelHeight);
  const changed = new Map();
  const counts = [0, 0];

  const valid = (x, y) => x >= 1 && y >= 1 && x < width - 1 && y < height - 1 &&
    !walls.some(w => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h);
  // Precompute collision mask once, not for every subpixel of every shot.
  const paintableMask = new Uint8Array(pixelWidth * pixelHeight);
  let paintable = 0;
  for (let iy = 0; iy < pixelHeight; iy++) {
    for (let ix = 0; ix < pixelWidth; ix++) {
      const index = iy * pixelWidth + ix;
      if (valid((ix + 0.5) / INK_SCALE, (iy + 0.5) / INK_SCALE)) {
        paintableMask[index] = 1;
        paintable++;
      }
    }
  }

  function mark(ix, iy, team) {
    if (team !== 0 && team !== 1) return;
    if (ix < 0 || iy < 0 || ix >= pixelWidth || iy >= pixelHeight) return;
    const index = iy * pixelWidth + ix;
    if (!paintableMask[index]) return;
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
    // A small angular lookup table replaces three expensive sine calls
    // for every painted sample. Inside the core we can skip atan2 entirely.
    const bins = radius < .55 ? 16 : 32;
    const edgeSq = new Float32Array(bins);
    for (let i = 0; i < bins; i++) {
      const angle = (i + .5) * Math.PI * 2 / bins - Math.PI;
      const edge = 1 + .11 * Math.sin(3 * angle + seed * .47) +
        .08 * Math.sin(7 * angle - seed * .27) +
        .04 * Math.cos(11 * angle + seed * .13);
      edgeSq[i] = edge * edge;
    }
    const invAngle = bins / (Math.PI * 2);
    for (let iy = y0; iy <= y1; iy++) {
      const dy = (iy + .5) / INK_SCALE - y;
      for (let ix = x0; ix <= x1; ix++) {
        const dx = (ix + .5) / INK_SCALE - x;
        const u = (dx * cs + dy * sn) / rx;
        const v = (-dx * sn + dy * cs) / ry;
        const distanceSq = u * u + v * v;
        if (distanceSq > 1.55) continue;
        if (distanceSq < .65) { mark(ix, iy, team); continue; }
        const bin = Math.min(bins - 1, Math.max(0, Math.floor((Math.atan2(v,u) + Math.PI) * invAngle)));
        if (distanceSq <= edgeSq[bin]) mark(ix, iy, team);
      }
    }
  }

  // Fast disk stamp for high-frequency movement trails and small droplets.
  // Full organic ellipses are reserved for actual impact bursts.
  function disk(x,y,radius,team) {
    if(radius<=0||!Number.isFinite(x+y+radius))return;
    const x0=Math.max(0,Math.floor((x-radius)*INK_SCALE));
    const x1=Math.min(pixelWidth-1,Math.ceil((x+radius)*INK_SCALE));
    const y0=Math.max(0,Math.floor((y-radius)*INK_SCALE));
    const y1=Math.min(pixelHeight-1,Math.ceil((y+radius)*INK_SCALE));
    const rr=radius*radius;
    for(let iy=y0;iy<=y1;iy++){
      const dy=(iy+.5)/INK_SCALE-y;
      const dy2=dy*dy;
      if(dy2>rr)continue;
      const span=Math.sqrt(rr-dy2);
      const lo=Math.max(x0,Math.ceil((x-span)*INK_SCALE-.5));
      const hi=Math.min(x1,Math.floor((x+span)*INK_SCALE-.5));
      for(let ix=lo;ix<=hi;ix++)mark(ix,iy,team);
    }
  }

  // Organic splashes: one asymmetric main body, directional fingers, and
  // tiny detached droplets. Small details use the fast disk path.
  function impact(x,y,radius,team,direction=0,seed=1,style='impact'){
    if(radius<=0||!Number.isFinite(x+y+radius+direction))return;
    const forward=style==='shooter'?1.35:style==='roller'?1.15:1;
    ellipse(x,y,radius*(style==='bomb'?1:.79),team,direction,forward,seed);
    const fingers=style==='bomb'?8:style==='roller'?5:6;
    for(let i=0;i<fingers;i++){
      const angle=direction+i/fingers*Math.PI*2+
        (seedRandom(seed,i+1)-.5)*.5;
      const offset=radius*(.36+.3*seedRandom(seed,i+31));
      const reach=radius*(.63+.45*seedRandom(seed,i+21));
      const width=radius*(.16+.13*seedRandom(seed,i+41));
      const cs=Math.cos(angle),sn=Math.sin(angle);
      // Tiny connected discs are cheaper than full rotated ellipses.
      disk(x+cs*offset,y+sn*offset,width,team);
      disk(x+cs*(offset+reach*.23),y+sn*(offset+reach*.23),
           width*.8,team);
    }
    const drops=style==='bomb'?12:style==='roller'?5:8;
    for(let i=0;i<drops;i++){
      const angle=seedRandom(seed,i+110)*Math.PI*2;
      const distance=radius*(.74+.63*seedRandom(seed,i+140));
      disk(x+Math.cos(angle)*distance,y+Math.sin(angle)*distance,
           radius*(.05+.09*seedRandom(seed,i+180)),team);
    }
  }

  // Core fast path: no rotated ellipse, trig table or 15+ sub-ellipses per
  // point. A continuous roller/gum trail is made from overlapping fast disks.
  function trail(x0,y0,x1,y1,radius,team,seed=1,continuous=false){
    if(radius<=0)return;
    const dx=x1-x0,dy=y1-y0,length=Math.hypot(dx,dy);
    if(length<.001){
      disk(x0,y0,radius,team);
      return;
    }
    const step=continuous?Math.max(.14,radius*.8):Math.max(.7,radius*2.6);
    const steps=Math.min(100,Math.max(1,Math.ceil(length/step)));
    const inv=1/steps;
    const nx=-dy/length,ny=dx/length;
    for(let i=0;i<=steps;i++){
      if(!continuous&&seedRandom(seed,i+215)<.21)continue;
      const t=i*inv;
      const side=(seedRandom(seed,i+251)-.5)*radius*(continuous?.18:1.25);
      const r=radius*(continuous?1:.57+seedRandom(seed,i+264)*.57);
      const x=x0+dx*t+nx*side,y=y0+dy*t+ny*side;
      disk(x,y,r,team);
      if(continuous&&i%8===0)disk(x+nx*r*.72,y+ny*r*.72,r*.35,team);
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
  function flush(maxCells = Infinity) {
    if (!changed.size) return [];
    // Process a bounded batch at each broadcast. Unsent changes remain queued
    // rather than causing a multi-megabyte spike during intense CPU battles.
    const budget=Number.isFinite(maxCells)?Math.max(1,Math.floor(maxCells)):Infinity;
    const indices=[];
    for(const index of changed.keys()) {
      indices.push(index);
      if(indices.length>=budget)break;
    }
    indices.sort((a,b)=>a-b);
    const runs=[];
    let start=indices[0],last=start,value=changed.get(start),length=1;
    for(let i=1;i<indices.length;i++){
      const index=indices[i],color=changed.get(index);
      if(index===last+1&&color===value){last=index;length++;}
      else{
        runs.push(start,length,value);
        start=last=index;value=color;length=1;
      }
    }
    runs.push(start,length,value);
    for(const index of indices)changed.delete(index);
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
