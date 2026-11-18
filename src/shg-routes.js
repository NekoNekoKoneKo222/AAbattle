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
export function mountCastleShogi(app,{currentUser,collection}){
  const rooms=new Map();
  const waiting=new Map();
  const quickByUser=new Map();
  function prune(){
    const now=Date.now();
    for(const [k,r] of rooms)if(now-r.updated>TTL)rooms.delete(k);
    for(const [id,q] of waiting)if(now-q.updated>60000)waiting.delete(id);
    for(const [id,code] of quickByUser)if(!rooms.has(code))quickByUser.delete(id);
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
  async function verifyLoadout(u,ids,res){
    if(!validateLoadout(ids)){error(res,400,'最大3体・合計コスト9以内の編成にしてください。');return false;}
    if(!await collection.has(u.id,ids)){error(res,403,'未所持の駒があります。ガチャか欠片交換で入手してください。');return false;}
    return true;
  }
  function codeNow(){
    let code;
    do{code=randomBytes(5).toString('base64url').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6);}
    while(code.length<6||rooms.has(code));
    return code;
  }
  async function payOutcome(r){
    if(!r.quick||r.paid||!r.game?.win||r.game.win===2)return;
    r.paid=true;
    const win=r.game.win;
    const [host,guest]=[r.host,r.guest];
    await Promise.allSettled([
      collection.award(host.id,win===1,r.loadouts[1]),
      collection.award(guest.id,win===-1,r.loadouts[-1])
    ]);
  }
  app.post('/api/SHG/quick/join',async(req,res)=>{
    try{
      const u=await user(req,res);if(!u)return;prune();
      const ids=req.body?.loadout||[];
      if(!await verifyLoadout(u,ids,res))return;
      const found=rooms.get(quickByUser.get(u.id));
      if(found)return res.json({status:'matched',room:view(found,u)});
      if(waiting.has(u.id)){waiting.get(u.id).updated=Date.now();return res.json({status:'waiting',waitingCount:waiting.size});}
      if(rooms.size>=MAX_ROOMS)return error(res,503,'マッチの上限に達しています。');
      const opponent=[...waiting.values()].sort((a,b)=>a.created-b.created).find(q=>q.user.id!==u.id);
      if(!opponent){
        waiting.set(u.id,{user:{id:u.id,username:u.username},loadout:ids,aa:cleanArts(req.body?.aa),created:Date.now(),updated:Date.now()});
        return res.json({status:'waiting',waitingCount:waiting.size});
      }
      waiting.delete(opponent.user.id);
      const code=codeNow(),r={code,quick:true,host:opponent.user,guest:{id:u.id,username:u.username},
        loadouts:{1:opponent.loadout,'-1':ids},aa:{1:opponent.aa,'-1':cleanArts(req.body?.aa)},
        revision:1,updated:Date.now(),paid:false};
      r.game=newGame({loadouts:r.loadouts,aa:r.aa});
      rooms.set(code,r);quickByUser.set(u.id,code);quickByUser.set(opponent.user.id,code);
      res.json({status:'matched',room:view(r,u)});
    }catch(e){console.error('SHG quick join',e);error(res,500,'クイックマッチを開始できませんでした。');}
  });
  app.get('/api/SHG/quick/status',async(req,res)=>{
    try{
      const u=await user(req,res);if(!u)return;prune();
      const r=rooms.get(quickByUser.get(u.id));
      if(r)return res.json({status:'matched',room:view(r,u)});
      const q=waiting.get(u.id);if(q){q.updated=Date.now();return res.json({status:'waiting',waitingCount:waiting.size});}
      res.json({status:'idle'});
    }catch(e){console.error('SHG quick status',e);error(res,500,'待機状況を取得できませんでした。');}
  });
  app.post('/api/SHG/quick/cancel',async(req,res)=>{
    try{
      const u=await user(req,res);if(!u)return;
      waiting.delete(u.id);
      const r=rooms.get(quickByUser.get(u.id));
      if(r&&r.game?.win){quickByUser.delete(u.id);}
      res.json({status:'idle'});
    }catch(e){error(res,500,'待機を解除できませんでした。');}
  });
  app.post('/api/SHG/rooms',async(req,res)=>{
    try{
      const u=await user(req,res);if(!u)return;
      prune();
      const ids=req.body?.loadout||[];
      if(!await verifyLoadout(u,ids,res))return;
      if(rooms.size>=MAX_ROOMS)return error(res,503,'対戦ルームの上限に達しました。');
      const code=codeNow();
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
        if(!await verifyLoadout(u,ids,res))return;
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
      r.revision++;r.updated=Date.now();await payOutcome(r);res.json(view(r,u));
    }catch(e){console.error('SHG action',e);error(res,500,'行動を処理できませんでした。');}
  });
  return {rooms};
}
