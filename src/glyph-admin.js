import { readFileSync } from 'node:fs';
import { setWorldMap, authoredMapSize, WORLD_SITES, TILE, canStand } from '@glyph/shared';

export function isGlyphAdmin(user) {
  return user?.username_key === 'nekonekokoneko';
}

export function validateWorldSource(source) {
  if (typeof source !== 'string' || source.length > 30000 || !source.trim()) throw new Error('マップは空にできず、30KB以内にしてください。');
  // Validation uses the same parser as the game. Callers restore the current map on failure.
  setWorldMap(source);
  const size = authoredMapSize();
  if (!size || Math.abs(size.originX) > 128 || Math.abs(size.originY) > 128 || size.originX + size.width > 129 || size.originY + size.height > 129) {
    throw new Error('マップの範囲はワールド座標 -128～128 に収めてください。');
  }
  for (const site of WORLD_SITES) if (!canStand((site.tx + .5) * TILE, (site.ty + .5) * TILE)) {
    throw new Error(`${site.name}の周囲を通れる地形にしてください。`);
  }
  return size;
}

export class GlyphAdminStore {
  constructor(pool, defaultPath) {
    this.pool = pool;
    this.defaultSource = readFileSync(defaultPath, 'utf8');
    this.source = this.defaultSource;
    this.version = 0;
    this.memoryNotices = [];
    setWorldMap(this.source);
  }
  async init() {
    if (!this.pool) return;
    const { rows } = await this.pool.query('SELECT source, version FROM glyph_world_state WHERE id=1');
    if (rows[0]) {
      validateWorldSource(rows[0].source);
      this.source = rows[0].source;
      this.version = rows[0].version;
    }
  }
  async saveWorld(source, userId, expectedVersion) {
    try { validateWorldSource(source); } catch (error) { setWorldMap(this.source); throw error; }
    if (expectedVersion !== this.version) { setWorldMap(this.source); throw new Error('別の編集でマップが更新されました。再読み込みしてください。'); }
    try {
      if (this.pool) {
        const { rows } = await this.pool.query(`INSERT INTO glyph_world_state (id,source,version,updated_by)
          VALUES (1,$1,1,$2) ON CONFLICT (id) DO UPDATE SET source=EXCLUDED.source,
          version=glyph_world_state.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW()
          WHERE glyph_world_state.version=$3 RETURNING version`, [source,userId,expectedVersion]);
        if (!rows[0]) throw new Error('別の編集でマップが更新されました。再読み込みしてください。');
        this.version = rows[0].version;
      } else this.version++;
      this.source = source;
      return { source, version: this.version };
    } catch (error) { setWorldMap(this.source); throw error; }
  }
  async addNotice(message, authorId) {
    const clean = typeof message === 'string' ? message.trim().replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') : '';
    if (!clean || clean.length > 500) throw new Error('通知は1～500文字で入力してください。');
    if (!this.pool) {
      const notice = { id: String(Date.now()), message: clean, created_at: new Date().toISOString() };
      this.memoryNotices.unshift(notice);
      this.memoryNotices = this.memoryNotices.slice(0, 10);
      return notice;
    }
    const { rows } = await this.pool.query('INSERT INTO glyph_announcements (message,author_id) VALUES ($1,$2) RETURNING id,message,created_at', [clean,authorId]);
    return rows[0];
  }
  async notices() {
    if (!this.pool) return this.memoryNotices;
    return (await this.pool.query('SELECT id,message,created_at FROM glyph_announcements ORDER BY id DESC LIMIT 10')).rows;
  }
}
