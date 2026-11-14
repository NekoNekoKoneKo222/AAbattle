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
  shield:{id:'shield',name:'神の盾',type:'equipment',rarity:'superRare',cost:3,target:'none',description:'自分の駒が最初に受けるカード破壊を1回防ぐ。'},
  reflect:{id:'reflect',name:'反射ヘルメット',type:'equipment',rarity:'superRare',cost:4,target:'none',description:'相手の対象指定カードを各ターン最初の1回だけ反射し、効果を無効にする。'},
  copier:{id:'copier',name:'無限コピー機',type:'equipment',rarity:'rare',cost:4,target:'own-card',description:'2CPで手札の通常カードを複製。対局中2回、各ターン1回。',activeCost:2,matchLimit:2,turnLimit:1},
  taxOffice:{id:'taxOffice',name:'税務署',type:'equipment',rarity:'rare',cost:4,target:'none',description:'自分のターン開始時、相手から1CPを徴収する。'},
  crown:{id:'crown',name:'バグった王冠',type:'equipment',rarity:'superRare',cost:5,target:'none',description:'装備時に王将がランダムな追加能力を獲得。王将を動かすと発動。'},
  hourglass:{id:'hourglass',name:'時の砂時計',type:'equipment',rarity:'ultraRare',cost:5,target:'none',description:'3CPでこのターンの直前の自分の行動を取り消す。対局中1回。',activeCost:3,matchLimit:1,turnLimit:1},
  multiply:{id:'multiply',name:'増殖装置',type:'equipment',rarity:'rare',cost:4,target:'square',description:'2CPで自分の歩の隣の空きマスに歩を増やす。対局中2回。',activeCost:2,matchLimit:2,turnLimit:1},
  immortal:{id:'immortal',name:'不死の契約',type:'equipment',rarity:'superRare',cost:4,target:'none',description:'カード破壊された自分の駒を最初の1回だけ復活させる。'},
  gianism:{id:'gianism',name:'ジャイアニズム',type:'equipment',rarity:'ultraRare',cost:5,target:'enemy-equipment',description:'3CPで相手の装備を1枚奪う。対局中1回。',activeCost:3,matchLimit:1,turnLimit:1},
  grant:{id:'grant',name:'臨時ボーナス',type:'instant',rarity:'common',cost:1,target:'none',description:'3CPを得る。最大10CP。'},
  insight:{id:'insight',name:'ひらめきの時間',type:'instant',rarity:'common',cost:1,target:'none',description:'デッキから2枚引く。手札は最大7枚。'},
  amnesia:{id:'amnesia',name:'記憶喪失',type:'instant',rarity:'rare',cost:3,target:'none',description:'相手の手札からランダムに1枚捨てさせる。'},
  reinforce:{id:'reinforce',name:'歩兵募集',type:'instant',rarity:'common',cost:3,target:'none',description:'持ち駒に歩兵を1枚追加する。盤上に打つ際は二歩を守る。'},
  promote:{id:'promote',name:'超進化',type:'rule',rarity:'rare',cost:4,target:'own-piece',description:'自分の成れる駒を1体、敵陣以外でも成らせる。'},
  recycle:{id:'recycle',name:'墓地から復活',type:'instant',rarity:'rare',cost:2,target:'none',description:'自分の墓地からランダムなカードを1枚手札に戻す。'}
});
export const COMBOS=Object.freeze([
  {id:'eternal-dobby',name:'永久にドビーは悪い子',requiredEquipment:['dobby','infinity'],priority:10,grantedEffects:['remove-match-limit'],animationId:'dobby-infinite',soundId:'combo'},
  {id:'infinite-heist',name:'無限強奪',requiredEquipment:['dobby','infinity','greed'],priority:20,grantedEffects:['remove-match-limit','draw-on-steal'],animationId:'heist',soundId:'combo'}
]);
const fail=message=>{throw new Error(message);};
const other=side=>side==='b'?'w':'b';
const shuffle=items=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;};
export const DEFAULT_DECK=Object.freeze(['avada','meteor','double','tax','warp','dispel','dobby','infinity','greed','shield'].flatMap(id=>[id,id]));
export function validateDeck(ids){if(!Array.isArray(ids)||ids.length!==20)fail('デッキは20枚にしてください。');const counts={};for(const id of ids){if(typeof id!=='string'||!CARD_CATALOG[id])fail('存在しないカードが入っています。');counts[id]=(counts[id]||0)+1;if(counts[id]>2)fail('同名カードは2枚までです。');}const counterCount=ids.filter(id=>CARD_CATALOG[id].type==='counter').length;if(counterCount>5)fail('カウンターカードは5枚までです。');return [...ids];}
const player=deck=>({deck:shuffle(deck),hand:[],grave:[],equipment:[],cp:4,cardPlayed:false,turnSerial:0});
export function initCards(decks={}){const cards={b:player(validateDeck(decks.b??DEFAULT_DECK)),w:player(validateDeck(decks.w??DEFAULT_DECK))};for(const side of ['b','w'])for(let i=0;i<4;i++)draw(cards[side]);cards.b.turnSerial=1;return cards;}
export function cloneCards(cards){return Object.fromEntries(['b','w'].map(side=>[side,{...cards[side],deck:[...cards[side].deck],hand:[...cards[side].hand],grave:[...cards[side].grave],equipment:cards[side].equipment.map(e=>({...e}))}]));}
function draw(p){if(!p.deck.length&&p.grave.length){p.deck=shuffle(p.grave);p.grave=[];}if(p.hand.length>=7||!p.deck.length)return false;p.hand.push(p.deck.pop());return true;}
export function startTurnCards(s){const p=s.cards[s.turn];p.turnSerial++;p.cp=Math.min(10,p.cp+2);p.cardPlayed=false;draw(p);s.log.push(`${s.turn==='b'?'先手':'後手'}は2CP回復し1枚ドロー`);if(has(s,s.turn,'taxOffice')){const enemy=s.cards[other(s.turn)],amount=Math.min(1,enemy.cp);enemy.cp-=amount;p.cp=Math.min(10,p.cp+amount);s.log.push(`税務署が${amount}CPを徴収`);}}
export function combosFor(s,side){const ids=new Set(s.cards[side].equipment.map(e=>e.id));return COMBOS.filter(combo=>combo.requiredEquipment.every(id=>ids.has(id))).sort((a,b)=>b.priority-a.priority);}
const has=(s,side,id)=>s.cards[side].equipment.some(e=>e.id===id);
export function canActivate(s,side,slot){const p=s.cards[side],equip=p.equipment[slot],card=equip&&CARD_CATALOG[equip.id];if(!card?.activeCost||equip.id==='hourglass'&&!s.undoSnapshot)return false;if(p.cp<card.activeCost||(equip.usedTurn===p.turnSerial&&(equip.turnUses||1)>=(card.turnLimit||1)))return false;return !Number.isFinite(card.matchLimit)||equip.uses<card.matchLimit||has(s,side,'infinity');}
function recordUse(p,item){item.turnUses=item.usedTurn===p.turnSerial?(item.turnUses||1)+1:1;item.usedTurn=p.turnSerial;item.uses++;}
function reflected(s,side){const opponent=s.cards[other(side)],helmet=opponent.equipment.find(e=>e.id==='reflect'&&e.usedTurn!==s.cards[side].turnSerial);if(!helmet)return false;helmet.usedTurn=s.cards[side].turnSerial;helmet.uses++;s.log.push('反射ヘルメットが対象指定カードを反射した');return true;}
function destroyPiece(s,side,target){if(!Number.isInteger(target)||target<0||target>=81)fail('対象マスが不正です。');const piece=s.board[target];if(!piece||piece.side!==other(side)||piece.type==='K')fail('敵の王将以外の駒を選んでください。');const opponent=s.cards[piece.side],shield=opponent.equipment.find(e=>e.id==='shield'&&!e.shieldUsed);if(shield){shield.shieldUsed=true;s.log.push('神の盾が駒破壊を防いだ');return false;}const crown=opponent.equipment.find(e=>e.id==='crown'&&e.trait==='guard'&&e.guardReady);if(crown){crown.guardReady=false;s.log.push('バグった王冠が駒破壊を防いだ');return false;}const immortal=opponent.equipment.find(e=>e.id==='immortal'&&!e.revived);if(immortal){immortal.revived=true;s.log.push('不死の契約で駒が復活した');return false;}s.board[target]=null;s.log.push(`${side==='b'?'先手':'後手'}のカードが${piece.type}を破壊`);return true;}
function steal(s,side){const own=s.cards[side],enemy=s.cards[other(side)];if(!enemy.hand.length)fail('相手の手札がありません。');if(own.hand.length>=7)fail('手札が上限の7枚です。');const i=Math.floor(Math.random()*enemy.hand.length),card=enemy.hand.splice(i,1)[0];own.hand.push(card);s.log.push(`${side==='b'?'先手':'後手'}が相手のカードを1枚奪った`);if(has(s,side,'greed')){draw(own);s.log.push('強欲な手でさらに1枚ドロー');}return card;}
function dobby(s,side,action){if(action.choice==='steal'){if(reflected(s,side))return;steal(s,side);}else if(action.choice==='destroy'){if(!Number.isInteger(action.target)||s.board[action.target]?.side!==other(side)||s.board[action.target]?.type==='K')fail('敵の王将以外の駒を選んでください。');if(!reflected(s,side))destroyPiece(s,side,action.target);}else fail('強奪か駒破壊を選んでください。');}
function equip(s,side,id,action){const p=s.cards[side];if(p.equipment.some(e=>e.id===id))fail('同名装備は1枚までです。');if(p.equipment.length>=3){const slot=action.replaceSlot;if(!Number.isInteger(slot)||slot<0||slot>=3)fail('交換する装備枠を選んでください。');const removed=p.equipment.splice(slot,1)[0];p.grave.push(removed.id);s.log.push(`${CARD_CATALOG[removed.id].name}を解除`);}const item={id,uses:0,usedTurn:-1,turnUses:0,shieldUsed:false,revived:false};if(id==='crown')item.trait=['cp','draw','guard'][Math.floor(Math.random()*3)];p.equipment.push(item);s.log.push(`${side==='b'?'先手':'後手'}が${CARD_CATALOG[id].name}を装備`);if(id==='dobby'){dobby(s,side,action);recordUse(p,item);}if((id==='infinity'&&has(s,side,'dobby'))||(id==='dobby'&&has(s,side,'infinity')))s.log.push('特殊コンボ発動！永久にドビーは悪い子が成立！');}
export function playCard(s,action){const side=s.turn,p=s.cards[side],id=action?.cardId,card=CARD_CATALOG[id];if(!card||!p.hand.includes(id))fail('手札にないカードです。');if(p.cardPlayed)fail('このターンはすでにカードを使いました。');if(p.cp<card.cost)fail('CPが足りません。');
  p.hand.splice(p.hand.indexOf(id),1);
  p.cp-=card.cost;
  if(card.type==='equipment')equip(s,side,id,action);
  else if(id==='avada'){if(!Number.isInteger(action.target)||s.board[action.target]?.side!==other(side)||s.board[action.target]?.type==='K')fail('敵の王将以外の駒を選んでください。');if(!reflected(s,side))destroyPiece(s,side,action.target);}
  else if(id==='meteor'){if(!Number.isInteger(action.target)||action.target<0||action.target>=81)fail('対象マスが不正です。');const x=action.target%9,y=Math.floor(action.target/9),targets=[];for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){const i=yy*9+xx;if(xx>=0&&xx<9&&yy>=0&&yy<9&&s.board[i]?.side===other(side)&&s.board[i].type!=='K')targets.push(i);}if(!targets.length)fail('範囲に破壊できる駒がありません。');if(!reflected(s,side))for(const i of targets)destroyPiece(s,side,i);}
  else if(id==='double')s.movesLeft=Math.min(3,(s.movesLeft||1)+1);
  else if(id==='tax'){const amount=Math.min(2,s.cards[other(side)].cp);s.cards[other(side)].cp-=amount;p.cp=Math.min(10,p.cp+amount);s.log.push(`${side==='b'?'先手':'後手'}が${amount}CPを徴収`);}
  else if(id==='warp'){const from=action.from,to=action.target;if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>=81||to<0||to>=81||s.board[from]?.side!==side||s.board[from].type==='K'||s.board[to])fail('自分の王将以外の駒と空きマスを選んでください。');s.board[to]=s.board[from];s.board[from]=null;}
  else if(id==='dispel'){const slot=action.target,p2=s.cards[other(side)];if(!Number.isInteger(slot)||slot<0||slot>=p2.equipment.length)fail('相手の装備を選んでください。');if(!reflected(s,side)){const removed=p2.equipment.splice(slot,1)[0];p2.grave.push(removed.id);s.log.push(`${CARD_CATALOG[removed.id].name}が解除された`);}}
  else if(id==='grant')p.cp=Math.min(10,p.cp+3);
  else if(id==='insight'){draw(p);draw(p);}
  else if(id==='amnesia'){const opponent=s.cards[other(side)];if(!opponent.hand.length)fail('相手の手札がありません。');if(!reflected(s,side)){const taken=opponent.hand.splice(Math.floor(Math.random()*opponent.hand.length),1)[0];opponent.grave.push(taken);s.log.push('相手の手札を1枚捨てさせた');}}
  else if(id==='reinforce'){if(s.hands[side].P>=18)fail('歩兵の持ち駒はこれ以上増やせません。');s.hands[side].P++;}
  else if(id==='promote'){const target=action.target,piece=s.board[target];if(!Number.isInteger(target)||target<0||target>=81||piece?.side!==side||piece.promoted||!['P','L','N','S','B','R'].includes(piece.type))fail('成れる自分の駒を選んでください。');piece.promoted=true;}
  else if(id==='recycle'){if(!p.grave.length||p.hand.length>=7)fail('墓地にカードがないか、手札が満杯です。');p.hand.push(p.grave.splice(Math.floor(Math.random()*p.grave.length),1)[0]);}
  p.cardPlayed=true;if(card.type!=='equipment')p.grave.push(id);s.log.push(`${side==='b'?'先手':'後手'}が${card.name}を使用`);
}
export function activateEquipment(s,action){const side=s.turn,p=s.cards[side],slot=action?.slot;if(!Number.isInteger(slot)||!canActivate(s,side,slot))fail('この装備能力は発動できません。');const item=p.equipment[slot],card=CARD_CATALOG[item.id];
  if(item.id==='dobby')dobby(s,side,action);
  else if(item.id==='copier'){const id=action.cardId;if(!CARD_CATALOG[id]||CARD_CATALOG[id].type==='equipment'||!p.hand.includes(id)||p.hand.length>=7)fail('複製する通常カードを手札から選んでください。');p.hand.push(id);s.log.push(`${CARD_CATALOG[id].name}を複製`);}
  else if(item.id==='multiply'){const to=action.target,x=to%9,y=Math.floor(to/9);if(!Number.isInteger(to)||to<0||to>=81||s.board[to]||!s.board.some((piece,i)=>piece?.side===side&&piece.type==='P'&&!piece.promoted&&Math.abs(i%9-x)+Math.abs(Math.floor(i/9)-y)===1)||(side==='b'?y===0:y===8))fail('自分の歩の隣の空きマスを選んでください。');s.board[to]={side,type:'P',promoted:false};s.log.push('増殖装置で歩を増やした');}
  else if(item.id==='gianism'){const enemy=s.cards[other(side)],target=action.target,stolen=enemy.equipment[target];if(!Number.isInteger(target)||!stolen||stolen.id==='gianism'||p.equipment.some(e=>e.id===stolen.id))fail('奪える相手の装備を選んでください。');if(p.equipment.length>=3){const replaceSlot=action.replaceSlot;if(!Number.isInteger(replaceSlot)||replaceSlot<0||replaceSlot>=3||replaceSlot===slot)fail('交換する自分の装備枠を選んでください。');p.grave.push(p.equipment.splice(replaceSlot,1)[0].id);}enemy.equipment.splice(target,1);p.equipment.push({...stolen,usedTurn:p.turnSerial,turnUses:1});s.log.push(`${CARD_CATALOG[stolen.id].name}を奪った`);}
  else if(item.id!=='hourglass')fail('この装備に任意発動能力はありません。');
  p.cp-=card.activeCost;recordUse(p,item);s.log.push(`${card.name}の能力を発動`);
}
export function kingMoved(s,side){const p=s.cards[side],crown=p.equipment.find(e=>e.id==='crown');if(!crown)return;if(crown.trait==='cp'){p.cp=Math.min(10,p.cp+1);s.log.push('バグった王冠: 王将の移動で1CP獲得');}else if(crown.trait==='draw'){if(draw(p))s.log.push('バグった王冠: 王将の移動で1枚ドロー');}else if(crown.trait==='guard'){crown.guardReady=true;s.log.push('バグった王冠: 王将の移動で防御を準備');}}
export function cardView(s){const side=s.turn;return {currentHand:[...s.cards[side].hand],handCount:{b:s.cards.b.hand.length,w:s.cards.w.hand.length},cp:{b:s.cards.b.cp,w:s.cards.w.cp},equipment:{b:s.cards.b.equipment.map(e=>({...e})),w:s.cards.w.equipment.map(e=>({...e}))},activeSlots:s.cards[side].equipment.map((_,i)=>canActivate(s,side,i)),cardPlayed:s.cards[side].cardPlayed,combos:{b:combosFor(s,'b').map(c=>c.name),w:combosFor(s,'w').map(c=>c.name)},deckCount:{b:s.cards.b.deck.length,w:s.cards.w.deck.length}};}
export function cpuCardAction(s){const side=s.turn,p=s.cards[side];if(p.cardPlayed)return null;const enemy=other(side),target=s.board.findIndex(piece=>piece?.side===enemy&&piece.type!=='K'),own=s.board.findIndex(piece=>piece?.side===side&&piece.type!=='K'),empty=s.board.findIndex(piece=>!piece),enemyEquip=s.cards[enemy].equipment;
  for(const id of ['dobby','infinity','avada','meteor','dispel','promote','greed','shield','reflect','immortal','taxOffice','crown','copier','hourglass','multiply','gianism','amnesia','tax','double','insight','grant','reinforce','recycle','warp']){
    if(!p.hand.includes(id)||p.cp<CARD_CATALOG[id].cost)continue;const action={kind:'card',cardId:id};
    if(id==='dobby'){if(s.cards[enemy].hand.length&&p.hand.length<7)action.choice='steal';else if(target>=0){action.choice='destroy';action.target=target;}else continue;}
    if(id==='avada'||id==='meteor'){if(target<0)continue;action.target=target;}
    if(id==='dispel'){if(!enemyEquip.length)continue;action.target=0;}
    if(id==='promote'){const candidate=s.board.findIndex(piece=>piece?.side===side&&!piece.promoted&&['P','L','N','S','B','R'].includes(piece.type));if(candidate<0)continue;action.target=candidate;}
    if(id==='amnesia'&&!s.cards[enemy].hand.length)continue;
    if(id==='recycle'&&(!p.grave.length||p.hand.length>=7))continue;
    if(id==='reinforce'&&s.hands[side].P>=18)continue;
    if(id==='warp'){if(own<0||empty<0)continue;action.from=own;action.target=empty;}
    if(CARD_CATALOG[id].type==='equipment'&&p.equipment.length>=3)action.replaceSlot=0;
    if(CARD_CATALOG[id].type==='equipment'&&p.equipment.some(e=>e.id===id))continue;
    return action;
  }
  return null;
}
