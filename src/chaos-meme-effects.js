import { emitEffect } from './chaos-effects.js';

const fail=message=>{throw new Error(message);};
const other=side=>side==='b'?'w':'b';
const size=s=>s.size||9;
const valid=(s,i)=>Number.isInteger(i)&&i>=0&&i<s.board.length;
const xy=(s,i)=>[i%size(s),Math.floor(i/size(s))];
const distance=(s,a,b)=>{const [ax,ay]=xy(s,a),[bx,by]=xy(s,b);return Math.abs(ax-bx)+Math.abs(ay-by);};
const random=items=>items[Math.floor(Math.random()*items.length)];
const own=(s,side,i,king=false)=>{if(!valid(s,i)||s.board[i]?.side!==side||!king&&s.board[i].type==='K')fail('対象の自分の駒を選んでください。');return s.board[i];};
const enemy=(s,side,i,king=false)=>{if(!valid(s,i)||s.board[i]?.side!==other(side)||!king&&s.board[i].type==='K')fail('対象の敵の駒を選んでください。');return s.board[i];};
const empty=(s,i)=>{if(!valid(s,i)||s.board[i]||['wall','hole'].includes(terrainAt(s,i)?.kind))fail('空きマスを選んでください。');return i;};
const chance=(p)=>Math.random()<p;
const ruleKey=(name,side)=>`${name}:${side}`;
export function ruleActive(s,name,side){const rule=s.chaos?.rules?.[ruleKey(name,side)];return Boolean(rule&&s.cards[side].turnSerial<rule.expiresOn);}
export function setRule(s,name,side,turns=2){s.chaos.rules[ruleKey(name,side)]={expiresOn:s.cards[side].turnSerial+turns+(side!==s.turn?1:0)};emitEffect(s,'ON_RULE_CHANGED',{side,rule:name});}
export function terrainAt(s,i){const terrain=s.chaos?.terrain?.[i];const serial=s.cards.b.turnSerial+s.cards.w.turnSerial;return terrain&&terrain.expiresOn>serial?terrain:null;}
function placeTerrain(s,i,kind){empty(s,i);s.chaos.terrain[i]={kind,expiresOn:s.cards.b.turnSerial+s.cards.w.turnSerial+3};s.log.push(`${kind==='wall'?'壁':kind==='hole'?'穴':'バナナの皮'}を配置`);}
function destroyUnprotected(s,i,source){const piece=s.board[i];if(!piece||piece.type==='K')return false;s.board[i]=null;emitEffect(s,'ON_PIECE_DESTROYED',{side:piece.side,attacker:source,target:i,pieceType:piece.type});return true;}
function area(s,target,radius,predicate,remove){if(!valid(s,target))fail('対象マスが不正です。');const [cx,cy]=xy(s,target);let count=0;for(let i=0;i<s.board.length;i++){const [x,y]=xy(s,i);if(Math.max(Math.abs(x-cx),Math.abs(y-cy))<=radius&&predicate(s.board[i],i)){remove(i);count++;}}if(!count)fail('範囲に対象がありません。');}
function rearrange(s,transform){const old=s.board,newBoard=Array(old.length).fill(null);for(let i=0;i<old.length;i++)if(old[i]?.type==='K')newBoard[i]=old[i];for(let i=0;i<old.length;i++){const piece=old[i];if(!piece||piece.type==='K')continue;const to=transform(i);const slot=!newBoard[to]?to:!newBoard[i]?i:newBoard.findIndex(p=>!p);if(slot>=0)newBoard[slot]=piece;}s.board=newBoard;}
function expand(s){if(size(s)>=11)fail('盤面はすでに11×11です。');const oldSize=size(s),nextSize=11,board=Array(121).fill(null),terrain={};for(let i=0;i<s.board.length;i++){const [x,y]=xy(s,i),next=(y+1)*nextSize+x+1;board[next]=s.board[i];if(s.chaos.terrain[i])terrain[next]=s.chaos.terrain[i];}s.board=board;s.size=nextSize;s.chaos.terrain=terrain;s.lastAction=null;}
export function resolveChaosTurnStart(s,side){const bonus=s.chaos?.pendingBonus?.[side]||0;if(bonus){s.cards[side].cp=Math.min(s.settings?.cpCap??10,s.cards[side].cp+bonus);delete s.chaos.pendingBonus[side];s.log.push(`追加報酬で${bonus}CPを獲得`);}for(const [key,value] of Object.entries(s.chaos?.terrain||{}))if(!terrainAt(s,Number(key)))delete s.chaos.terrain[key];}
export function resolveChaosTurnEnd(s,side){for(let i=0;i<s.board.length;i++){const p=s.board[i];if(p?.side===side&&p.type!=='K'&&p.doomAt&&p.doomAt<=s.cards[side].turnSerial){destroyUnprotected(s,i,other(side));s.log.push('時限破壊が発動');}}}

