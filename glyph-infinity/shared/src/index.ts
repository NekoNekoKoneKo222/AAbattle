export const TILE = 32;
export * from './craft.js';
export * from './rpg.js';
export * from './world.js';
import { BIOMES, WORLD_SITES, CHUNK_SIZE, biomeAt, generatedChunk } from './world.js';
export const WORLD = 128;
export type Vec = { x: number; y: number };
export type Input = { x: number; y: number; aimX: number; aimY: number; attack: boolean; dash: boolean };
export type Actor = { id: string; name: string; x: number; y: number; hp: number; maxHp: number; glyph: string; kind?: string; facingX?: number; facingY?: number; windupUntil?: number; staggerUntil?: number; attackMode?:'strike'|'sweep'|'volley'; targetX?:number; targetY?:number };
export type Effect = { id: number; x: number; y: number; text: string; color: string; born: number; kind?: 'slash' | 'hit' | 'trail'; dx?: number; dy?: number };
export type Projectile = { id: number; x: number; y: number; glyph: string; color: string };
export type Snapshot = { type: 'state'; you: string; players: Actor[]; enemies: Actor[]; projectiles: Projectile[]; effects: Effect[]; xp: number; level: number; coins: number; zone: string; dungeon:number; pvp?:{mode:string;size:number;round:number;score:[number,number];remaining:number;team:number}; world?:{explored:string[];discovered:string[]}; craft?:import('./craft.js').CraftState; time: number; rollUntil: number; rollX: number; rollY: number; rollReadyAt: number; parryUntil: number; parryReadyAt: number; swingAt: number; combo: number; ep: number; maxEp: number; skillCooldowns: number[]; weaponGlyph: string };

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
  const site=WORLD_SITES.find(s=>s.tx===tx&&s.ty===ty);if(site)return site.glyph;
  const authored = authoredMap?.rows[ty - authoredMap.originY]?.[tx - authoredMap.originX];
  if (authored !== undefined) return ({ '.':'·', ':':'·', 'T':'♣', '~':'≋', '^':'▲', '+':'◈', 'S':'◎' } as Record<string,string>)[authored] ?? authored;
  if (Math.abs(tx) < 9 && Math.abs(ty) < 8) {
    if ((Math.abs(tx) === 8 || Math.abs(ty) === 7) && !(Math.abs(tx) <= 1 || Math.abs(ty) <= 1)) return '#';
    if (tx === 0 || ty === 0) return '·';
    return (tx * 17 + ty * 31) % 17 === 0 ? '◈' : ' ';
  }
  const cx=Math.floor(tx/CHUNK_SIZE),cy=Math.floor(ty/CHUNK_SIZE);
  return generatedChunk(cx,cy)[(ty-cy*CHUNK_SIZE)*CHUNK_SIZE+tx-cx*CHUNK_SIZE];
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
export function zoneAt(x: number, y: number): string {const biome=biomeAt(x/TILE,y/TILE);return biome==='forest'?'文字の森':BIOMES[biome].name;}
export function norm(x: number,y: number): Vec {
  const len=Math.hypot(x,y);
  return len > 0 ? {x:x/len,y:y/len} : {x:0,y:0};
}
