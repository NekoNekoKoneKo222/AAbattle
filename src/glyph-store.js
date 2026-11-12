export class GlyphStore {
  constructor(pool) { this.pool=pool; this.memory=new Map(); }
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
}