export function resolveMemeCard(s,card,action,ops){
  const side=s.turn,opponent=other(side),effect=card.effect.kind,to=action.target,from=action.from,board=s.board,ownCards=s.cards[side],enemyCards=s.cards[opponent];
  if(['doom','beam','erase','turn-pawn','eject','steal-piece','freeze','avada-ex','puppet','swap-enemy'].includes(effect)){
    enemy(s,side,['puppet'].includes(effect)?from:to,effect==='avada-ex');
    if(ops.reflected(s,side))return;
  }
  switch(effect){
    case 'doom':{const p=enemy(s,side,to);p.doomAt=enemyCards.turnSerial+1;break;}
    case 'blast':case 'beam':case 'erase':{if(effect!=='blast')enemy(s,side,to);area(s,to,effect==='blast'?1:0,p=>p?.side===opponent&&p.type!=='K',i=>ops.destroy(s,side,i));if(effect==='beam'){const [x,y]=xy(s,to),next=y+1<size(s)?(y+1)*size(s)+x:-1;if(next>=0&&board[next]?.side===opponent&&board[next].type!=='K')ops.destroy(s,side,next);}break;}
    case 'turn-pawn':{const p=enemy(s,side,to);p.type='P';p.promoted=false;break;}
    case 'eject':{const p=enemy(s,side,to);s.hands[opponent][p.type]++;board[to]=null;break;}
    case 'world-end':{for(let i=0;i<board.length;i++)destroyUnprotected(s,i,side);break;}
    case 'rook-pawn':{const p=own(s,side,to);if(p.type!=='P')fail('自分の歩を選んでください。');p.rookUntil=ownCards.turnSerial+3;break;}
    case 'extra-moves':s.movesLeft=Math.min(4,(s.movesLeft||1)+card.effect.power);break;
    case 'clone-piece':{const p=own(s,side,from);empty(s,to);if(distance(s,from,to)!==1)fail('隣の空きマスを選んでください。');board[to]={...p};break;}
    case 'full-dash':{own(s,side,from);empty(s,to);board[to]=board[from];board[from]=null;ownCards.cp=Math.min(10,ownCards.cp+1);break;}
    case 'swap-own':{own(s,side,from);own(s,side,to);[board[to],board[from]]=[board[from],board[to]];break;}
    case 'recall-own':{const p=own(s,side,to);s.hands[side][p.type]++;board[to]=null;break;}
    case 'counter-reverse':case 'counter-guard':case 'counter-null':case 'counter-decoy':case 'counter-dodge':s.chaos.counters[side]={kind:effect,uses:1};break;
    case 'reboot':{const p=own(s,side,to,true);delete p.frozenUntil;delete p.doomAt;break;}
    case 'steal-piece':{const p=enemy(s,side,to);if(!['P','L','N'].includes(p.type))fail('歩・香・桂を選んでください。');p.side=side;p.promoted=false;break;}
    case 'puppet':{enemy(s,side,from);empty(s,to);if(distance(s,from,to)!==1)fail('隣の空きマスを選んでください。');board[to]=board[from];board[from]=null;break;}
    case 'freeze':{const p=enemy(s,side,to);p.frozenUntil=enemyCards.turnSerial+card.effect.power+1;break;}
    case 'banana':case 'hole':case 'wall':placeTerrain(s,to,effect==='banana'?'banana':effect);break;
    case 'sleep':setRule(s,'sleep',opponent,1);break;
    case 'random-freeze':{const candidates=board.filter(p=>p?.side===opponent&&p.type!=='K');if(!candidates.length)fail('凍結できる敵の駒がありません。');random(candidates).frozenUntil=enemyCards.turnSerial+2;break;}
    case 'swap-enemy':{own(s,side,from);enemy(s,side,to);[board[from],board[to]]=[board[to],board[from]];break;}
    case 'rotate':rearrange(s,i=>board.length-1-i);break;
    case 'landslide':area(s,to,1,p=>p&&p.type!=='K',i=>destroyUnprotected(s,i,side));break;
    case 'expand':expand(s);break;
    case 'mirror':rearrange(s,i=>{const [x,y]=xy(s,i);return y*size(s)+(size(s)-1-x);});break;
    case 'traffic':{const mid=Math.floor(size(s)/2);let placed=0;for(const i of [mid*size(s)+mid-1,mid*size(s)+mid,mid*size(s)+mid+1])if(!board[i]&&!terrainAt(s,i)){placeTerrain(s,i,'wall');placed++;}if(!placed)fail('中央に壁を置けるマスがありません。');break;}
    case 'terrain-random':placeTerrain(s,to,random(['wall','hole','banana']));break;
    case 'rule-gravity':setRule(s,'gravity',side,2);setRule(s,'gravity',opponent,2);break;
    case 'rule-ignore':setRule(s,'ignore',side,2);break;
    case 'shogi-over':{if(board.filter(p=>p?.side===opponent).length>3)fail('相手の盤上駒が3体以下の場合に使えます。');s.status='finished';s.winner=side;s.reason='将棋終了のお知らせ';break;}
    case 'rule-pawn-gold':setRule(s,'pawn-gold',side,2);setRule(s,'pawn-gold',opponent,2);break;
    case 'rule-king-dash':setRule(s,'king-dash',side,2);break;
    case 'rule-all-rooks':setRule(s,'all-rooks',side,2);break;
    case 'rule-free-promote':setRule(s,'free-promote',side,2);break;
    case 'rule-no-diagonal':setRule(s,'no-diagonal',opponent,2);break;
    case 'three-moves':s.movesLeft=Math.max(s.movesLeft||1,3);break;
    case 'rule-override':s.chaos.rules={};setRule(s,'free-promote',side,2);break;
    case 'push-random':{const options=board.map((p,i)=>p?.side===opponent&&p.type!=='K'?i:-1).filter(i=>i>=0);if(!options.length)fail('押せる敵の駒がありません。');const i=random(options),[x,y]=xy(s,i),neighbors=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(([xx,yy])=>xx>=0&&yy>=0&&xx<size(s)&&yy<size(s)).map(([xx,yy])=>yy*size(s)+xx).filter(j=>!board[j]&&!['wall','hole'].includes(terrainAt(s,j)?.kind));if(!neighbors.length)fail('移動先がありません。');const j=random(neighbors);board[j]=board[i];board[i]=null;break;}
    case 'spawn-pawn':{const mid=Math.floor(size(s)/2),options=board.map((p,i)=>!p&&!terrainAt(s,i)&&distance(s,i,mid*size(s)+mid)<=2?i:-1).filter(i=>i>=0);if(!options.length)fail('中央に空きマスがありません。');board[random(options)]={side,type:'P',promoted:false};break;}
    case 'bgm':ownCards.cp=Math.min(10,ownCards.cp+2);enemyCards.cp=Math.max(0,enemyCards.cp-1);break;
    case 'ninety-nine':if(chance(.99)){ownCards.cp=Math.min(10,ownCards.cp+3);ops.draw(ownCards);ops.draw(ownCards);}else ownCards.cp=Math.max(0,ownCards.cp-3);break;
    case 'fortune':ownCards.cp=Math.max(0,Math.min(10,ownCards.cp+(chance(.5)?1:-1)*(1+Math.floor(Math.random()*3))));break;
    case 'pray':for(let i=0,n=1+Math.floor(Math.random()*3);i<n;i++)ops.draw(ownCards);break;
    case 'bugged':{const choices=board.filter(p=>p&&p.type!=='K'&&(p.type!=='P'||p.promoted));if(!choices.length)fail('変化できる駒がありません。');const p=random(choices);p.type='P';p.promoted=false;break;}
    case 'fake-ad':s.chaos.pendingBonus[side]=(s.chaos.pendingBonus[side]||0)+3;break;
    case 'copy-grave':{if(ownCards.hand.length>=7)fail('手札が満杯です。');const id=[...enemyCards.grave].reverse().find(id=>ops.catalog[id]&&ops.catalog[id].type!=='equipment');if(!id)fail('相手の使用済み通常カードがありません。');ownCards.hand.push(id);break;}
    case 'divine-move':s.movesLeft=Math.min(4,(s.movesLeft||1)+1);s.chaos.kingGuard[side]=1;break;
    case 'rebuild':s.chaos.rules={};s.chaos.terrain={};s.hands[side].P=Math.min(18,s.hands[side].P+2);break;
    case 'new-king':{const p=own(s,side,to);if(p.type!=='G')fail('自分の金将を選んでください。');const king=board.find(q=>q?.side===side&&q.type==='K');if(!king)fail('王将がいません。');king.type='G';p.type='K';p.promoted=false;break;}
    case 'rule-chess':setRule(s,'chess',side,2);break;
    case 'assemble':{let count=0;for(const type of ['R','B','G','S','N','L','P'])while(s.hands[side][type]&&count<3){const options=board.map((p,i)=>!p&&!terrainAt(s,i)&&(side==='b'?Math.floor(i/size(s))>=size(s)-3:Math.floor(i/size(s))<=2)?i:-1).filter(i=>i>=0);if(!options.length)break;const i=options[0];board[i]={side,type,promoted:false};s.hands[side][type]--;count++;}if(!count)fail('打てる持ち駒がありません。');break;}
    case 'game-broken':for(const rule of ['pawn-gold','free-promote','gravity']){setRule(s,rule,side,2);if(rule!=='free-promote')setRule(s,rule,opponent,2);}break;
    case 'avada-ex':{const p=enemy(s,side,to,true);if(p.type==='K'){board[to]=null;s.log.push('王将を直接破壊した');}else ops.destroy(s,side,to);break;}
    case 'forced-ending':{const ownCount=board.filter(p=>p?.side===side).length,enemyCount=board.filter(p=>p?.side===opponent).length;s.status='finished';s.winner=ownCount===enemyCount?null:ownCount>enemyCount?side:opponent;s.reason='強制エンディング';break;}
    case 'admin-power':{if(action.choice==='blast'){const target=board.findIndex(p=>p?.side===opponent&&p.type!=='K');if(target<0)fail('破壊できる敵駒がありません。');ops.destroy(s,side,target);}else if(action.choice==='cp')ownCards.cp=Math.min(10,ownCards.cp+5);else if(action.choice==='draw'){for(let i=0;i<3;i++)ops.draw(ownCards);}else fail('破壊・CP・ドローから選んでください。');break;}
    default:fail('未対応のカード効果です。');
  }
  s.log.push(`${card.name}の効果が発動`);
}
