import express from 'express';
import { newGame, applyAction, cpuAction, view } from './chaos-shogi.js';
import { CARD_CATALOG, COMBOS, DEFAULT_DECK, cpuCardAction } from './chaos-cards.js';
import { createChaosOnline } from './chaos-online.js';
import { visualEvent } from './chaos-visual.js';

export function resolveCpuTurn(state){
  let next=state;const events=[],comboEvents=[];
  if(!next.cpu||next.status!=='playing'||next.turn!=='w')return {game:next,events,comboEvents};
  const card=cpuCardAction(next);
  if(card)try{const before=next;next=applyAction(next,card);const event=visualEvent(before,next,card);if(event)events.push(event);comboEvents.push(...next.comboEvents);}catch{/* An optional card must not block the CPU turn. */}
  for(let count=0;count<8&&next.status==='playing'&&next.turn==='w';count++){
    const move=cpuAction(next);
    if(!move){next={...next,status:'finished',winner:'b',reason:'CPUに合法手なし',revision:next.revision+1,log:[...next.log,'CPUに合法手がなく先手の勝ち']};break;}
    const before=next;next=applyAction(next,move);const event=visualEvent(before,next,move);if(event)events.push(event);comboEvents.push(...next.comboEvents);
  }
  return {game:next,events,comboEvents};
}

export function mountChaosShogi(app,{currentUser,collection}={}){
  const games=new Map(),router=express.Router();
  const fail=(res,status,message)=>res.status(status).json({error:message});
  router.use((req,res,next)=>{
    if(req.method==='GET')return next();
    const origin=req.get('origin');
    if(origin){try{if(new URL(origin).host!==req.get('host'))return fail(res,403,'送信元が一致しません。');}catch{return fail(res,403,'送信元が不正です。');}}
    if(!req.is('application/json'))return fail(res,415,'JSONで送信してください。');
    next();
  });
  router.post('/games',(req,res)=>{
    if(games.size>=200)return fail(res,503,'対局数が上限です。時間をおいてください。');
    try{const cpu=req.body?.cpu===true,decks={b:req.body?.decks?.b,w:cpu?undefined:req.body?.decks?.w};const game=newGame({cpu,minutes:req.body?.minutes,decks,collapse:req.body?.collapse===true});games.set(game.id,game);res.status(201).json(view(game));}
    catch(error){fail(res,400,error.message);}
  });
  router.get('/cards',(_req,res)=>res.json({cards:CARD_CATALOG,combos:COMBOS,defaultDeck:DEFAULT_DECK,deckRules:{size:20,maxCopies:2,maxCounters:5,maxMythic:1,maxSaved:10}}));
  router.get('/games/:id',(req,res)=>{
    const game=games.get(req.params.id);if(!game)return fail(res,404,'対局が見つかりません。サーバー更新後は新しい対局を始めてください。');
    res.set('Cache-Control','no-store').json(view(game));
  });
  router.post('/games/:id/actions',(req,res)=>{
    const game=games.get(req.params.id);if(!game)return fail(res,404,'対局が見つかりません。');
    if(!Number.isInteger(req.body?.revision)||req.body.revision!==game.revision)return fail(res,409,'盤面が更新されました。読み込み直してください。');
    if(game.cpu&&game.turn==='w')return fail(res,409,'CPUの手番です。');
    try{
      let next=applyAction(game,req.body.action);
      const comboEvents=[...next.comboEvents],visualEvents=[];
      const first=visualEvent(game,next,req.body.action);if(first)visualEvents.push(first);
      const cpu=resolveCpuTurn(next);next=cpu.game;comboEvents.push(...cpu.comboEvents);visualEvents.push(...cpu.events);
      next.comboEvents=comboEvents;next.visualEvents=visualEvents;
      games.set(game.id,next);res.json(view(next));
    }catch(error){return fail(res,400,error.message);}
  });
  const timer=setInterval(()=>{const cutoff=Date.now()-24*60*60*1000;for(const [id,game] of games)if(game.createdAt<cutoff)games.delete(id);},60*60*1000);timer.unref?.();
  app.use('/api/CSH',router);
  if(currentUser){const online=createChaosOnline({currentUser,collection});app.use('/api/CSH/online',online.router);return online;}
}
