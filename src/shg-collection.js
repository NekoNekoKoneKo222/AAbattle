import {randomInt} from 'node:crypto';
import {BY_ID,SPECIALS} from '../public/SHG/specials.js';
const STARTER={slash:1,guardian:1,sniper:1};
export const GACHA_PRICE=150;
export const RARITY_RATES={common:50,rare:30,epic:14,legendary:5,mythic:1};
export function rarityOf(p){
  if(p.id==='goch')return 'special';
  if(['nich','yaruo','phoenix','void','luck'].includes(p.id))return 'mythic';
  const index=SPECIALS.findIndex(q=>q.id===p.id);
  return index%11===0?'legendary':index%5===0?'epic':index%3===0?'rare':'common';
}
export const shardValue={common:12,rare:26,epic:65,legendary:150,mythic:300};
export const craftPrice={common:90,rare:190,epic:450,legendary:1000,mythic:1800};
const weighted=Object.entries(RARITY_RATES);
function draw(){
  const roll=randomInt(100);let n=0,rarity='common';
  for(const [r,w] of weighted){n+=w;if(roll<n){rarity=r;break;}}
  let candidates=SPECIALS.filter(p=>p.id!=='goch'&&rarityOf(p)===rarity);
  if(!candidates.length)candidates=SPECIALS.filter(p=>p.id!=='goch');
  return candidates[randomInt(candidates.length)];
}
export function createShgCollection(pool){
  let initialized;
  async function ensure(){
    if(!pool)throw Object.assign(new Error('データベース未接続。ガチャは利用できません。'),{status:503});
    if(!initialized)initialized=pool.query(
      "CREATE TABLE IF NOT EXISTS shg_profiles (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, coins INTEGER NOT NULL DEFAULT 900 CHECK (coins>=0), shards INTEGER NOT NULL DEFAULT 0 CHECK(shards>=0), pieces JSONB NOT NULL DEFAULT '{\"slash\":1,\"guardian\":1,\"sniper\":1}'::jsonb, mastery JSONB NOT NULL DEFAULT '{}'::jsonb, daily_day DATE, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    ).catch(e=>{initialized=null;throw e});
    await initialized;
  }
  async function init(client,userId){
    await client.query('INSERT INTO shg_profiles (user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
  }
  function view(row){
    return {coins:row.coins,shards:row.shards,pieces:row.pieces||{},mastery:row.mastery||{},wins:row.wins,losses:row.losses,
      dailyAvailable:row.daily_day!==new Date().toISOString().slice(0,10)};
  }
  async function locked(userId,fn){
    await ensure();const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await init(client,userId);
      const {rows:[row]}=await client.query('SELECT * FROM shg_profiles WHERE user_id=$1 FOR UPDATE',[userId]);
      const result=await fn(client,row);
      await client.query('COMMIT');return result;
    }catch(e){await client.query('ROLLBACK');throw e;}
    finally{client.release();}
  }
  async function get(userId){return locked(userId,(_c,row)=>view(row));}
  async function has(userId,ids){
    const profile=await get(userId);
    return ids.every(id=>(profile.pieces[id]||0)>0);
  }
  async function pull(userId,count){
    if(![1,10].includes(count))throw Object.assign(new Error('1回または10連を選んでください。'),{status:400});
    return locked(userId,async(client,row)=>{
      const price=count*GACHA_PRICE;
      if(row.coins<price)throw Object.assign(new Error('コインが足りません。'),{status:400});
      const pieces={...row.pieces},results=[];
      for(let i=0;i<count;i++){
        const p=draw(),newPiece=!pieces[p.id];
        pieces[p.id]=(pieces[p.id]||0)+1;
        results.push({id:p.id,name:p.name,rarity:rarityOf(p),newPiece});
      }
      const {rows:[next]}=await client.query('UPDATE shg_profiles SET coins=coins-$2,pieces=$3::jsonb,updated_at=NOW() WHERE user_id=$1 RETURNING *',[userId,price,JSON.stringify(pieces)]);
      return {profile:view(next),results};
    });
  }
  async function convert(userId,id,count){
    const p=BY_ID[id];if(!p||id==='goch')throw Object.assign(new Error('変換できない駒です。'),{status:400});
    if(!Number.isSafeInteger(count)||count<1||count>9999)throw Object.assign(new Error('変換数が不正です。'),{status:400});
    return locked(userId,async(client,row)=>{
      const pieces={...row.pieces};
      if((pieces[id]||0)<count)throw Object.assign(new Error('所持数が不足しています。'),{status:400});
      pieces[id]-=count;if(pieces[id]===0)delete pieces[id];
      const gain=shardValue[rarityOf(p)]*count;
      const {rows:[next]}=await client.query('UPDATE shg_profiles SET pieces=$2::jsonb,shards=shards+$3,updated_at=NOW() WHERE user_id=$1 RETURNING *',[userId,JSON.stringify(pieces),gain]);
      return {profile:view(next),gained:gain,name:p.name};
    });
  }
  async function craft(userId,id){
    const p=BY_ID[id];if(!p||id==='goch')throw Object.assign(new Error('交換対象が不正です。'),{status:400});
    return locked(userId,async(client,row)=>{
      const price=craftPrice[rarityOf(p)];
      if(row.shards<price)throw Object.assign(new Error('欠片が足りません。'),{status:400});
      const pieces={...row.pieces,[id]:(row.pieces?.[id]||0)+1};
      const {rows:[next]}=await client.query('UPDATE shg_profiles SET shards=shards-$2,pieces=$3::jsonb,updated_at=NOW() WHERE user_id=$1 RETURNING *',[userId,price,JSON.stringify(pieces)]);
      return {profile:view(next),name:p.name};
    });
  }
  async function daily(userId){
    return locked(userId,async(client,row)=>{
      // UTC day to avoid timezone ambiguity and client clock spoofing.
      const today=new Date().toISOString().slice(0,10);
      const current=row.daily_day?new Date(row.daily_day).toISOString().slice(0,10):'';
      if(current===today)throw Object.assign(new Error('今日のログイン報酬は受け取り済みです。'),{status:400});
      const {rows:[next]}=await client.query('UPDATE shg_profiles SET coins=coins+300,daily_day=$2,updated_at=NOW() WHERE user_id=$1 RETURNING *',[userId,today]);
      return {profile:view(next),gained:300};
    });
  }
  async function award(userId,won,masteryIds=[]){
    return locked(userId,async(client,row)=>{
      const mastery={...row.mastery};
      for(const id of new Set(masteryIds.filter(id=>BY_ID[id]&&id!=='goch')))mastery[id]=Math.max(0,Number(mastery[id])||0)+25;
      const {rows:[next]}=await client.query('UPDATE shg_profiles SET coins=coins+$2,wins=wins+$3,losses=losses+$4,mastery=$5::jsonb,updated_at=NOW() WHERE user_id=$1 RETURNING *',
       [userId,won?150:75,won?1:0,won?0:1,JSON.stringify(mastery)]);
      return {profile:view(next)};
    });
  }
  return {get,has,pull,convert,craft,daily,award};
}
export function mountShgCollection(app,{currentUser,collection}){
  const wrap=(handler)=>async(req,res)=>{
    try{
      const u=await currentUser(req);if(!u)return res.status(401).json({error:'AAbattleにログインしてください。'});
      if(req.method!=='GET'){
        const origin=req.get('origin');
        if(origin&&new URL(origin).host!==req.get('host'))return res.status(403).json({error:'送信元が不正です。'});
      }
      res.json(await handler(req,u));
    }catch(e){if(!e.status||e.status>=500)console.error('SHG collection',e);
      res.status(e.status||500).json({error:e.status?e.message:'収集データの処理に失敗しました。'});
    }
  };
  app.get('/api/SHG/collection',wrap((_req,u)=>collection.get(u.id)));
  app.post('/api/SHG/collection/pull',wrap((req,u)=>collection.pull(u.id,Number(req.body?.count))));
  app.post('/api/SHG/collection/convert',wrap((req,u)=>collection.convert(u.id,req.body?.id,Number(req.body?.count))));
  app.post('/api/SHG/collection/craft',wrap((req,u)=>collection.craft(u.id,req.body?.id)));
  app.post('/api/SHG/collection/daily',wrap((_req,u)=>collection.daily(u.id)));
}