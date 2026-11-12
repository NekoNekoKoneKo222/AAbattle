import { useEffect, useRef, useState } from 'react';
import { TILE, WORLD, tileAt, type Actor } from '@glyph/shared';

function terrainColor(glyph: string): string {
  if (glyph === '#' || glyph === '▓' || glyph === '▲') return '#62788b';
  if (glyph === '♣' || glyph === '♠') return '#438a6e';
  if (glyph === '≋') return '#3887a9';
  if (glyph === '◈' || glyph === '◎') return '#e2b86f';
  if (glyph === '·') return '#567181';
  return '#243a4a';
}

function drawTiles(ctx: CanvasRenderingContext2D, left: number, top: number, count: number, cell: number) {
  ctx.fillStyle = '#0b1925';
  ctx.fillRect(0, 0, count * cell, count * cell);
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
    ctx.fillStyle = terrainColor(tileAt(left + col, top + row));
    ctx.fillRect(col * cell, row * cell, cell - 0.35, cell - 0.35);
  }
}

export function WorldMap({ player, open, onClose, onOpen }: { player?: Actor; open: boolean; onClose: () => void; onOpen: () => void }) {
  const mini = useRef<HTMLCanvasElement>(null);
  const full = useRef<HTMLCanvasElement>(null);
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);
  const px = Math.floor((player?.x ?? 16) / TILE), py = Math.floor((player?.y ?? 16) / TILE);

  useEffect(() => {
    const ctx = mini.current?.getContext('2d');
    if (!ctx) return;
    const count = 33, cell = 4, left = px - 16, top = py - 16;
    drawTiles(ctx, left, top, count, cell);
    ctx.fillStyle = '#f6f9ff';
    ctx.fillRect(16 * cell - 3, 16 * cell - 3, 10, 10);
    ctx.fillStyle = '#41e9ff';
    ctx.fillRect(16 * cell - 1, 16 * cell - 1, 6, 6);
  }, [px, py]);

  useEffect(() => {
    if (!open) return;
    const ctx = full.current?.getContext('2d');
    if (!ctx) return;
    const count = WORLD * 2 + 1, cell = 4;
    drawTiles(ctx, -WORLD, -WORLD, count, cell);
    const dot = (x: number, y: number, color: string, size = 12) => {
      const sx = (x + WORLD + .5) * cell, sy = (y + WORLD + .5) * cell;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(sx, sy, size / 2, 0, Math.PI * 2); ctx.fill();
    };
    dot(0, 0, '#f1c971', 9);
    dot(-20, 14, '#ba8df2', 7);
    dot(0, 22, '#d38ad7', 7);
    if (marker) dot(marker.x, marker.y, '#f6d880', 12);
    dot(px, py, '#72f4ff', 17);
    ctx.fillStyle = '#e8faff'; ctx.font = 'bold 12px system-ui';
    ctx.fillText('始まりの街', (0 + WORLD) * cell + 11, (0 + WORLD) * cell - 12);
    ctx.fillText('文字の森', (20 + WORLD) * cell + 6, (0 + WORLD) * cell - 12);
    ctx.fillText('虚無の遺跡', (0 + WORLD) * cell + 9, (22 + WORLD) * cell + 17);
    ctx.fillText('訓練闘技場', (-20 + WORLD) * cell - 80, (14 + WORLD) * cell - 10);
  }, [open, px, py, marker]);

  return <>
    <button className="minimap" onClick={onOpen} aria-label="ワールドマップを開く" title="ワールドマップ (M)"><canvas ref={mini} width="132" height="132"/><span>◎ MAP　M</span></button>
    {open && <div className="map-backdrop" role="dialog" aria-modal="true" aria-label="ワールドマップ">
      <section className="world-map">
        <div className="map-title"><div><strong>◈ WORLD MAP</strong><small>ワールドマップ / 現在地：{px}, {py}</small></div><button onClick={onClose} aria-label="マップを閉じる">閉じる ×</button></div>
        <canvas ref={full} width="644" height="644" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMarker({ x: Math.max(-WORLD, Math.min(WORLD, Math.floor((e.clientX - r.left) / r.width * 644 / 4) - WORLD)), y: Math.max(-WORLD, Math.min(WORLD, Math.floor((e.clientY - r.top) / r.height * 644 / 4) - WORLD)) }); }} aria-label="クリックして目的地マーカーを置く"/>
        <div className="map-legend"><span><i style={{background:'#72f4ff'}}/>現在地</span><span><i style={{background:'#f6d880'}}/>目的地</span><span><i style={{background:'#f1c971'}}/>安全地帯</span><span><i style={{background:'#438a6e'}}/>森林</span><span><i style={{background:'#62788b'}}/>障害物</span></div>
        <p>地図をタップすると目的地マーカーを置けます。M または「閉じる」で戻ります。</p>
      </section>
    </div>}
  </>;
}
