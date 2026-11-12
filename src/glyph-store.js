import { starterCraft } from '@glyph/shared';

export class GlyphStore {
  constructor(pool) { this.pool=pool; this.memory=new Map(); this.crafting=new Map(); this.names=new Map(); }
  async load(user) {
    const fresh={x:16,y:16,hp:100,xp:0,level:1,coins:0};
    if(!this.pool)return {...fresh,...this.memory.get(user.id)};
    const {rows}=await this.pool.query('SELECT x,y,hp,xp,level,coins FROM glyph_profiles WHERE user_id=$1',[user.id]);
    return rows[0]?{x:Number(rows[0].x),y:Number(rows[0].y),hp:rows[0].hp,xp:rows[0].xp,level:rows[0].level,coins:rows[0].coins}:fresh;
  }
  async save(user,profile) {
    if(!this.pool){this.memory.set(user.id,{...profile});return;}
    await this.pool.query(`INSERT INTO glyph_profiles (user_id,x,y,hp,xp,level,coins) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id) DO UPDATE SET x=EXCLUDED.x,y=EXCLUDED.y,hp=EXCLUDED.hp,xp=EXCLUDED.xp,level=EXCLUDED.level,coins=EXCLUDED.coins,updated_at=NOW()`,
      [user.id,profile.x,profile.y,profile.hp,profile.xp,profile.level,profile.coins]);
  }
  async loadCraft(user) {
    if (!this.pool) return structuredClone(this.crafting.get(user.id) || starterCraft());
    const {rows}=await this.pool.query('SELECT data FROM glyph_crafting WHERE user_id=$1',[user.id]);
    return rows[0]?.data || starterCraft();
  }
  async saveCraft(user,craft) {
    if (!this.pool) {this.crafting.set(user.id,structuredClone(craft));this.names.set(user.id,user.username);return;}
    await this.pool.query(`INSERT INTO glyph_crafting (user_id,data) VALUES ($1,$2::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`,[user.id,JSON.stringify(craft)]);
  }
  async leaderboard() {
    if(!this.pool)return [...this.crafting.entries()].map(([id,data])=>({name:this.names.get(id)||'冒険者',rating:data.pvp?.rating??1000,wins:data.pvp?.wins??0})).sort((a,b)=>b.rating-a.rating).slice(0,20);
    const {rows}=await this.pool.query(`SELECT u.username AS name,
      LEAST(99999,GREATEST(0,COALESCE((c.data->'pvp'->>'rating')::integer,1000))) AS rating,
      GREATEST(0,COALESCE((c.data->'pvp'->>'wins')::integer,0)) AS wins
      FROM glyph_crafting c JOIN users u ON u.id=c.user_id
      WHERE c.data ? 'pvp' ORDER BY rating DESC,wins DESC LIMIT 20`);
    return rows;
  }
}
