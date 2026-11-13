import { randomUUID, randomBytes } from 'node:crypto';

export class PixelError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const roomCode=()=>randomBytes(4).toString('hex').toUpperCase();
const row=(c,v,author)=>c&&({...c,version_id:v?.id??c.current_version_id,version_number:v?.version_number,project:v?.project,png:v?.png_data??v?.png,analysis:v?.analysis,author:author??c.author});

export class PixelStore {
  constructor(pool){this.pool=pool;this.characters=new Map();this.versions=new Map();this.battles=new Map();this.rooms=new Map();this.usage=[];this.cache=new Map();}
  async list(ownerId,{publicOnly=false,query='',sort='new',page=0}={}){
    const offset=Math.max(0,Math.min(1000,Number(page)||0))*24;
    if(!this.pool){let items=[...this.characters.values()].filter(c=>!c.deleted_at&&(publicOnly?c.visibility==='public':c.owner_id===ownerId)).map(c=>row(c,this.versions.get(c.current_version_id),c.author));if(query)items=items.filter(c=>`${c.name} ${c.tags.join(' ')} ${c.analysis?.element??''}`.toLowerCase().includes(query.toLowerCase()));items.sort((a,b)=>sort==='favorite'?Number(b.favorite)-Number(a.favorite)||b.updated_at.localeCompare(a.updated_at):b.updated_at.localeCompare(a.updated_at));return {items:items.slice(offset,offset+24),total:items.length};}
    const where=publicOnly?"c.visibility='public'":"c.owner_id=$1";
    const params=publicOnly?[]:[ownerId];
    const search=query?` AND (c.name ILIKE $${params.length+1} OR array_to_string(c.tags,' ') ILIKE $${params.length+1} OR v.analysis->>'element' ILIKE $${params.length+1})`:'';
    if(query)params.push(`%${query}%`);
    const {rows:counts}=await this.pool.query(`SELECT COUNT(*)::integer AS total FROM draw_characters c JOIN draw_versions v ON v.id=c.current_version_id WHERE ${where} AND c.deleted_at IS NULL${search}`,params);
    const order=sort==='favorite'?'c.favorite DESC,c.updated_at DESC':sort==='name'?'c.name ASC,c.updated_at DESC':'c.updated_at DESC';
    const {rows}=await this.pool.query(`SELECT c.*,v.id AS version_id,v.version_number,v.project,v.png_data AS png,v.analysis,u.username AS author FROM draw_characters c JOIN draw_versions v ON v.id=c.current_version_id JOIN users u ON u.id=COALESCE(c.original_author_id,c.owner_id) WHERE ${where} AND c.deleted_at IS NULL${search} ORDER BY ${order} LIMIT 24 OFFSET $${params.length+1}`,[...params,offset]);
    return {items:rows,total:counts[0].total};
  }
  async get(id,viewerId){
    if(!this.pool){const c=this.characters.get(id);return c&&!c.deleted_at&&(c.owner_id===viewerId||c.visibility==='public')?row(c,this.versions.get(c.current_version_id),c.author):null;}
    const {rows}=await this.pool.query(`SELECT c.*,v.id AS version_id,v.version_number,v.project,v.png_data AS png,v.analysis,u.username AS author FROM draw_characters c JOIN draw_versions v ON v.id=c.current_version_id JOIN users u ON u.id=COALESCE(c.original_author_id,c.owner_id) WHERE c.id=$1 AND c.deleted_at IS NULL AND (c.owner_id=$2 OR c.visibility='public')`,[id,viewerId]);return rows[0]??null;
  }
  async own(id,userId){const c=await this.get(id,userId);if(!c||c.owner_id!==userId)throw new PixelError('自分のキャラクターが見つかりません。',404);return c;}
  async version(id){if(!this.pool)return this.versions.get(id)??null;return (await this.pool.query('SELECT id,character_id,name,version_number,project,png_data AS png,analysis FROM draw_versions WHERE id=$1',[id])).rows[0]??null;}
  async create(user,{name,project,png,analysis,visibility='private',copyAllowed=false,tags=[],originalAuthorId=null}){
    const id=randomUUID(),vid=randomUUID(),now=new Date().toISOString(),c={id,owner_id:user.id,name,visibility,copy_allowed:copyAllowed,favorite:false,tags,original_author_id:originalAuthorId,current_version_id:vid,created_at:now,updated_at:now,deleted_at:null,author:user.username};
    const v={id:vid,character_id:id,name,version_number:1,project,png,analysis};
    if(!this.pool){this.characters.set(id,c);this.versions.set(vid,v);return row(c,v,user.username);}
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query(`INSERT INTO draw_characters(id,owner_id,name,visibility,copy_allowed,tags,original_author_id,current_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,user.id,name,visibility,copyAllowed,tags,originalAuthorId,vid]);await client.query(`INSERT INTO draw_versions(id,character_id,name,version_number,project,png_data,analysis) VALUES($1,$2,$3,1,$4::jsonb,$5,$6::jsonb)`,[vid,id,name,JSON.stringify(project),png,JSON.stringify(analysis)]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    return row(c,v,user.username);
  }
  async revise(user,id,{name,project,png,analysis}){
    const current=await this.own(id,user.id),vid=randomUUID(),now=new Date().toISOString();
    if(!this.pool){const c=this.characters.get(id),v={id:vid,character_id:id,name,version_number:current.version_number+1,project,png,analysis};this.versions.set(vid,v);Object.assign(c,{name,current_version_id:vid,updated_at:now});return row(c,v,c.author);}
    const client=await this.pool.connect();try{await client.query('BEGIN');const {rows}=await client.query('SELECT current_version_id FROM draw_characters WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,user.id]);if(!rows[0])throw new PixelError('キャラクターが見つかりません。',404);const {rows:versions}=await client.query('SELECT version_number FROM draw_versions WHERE id=$1',[rows[0].current_version_id]);await client.query(`INSERT INTO draw_versions(id,character_id,name,version_number,project,png_data,analysis) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)`,[vid,id,name,versions[0].version_number+1,JSON.stringify(project),png,JSON.stringify(analysis)]);await client.query('UPDATE draw_characters SET name=$2,current_version_id=$3,updated_at=NOW() WHERE id=$1 AND owner_id=$4',[id,name,vid,user.id]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    return this.get(id,user.id);
  }
  async metadata(user,id,{name,visibility,copyAllowed,favorite,tags}){
    const c=await this.own(id,user.id);
    if(!this.pool){Object.assign(this.characters.get(id),{name,visibility,copy_allowed:copyAllowed,favorite,tags,updated_at:new Date().toISOString()});return this.get(id,user.id);}
    await this.pool.query('UPDATE draw_characters SET name=$3,visibility=$4,copy_allowed=$5,favorite=$6,tags=$7,updated_at=NOW() WHERE id=$1 AND owner_id=$2',[id,user.id,name,visibility,copyAllowed,favorite,tags]);return this.get(id,user.id);
  }
  async remove(user,id){await this.own(id,user.id);if(!this.pool){this.characters.get(id).deleted_at=new Date().toISOString();return;}await this.pool.query('UPDATE draw_characters SET deleted_at=NOW() WHERE id=$1 AND owner_id=$2',[id,user.id]);}
  async history(id,userId){await this.own(id,userId);if(!this.pool)return [...this.versions.values()].filter(v=>v.character_id===id).sort((a,b)=>b.version_number-a.version_number);return (await this.pool.query('SELECT id,name,version_number,created_at FROM draw_versions WHERE character_id=$1 ORDER BY version_number DESC',[id])).rows;}
  async cached(key){if(!this.pool)return this.cache.get(key)??null;return (await this.pool.query('SELECT analysis FROM draw_analysis_cache WHERE cache_key=$1',[key])).rows[0]?.analysis??null;}
  async cacheAnalysis(key,analysis){if(!this.pool){this.cache.set(key,analysis);return;}await this.pool.query('INSERT INTO draw_analysis_cache(cache_key,analysis) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',[key,JSON.stringify(analysis)]);}
  async charge(userId,kind,max){
    if(!this.pool){const now=Date.now();this.usage=this.usage.filter(v=>v.time>now-3600000);if(this.usage.filter(v=>v.userId===userId&&v.kind===kind).length>=max)throw new PixelError('AI利用の上限です。1時間後に再試行してください。',429);this.usage.push({userId,kind,time:now});return;}
    const {rows}=await this.pool.query("SELECT COUNT(*)::integer AS count FROM draw_ai_usage WHERE user_id=$1 AND kind=$2 AND created_at>NOW()-INTERVAL '1 hour'",[userId,kind]);if(rows[0].count>=max)throw new PixelError('AI利用の上限です。1時間後に再試行してください。',429);await this.pool.query('INSERT INTO draw_ai_usage(user_id,kind) VALUES($1,$2)',[userId,kind]);
  }
  async battleByRequest(requestId){if(!this.pool)return [...this.battles.values()].find(b=>b.request_id===requestId)??null;return (await this.pool.query('SELECT * FROM draw_battles WHERE request_id=$1',[requestId])).rows[0]??null;}
  async createBattle({requestId,creatorId,aVersionId,bVersionId,mode,stage}){
    const existing=await this.battleByRequest(requestId);if(existing)return existing;
    const battle={id:randomUUID(),request_id:requestId,creator_id:creatorId,a_version_id:aVersionId,b_version_id:bVersionId,mode,stage,status:'judging',result:null,error:null,created_at:new Date().toISOString()};
    if(!this.pool){this.battles.set(battle.id,battle);return battle;}
    const {rows}=await this.pool.query('INSERT INTO draw_battles(id,request_id,creator_id,a_version_id,b_version_id,mode,stage) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(request_id) DO NOTHING RETURNING *',[battle.id,requestId,creatorId,aVersionId,bVersionId,mode,stage]);return rows[0]??this.battleByRequest(requestId);
  }
  async completeBattle(id,result,error=null){
    if(!this.pool){const b=this.battles.get(id);if(b.status==='judging')Object.assign(b,{status:error?'error':'complete',result,error,completed_at:new Date().toISOString()});return b;}
    const {rows}=await this.pool.query("UPDATE draw_battles SET status=$2,result=$3::jsonb,error=$4,completed_at=NOW() WHERE id=$1 AND status='judging' RETURNING *",[id,error?'error':'complete',result?JSON.stringify(result):null,error]);return rows[0]??this.getBattle(id);
  }
  async getBattle(id){if(!this.pool)return this.battles.get(id)??null;return (await this.pool.query('SELECT * FROM draw_battles WHERE id=$1',[id])).rows[0]??null;}
  async recoverableBattles(){if(!this.pool)return[];return (await this.pool.query("UPDATE draw_battles SET recovery_at=NOW() WHERE id IN (SELECT id FROM draw_battles WHERE status='judging' AND created_at<NOW()-INTERVAL '2 minutes' AND (recovery_at IS NULL OR recovery_at<NOW()-INTERVAL '2 minutes') LIMIT 8 FOR UPDATE SKIP LOCKED) RETURNING *")).rows;}
  async listBattles(userId){if(!this.pool)return [...this.battles.values()].filter(b=>b.creator_id===userId||b.result?.guestId===userId).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,30);return (await this.pool.query("SELECT * FROM draw_battles WHERE creator_id=$1 OR result->>'guestId'=$1::text ORDER BY created_at DESC LIMIT 30",[userId])).rows;}
  async createRoom(user){for(let i=0;i<5;i++){const code=roomCode(),room={id:randomUUID(),code,host_id:user.id,guest_id:null,host_character_id:null,guest_character_id:null,host_ready:false,guest_ready:false,status:'waiting',battle_id:null,created_at:new Date().toISOString()};if(!this.pool){if(this.rooms.has(code))continue;this.rooms.set(code,room);return room;}const {rows}=await this.pool.query("INSERT INTO draw_rooms(id,code,host_id) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING RETURNING *",[room.id,code,user.id]);if(rows[0])return rows[0];}throw new PixelError('ルームを作成できませんでした。',503);}
  async room(code){if(!this.pool)return this.rooms.get(code)??null;return (await this.pool.query('SELECT * FROM draw_rooms WHERE code=$1',[code])).rows[0]??null;}
  async roomByBattle(battleId){if(!this.pool)return [...this.rooms.values()].find(r=>r.battle_id===battleId)??null;return (await this.pool.query('SELECT * FROM draw_rooms WHERE battle_id=$1',[battleId])).rows[0]??null;}
  async joinRoom(code,userId){const room=await this.room(code);if(!room)throw new PixelError('ルームが見つかりません。',404);if(room.host_id===userId||room.guest_id===userId)return room;if(room.guest_id||room.status!=='waiting')throw new PixelError('ルームには参加できません。',409);if(!this.pool){room.guest_id=userId;return room;}const {rows}=await this.pool.query("UPDATE draw_rooms SET guest_id=$2,updated_at=NOW() WHERE code=$1 AND guest_id IS NULL AND status='waiting' RETURNING *",[code,userId]);if(!rows[0])throw new PixelError('ルームには参加できません。',409);return rows[0];}
  async readyRoom(code,userId,characterId){const room=await this.room(code);if(!room||![room.host_id,room.guest_id].includes(userId))throw new PixelError('ルームに参加していません。',403);if(!room.guest_id||room.status!=='waiting')throw new PixelError('対戦準備を変更できません。',409);const field=userId===room.host_id?'host':'guest';if(!this.pool){room[`${field}_character_id`]=characterId;room[`${field}_ready`]=true;return room;}const {rows}=await this.pool.query(`UPDATE draw_rooms SET ${field}_character_id=$2,${field}_ready=TRUE,updated_at=NOW() WHERE code=$1 AND status='waiting' RETURNING *`,[code,characterId]);if(!rows[0])throw new PixelError('対戦準備を変更できません。',409);return rows[0];}
  async claimRoom(code){if(!this.pool){const r=this.rooms.get(code);if(!r||r.status!=='waiting'||!r.host_ready||!r.guest_ready)return null;r.status='judging';return r;}const {rows}=await this.pool.query("UPDATE draw_rooms SET status='judging',updated_at=NOW() WHERE code=$1 AND status='waiting' AND host_ready AND guest_ready RETURNING *",[code]);return rows[0]??null;}
  async finishRoom(code,battleId,status){if(!this.pool){const r=this.rooms.get(code);Object.assign(r,{battle_id:battleId,status});return r;}const {rows}=await this.pool.query('UPDATE draw_rooms SET battle_id=$2,status=$3,updated_at=NOW() WHERE code=$1 RETURNING *',[code,battleId,status]);return rows[0];}
  async leaveRoom(code,userId){const room=await this.room(code);if(!room||![room.host_id,room.guest_id].includes(userId))throw new PixelError('ルームに参加していません。',403);if(room.status==='judging')throw new PixelError('AI判定中は退出できません。',409);if(userId===room.host_id){if(!this.pool){room.status='closed';return room;}return (await this.pool.query("UPDATE draw_rooms SET status='closed',updated_at=NOW() WHERE code=$1 RETURNING *",[code])).rows[0];}if(!this.pool){Object.assign(room,{guest_id:null,guest_character_id:null,guest_ready:false,host_ready:false});return room;}return (await this.pool.query("UPDATE draw_rooms SET guest_id=NULL,guest_character_id=NULL,guest_ready=FALSE,host_ready=FALSE,updated_at=NOW() WHERE code=$1 RETURNING *",[code])).rows[0];}
  async rematchRoom(code,userId){const room=await this.room(code);if(!room||room.host_id!==userId||!room.guest_id||!['complete','error'].includes(room.status))throw new PixelError('再戦できません。',409);if(!this.pool){Object.assign(room,{host_character_id:null,guest_character_id:null,host_ready:false,guest_ready:false,status:'waiting',battle_id:null});return room;}return (await this.pool.query("UPDATE draw_rooms SET host_character_id=NULL,guest_character_id=NULL,host_ready=FALSE,guest_ready=FALSE,status='waiting',battle_id=NULL,updated_at=NOW() WHERE code=$1 RETURNING *",[code])).rows[0];}
}
