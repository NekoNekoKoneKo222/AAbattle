import { randomUUID } from 'node:crypto';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { PixelStore, PixelError } from './pixel-store.js';
import { analyzePixel, judgePixel, pixelHash, validatePixelImage, validatePixelProject } from './pixel-ai.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (message, status=400) => { throw new PixelError(message,status); };
const nameOf = value => { const name=String(value??'').trim(); if(!name||name.length>64)fail('名前は1～64文字で入力してください。'); return name; };
const tagsOf = value => Array.isArray(value) ? [...new Set(value.filter(v=>typeof v==='string').map(v=>v.trim().slice(0,24)).filter(Boolean))].slice(0,8) : [];
const stageOf = value => String(value||'中立の舞台').trim().slice(0,80)||'中立の舞台';
const safeRoom = room => room && ({code:room.code,status:room.status,hostId:room.host_id,guestId:room.guest_id,hostCharacterId:room.host_character_id,guestCharacterId:room.guest_character_id,hostReady:room.host_ready,guestReady:room.guest_ready,battleId:room.battle_id});

export function mountPixelRoutes(app,{pool,currentUser}) {
  const store=new PixelStore(pool);
  const wss=new WebSocketServer({noServer:true,maxPayload:2048});
  const sockets=new Map();
  const inFlight=new Set();
  const judging=new Set();
  const api=express.Router();
  const send=(userId,event)=>{for(const ws of sockets.get(userId)||[])if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(event));};
  const roomEvent=room=>{for(const id of [room.host_id,room.guest_id])if(id)send(id,{type:'room',room:safeRoom(room)});};
  const wrap=fn=>async(req,res)=>{try{
    if(req.method!=='GET'){
      const origin=req.get('origin');
      if(origin&&new URL(origin).host!==req.get('host'))fail('送信元が一致しません。',403);
      if(!req.is('application/json'))fail('JSONで送信してください。',415);
    }
    const user=await currentUser(req);
    await fn(req,res,user);
  }catch(error){
    const message=String(error?.message||'');
    const expected=/^(PNG画像|ドット絵データ|レイヤーのピクセル|AIの応答|AIの能力|AIの勝敗|AIの戦闘|Gemini|GEMINI_API_KEY)/.test(message);
    if(!(error instanceof PixelError)&&!expected)console.error('PIXEL MYTH:',error);
    res.status(error instanceof PixelError?error.status:expected&&/^(AI|Gemini|GEMINI_API_KEY)/.test(message)?503:expected?400:500).json({error:error instanceof PixelError||expected?message:'処理に失敗しました。'});
  }};
  const need=user=>user||fail('AAbattleアカウントでログインしてください。',401);
  const checkedInput=body=>{
    const name=nameOf(body?.name);
    const project=validatePixelProject(body?.project);
    const png=validatePixelImage(body?.png,project.size);
    return {name,project,png};
  };
  const doAnalysis=async(user,input)=>{
    if(inFlight.has(user.id))fail('AI解析中です。完了をお待ちください。',409);
    inFlight.add(user.id);
    try{
      const key=pixelHash(input.name,input.png);
      const cached=await store.cached(key);
      if(cached)return cached;
      await store.charge(user.id,'analysis',12);
      const analysis=await analyzePixel(input);
      await store.cacheAnalysis(key,analysis);
      return analysis;
    }finally{inFlight.delete(user.id);}
  };
  const viewBattle=async(battle,user)=>{
    if(!battle)fail('対戦が見つかりません。',404);
    if(battle.creator_id!==user.id && battle.result?.guestId!==user.id){
      const room=await store.roomByBattle?.(battle.id);
      if(!room||room.guest_id!==user.id)fail('対戦が見つかりません。',404);
    }
    const [a,b]=await Promise.all([store.version(battle.a_version_id),store.version(battle.b_version_id)]);
    return {...battle,a:{png:a?.png,analysis:a?.analysis},b:{png:b?.png,analysis:b?.analysis}};
  };
  const runJudge=async(battle,a,b,roomCode=null,guestId=null)=>{
    if(judging.has(battle.id))return;
    judging.add(battle.id);
    try{
      const result=await judgePixel(a,b,battle.stage);
      const saved=await store.completeBattle(battle.id,{...result,a:{name:a.name,png:a.png,analysis:a.analysis},b:{name:b.name,png:b.png,analysis:b.analysis},stage:battle.stage,guestId});
      if(roomCode){const room=await store.finishRoom(roomCode,battle.id,'complete');roomEvent(room);}
      send(battle.creator_id,{type:'battle',battleId:battle.id,status:saved.status});
    }catch(error){console.error('PIXEL MYTH judge:',error.message);await store.completeBattle(battle.id,guestId?{guestId}:null,error.message);if(roomCode){const room=await store.finishRoom(roomCode,battle.id,'error');roomEvent(room);}send(battle.creator_id,{type:'battle',battleId:battle.id,status:'error'});}
    finally{judging.delete(battle.id);}
  };
  const recoveryTimer=setInterval(async()=>{try{
    for(const battle of await store.recoverableBattles()){
      const [a,b,room]=await Promise.all([store.version(battle.a_version_id),store.version(battle.b_version_id),store.roomByBattle(battle.id)]);
      if(!a||!b){await store.completeBattle(battle.id,null,'保存済みキャラクターの版を読み込めませんでした。');continue;}
      runJudge(battle,{name:a.name,png:a.png,analysis:a.analysis},{name:b.name,png:b.png,analysis:b.analysis},room?.code,room?.guest_id);
    }
  }catch(error){console.error('PIXEL MYTH recovery:',error.message);}},30000);
  recoveryTimer.unref?.();

  api.get('/config',wrap(async(_req,res,user)=>res.json({user:user?{id:user.id,username:user.username}:null,aiAvailable:Boolean(process.env.GEMINI_API_KEY),sizes:[16,32,64,128],analysisLimitPerHour:12})));
  api.get('/characters',wrap(async(req,res,user)=>{const publicOnly=req.query.scope==='public';if(!publicOnly)need(user);res.json(await store.list(user?.id??null,{publicOnly,query:String(req.query.q||'').slice(0,80),sort:String(req.query.sort||'new'),page:req.query.page}));}));
  api.get('/characters/:id',wrap(async(req,res,user)=>{if(!uuid(req.params.id))fail('IDが不正です。');const c=await store.get(req.params.id,user?.id??null);if(!c)fail('キャラクターが見つかりません。',404);res.json(c);}));
  api.get('/characters/:id/versions',wrap(async(req,res,user)=>{need(user);res.json({versions:await store.history(req.params.id,user.id)});}));
  api.get('/characters/:id/versions/:versionId',wrap(async(req,res,user)=>{need(user);await store.own(req.params.id,user.id);const version=await store.version(req.params.versionId);if(!version||version.character_id!==req.params.id)fail('バージョンが見つかりません。',404);res.json(version);}));
  api.post('/characters',wrap(async(req,res,user)=>{need(user);const input=checkedInput(req.body);const analysis=await doAnalysis(user,input);const c=await store.create(user,{...input,analysis,visibility:req.body.visibility==='public'?'public':'private',copyAllowed:req.body.copyAllowed===true,tags:tagsOf(req.body.tags)});res.status(201).json(c);}));
  api.put('/characters/:id',wrap(async(req,res,user)=>{need(user);await store.own(req.params.id,user.id);const input=checkedInput(req.body);const analysis=await doAnalysis(user,input);res.json(await store.revise(user,req.params.id,{...input,analysis}));}));
  api.patch('/characters/:id',wrap(async(req,res,user)=>{need(user);const c=await store.own(req.params.id,user.id);res.json(await store.metadata(user,c.id,{name:nameOf(req.body.name??c.name),visibility:req.body.visibility==='public'?'public':'private',copyAllowed:req.body.copyAllowed===true,favorite:req.body.favorite===true,tags:tagsOf(req.body.tags)}));}));
  api.delete('/characters/:id',wrap(async(req,res,user)=>{need(user);await store.remove(user,req.params.id);res.json({ok:true});}));
  api.post('/characters/:id/copy',wrap(async(req,res,user)=>{need(user);const c=await store.get(req.params.id,user.id);if(!c||c.visibility!=='public'||!c.copy_allowed)fail('コピーできません。',403);const copy=await store.create(user,{name:`${c.name} のコピー`.slice(0,64),project:c.project,png:c.png,analysis:c.analysis,originalAuthorId:c.original_author_id||c.owner_id});res.status(201).json(copy);}));
  api.get('/battles',wrap(async(_req,res,user)=>{need(user);res.json({battles:await store.listBattles(user.id)});}));
  api.get('/battles/:id',wrap(async(req,res,user)=>{need(user);res.json(await viewBattle(await store.getBattle(req.params.id),user));}));
  api.post('/battles',wrap(async(req,res,user)=>{
    need(user);const requestId=req.body.requestId;if(!uuid(requestId))fail('リクエストIDが不正です。');
    const existing=await store.battleByRequest(requestId);if(existing){if(existing.creator_id!==user.id)fail('対戦IDを使用できません。',403);return res.json(await viewBattle(existing,user));}
    if(inFlight.has(`battle:${user.id}`))fail('AI判定中です。',409);
    const a=await store.own(req.body.aId,user.id),b=await store.get(req.body.bId,user.id);
    if(!b||a.id===b.id)fail('対戦相手を選んでください。');
    await store.charge(user.id,'battle',24);
    const battle=await store.createBattle({requestId,creatorId:user.id,aVersionId:a.version_id,bVersionId:b.version_id,mode:'solo',stage:stageOf(req.body.stage)});
    inFlight.add(`battle:${user.id}`);
    runJudge(battle,{name:a.name,png:a.png,analysis:a.analysis},{name:b.name,png:b.png,analysis:b.analysis}).finally(()=>inFlight.delete(`battle:${user.id}`));
    res.status(202).json({id:battle.id,status:battle.status});
  }));
  const roomFor=async(code,user)=>{const room=await store.room(String(code||'').toUpperCase());if(!room||![room.host_id,room.guest_id].includes(user.id))fail('ルームが見つかりません。',404);return room;};
  api.post('/rooms',wrap(async(_req,res,user)=>{need(user);const room=await store.createRoom(user);roomEvent(room);res.status(201).json(safeRoom(room));}));
  api.post('/rooms/:code/join',wrap(async(req,res,user)=>{need(user);const room=await store.joinRoom(String(req.params.code).toUpperCase(),user.id);roomEvent(room);res.json(safeRoom(room));}));
  api.get('/rooms/:code',wrap(async(req,res,user)=>{need(user);res.json(safeRoom(await roomFor(req.params.code,user)));}));
  api.post('/rooms/:code/ready',wrap(async(req,res,user)=>{
    need(user);const code=String(req.params.code).toUpperCase();await roomFor(code,user);const c=await store.own(req.body.characterId,user.id);
    let room=await store.readyRoom(code,user.id,c.id);roomEvent(room);
    const claimed=await store.claimRoom(code);
    if(claimed){
      const [a,b]=await Promise.all([store.get(claimed.host_character_id,claimed.host_id),store.get(claimed.guest_character_id,claimed.guest_id)]);
      if(!a||!b){room=await store.finishRoom(code,null,'error');roomEvent(room);fail('キャラクターを読み込めません。',409);}
      try{await store.charge(claimed.host_id,'battle',24);const battle=await store.createBattle({requestId:randomUUID(),creatorId:claimed.host_id,aVersionId:a.version_id,bVersionId:b.version_id,mode:'online',stage:'オンラインアリーナ'});room=await store.finishRoom(code,battle.id,'judging');roomEvent(room);runJudge(battle,{name:a.name,png:a.png,analysis:a.analysis},{name:b.name,png:b.png,analysis:b.analysis},code,claimed.guest_id);}
      catch(error){room=await store.finishRoom(code,null,'error');roomEvent(room);throw error;}
    }
    res.json(safeRoom(room));
  }));
  api.post('/rooms/:code/rematch',wrap(async(req,res,user)=>{need(user);const room=await store.rematchRoom(String(req.params.code).toUpperCase(),user.id);roomEvent(room);res.json(safeRoom(room));}));
  api.post('/rooms/:code/leave',wrap(async(req,res,user)=>{need(user);const room=await store.leaveRoom(String(req.params.code).toUpperCase(),user.id);roomEvent(room);res.json(safeRoom(room));}));
  app.use('/api/draw',api);
  wss.on('connection',(ws,req,user)=>{let set=sockets.get(user.id);if(!set){set=new Set();sockets.set(user.id,set);}set.add(ws);ws.send(JSON.stringify({type:'ready'}));ws.on('close',()=>{set.delete(ws);if(!set.size)sockets.delete(user.id);});});
  return {upgrade:(req,socket,head,user)=>wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req,user)),store};
}
