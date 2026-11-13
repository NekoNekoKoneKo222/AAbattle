import { TILE, canStand, tileAt, type Actor, type Input, type Projectile, type Snapshot } from '@glyph/shared';
import type { RefObject } from 'react';

export type Frame = { current: Snapshot; previous: Snapshot | null; receivedAt: number; interval: number };
type Position = { x: number; y: number };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const ease = (dt: number, ms: number) => 1 - Math.exp(-dt / ms);
const lookup = <T extends { id: string | number }>(list: T[], id: string | number) => list.find(item => item.id === id);

function terrainColor(glyph: string): string {
  if (glyph === '#') return '#698092';
  if (glyph === '♣' || glyph === '♠') return '#419976';
  if (glyph === '≋') return '#55a6cb';
  if (glyph === '▲' || glyph === '▓') return '#94799e';
  if (glyph === '◈' || glyph === '◎') return '#dfbc76';
  return '#436078';
}

export function startRenderer(canvas: HTMLCanvasElement, frames: RefObject<Frame | null>, input: RefObject<Input>): () => void {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return () => {};
  const tileCanvas = document.createElement('canvas');
  const tileCtx = tileCanvas.getContext('2d', { alpha: false });
  if (!tileCtx) return () => {};
  const glyphTiles = new Map<string,HTMLCanvasElement>();
  let cachedLeft = Infinity, cachedTop = Infinity, cachedCols = 0, cachedRows = 0;
  let self: Position | null = null, camera: Position | null = null;
  let lastFrame = 0, frameId = 0;

  function rebuildTiles(left: number, top: number, cols: number, rows: number) {
    if (left >= cachedLeft && top >= cachedTop && left + cols <= cachedLeft + cachedCols && top + rows <= cachedTop + cachedRows) return;
    left -= 3; top -= 3; cols += 6; rows += 6;
    cachedLeft = left; cachedTop = top; cachedCols = cols; cachedRows = rows;
    tileCanvas.width = cols * TILE; tileCanvas.height = rows * TILE;
    tileCtx!.fillStyle = '#0e1721'; tileCtx!.fillRect(0, 0, tileCanvas.width, tileCanvas.height);
    tileCtx!.imageSmoothingEnabled = false;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const tx = left + col, ty = top + row, glyph = tileAt(tx, ty);
      const x = col * TILE, y = row * TILE;
      if (Math.abs(tx) < 9 && Math.abs(ty) < 8) {tileCtx!.fillStyle = '#182a38'; tileCtx!.fillRect(x, y, TILE, TILE);}
      else if (ty > 15 && Math.abs(tx) < 18) {tileCtx!.fillStyle = '#201d2c'; tileCtx!.fillRect(x, y, TILE, TILE);}
      if(glyph===' '||glyph==='·')continue;
      if(glyph===':'||glyph==='░'||glyph==='▒'||glyph==='#'||glyph==='▓'){
        tileCtx!.fillStyle=terrainColor(glyph);
        tileCtx!.fillRect(x+4,y+4,TILE-8,TILE-8);
        continue;
      }
      const color=terrainColor(glyph),key=`${glyph}:${color}`;
      let image=glyphTiles.get(key);
      if(!image){
        image=document.createElement('canvas');image.width=TILE;image.height=TILE;
        const g=image.getContext('2d')!;g.textAlign='center';g.textBaseline='middle';g.font='22px Consolas, monospace';g.fillStyle=color;g.fillText(glyph,TILE/2,TILE/2);
        glyphTiles.set(key,image);
      }
      tileCtx!.drawImage(image,x,y);
    }
  }

  function interpolate<T extends Position & { id: string | number }>(actor: T, previous: T[] | undefined, alpha: number): T {
    const old = previous && lookup(previous, actor.id);
    return old ? { ...actor, x: old.x + (actor.x - old.x) * alpha, y: old.y + (actor.y - old.y) * alpha } : actor;
  }

  function draw(now: number) {
    frameId = requestAnimationFrame(draw);
    if (now - lastFrame < 1000 / 65) return;
    const dt = lastFrame ? clamp(now - lastFrame, 0, 50) : 16;
    lastFrame = now;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      cachedLeft = Infinity;
    }
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx!.fillStyle = '#0c1420'; ctx!.fillRect(0, 0, width, height);
    const frame = frames.current;
    if (!frame) {ctx!.fillStyle = '#8bb7c8'; ctx!.font = 'bold 22px Consolas, monospace'; ctx!.textAlign = 'center'; ctx!.fillText('GLYPH INFINITY', width / 2, height / 2); return;}
    const s = frame.current, p = s.players.find(a => a.id === s.you);
    if (!p) return;
    const age = Math.max(0, now - frame.receivedAt);
    const serverNow = s.time + age;
    // Draw enemies from the newest server position and predict only a small
    // fraction of the next step. Delayed packets no longer rewind their pose.
    const alpha = clamp(1 + age / frame.interval, 1, 1.6);
    const moving = input.current.x !== 0 || input.current.y !== 0;
    const rolling = s.rollUntil > serverNow;
    const lead = Math.min(age, 60) / 1000;
    const speed = rolling ? 320 : 120;
    const predictedX = p.x + (rolling ? s.rollX : moving ? input.current.x : 0) * speed * lead;
    const predictedY = p.y + (rolling ? s.rollY : moving ? input.current.y : 0) * speed * lead;
    const targetX = canStand(predictedX, p.y) ? predictedX : p.x;
    const targetY = canStand(p.x, predictedY) ? predictedY : p.y;
    if (!self) self = { x: p.x, y: p.y };
    const follow = ease(dt, 43);
    self.x += (targetX - self.x) * follow;
    self.y += (targetY - self.y) * follow;
    if (Math.hypot(self.x - p.x, self.y - p.y) > 90) self = { x: p.x, y: p.y };
    if (!camera) camera = { ...self };
    const cameraFollow = ease(dt, 80);
    camera.x += (self.x - camera.x) * cameraFollow;
    camera.y += (self.y - camera.y) * cameraFollow;
    const cx = camera.x, cy = camera.y;
    const scale = clamp(width / 900, .75, 1.15);
    const toScreen = (x: number, y: number) => ({ x: width / 2 + (x - cx) * scale, y: height / 2 + (y - cy) * scale });
    const left = Math.floor((cx - width / 2 / scale) / TILE) - 2;
    const top = Math.floor((cy - height / 2 / scale) / TILE) - 2;
    const cols = Math.ceil(width / scale / TILE) + 5;
    const rows = Math.ceil(height / scale / TILE) + 5;
    rebuildTiles(left, top, cols, rows);
    const screen = toScreen(cachedLeft * TILE, cachedTop * TILE);
    ctx!.drawImage(tileCanvas, screen.x, screen.y, tileCanvas.width * scale, tileCanvas.height * scale);

    const drawActor = (actor: Actor, enemy: boolean) => {
      const pos = toScreen(actor.x, actor.y);
      if (pos.x < -40 || pos.x > width + 40 || pos.y < -50 || pos.y > height + 40) return;
      const warning = enemy && (actor.windupUntil ?? 0) > serverNow;
      if (warning) {
        const remaining = clamp((actor.windupUntil! - serverNow) / (actor.kind==='boss'?780:650),0,1);
        ctx!.strokeStyle = remaining<.3?'#ffe29b':'#f79263'; ctx!.lineWidth = actor.kind==='boss'?3:2;
        ctx!.setLineDash(actor.kind==='boss'?[7,5]:[]);
        if(actor.kind==='boss'&&actor.attackMode==='volley'&&actor.targetX!==undefined&&actor.targetY!==undefined){const aim=toScreen(actor.targetX,actor.targetY);ctx!.beginPath();ctx!.moveTo(pos.x,pos.y);ctx!.lineTo(aim.x,aim.y);ctx!.stroke();}
        else{ctx!.beginPath();ctx!.arc(pos.x,pos.y,(actor.kind==='boss'?(actor.attackMode==='sweep'?86:55):22)*scale,0,Math.PI*2);ctx!.stroke();}
        ctx!.setLineDash([]);
        ctx!.fillStyle = '#ffd29b'; ctx!.font = 'bold 21px Consolas, monospace'; ctx!.textAlign = 'center'; ctx!.fillText('!', pos.x, pos.y - 39);
      }
      ctx!.fillStyle = enemy ? (actor.staggerUntil ?? 0) > serverNow ? '#fff1a3' : '#ff8290' : actor.kind==='party' ? '#a5ffa0' : actor.kind==='player' ? '#d4b6ff' : rolling ? '#81f4ff' : '#6be5ff';
      ctx!.font = `bold ${Math.round((enemy ? 27 : 32) * scale)}px Consolas, monospace`;
      ctx!.textAlign = 'center'; ctx!.textBaseline = 'middle';
      ctx!.fillText(!enemy&&actor.id===s.you&&rolling?'◇':actor.glyph, pos.x, pos.y);
      ctx!.fillStyle = '#cfdfeb'; ctx!.font = '11px system-ui';
      ctx!.fillText(actor.name, pos.x, pos.y - 28 * scale);
      ctx!.fillStyle = '#513043'; ctx!.fillRect(pos.x - 20, pos.y - 19 * scale, 40, 4);
      ctx!.fillStyle = enemy ? '#f27384' : '#58e5d2';
      ctx!.fillRect(pos.x - 20, pos.y - 19 * scale, 40 * clamp(actor.hp / actor.maxHp, 0, 1), 4);
    };

    const enemies = s.enemies.map(e => interpolate(e, frame.previous?.enemies, alpha));
    enemies.forEach(e => drawActor(e, true));
    s.players.filter(actor=>actor.id!==s.you).forEach(actor=>drawActor(interpolate(actor,frame.previous?.players,alpha),false));
    for (const projectile of s.projectiles || []) {
      const b = interpolate<Projectile>(projectile, frame.previous?.projectiles, alpha);
      const point = toScreen(b.x, b.y);
      ctx!.fillStyle = b.color; ctx!.font = 'bold 22px Consolas, monospace'; ctx!.textAlign = 'center';
      ctx!.fillText(b.glyph, point.x, point.y);
    }
    drawActor({ ...p, x: self.x, y: self.y }, false);

    for (const effect of s.effects) {
      const effectAge = serverNow - effect.born;
      if (effectAge < 0 || effectAge > 650) continue;
      ctx!.globalAlpha = 1 - effectAge / 650;
      const point = toScreen(effect.x, effect.y);
      if (effect.kind === 'slash') {
        const direction = Math.atan2(effect.dy ?? 0, effect.dx ?? 1);
        ctx!.fillStyle = effect.color; ctx!.font = `bold ${Math.round(22 * scale)}px Consolas, monospace`;
        for (let i = -2; i <= 2; i++) {
          const angle = direction + i * .3 + effectAge / 280;
          ctx!.fillText(i === 0 ? '✦' : '╱', point.x + Math.cos(angle) * 48 * scale, point.y + Math.sin(angle) * 48 * scale);
        }
      } else {
        ctx!.fillStyle = effect.color; ctx!.font = `bold ${effect.kind === 'trail' ? 15 : 18}px Consolas, monospace`;
        ctx!.textAlign = 'center';
        ctx!.fillText(effect.text, point.x, point.y - effectAge * .035);
      }
      ctx!.globalAlpha = 1;
    }
  }
  frameId = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frameId);
}
