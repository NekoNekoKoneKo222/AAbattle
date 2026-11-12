export const TILE = 32;
export const WORLD = 80;
export type Vec = { x: number; y: number };
export type Input = { x: number; y: number; aimX: number; aimY: number; attack: boolean; dash: boolean };
export type Actor = { id: string; name: string; x: number; y: number; hp: number; maxHp: number; glyph: string; kind?: string; facingX?: number; facingY?: number };
export type Effect = { id: number; x: number; y: number; text: string; color: string; born: number };
export type Snapshot = { type: 'state'; you: string; players: Actor[]; enemies: Actor[]; effects: Effect[]; xp: number; level: number; coins: number; zone: string; time: number };

type AuthoredMap = { originX: number; originY: number; rows: string[][] };
let authoredMap: AuthoredMap | null = null;

/** A plain text grid. @origin is the tile coordinate of the top-left character. */
export function setWorldMap(source: string): void {
  if (!source.trim()) { authoredMap = null; return; }
  const lines = source.replace(/\r/g, '').split('\n').filter(line => line.length > 0 && !line.startsWith(';'));
  const header = /^@origin\s+(-?\d+)\s+(-?\d+)$/.exec(lines.shift() ?? '');
  if (!header || !lines.length || lines.length > 161) throw new Error('world.txt: @origin と地形の行を確認してください。');
  const rows = lines.map(line => Array.from(line));
  const width = rows[0]?.length;
  if (!width || width > 161 || rows.some(row => row.length !== width || row.some(c => !'. :#T~^+S'.includes(c)))) {
    throw new Error('world.txt: 全行を同じ幅にし、指定された地形文字を使用してください。');
  }
  authoredMap = { originX: Number(header[1]), originY: Number(header[2]), rows };
}

export function authoredMapSize(): { originX: number; originY: number; width: number; height: number } | null {
  return authoredMap ? { originX: authoredMap.originX, originY: authoredMap.originY, width: authoredMap.rows[0].length, height: authoredMap.rows.length } : null;
}

export function tileAt(tx: number, ty: number): string {
  if (Math.abs(tx) > WORLD || Math.abs(ty) > WORLD) return '#';
  const authored = authoredMap?.rows[ty - authoredMap.originY]?.[tx - authoredMap.originX];
  if (authored !== undefined) return ({ '.':'·', ':':'·', 'T':'♣', '~':'≋', '^':'▲', '+':'◈', 'S':'◎' } as Record<string,string>)[authored] ?? authored;
  if (Math.abs(tx) < 9 && Math.abs(ty) < 8) {
    if ((Math.abs(tx) === 8 || Math.abs(ty) === 7) && !(Math.abs(tx) <= 1 || Math.abs(ty) <= 1)) return '#';
    if (tx === 0 || ty === 0) return '·';
    return (tx * 17 + ty * 31) % 17 === 0 ? '◈' : ' ';
  }
  const n = Math.abs((tx * 73856093 ^ ty * 19349663) % 101);
  if (tx < -13 && ty > 10) return n < 11 ? '▓' : n < 23 ? ':' : '·';
  if (ty > 15 && Math.abs(tx) < 18) return n < 18 ? '#' : n < 32 ? '▒' : '·';
  return n < 10 ? '♣' : n < 23 ? '♠' : n < 30 ? '░' : '·';
}
export function blocked(x: number, y: number): boolean {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const tile = tileAt(tx, ty);
  return tile === '#' || tile === '▓' || tile === '♣' || tile === '♠' || tile === '≋' || tile === '▲';
}
export function canStand(x: number, y: number): boolean {
  const r = 8;
  return !blocked(x-r,y-r) && !blocked(x+r,y-r) && !blocked(x-r,y+r) && !blocked(x+r,y+r);
}
export function zoneAt(x: number, y: number): string {
  const tx=x/TILE, ty=y/TILE;
  if (Math.abs(tx)<9 && Math.abs(ty)<8) return '始まりの街';
  if (tx < -13 && ty > 10) return '訓練闘技場';
  if (ty > 15 && Math.abs(tx) < 18) return '虚無の遺跡';
  return '文字の森';
}
export function norm(x: number,y: number): Vec {
  const len=Math.hypot(x,y);
  return len > 0 ? {x:x/len,y:y/len} : {x:0,y:0};
}
