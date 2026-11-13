export const CARD_CATALOG=Object.freeze({
  avada:{id:'avada',name:'アバダ・ケダブラ',type:'instant',rarity:'rare',cost:4,target:'enemy-piece',description:'敵の王将以外の駒を1体破壊する。'},
  meteor:{id:'meteor',name:'隕石落下',type:'instant',rarity:'superRare',cost:6,target:'square',description:'指定マスを中心に3×3の敵駒を破壊する。王将には効かない。'},
  double:{id:'double',name:'2回行動',type:'rule',rarity:'rare',cost:3,target:'none',description:'このターンの駒移動回数を1回増やす。'},
  tax:{id:'tax',name:'税金徴収',type:'instant',rarity:'common',cost:2,target:'none',description:'相手から2CPを徴収し、自分のCPを増やす。'},
  warp:{id:'warp',name:'瞬間移動',type:'instant',rarity:'rare',cost:3,target:'own-piece-and-square',description:'自分の王将以外の駒を空きマスへ移す。自玉を王手にさらせない。'},
  dispel:{id:'dispel',name:'装備解除命令',type:'instant',rarity:'rare',cost:3,target:'enemy-equipment',description:'相手の装備を1枚破壊し、パッシブ効果を解除する。'},
  dobby:{id:'dobby',name:'ドビーは悪い子',type:'equipment',rarity:'ultraRare',cost:5,target:'choice',description:'装備時に強奪か駒破壊。通常は対局中1回。無下限呪術と装備すると毎ターン3CPで再発動。',activeCost:3,matchLimit:1,turnLimit:1},
  infinity:{id:'infinity',name:'無下限呪術',type:'equipment',rarity:'ultraRare',cost:8,target:'none',description:'装備中、自分の装備能力の対局中使用回数制限を解除する。'},
  greed:{id:'greed',name:'強欲な手',type:'equipment',rarity:'superRare',cost:3,target:'none',description:'相手からカードを奪うと、自分のデッキから追加で1枚ドロー。'},
  shield:{id:'shield',name:'神の盾',type:'equipment',rarity:'superRare',cost:3,target:'none',description:'自分の駒が最初に受けるカード破壊を1回防ぐ。'}
});
export const COMBOS=Object.freeze([
  {id:'eternal-dobby',name:'永久にドビーは悪い子',requiredEquipment:['dobby','infinity'],priority:10,grantedEffects:['remove-match-limit'],animationId:'dobby-infinite',soundId:'combo'},
  {id:'infinite-heist',name:'無限強奪',requiredEquipment:['dobby','infinity','greed'],priority:20,grantedEffects:['remove-match-limit','draw-on-steal'],animationId:'heist',soundId:'combo'}
]);
const fail=message=>{throw new Error(message);};
const other=side=>side==='b'?'w':'b';
const shuffle=items=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;};
const initialDeck=()=>shuffle(Object.keys(CARD_CATALOG).flatMap(id=>[id,id]));
const player=()=>({deck:initialDeck(),hand:[],grave:[],equipment:[],cp:4,cardPlayed:false,turnSerial:0});
export function initCards(){const cards={b:player(),w:player()};for(const side of ['b','w'])for(let i=0;i<4;i++)draw(cards[side]);cards.b.turnSerial=1;return cards;}
export function cloneCards(cards){return Object.fromEntries(['b','w'].map(side=>[side,{...cards[side],deck:[...cards[side].deck],hand:[...cards[side].hand],grave:[...cards[side].grave],equipment:cards[side].equipment.map(e=>({...e}))}]));}
function draw(p){if(!p.deck.length&&p.grave.length){p.deck=shuffle(p.grave);p.grave=[];}if(p.hand.length>=7||!p.deck.length)return false;p.hand.push(p.deck.pop());return true;}
export function startTurnCards(s){const p=s.cards[s.turn];p.turnSerial++;p.cp=Math.min(10,p.cp+2);p.cardPlayed=false;draw(p);s.log.push(`${s.turn==='b'?'先手':'後手'}は2CP回復し1枚ドロー`);}
export function combosFor(s,side){const ids=new Set(s.cards[side].equipment.map(e=>e.id));return COMBOS.filter(combo=>combo.requiredEquipment.every(id=>ids.has(id))).sort((a,b)=>b.priority-a.priority);}
const has=(s,side,id)=>s.cards[side].equipment.some(e=>e.id===id);
export function canActivate(s,side,slot){const p=s.cards[side],equip=p.equipment[slot],card=equip&&CARD_CATALOG[equip.id];if(!card?.activeCost)return false;if(p.cp<card.activeCost||equip.usedTurn===p.turnSerial)return false;return !Number.isFinite(card.matchLimit)||equip.uses<card.matchLimit||has(s,side,'infinity');}
function destroyPiece(s,side,target){if(!Number.isInteger(target)||target<0||target>=81)fail('対象マスが不正です。');const piece=s.board[target];if(!piece||piece.side!==other(side)||piece.type==='K')fail('敵の王将以外の駒を選んでください。');const opponent=s.cards[piece.side],shield=opponent.equipment.find(e=>e.id==='shield'&&!e.shieldUsed);if(shield){shield.shieldUsed=true;s.log.push('神の盾が駒破壊を防いだ');return false;}s.board[target]=null;s.log.push(`${side==='b'?'先手':'後手'}のカードが${piece.type}を破壊`);return true;}
function steal(s,side){const own=s.cards[side],enemy=s.cards[other(side)];if(!enemy.hand.length)fail('相手の手札がありません。');if(own.hand.length>=7)fail('手札が上限の7枚です。');const i=Math.floor(Math.random()*enemy.hand.length),card=enemy.hand.splice(i,1)[0];own.hand.push(card);s.log.push(`${side==='b'?'先手':'後手'}が相手のカードを1枚奪った`);if(has(s,side,'greed')){draw(own);s.log.push('強欲な手でさらに1枚ドロー');}return card;}
function dobby(s,side,action){if(action.choice==='steal')steal(s,side);else if(action.choice==='destroy')destroyPiece(s,side,action.target);else fail('強奪か駒破壊を選んでください。');}
function equip(s,side,id,action){const p=s.cards[side];if(p.equipment.some(e=>e.id===id))fail('同名装備は1枚までです。');if(p.equipment.length>=3){const slot=action.replaceSlot;if(!Number.isInteger(slot)||slot<0||slot>=3)fail('交換する装備枠を選んでください。');const removed=p.equipment.splice(slot,1)[0];p.grave.push(removed.id);s.log.push(`${CARD_CATALOG[removed.id].name}を解除`);}const item={id,uses:0,usedTurn:-1,shieldUsed:false};p.equipment.push(item);s.log.push(`${side==='b'?'先手':'後手'}が${CARD_CATALOG[id].name}を装備`);if(id==='dobby'){dobby(s,side,action);item.uses=1;item.usedTurn=p.turnSerial;}if((id==='infinity'&&has(s,side,'dobby'))||(id==='dobby'&&has(s,side,'infinity')))s.log.push('特殊コンボ発動！永久にドビーは悪い子が成立！');}
export function playCard(s,action){const side=s.turn,p=s.cards[side],id=action?.cardId,card=CARD_CATALOG[id];if(!card||!p.hand.includes(id))fail('手札にないカードです。');if(p.cardPlayed)fail('このターンはすでにカードを使いました。');if(p.cp<card.cost)fail('CPが足りません。');
  p.hand.splice(p.hand.indexOf(id),1);
  p.cp-=card.cost;
  if(card.type==='equipment')equip(s,side,id,action);
  else if(id==='avada')destroyPiece(s,side,action.target);
  else if(id==='meteor'){if(!Number.isInteger(action.target)||action.target<0||action.target>=81)fail('対象マスが不正です。');const x=action.target%9,y=Math.floor(action.target/9),targets=[];for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){const i=yy*9+xx;if(xx>=0&&xx<9&&yy>=0&&yy<9&&s.board[i]?.side===other(side)&&s.board[i].type!=='K')targets.push(i);}if(!targets.length)fail('範囲に破壊できる駒がありません。');for(const i of targets)destroyPiece(s,side,i);}
  else if(id==='double')s.movesLeft=Math.min(3,(s.movesLeft||1)+1);
  else if(id==='tax'){const amount=Math.min(2,s.cards[other(side)].cp);s.cards[other(side)].cp-=amount;p.cp=Math.min(10,p.cp+amount);s.log.push(`${side==='b'?'先手':'後手'}が${amount}CPを徴収`);}
  else if(id==='warp'){const from=action.from,to=action.target;if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>=81||to<0||to>=81||s.board[from]?.side!==side||s.board[from].type==='K'||s.board[to])fail('自分の王将以外の駒と空きマスを選んでください。');s.board[to]=s.board[from];s.board[from]=null;}
  else if(id==='dispel'){const slot=action.target,p2=s.cards[other(side)];if(!Number.isInteger(slot)||slot<0||slot>=p2.equipment.length)fail('相手の装備を選んでください。');const removed=p2.equipment.splice(slot,1)[0];p2.grave.push(removed.id);s.log.push(`${CARD_CATALOG[removed.id].name}が解除された`);}
  p.cardPlayed=true;if(card.type!=='equipment')p.grave.push(id);s.log.push(`${side==='b'?'先手':'後手'}が${card.name}を使用`);
}
export function activateEquipment(s,action){const side=s.turn,p=s.cards[side],slot=action?.slot;if(!Number.isInteger(slot)||!canActivate(s,side,slot))fail('この装備能力は発動できません。');const item=p.equipment[slot],card=CARD_CATALOG[item.id];if(item.id==='dobby')dobby(s,side,action);else fail('この装備に任意発動能力はありません。');p.cp-=card.activeCost;item.uses++;item.usedTurn=p.turnSerial;s.log.push(`${card.name}の能力を発動`);}
export function cardView(s){const side=s.turn;return {currentHand:[...s.cards[side].hand],handCount:{b:s.cards.b.hand.length,w:s.cards.w.hand.length},cp:{b:s.cards.b.cp,w:s.cards.w.cp},equipment:{b:s.cards.b.equipment.map(e=>({...e})),w:s.cards.w.equipment.map(e=>({...e}))},activeSlots:s.cards[side].equipment.map((_,i)=>canActivate(s,side,i)),cardPlayed:s.cards[side].cardPlayed,combos:{b:combosFor(s,'b').map(c=>c.name),w:combosFor(s,'w').map(c=>c.name)},deckCount:{b:s.cards.b.deck.length,w:s.cards.w.deck.length}};}
export function cpuCardAction(s){const side=s.turn,p=s.cards[side];if(p.cardPlayed)return null;const enemy=other(side),target=s.board.findIndex(piece=>piece?.side===enemy&&piece.type!=='K'),own=s.board.findIndex(piece=>piece?.side===side&&piece.type!=='K'),empty=s.board.findIndex(piece=>!piece),enemyEquip=s.cards[enemy].equipment;
  for(const id of ['dobby','infinity','avada','meteor','dispel','greed','shield','tax','double','warp']){
    if(!p.hand.includes(id)||p.cp<CARD_CATALOG[id].cost)continue;const action={kind:'card',cardId:id};
    if(id==='dobby'){if(s.cards[enemy].hand.length&&p.hand.length<7)action.choice='steal';else if(target>=0){action.choice='destroy';action.target=target;}else continue;}
    if(id==='avada'||id==='meteor'){if(target<0)continue;action.target=target;}
    if(id==='dispel'){if(!enemyEquip.length)continue;action.target=0;}
    if(id==='warp'){if(own<0||empty<0)continue;action.from=own;action.target=empty;}
    if(CARD_CATALOG[id].type==='equipment'&&p.equipment.length>=3)action.replaceSlot=0;
    if(CARD_CATALOG[id].type==='equipment'&&p.equipment.some(e=>e.id===id))continue;
    return action;
  }
  return null;
}
