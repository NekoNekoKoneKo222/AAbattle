import { randomUUID } from 'node:crypto';
import { initCards, cloneCards, startTurnCards, playCard, activateEquipment, cardView, canActivate, kingMoved, syncComboEvents, CARD_CATALOG } from './chaos-cards.js';

export const TYPES=['P','L','N','S','G','B','R','K'];
export const GLYPHS={K:'王',R:'飛',B:'角',G:'金',S:'銀',N:'桂',L:'香',P:'歩'};
export const PROMOTED={R:'龍',B:'馬',S:'全',N:'圭',L:'杏',P:'と'};
const BACK=['L','N','S','G','K','G','S','N','L'];
const EPS=1e-9;
const opposite=side=>side==='b'?'w':'b';
const inside=(x,y)=>x>=0&&x<9&&y>=0&&y<9;
const index=(x,y)=>y*9+x;
const coords=i=>[i%9,Math.floor(i/9)];
const clone=s=>({ ...s,board:s.board.map(p=>p&&{...p}),hands:{b:{...s.hands.b},w:{...s.hands.w}},cards:cloneCards(s.cards),remaining:{...s.remaining},history:[...s.history],log:[...s.log],undoSnapshot:undefined });
const deny=message=>{throw new Error(message);};
const zone=(side,y)=>side==='b'?y<=2:y>=6;
const last=(side,y)=>side==='b'?y===0:y===8;
const lastTwo=(side,y)=>side==='b'?y<=1:y>=7;
const movable=(type)=>!['G','K'].includes(type);
const steps=(p)=>{
  const f=p.side==='b'?-1:1;
  if(p.promoted&&['P','L','N','S'].includes(p.type))return [[0,f],[1,f],[-1,f],[1,0],[-1,0],[0,-f]];
  if(p.type==='K')return [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]];
  if(p.type==='G')return [[0,f],[1,f],[-1,f],[1,0],[-1,0],[0,-f]];
  if(p.type==='S')return [[0,f],[1,f],[-1,f],[1,-f],[-1,-f]];
  if(p.type==='N')return [[1,2*f],[-1,2*f]];
  if(p.type==='P')return [[0,f]];
  if(p.type==='R'&&p.promoted)return [[1,1],[-1,1],[1,-1],[-1,-1]];
  if(p.type==='B'&&p.promoted)return [[1,0],[-1,0],[0,1],[0,-1]];
  return [];
};
const rays=p=>{
  const f=p.side==='b'?-1:1;
  if(p.type==='R')return [[1,0],[-1,0],[0,1],[0,-1]];
  if(p.type==='B')return [[1,1],[-1,1],[1,-1],[-1,-1]];
  if(p.type==='L'&&!p.promoted)return [[0,f]];
  return [];
};
function targets(s,from){
  const p=s.board[from];if(!p)return[];const [x,y]=coords(from),out=[];
  for(const [dx,dy] of steps(p)){const xx=x+dx,yy=y+dy;if(inside(xx,yy)&&s.board[index(xx,yy)]?.side!==p.side)out.push(index(xx,yy));}
  for(const [dx,dy] of rays(p)){let xx=x+dx,yy=y+dy;while(inside(xx,yy)){const i=index(xx,yy),q=s.board[i];if(q?.side===p.side)break;out.push(i);if(q)break;xx+=dx;yy+=dy;}}
  return out;
}
export function inCheck(s,side){
  const king=s.board.findIndex(p=>p?.side===side&&p.type==='K');
  if(king<0)return true;
  return s.board.some((p,i)=>p?.side===opposite(side)&&targets(s,i).includes(king));
}
function moveUnchecked(s,from,to,promote=false){
  const n=clone(s),p=n.board[from],victim=n.board[to];
  if(victim){if(victim.type==='K')deny('王将は取れません。王手で詰ませてください。');n.hands[p.side][victim.type]++;}
  n.board[to]={...p,promoted:p.promoted||promote};n.board[from]=null;return n;
}
function dropUnchecked(s,type,to){const n=clone(s);n.hands[s.turn][type]--;n.board[to]={side:s.turn,type,promoted:false};return n;}
export function legalActions(s,side=s.turn,{checkPawnDropMate=true}={}){
  if(s.status!=='playing')return[];const actions=[];
  for(let from=0;from<81;from++){
    const p=s.board[from];if(!p||p.side!==side)continue;
    for(const to of targets(s,from)){
      if(s.board[to]?.type==='K')continue;
      const [,fy]=coords(from),[,ty]=coords(to);
      const must=!p.promoted&&((['P','L'].includes(p.type)&&last(side,ty))||(p.type==='N'&&lastTwo(side,ty)));
      const may=!p.promoted&&movable(p.type)&&(zone(side,fy)||zone(side,ty));
      for(const promote of must?[true]:may?[false,true]:[false]){
        const n=moveUnchecked(s,from,to,promote);
        if(!inCheck(n,side))actions.push({kind:'move',from,to,promote});
      }
    }
  }
  for(const type of TYPES){if(type==='K'||!s.hands[side][type])continue;
    for(let to=0;to<81;to++){if(s.board[to])continue;const [x,y]=coords(to);
      if((['P','L'].includes(type)&&last(side,y))||(type==='N'&&lastTwo(side,y)))continue;
      if(type==='P'&&s.board.some((p,i)=>i%9===x&&p?.side===side&&p.type==='P'&&!p.promoted))continue;
      const n=dropUnchecked({...s,turn:side},type,to);if(inCheck(n,side))continue;
      if(type==='P'&&checkPawnDropMate&&inCheck(n,opposite(side))&&!legalActions({...n,turn:opposite(side)},opposite(side),{checkPawnDropMate:false}).length)continue;
      actions.push({kind:'drop',type,to});
    }
  }
  return actions;
}
function key(s){return JSON.stringify([s.turn,s.board.map(p=>p?`${p.side}${p.type}${p.promoted?'1':'0'}`:'').join(','),TYPES.map(t=>s.hands.b[t]),TYPES.map(t=>s.hands.w[t])]);}
export function newGame({cpu=false,minutes=10,decks={}}={}){
  const board=Array(81).fill(null),hands={b:{},w:{}};
  for(const t of TYPES){hands.b[t]=0;hands.w[t]=0;}
  for(let x=0;x<9;x++){
    board[index(x,0)]={side:'w',type:BACK[x],promoted:false};board[index(x,8)]={side:'b',type:BACK[x],promoted:false};
    board[index(x,2)]={side:'w',type:'P',promoted:false};board[index(x,6)]={side:'b',type:'P',promoted:false};
  }
  for(const [x,y,side,type] of [[1,1,'w','R'],[7,1,'w','B'],[1,7,'b','B'],[7,7,'b','R']])board[index(x,y)]={side,type,promoted:false};
  const now=Date.now(),timeMs=Math.max(1,Math.min(60,Number(minutes)||10))*60000;
  const s={id:randomUUID(),board,hands,cards:initCards(decks),movesLeft:1,turn:'b',status:'playing',winner:null,reason:null,revision:0,cpu:Boolean(cpu),remaining:{b:timeMs,w:timeMs},turnStartedAt:now,history:[],log:[],comboEvents:[],createdAt:now};
  s.history.push(key(s));return s;
}
export function remainingMs(s,now=Date.now()){return {b:Math.max(0,s.remaining.b-(s.status==='playing'&&s.turn==='b'?now-s.turnStartedAt:0)),w:Math.max(0,s.remaining.w-(s.status==='playing'&&s.turn==='w'?now-s.turnStartedAt:0))};}
export function expire(s,now=Date.now()){if(s.status==='playing'&&remainingMs(s,now)[s.turn]<=EPS){s.remaining[s.turn]=0;s.winner=opposite(s.turn);s.status='finished';s.reason='時間切れ';s.log.push(`${s.turn==='b'?'先手':'後手'}が時間切れ`);s.revision++;}return s;}
export function applyAction(s,action,now=Date.now()){
  expire(s,now);if(s.status!=='playing')deny('対局は終了しています。');
  if(action?.kind==='resign'){
    const n=clone(s);n.remaining=remainingMs(s,now);n.status='finished';n.winner=opposite(s.turn);n.reason='投了';n.comboEvents=[];n.log.push(`${s.turn==='b'?'先手':'後手'}が投了`);n.revision++;return n;
  }
  if(action?.kind==='card'||action?.kind==='activate'){
    if(action.kind==='activate'&&s.cards[s.turn].equipment[action.slot]?.id==='hourglass'){
      if(!s.undoSnapshot||s.undoSnapshot.turn!==s.turn||!canActivate(s,s.turn,action.slot))deny('このターンに取り消せる自分の行動がありません。');
      const n=clone(s.undoSnapshot),item=n.cards[n.turn].equipment.find(e=>e.id==='hourglass');if(!item)deny('砂時計の装備前の行動は取り消せません。');
      const cost=CARD_CATALOG.hourglass.activeCost;if(n.cards[n.turn].cp<cost)deny('行動を戻した後のCPが足りません。');
      n.cards[n.turn].cp-=cost;item.uses=Math.max(item.uses,s.cards[s.turn].equipment[action.slot].uses)+1;item.usedTurn=n.cards[n.turn].turnSerial;item.turnUses=1;
      n.remaining=remainingMs(s,now);n.turnStartedAt=now;n.revision=s.revision+1;n.log.push('時の砂時計で直前の行動を取り消した');syncComboEvents(s,n);return n;
    }
    const n=clone(s);n.remaining=remainingMs(s,now);n.turnStartedAt=now;
    if(action.kind==='card')playCard(n,action);else activateEquipment(n,action);
    if(!inCheck(s,s.turn)&&inCheck(n,s.turn))deny('自分の王将を王手にさらすカード使用はできません。');
    n.undoSnapshot=clone(s);n.revision++;syncComboEvents(s,n);return n;
  }
  const legal=legalActions(s).find(a=>a.kind===action?.kind&&a.to===action?.to&&(a.kind==='drop'?a.type===action.type:a.from===action.from&&a.promote===Boolean(action.promote)));
  if(!legal)deny('その手は指せません。王手や駒の移動規則を確認してください。');
  const side=s.turn,p=s.board[action.from],n=legal.kind==='drop'?dropUnchecked(s,legal.type,legal.to):moveUnchecked(s,legal.from,legal.to,legal.promote);
  n.lastAction=legal;
  if(legal.kind==='move'&&p.type==='K')kingMoved(n,side);
  n.remaining=remainingMs(s,now);n.movesLeft=(s.movesLeft||1)-1;n.turn=n.movesLeft>0?side:opposite(side);n.turnStartedAt=now;n.revision=s.revision+1;
  n.log.push(`${side==='b'?'先手':'後手'} ${legal.kind==='drop'?GLYPHS[legal.type]+'打':(p.promoted?PROMOTED[p.type]:GLYPHS[p.type])+(legal.promote?'成':'')} ${Math.floor(legal.to/9)+1}段${legal.to%9+1}筋`);
  const defending=opposite(side),defenderState={...n,turn:defending};
  if(!legalActions(defenderState).length){n.status='finished';n.reason=inCheck(n,defending)?'詰み':'合法手なし';n.winner=side;n.log.push(`${side==='b'?'先手':'後手'}の勝ち`);}
  else if(n.turn!==side){n.movesLeft=1;startTurnCards(n);n.history.push(key(n));if(n.history.filter(v=>v===n.history.at(-1)).length>=4){n.status='finished';n.reason='千日手';n.winner=null;n.log.push('千日手で引き分け');}}
  n.undoSnapshot=n.turn===side&&n.status==='playing'?clone(s):undefined;
  n.comboEvents=[];
  return n;
}
export function cpuAction(s){const options=legalActions(s);if(!options.length)return null;const valued=options.map(a=>({a,score:(a.kind==='move'&&s.board[a.to]?{P:1,L:3,N:3,S:4,G:5,B:8,R:10}[s.board[a.to].type]*10:0)+(a.promote?4:0)+Math.random()*5}));valued.sort((a,b)=>b.score-a.score);return valued[0].a;}
export function view(s,now=Date.now()){expire(s,now);return {...s,cards:cardView(s),remaining:remainingMs(s,now),legal:s.status==='playing'?legalActions(s):[],check:s.status==='playing'?{b:inCheck(s,'b'),w:inCheck(s,'w')}:{b:false,w:false},history:undefined,undoSnapshot:undefined};}
