import express from 'express';
import { newGame, applyAction, cpuAction, view } from './chaos-shogi.js';
import { CARD_CATALOG, COMBOS, DEFAULT_DECK, cpuCardAction } from './chaos-cards.js';

export function mountChaosShogi(app){
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
    try{const cpu=req.body?.cpu===true,decks={b:req.body?.decks?.b,w:cpu?undefined:req.body?.decks?.w};const game=newGame({cpu,minutes:req.body?.minutes,decks});games.set(game.id,game);res.status(201).json(view(game));}
    catch(error){fail(res,400,error.message);}
  });
  router.get('/cards',(_req,res)=>res.json({cards:CARD_CATALOG,combos:COMBOS,defaultDeck:DEFAULT_DECK,deckRules:{size:20,maxCopies:2,maxCounters:5,maxSaved:10}}));
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
      const comboEvents=[...next.comboEvents];
      if(next.cpu&&next.status==='playing'&&next.turn==='w'){
        const card=cpuCardAction(next);if(card)try{next=applyAction(next,card);comboEvents.push(...next.comboEvents);}catch{/* CPU skips an invalid optional card. */}
        const move=cpuAction(next);if(move){next=applyAction(next,move);comboEvents.push(...next.comboEvents);}
      }
      next.comboEvents=comboEvents;
      games.set(game.id,next);res.json(view(next));
    }catch(error){return fail(res,400,error.message);}
  });
  const timer=setInterval(()=>{const cutoff=Date.now()-24*60*60*1000;for(const [id,game] of games)if(game.createdAt<cutoff)games.delete(id);},60*60*1000);timer.unref?.();
  app.use('/api/CSH',router);
}
