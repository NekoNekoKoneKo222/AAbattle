import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newGame, applyAction, cpuAction, view, expire } from './chaos-shogi.js';
import { CARD_CATALOG, COMBOS, cpuCardAction } from './chaos-cards.js';
import { createChaosOnline } from './chaos-online.js';
import { STARTER_DECK, packTargets } from './chaos-collection.js';
import { cardArtSvg } from './chaos-art.js';
const cardArtDirectory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/CSH/card-art');
import { visualEvent } from './chaos-visual.js';

export function resolveCpuStep(state){
  if(!state.cpu||state.status!=='playing'||state.turn!=='w')return {game:state,events:[],comboEvents:[]};
  let action=null;
  if(!state.cards.w.cardPlayed&&(state.cpuDifficulty!=='easy'||Math.random()<.35))action=cpuCardAction(state);
  if(action)try{const next=applyAction(state,action),event=visualEvent(state,next,action);return {game:next,events:event?[event]:[],comboEvents:[...next.comboEvents]};}catch{/* Invalid optional card: continue to a legal move. */}
  action=cpuAction(state,state.cpuDifficulty);
  if(!action)return {game:{...state,status:'finished',winner:'b',reason:'CPUに合法手なし',revision:state.revision+1,log:[...state.log,'CPUに合法手がなく先手の勝ち']},events:[],comboEvents:[]};
  const next=applyAction(state,action),event=visualEvent(state,next,action);
  return {game:next,events:event?[event]:[],comboEvents:[...next.comboEvents]};
}
export function resolveCpuTurn(state){
  let next=state;const events=[],comboEvents=[];
  for(let count=0;count<9&&next.cpu&&next.status==='playing'&&next.turn==='w';count++){const step=resolveCpuStep(next);next=step.game;events.push(...step.events);comboEvents.push(...step.comboEvents);}
  return {game:next,events,comboEvents};
}

export function mountChaosShogi(app,{currentUser,collection,findUser}={}){
  const games=new Map(),cpuTimers=new Map(),router=express.Router();
  const fail=(res,status,message)=>res.status(status).json({error:message});
  function scheduleCpu(game){
    if(!game.cpu||game.status!=='playing'||game.turn!=='w')return;
    const delay=game.cpuStepCount?Math.max(800,Math.round(game.cpuThinkMs*.45)):game.cpuThinkMs;
    game.cpuReadyAt=Date.now()+delay;
    const timer=setTimeout(()=>advanceCpu(game.id,game.cpuReadyAt),delay);timer.unref?.();cpuTimers.set(game.id,timer);
  }
  function advanceCpu(id,expectedReadyAt){
    const current=games.get(id);if(!current||current.cpuReadyAt!==expectedReadyAt||current.turn!=='w'||current.status!=='playing')return;
    if(Date.now()<current.cpuReadyAt)return;
    clearTimeout(cpuTimers.get(id));cpuTimers.delete(id);expire(current);
    if(current.status!=='playing'){current.cpuReadyAt=null;return;}
    try{const step=resolveCpuStep(current),next=step.game;next.visualEvents=step.events;next.comboEvents=step.comboEvents;next.cpuStepCount=(current.cpuStepCount||0)+1;next.cpuReadyAt=null;games.set(id,next);scheduleCpu(next);}catch(error){console.error('CHAOS SHOGI CPU turn failed:',error);}
  }
  router.use((req,res,next)=>{
    if(req.method==='GET')return next();
    const origin=req.get('origin');
    if(origin){try{if(new URL(origin).host!==req.get('host'))return fail(res,403,'送信元が一致しません。');}catch{return fail(res,403,'送信元が不正です。');}}
    if(!req.is('application/json'))return fail(res,415,'JSONで送信してください。');
    next();
  });
  router.post('/games',(req,res)=>{
    if(games.size>=200)return fail(res,503,'対局数が上限です。時間をおいてください。');
    try{const cpu=req.body?.cpu===true,decks={b:req.body?.decks?.b,w:cpu?undefined:req.body?.decks?.w};if(cpu&&req.body?.cpuDifficulty!==undefined&&!['easy','normal','hard'].includes(req.body.cpuDifficulty))return fail(res,400,'CPU難易度が不正です。');const game=newGame({cpu,minutes:req.body?.minutes,decks,collapse:req.body?.collapse===true,cpuDifficulty:req.body?.cpuDifficulty,cpuThinkMs:req.body?.cpuThinkMs});games.set(game.id,game);res.status(201).json(view(game));}
    catch(error){fail(res,400,error.message);}
  });
  router.get('/cards',(_req,res)=>res.json({cards:Object.fromEntries(Object.entries(CARD_CATALOG).map(([id,card])=>[id,{...card,imagePath:`/api/CSH/cards/${encodeURIComponent(id)}/art.svg`}])),combos:COMBOS,defaultDeck:STARTER_DECK,packTargets:packTargets(),deckRules:{size:20,maxCopies:2,maxCounters:5,maxMythic:1,maxSaved:10}}));
  router.get('/cards/:id/art.svg',(req,res)=>{const card=Object.hasOwn(CARD_CATALOG,req.params.id)?CARD_CATALOG[req.params.id]:null;if(!card)return res.status(404).end();for(const extension of ['webp','png','svg']){const file=path.join(cardArtDirectory,`${card.id}.${extension}`);if(existsSync(file))return res.set('Cache-Control','public, max-age=86400').sendFile(file);}res.type('image/svg+xml').set('Cache-Control','public, max-age=86400').send(cardArtSvg(card));});
  router.get('/games/:id',(req,res)=>{
    const game=games.get(req.params.id);if(!game)return fail(res,404,'対局が見つかりません。サーバー更新後は新しい対局を始めてください。');
    if(game.cpuReadyAt&&Date.now()>=game.cpuReadyAt)advanceCpu(game.id,game.cpuReadyAt);
    res.set('Cache-Control','no-store').json(view(games.get(game.id)));
  });
  router.post('/games/:id/actions',(req,res)=>{
    const game=games.get(req.params.id);if(!game)return fail(res,404,'対局が見つかりません。');
    if(!Number.isInteger(req.body?.revision)||req.body.revision!==game.revision)return fail(res,409,'盤面が更新されました。読み込み直してください。');
    if(game.cpu&&game.turn==='w')return fail(res,409,'CPUの手番です。');
    try{
      let next=applyAction(game,req.body.action);
      const comboEvents=[...next.comboEvents],visualEvents=[];
      const first=visualEvent(game,next,req.body.action);if(first)visualEvents.push(first);
      next.comboEvents=comboEvents;next.visualEvents=visualEvents;
      next.cpuStepCount=0;games.set(game.id,next);scheduleCpu(next);res.json(view(next));
    }catch(error){return fail(res,400,error.message);}
  });
  const timer=setInterval(()=>{const cutoff=Date.now()-24*60*60*1000;for(const [id,game] of games)if(game.createdAt<cutoff){clearTimeout(cpuTimers.get(id));cpuTimers.delete(id);games.delete(id);}},60*60*1000);timer.unref?.();
  app.use('/api/CSH',router);
  if(currentUser){const online=createChaosOnline({currentUser,collection,findUser});app.use('/api/CSH/online',online.router);return online;}
}
