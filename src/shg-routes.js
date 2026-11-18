// Ephemeral authenticated friend-room PvP for CASTLE SHOGI.
// All moves are validated on the server using the same engine as local play.
import {randomBytes} from 'node:crypto';
import {newGame,play} from '../public/SHG/engine.js';
import {validateLoadout} from '../public/SHG/specials.js';

const CODE=/^[A-Z2-9]{6}$/;
const MAX_ROOMS=160;
const TTL=3*60*60*1000;
function cleanArts(arts){
  return Array.isArray(arts)?arts.slice(0,2).map(v=>String(v||'').slice(0,160)):[];
}
function error(res,status,msg){return res.status(status).json({error:msg});}
export function mountCastleShogi(app,{currentUser}){
  const rooms=new Map();
  function prune(){
    const now=Date.now();
    for(const [k,r] of rooms)if(now-r.updated>TTL)rooms.delete(k);
  }
  async function user(req,res){
    const u=await currentUser(req);
    if(!u)error(res,401,'AAbattleアカウントにログインしてください。');
    return u;
  }
  function view(r,u){
    return {code:r.code,revision:r.revision,side:u.id===r.host.id?1:-1,host:r.host.username,
      guest:r.guest?.username||null,updated:r.updated,game:r.game};
  }
  function owned(r,u){return r.host.id===u.id||r.guest?.id===u.id;}
  app.post('/api/SHG/rooms',async(req,res)=>{
    try{
      const u=await user(req,res);if(!u)return;
      prune();
      const ids=req.body?.loadout||[];
      if(!validateLoadout(ids))return error(res,400,'編成は3体以内、合計9コスト以内で設定してください。');
      if(rooms.size>=MAX_ROOMS)return error(res,503,'対戦ルームの上限に達しました。');
      let code;do{code=randomBytes(5).toString('base64url').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);}while(code.length<6||rooms.has(code));
      const r={code,host:{id:u.id,username:u.username},guest:null,loadouts:{1:ids},aa:{1:cleanArts(req.body?.aa)},game:null,revision:0,updated:Date.now()};
      rooms.set(code,r);res.status(201).json(view(r,u));
    }catch(e){console.error('SHG create',e);error(res,500,'ルーム作成に失敗しました。');}
  });
  app.post('/api/SHG/rooms/:code/join',async(req,res)=>{
    try{
      const u=await user(req,res);if(!u)return;prune();
      const code=String(req.params.code||'').toUpperCase(),r=rooms.get(code);
      if(!CODE.test(code)||!r)return error(res,404,'ルームが見つかりません。');
      if(r.host.id===u.id)return res.json(view(r,u));
      if(r.guest&&r.guest.id!==u.id)return error(res,409,'ルームは満員です。');
      if(!r.guest){
        const ids=req.body?.loadout||[];
        if(!validateLoadout(ids))return error(res,400,'編成コストが上限を超えています。');
        r.guest={id:u.id,username:u.username};
        r.loadouts[-1]=ids;r.aa[-1]=cleanArts(req.body?.aa);
        // Online rooms allow all units, but no purchased-stat advantage. Mastery is cosmetic here.
        r.game=newGame({loadouts:r.loadouts,aa:r.aa});
        r.revision=1;
      }
      r.updated=Date.now();res.json(view(r,u));
    }catch(e){console.error('SHG join',e);error(res,500,'参加できませんでした。');}
  });
  app.get('/api/SHG/rooms/:code',async(req,res)=>{
    try{
      const u=await user(req,res);if(!u)return;prune();
      const code=String(req.params.code||'').toUpperCase(),r=rooms.get(code);
      if(!CODE.test(code)||!r)return error(res,404,'ルームが見つかりません。');
      if(!owned(r,u))return error(res,403,'この対局の参加者ではありません。');
      res.set('Cache-Control','no-store').json(view(r,u));
    }catch(e){console.error('SHG view',e);error(res,500,'対局を取得できませんでした。');}
  });
  app.post('/api/SHG/rooms/:code/action',async(req,res)=>{
    try{
      const u=await user(req,res);if(!u)return;prune();
      const code=String(req.params.code||'').toUpperCase(),r=rooms.get(code);
      if(!CODE.test(code)||!r)return error(res,404,'ルームが見つかりません。');
      if(!owned(r,u))return error(res,403,'この対局の参加者ではありません。');
      if(!r.game)return error(res,409,'相手の参加を待っています。');
      if(req.body?.revision!==r.revision)return error(res,409,'盤面が更新されました。再読み込みしてください。');
      const side=r.host.id===u.id?1:-1;
      if(r.game.turn!==side)return error(res,403,'今は相手のターンです。');
      try{r.game=play(r.game,req.body.action);}catch(e){return error(res,400,String(e.message).slice(0,160));}
      r.revision++;r.updated=Date.now();res.json(view(r,u));
    }catch(e){console.error('SHG action',e);error(res,500,'行動を処理できませんでした。');}
  });
  return {rooms};
}
