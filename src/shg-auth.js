// Separate Castle Shogi identity store. Does not modify AAbattle users or sessions.
// Guests can upgrade in place to a recoverable username/password SHG account.
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import argon2 from 'argon2';

const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
const SHA = v=>createHash('sha256').update(v).digest('hex');
const GUEST_PREFIX = 'Guest_';
const usernamePattern = /^[A-Za-z0-9_]{3,20}$/;
const rateBuckets = new Map();
function deny(message,status=400){return Object.assign(new Error(message),{status});}
function rateLimit(key){
  const now=Date.now(),current=(rateBuckets.get(key)||[]).filter(t=>t>now-15*60*1000);
  if(current.length>=12)throw deny('操作が多すぎます。しばらくしてから再度お試しください。',429);
  current.push(now);rateBuckets.set(key,current);
  if(rateBuckets.size>5000)for(const [k,v] of rateBuckets)if(v[v.length-1]<now-15*60*1000)rateBuckets.delete(k);
}
export function createShgAuth(pool){
  let initPromise;
  async function ensure(){
    if(!pool)throw deny('SHGデータベースに接続されていません。',503);
    if(!initPromise)initPromise=(async()=>{
      await pool.query(`CREATE TABLE IF NOT EXISTS shg_players (
        id UUID PRIMARY KEY, username VARCHAR(32) NOT NULL,
        username_key VARCHAR(32) UNIQUE, password_hash TEXT,
        is_guest BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS shg_sessions (
        token_hash TEXT PRIMARY KEY, player_id UUID NOT NULL REFERENCES shg_players(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL)`);
      await pool.query('CREATE INDEX IF NOT EXISTS shg_sessions_player_idx ON shg_sessions (player_id)');
    })().catch(error=>{initPromise=null;throw error});
    return initPromise;
  }
  function tokenFrom(req){
    const raw=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('shg_sid='));
    const token=raw?.slice('shg_sid='.length);
    return token && /^[0-9a-f]{64}$/.test(token)?token:null;
  }
  async function current(req){
    await ensure();
    const token=tokenFrom(req);if(!token)return null;
    const {rows}=await pool.query(`SELECT p.id,p.username,p.is_guest
      FROM shg_sessions s JOIN shg_players p ON p.id=s.player_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW()`,[SHA(token)]);
    return rows[0]||null;
  }
  async function issue(res,userId){
    const token=randomBytes(32).toString('hex'),secure=process.env.NODE_ENV==='production'?'; Secure':'';
    await pool.query('INSERT INTO shg_sessions(token_hash,player_id,expires_at) VALUES($1,$2,$3)',
      [SHA(token),userId,new Date(Date.now()+SESSION_AGE)]);
    res.setHeader('Set-Cookie',`shg_sid=${token}; HttpOnly; Path=/api/SHG; SameSite=Lax; Max-Age=${SESSION_AGE/1000}${secure}`);
  }
  function nameAndPassword(body){
    const username=String(body?.username||'').trim(),password=String(body?.password||'');
    if(!usernamePattern.test(username))throw deny('ユーザー名は英数字または _ で3〜20文字にしてください。');
    if(password.length<10||password.length>128)throw deny('パスワードは10〜128文字にしてください。');
    return {username,key:username.toLowerCase(),password};
  }
  async function guest(req,res){
    await ensure();
    const existing=await current(req);if(existing)return existing;
    const userId=randomUUID(),name=GUEST_PREFIX+randomBytes(4).toString('hex');
    await pool.query('INSERT INTO shg_players(id,username,is_guest) VALUES($1,$2,TRUE)',[userId,name]);
    await issue(res,userId);
    return {id:userId,username:name,is_guest:true};
  }
  async function register(req,res,body){
    await ensure();const {username,key,password}=nameAndPassword(body),old=await current(req);
    const passHash=await argon2.hash(password);
    try{
      let id;
      if(old?.is_guest){
        id=old.id;
        await pool.query('UPDATE shg_players SET username=$2,username_key=$3,password_hash=$4,is_guest=FALSE WHERE id=$1',
          [id,username,key,passHash]);
      }else{
        id=randomUUID();
        await pool.query('INSERT INTO shg_players(id,username,username_key,password_hash,is_guest) VALUES($1,$2,$3,$4,FALSE)',
          [id,username,key,passHash]);
        await issue(res,id);
      }
      return {id,username,is_guest:false};
    }catch(error){
      if(error.code==='23505')throw deny('このユーザー名はすでに使用されています。',409);
      throw error;
    }
  }
  async function login(req,res,body){
    await ensure();
    const username=String(body?.username||'').trim(),password=String(body?.password||'');
    if(!usernamePattern.test(username)||!password)throw deny('ユーザー名またはパスワードが正しくありません。',401);
    const {rows}=await pool.query('SELECT id,username,password_hash FROM shg_players WHERE username_key=$1 AND is_guest=FALSE',[username.toLowerCase()]);
    if(!rows[0]||!await argon2.verify(rows[0].password_hash,password))throw deny('ユーザー名またはパスワードが正しくありません。',401);
    await issue(res,rows[0].id);
    return {id:rows[0].id,username:rows[0].username,is_guest:false};
  }
  async function logout(req,res){
    const token=tokenFrom(req);
    if(token)await pool.query('DELETE FROM shg_sessions WHERE token_hash=$1',[SHA(token)]);
    res.setHeader('Set-Cookie','shg_sid=; HttpOnly; Path=/api/SHG; SameSite=Lax; Max-Age=0'+(process.env.NODE_ENV==='production'?'; Secure':''));
  }
  return {ensure,current,guest,register,login,logout,rateLimit};
}
export function mountShgAuth(app,auth){
  const handler=fn=>async(req,res)=>{
    try{
      if(req.method!=='GET'){
        if(req.get('content-type')&&!req.is('application/json'))throw deny('JSON形式で送信してください。',415);
        const origin=req.get('origin');
        if(origin&&new URL(origin).host!==req.get('host'))throw deny('送信元を確認できません。',403);
        auth.rateLimit(req.ip+'-'+req.path);
      }
      const u=await fn(req,res);
      if(!res.headersSent)res.json({user:u});
    }catch(error){
      if((error.status||500)>=500)console.error('SHG auth:',error.message);
      res.status(error.status||500).json({error:error.status?error.message:'SHGアカウント処理に失敗しました。'});
    }
  };
  app.get('/api/SHG/auth/me',handler(async req=>{
    const u=await auth.current(req);if(!u)throw deny('SHGへのログインが必要です。',401);return u;
  }));
  app.post('/api/SHG/auth/guest',handler((req,res)=>auth.guest(req,res)));
  app.post('/api/SHG/auth/register',handler((req,res)=>auth.register(req,res,req.body)));
  app.post('/api/SHG/auth/login',handler((req,res)=>auth.login(req,res,req.body)));
  app.post('/api/SHG/auth/logout',handler(async(req,res)=>{await auth.logout(req,res);return null;}));
}
