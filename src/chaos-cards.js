import { registerEffectHandler, emitEffect } from './chaos-effects.js';
import { MEME_CARDS } from './chaos-memes.js';
import { resolveMemeCard, resolveChaosTurnStart, terrainAt } from './chaos-meme-effects.js';

export const CARD_CATALOG=Object.freeze({
  avada:{id:'avada',name:'アバダ・ケダブラ',type:'instant',rarity:'rare',cost:4,target:'enemy-piece',description:'敵の王将以外の駒を1体破壊する。'},
  meteor:{id:'meteor',name:'隕石落下',type:'instant',rarity:'superRare',cost:6,target:'square',description:'指定マスを中心に3×3の敵駒を破壊する。王将には効かない。'},
  double:{id:'double',name:'2回行動',type:'rule',rarity:'rare',cost:3,target:'none',description:'このターンの駒移動回数を1回増やす。'},
  tax:{id:'tax',name:'税金徴収',type:'instant',rarity:'common',cost:2,target:'none',description:'相手から2CPを徴収し、相手に持ち駒があればランダムに1枚奪う。'},
  warp:{id:'warp',name:'瞬間移動',type:'instant',rarity:'rare',cost:3,target:'own-piece-and-square',description:'自分の王将以外の駒を空きマスへ移す。自玉を王手にさらせない。'},
  dispel:{id:'dispel',name:'装備解除命令',type:'instant',rarity:'rare',cost:3,target:'enemy-equipment',description:'相手の装備を1枚破壊し、パッシブ効果を解除する。'},
  dobby:{id:'dobby',name:'ドビーは悪い子',type:'equipment',rarity:'ultraRare',cost:5,target:'choice',description:'装備時に強奪か駒破壊。通常は対局中1回。無下限呪術と装備すると毎ターン3CPで再発動。',activeCost:3,matchLimit:1,turnLimit:1},
  infinity:{id:'infinity',name:'無下限呪術',type:'equipment',rarity:'ultraRare',cost:8,target:'none',description:'装備中、自分の装備能力の対局中使用回数制限を解除する。',passiveEffects:['remove-match-limit']},
  greed:{id:'greed',name:'強欲な手',type:'equipment',rarity:'superRare',cost:3,target:'none',description:'相手からカードを奪うと、自分のデッキから追加で1枚ドロー。',passiveEffects:['draw-on-steal']},
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
  snatch:{id:'snatch',name:'手札強奪',type:'instant',rarity:'rare',cost:3,target:'none',description:'相手の手札からランダムに1枚奪う。強欲な手との連鎖にも対応。'},
  reinforce:{id:'reinforce',name:'歩兵募集',type:'instant',rarity:'common',cost:3,target:'none',description:'持ち駒に歩兵を1枚追加する。盤上に打つ際は二歩を守る。'},
  promote:{id:'promote',name:'超進化',type:'rule',rarity:'rare',cost:4,target:'own-piece',description:'自分の成れる駒を1体、敵陣以外でも成らせる。'},
  recycle:{id:'recycle',name:'墓地から復活',type:'instant',rarity:'rare',cost:2,target:'none',description:'自分の墓地からランダムなカードを1枚手札に戻す。'},
  ...MEME_CARDS
});
export const COMBOS=Object.freeze([
  {id:'eternal-dobby',name:'永久にドビーは悪い子',requiredEquipment:['dobby','infinity'],requiredConditions:[],priority:10,grantedEffects:['remove-match-limit'],removedEffects:[],animationId:'dobby-infinite',soundId:'combo'},
  {id:'infinite-heist',name:'無限強奪',requiredEquipment:['dobby','infinity','greed'],requiredConditions:[],priority:20,grantedEffects:['remove-match-limit','draw-on-steal'],removedEffects:[],animationId:'heist',soundId:'combo'},
  {id:'infinite-multiply',name:'無限増殖',requiredEquipment:['multiply','infinity'],requiredConditions:[],priority:15,grantedEffects:['remove-match-limit'],removedEffects:[],animationId:'multiply-infinite',soundId:'combo'},
  {id:'infinite-revive',name:'無限復活',requiredEquipment:['immortal','infinity'],requiredConditions:[],priority:15,grantedEffects:['repeat-revive'],removedEffects:[],animationId:'revive-infinite',soundId:'combo'},
  {id:'mass-production',name:'カード大量生産',requiredEquipment:['copier','greed','infinity'],requiredConditions:[],priority:20,grantedEffects:['remove-match-limit','draw-on-steal'],removedEffects:[],animationId:'card-factory',soundId:'combo'},
  {id:'absolute-defense',name:'絶対防御',requiredEquipment:['reflect','shield'],requiredConditions:[],priority:10,grantedEffects:['reflect-then-shield'],removedEffects:[],animationId:'absolute-defense',soundId:'combo'}
]);
const fail=message=>{throw new Error(message);};
const other=side=>side==='b'?'w':'b';
const shuffle=items=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;};
export const DEFAULT_DECK=Object.freeze(['avada','meteor','double','tax','warp','dispel','dobby','infinity','greed','shield'].flatMap(id=>[id,id]));
export function validateDeck(ids){if(!Array.isArray(ids)||ids.length!==20)fail('デッキは20枚にしてください。');const counts=Object.create(null);for(const id of ids){if(typeof id!=='string'||!Object.hasOwn(CARD_CATALOG,id))fail('存在しないカードが入っています。');counts[id]=(counts[id]||0)+1;if(counts[id]>2)fail('同名カードは2枚までです。');}const counterCount=ids.filter(id=>CARD_CATALOG[id].type==='counter').length;if(counterCount>5)fail('カウンターカードは5枚までです。');if(ids.filter(id=>CARD_CATALOG[id].rarity==='mythic').length>1)fail('神話級カードは合計1枚までです。');return [...ids];}
const player=deck=>({deck:shuffle(deck),hand:[],grave:[],equipment:[],cp:4,cardPlayed:false,turnSerial:0});
export function initCards(decks={}){const cards={b:player(validateDeck(decks.b??DEFAULT_DECK)),w:player(validateDeck(decks.w??DEFAULT_DECK))};for(const side of ['b','w'])for(let i=0;i<4;i++)draw(cards[side]);cards.b.turnSerial=1;return cards;}
export function cloneCards(cards){return Object.fromEntries(['b','w'].map(side=>[side,{...cards[side],deck:[...cards[side].deck],hand:[...cards[side].hand],grave:[...cards[side].grave],equipment:cards[side].equipment.map(e=>({...e}))}]));}
function draw(p){if(!p.deck.length&&p.grave.length){p.deck=shuffle(p.grave);p.grave=[];}if(p.hand.length>=7||!p.deck.length)return false;p.hand.push(p.deck.pop());return true;}
export function startTurnCards(s){const p=s.cards[s.turn];p.turnSerial++;p.cp=Math.min(10,p.cp+2);p.cardPlayed=false;const drawn=draw(p);s.log.push(`${s.turn==='b'?'先手':'後手'}は2CP回復し1枚ドロー`);resolveChaosTurnStart(s,s.turn);emitEffect(s,'ON_TURN_START',{side:s.turn});if(drawn)emitEffect(s,'ON_CARD_DRAWN',{side:s.turn,source:'turn'});}
export function combosFor(s,side){const ids=new Set(s.cards[side].equipment.map(e=>e.id));return COMBOS.filter(combo=>combo.requiredEquipment.every(id=>ids.has(id))&&combo.requiredConditions.every(condition=>condition==='own-turn'?s.turn===side:true)).sort((a,b)=>b.priority-a.priority);}
export function activeEffects(s,side){const effects=new Set();for(const item of s.cards[side].equipment)for(const effect of CARD_CATALOG[item.id]?.passiveEffects||[])effects.add(effect);for(const combo of combosFor(s,side)){for(const effect of combo.grantedEffects)effects.add(effect);for(const effect of combo.removedEffects)effects.delete(effect);}return effects;}
export function syncComboEvents(previous,next){
  next.comboEvents=[];
  for(const side of ['b','w']){
    const before=new Set(combosFor(previous,side).map(combo=>combo.id));
    const after=new Set(combosFor(next,side).map(combo=>combo.id));
    for(const combo of COMBOS){
      const active=after.has(combo.id);
      if(active===before.has(combo.id))continue;
      next.comboEvents.push({side,id:combo.id,name:combo.name,active,animationId:combo.animationId,soundId:combo.soundId});
      next.log.push(`${side==='b'?'先手':'後手'}の${combo.name}が${active?'成立！':'終了'}`);
    }
  }
}
const has=(s,side,id)=>s.cards[side].equipment.some(e=>e.id===id);
function canMultiplyAt(s,side,to){const width=s.size||9;if(!Number.isInteger(to)||to<0||to>=s.board.length||s.board[to]||terrainAt(s,to))return false;const x=to%width,y=Math.floor(to/width);if(side==='b'?y===0:y===width-1)return false;return s.board.some((piece,i)=>piece?.side===side&&piece.type==='P'&&!piece.promoted&&Math.abs(i%width-x)+Math.abs(Math.floor(i/width)-y)===1);}
export function canActivate(s,side,slot){const p=s.cards[side],equip=p.equipment[slot],card=equip&&CARD_CATALOG[equip.id];if(!card?.activeCost||equip.id==='hourglass'&&!s.undoSnapshot)return false;if(equip.id==='multiply'&&!s.board.some((_,i)=>canMultiplyAt(s,side,i)))return false;if(p.cp<card.activeCost||(equip.usedTurn===p.turnSerial&&(equip.turnUses||1)>=(card.turnLimit||1)))return false;return !Number.isFinite(card.matchLimit)||equip.uses<card.matchLimit||activeEffects(s,side).has('remove-match-limit');}
function recordUse(p,item){item.turnUses=item.usedTurn===p.turnSerial?(item.turnUses||1)+1:1;item.usedTurn=p.turnSerial;item.uses++;}
function reflected(s,side){const event={attacker:side,defender:other(side),prevented:false};emitEffect(s,'ON_CARD_TARGETED',event);return event.prevented;}
function destroyPiece(s,side,target){if(!Number.isInteger(target)||target<0||target>=s.board.length)fail('対象マスが不正です。');const piece=s.board[target];if(!piece||piece.side!==other(side)||piece.type==='K')fail('敵の王将以外の駒を選んでください。');const event={attacker:side,defender:piece.side,target,piece,prevented:false};emitEffect(s,'ON_PIECE_TARGETED',event);if(event.prevented)return false;s.board[target]=null;s.log.push(`${side==='b'?'先手':'後手'}のカードが${piece.type}を破壊`);emitEffect(s,'ON_PIECE_DESTROYED',{side:piece.side,attacker:side,target,pieceType:piece.type});return true;}
function steal(s,side){const own=s.cards[side],enemy=s.cards[other(side)];if(!enemy.hand.length)fail('相手の手札がありません。');if(own.hand.length>=7)fail('手札が上限の7枚です。');const i=Math.floor(Math.random()*enemy.hand.length),card=enemy.hand.splice(i,1)[0];own.hand.push(card);s.log.push(`${side==='b'?'先手':'後手'}が相手のカードを1枚奪った`);emitEffect(s,'ON_CARD_STOLEN',{side});return card;}
registerEffectHandler('ON_CARD_STOLEN','greed-draw',(s,event,emit)=>{if(!activeEffects(s,event.side).has('draw-on-steal'))return;if(draw(s.cards[event.side])){s.log.push('強欲な手でさらに1枚ドロー');emit('ON_CARD_DRAWN',{side:event.side,source:'greed'});}},10);
registerEffectHandler('ON_TURN_START','tax-office',(s,event)=>{if(!has(s,event.side,'taxOffice'))return;const own=s.cards[event.side],enemy=s.cards[other(event.side)],amount=Math.min(1,enemy.cp);enemy.cp-=amount;own.cp=Math.min(10,own.cp+amount);s.log.push(`税務署が${amount}CPを徴収`);},10);
registerEffectHandler('ON_CARD_TARGETED','reflect-helmet',(s,event)=>{const helmet=s.cards[event.defender].equipment.find(e=>e.id==='reflect'&&e.usedTurn!==s.cards[event.attacker].turnSerial);if(!helmet)return;helmet.usedTurn=s.cards[event.attacker].turnSerial;helmet.uses++;event.prevented=true;s.log.push('反射ヘルメットが対象指定カードを反射した');},30);
registerEffectHandler('ON_CARD_TARGETED','prepared-counter',(s,event)=>{if(event.prevented)return;const counter=s.chaos?.counters?.[event.defender];if(!counter||!['counter-reverse','counter-null'].includes(counter.kind))return;delete s.chaos.counters[event.defender];event.prevented=true;if(counter.kind==='counter-reverse')s.cards[event.attacker].cp=Math.max(0,s.cards[event.attacker].cp-2);s.log.push('準備したカウンターが対象カードを無効化');},40);
registerEffectHandler('ON_CARD_TARGETED','hand-counter',(s,event,emit)=>{if(event.prevented)return;const defender=s.cards[event.defender],id=defender.hand.find(id=>['uno','nope','never-happened','reflect-armor'].includes(id)&&defender.cp>=CARD_CATALOG[id].cost);if(!id)return;defender.hand.splice(defender.hand.indexOf(id),1);defender.grave.push(id);defender.cp-=CARD_CATALOG[id].cost;event.prevented=true;if(['uno','reflect-armor'].includes(id))s.cards[event.attacker].cp=Math.max(0,s.cards[event.attacker].cp-2);s.log.push(`${CARD_CATALOG[id].name}が手札から反応`);emit('ON_CARD_PLAYED',{side:event.defender,cardId:id,counter:true});},35);
registerEffectHandler('ON_PIECE_TARGETED','prepared-piece-counter',(s,event)=>{if(event.prevented)return;const counter=s.chaos?.counters?.[event.defender];if(!counter||!['counter-guard','counter-decoy','counter-dodge'].includes(counter.kind))return;delete s.chaos.counters[event.defender];if(counter.kind==='counter-dodge'){const width=s.size||9,x=event.target%width,y=Math.floor(event.target/width),options=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(([xx,yy])=>xx>=0&&yy>=0&&xx<width&&yy<width).map(([xx,yy])=>yy*width+xx).filter(i=>!s.board[i]);if(options.length){const to=options[0];s.board[to]=s.board[event.target];s.board[event.target]=null;}}event.prevented=true;s.log.push('準備した防御カードが駒破壊を防いだ');},40);
registerEffectHandler('ON_PIECE_TARGETED','hand-piece-counter',(s,event,emit)=>{if(event.prevented)return;const defender=s.cards[event.defender],id=defender.hand.find(id=>['blind-spot','decoy','barrier','emergency-dodge'].includes(id)&&defender.cp>=CARD_CATALOG[id].cost);if(!id)return;defender.hand.splice(defender.hand.indexOf(id),1);defender.grave.push(id);defender.cp-=CARD_CATALOG[id].cost;if(id==='emergency-dodge'){const width=s.size||9,x=event.target%width,y=Math.floor(event.target/width),options=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(([xx,yy])=>xx>=0&&yy>=0&&xx<width&&yy<width).map(([xx,yy])=>yy*width+xx).filter(i=>!s.board[i]);if(options.length){s.board[options[0]]=s.board[event.target];s.board[event.target]=null;}}event.prevented=true;s.log.push(`${CARD_CATALOG[id].name}が手札から反応`);emit('ON_CARD_PLAYED',{side:event.defender,cardId:id,counter:true});},38);
registerEffectHandler('ON_PIECE_TARGETED','divine-king-guard',(s,event)=>{if(event.prevented||!s.chaos?.kingGuard?.[event.defender])return;s.chaos.kingGuard[event.defender]=0;event.prevented=true;s.log.push('神の一手が駒を守った');},35);
registerEffectHandler('ON_PIECE_TARGETED','divine-shield',(s,event)=>{if(event.prevented)return;const shield=s.cards[event.defender].equipment.find(e=>e.id==='shield'&&!e.shieldUsed);if(!shield)return;shield.shieldUsed=true;event.prevented=true;s.log.push('神の盾が駒破壊を防いだ');},30);
registerEffectHandler('ON_PIECE_TARGETED','crown-guard',(s,event)=>{if(event.prevented)return;const crown=s.cards[event.defender].equipment.find(e=>e.id==='crown'&&e.trait==='guard'&&e.guardReady);if(!crown)return;crown.guardReady=false;event.prevented=true;s.log.push('バグった王冠が駒破壊を防いだ');},20);
registerEffectHandler('ON_PIECE_TARGETED','immortal-revive',(s,event)=>{if(event.prevented)return;const immortal=s.cards[event.defender].equipment.find(e=>e.id==='immortal');if(!immortal)return;const repeat=activeEffects(s,event.defender).has('repeat-revive'),turnKey=`${event.attacker}:${s.cards[event.attacker].turnSerial}`;if(immortal.revived&&(!repeat||immortal.reviveTurnKey===turnKey))return;immortal.revived=true;immortal.uses=(immortal.uses||0)+1;immortal.reviveTurnKey=turnKey;event.prevented=true;s.log.push('不死の契約で駒が復活した');},10);
registerEffectHandler('ON_PIECE_MOVED','crown-king',(s,event)=>{if(event.pieceType!=='K')return;const p=s.cards[event.side],crown=p.equipment.find(e=>e.id==='crown');if(!crown)return;if(crown.trait==='cp'){p.cp=Math.min(10,p.cp+1);s.log.push('バグった王冠: 王将の移動で1CP獲得');}else if(crown.trait==='draw'){if(draw(p))s.log.push('バグった王冠: 王将の移動で1枚ドロー');}else if(crown.trait==='guard'){crown.guardReady=true;s.log.push('バグった王冠: 王将の移動で防御を準備');}},10);
function dobby(s,side,action){if(action.choice==='steal'){if(!s.cards[other(side)].hand.length||s.cards[side].hand.length>=7)fail('相手の手札がないか、自分の手札が満杯です。');if(!reflected(s,side))steal(s,side);}else if(action.choice==='destroy'){if(!Number.isInteger(action.target)||s.board[action.target]?.side!==other(side)||s.board[action.target]?.type==='K')fail('敵の王将以外の駒を選んでください。');if(!reflected(s,side))destroyPiece(s,side,action.target);}else fail('強奪か駒破壊を選んでください。');}
function equip(s,side,id,action){const p=s.cards[side];if(p.equipment.some(e=>e.id===id))fail('同名装備は1枚までです。');if(p.equipment.length>=3){const slot=action.replaceSlot;if(!Number.isInteger(slot)||slot<0||slot>=3)fail('交換する装備枠を選んでください。');const removed=p.equipment.splice(slot,1)[0];p.grave.push(removed.id);s.log.push(`${CARD_CATALOG[removed.id].name}を解除`);emitEffect(s,'ON_UNEQUIP',{side,cardId:removed.id});}const item={id,uses:0,usedTurn:-1,turnUses:0,shieldUsed:false,revived:false};if(id==='crown')item.trait=['cp','draw','guard'][Math.floor(Math.random()*3)];p.equipment.push(item);s.log.push(`${side==='b'?'先手':'後手'}が${CARD_CATALOG[id].name}を装備`);emitEffect(s,'ON_EQUIP',{side,cardId:id});if(id==='dobby'){dobby(s,side,action);recordUse(p,item);}}
export function playCard(s,action){const side=s.turn,p=s.cards[side],id=action?.cardId,card=Object.hasOwn(CARD_CATALOG,id)?CARD_CATALOG[id]:null;if(!card||!p.hand.includes(id))fail('手札にないカードです。');if(card.allowedModes&&!card.allowedModes.includes(s.mode||'normal'))fail('このカードは完全崩壊モード専用です。');if(s.chaos?.rules?.[`sleep:${side}`]?.expiresOn>p.turnSerial)fail('睡眠中はカードを使用できません。');if(p.cardPlayed)fail('このターンはすでにカードを使いました。');if(p.cp<card.cost)fail('CPが足りません。');
  p.hand.splice(p.hand.indexOf(id),1);
  p.cp-=card.cost;
  if(card.type==='equipment')equip(s,side,id,action);
  else if(id==='avada'){if(!Number.isInteger(action.target)||s.board[action.target]?.side!==other(side)||s.board[action.target]?.type==='K')fail('敵の王将以外の駒を選んでください。');if(!reflected(s,side))destroyPiece(s,side,action.target);}
  else if(id==='meteor'){if(!Number.isInteger(action.target)||action.target<0||action.target>=s.board.length)fail('対象マスが不正です。');const width=s.size||9,x=action.target%width,y=Math.floor(action.target/width),targets=[];for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){const i=yy*width+xx;if(xx>=0&&xx<width&&yy>=0&&yy<width&&s.board[i]?.side===other(side)&&s.board[i].type!=='K')targets.push(i);}if(!targets.length)fail('範囲に破壊できる駒がありません。');for(const i of targets)destroyPiece(s,side,i);}
  else if(id==='double'){s.movesLeft=Math.min(3,(s.movesLeft||1)+1);emitEffect(s,'ON_RULE_CHANGED',{side,rule:'extra-move'});}
  else if(id==='tax'){const amount=Math.min(2,s.cards[other(side)].cp);s.cards[other(side)].cp-=amount;p.cp=Math.min(10,p.cp+amount);s.log.push(`${side==='b'?'先手':'後手'}が${amount}CPを徴収`);const held=Object.entries(s.hands[other(side)]).filter(([type,count])=>type!=='K'&&count>0);if(held.length){const type=held[Math.floor(Math.random()*held.length)][0];s.hands[other(side)][type]--;s.hands[side][type]++;s.log.push('相手の持ち駒を1枚徴収');}}
  else if(id==='warp'){const from=action.from,to=action.target;if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>=s.board.length||to<0||to>=s.board.length||s.board[from]?.side!==side||s.board[from].type==='K'||s.board[to]||terrainAt(s,to))fail('自分の王将以外の駒と空きマスを選んでください。');s.board[to]=s.board[from];s.board[from]=null;}
  else if(id==='dispel'){const slot=action.target,p2=s.cards[other(side)];if(!Number.isInteger(slot)||slot<0||slot>=p2.equipment.length)fail('相手の装備を選んでください。');if(!reflected(s,side)){const removed=p2.equipment.splice(slot,1)[0];p2.grave.push(removed.id);s.log.push(`${CARD_CATALOG[removed.id].name}が解除された`);emitEffect(s,'ON_UNEQUIP',{side:other(side),cardId:removed.id});}}
  else if(id==='grant')p.cp=Math.min(10,p.cp+3);
  else if(id==='insight'){draw(p);draw(p);}
  else if(id==='amnesia'){const opponent=s.cards[other(side)];if(!opponent.hand.length)fail('相手の手札がありません。');if(!reflected(s,side)){const taken=opponent.hand.splice(Math.floor(Math.random()*opponent.hand.length),1)[0];opponent.grave.push(taken);s.log.push('相手の手札を1枚捨てさせた');}}
  else if(id==='snatch'){if(!s.cards[other(side)].hand.length||p.hand.length>=7)fail('相手の手札がないか、自分の手札が満杯です。');if(!reflected(s,side))steal(s,side);}
  else if(id==='reinforce'){if(s.hands[side].P>=18)fail('歩兵の持ち駒はこれ以上増やせません。');s.hands[side].P++;}
  else if(id==='promote'){const target=action.target,piece=s.board[target];if(!Number.isInteger(target)||target<0||target>=s.board.length||piece?.side!==side||piece.promoted||!['P','L','N','S','B','R'].includes(piece.type))fail('成れる自分の駒を選んでください。');piece.promoted=true;}
  else if(id==='recycle'){if(!p.grave.length||p.hand.length>=7)fail('墓地にカードがないか、手札が満杯です。');p.hand.push(p.grave.splice(Math.floor(Math.random()*p.grave.length),1)[0]);}
  else if(MEME_CARDS[id])resolveMemeCard(s,card,action,{destroy:destroyPiece,draw,reflected,steal,catalog:CARD_CATALOG});
  p.cardPlayed=true;if(card.type!=='equipment')p.grave.push(id);s.log.push(`${side==='b'?'先手':'後手'}が${card.name}を使用`);emitEffect(s,'ON_CARD_PLAYED',{side,cardId:id});
}
export function activateEquipment(s,action){const side=s.turn,p=s.cards[side],slot=action?.slot;if(!Number.isInteger(slot)||!canActivate(s,side,slot))fail('この装備能力は発動できません。');const item=p.equipment[slot],card=CARD_CATALOG[item.id];
  if(item.id==='dobby')dobby(s,side,action);
  else if(item.id==='copier'){const id=action.cardId;if(!CARD_CATALOG[id]||CARD_CATALOG[id].type==='equipment'||!p.hand.includes(id)||p.hand.length>=7)fail('複製する通常カードを手札から選んでください。');p.hand.push(id);s.log.push(`${CARD_CATALOG[id].name}を複製`);}
  else if(item.id==='multiply'){const to=action.target;if(!canMultiplyAt(s,side,to))fail('自分の歩の隣の空きマスを選んでください。');s.board[to]={side,type:'P',promoted:false};s.log.push('増殖装置で歩を増やした');}
  else if(item.id==='gianism'){const enemy=s.cards[other(side)],target=action.target,stolen=enemy.equipment[target];if(!Number.isInteger(target)||!stolen||stolen.id==='gianism'||p.equipment.some(e=>e.id===stolen.id))fail('奪える相手の装備を選んでください。');if(p.equipment.length>=3){const replaceSlot=action.replaceSlot;if(!Number.isInteger(replaceSlot)||replaceSlot<0||replaceSlot>=3||replaceSlot===slot)fail('交換する自分の装備枠を選んでください。');const removed=p.equipment.splice(replaceSlot,1)[0];p.grave.push(removed.id);emitEffect(s,'ON_UNEQUIP',{side,cardId:removed.id});}enemy.equipment.splice(target,1);emitEffect(s,'ON_UNEQUIP',{side:other(side),cardId:stolen.id});p.equipment.push({...stolen,usedTurn:p.turnSerial,turnUses:1});emitEffect(s,'ON_EQUIP',{side,cardId:stolen.id});s.log.push(`${CARD_CATALOG[stolen.id].name}を奪った`);}
  else if(item.id!=='hourglass')fail('この装備に任意発動能力はありません。');
  p.cp-=card.activeCost;recordUse(p,item);s.log.push(`${card.name}の能力を発動`);emitEffect(s,'ON_ACTIVATE',{side,cardId:item.id});
}
export function pieceMoved(s,side,pieceType,from,to){emitEffect(s,'ON_PIECE_MOVED',{side,pieceType,from,to});}
export function cardView(s){const side=s.turn;return {currentHand:[...s.cards[side].hand],handCount:{b:s.cards.b.hand.length,w:s.cards.w.hand.length},cp:{b:s.cards.b.cp,w:s.cards.w.cp},turnSerial:{b:s.cards.b.turnSerial,w:s.cards.w.turnSerial},equipment:{b:s.cards.b.equipment.map(e=>({...e})),w:s.cards.w.equipment.map(e=>({...e}))},activeSlots:s.cards[side].equipment.map((_,i)=>canActivate(s,side,i)),cardPlayed:s.cards[side].cardPlayed,combos:{b:combosFor(s,'b').map(c=>c.name),w:combosFor(s,'w').map(c=>c.name)},deckCount:{b:s.cards.b.deck.length,w:s.cards.w.deck.length}};}
export function cpuCardAction(s){const side=s.turn,p=s.cards[side];if(p.cardPlayed)return null;const enemy=other(side),target=s.board.findIndex(piece=>piece?.side===enemy&&piece.type!=='K'),own=s.board.findIndex(piece=>piece?.side===side&&piece.type!=='K'),empty=s.board.findIndex(piece=>!piece),enemyEquip=s.cards[enemy].equipment;
  for(const id of ['dobby','infinity','avada','meteor','dispel','promote','greed','shield','reflect','immortal','taxOffice','crown','copier','hourglass','multiply','gianism','snatch','amnesia','tax','double','insight','grant','reinforce','recycle','warp']){
    if(!p.hand.includes(id)||p.cp<CARD_CATALOG[id].cost)continue;const action={kind:'card',cardId:id};
    if(id==='dobby'){if(s.cards[enemy].hand.length&&p.hand.length<7)action.choice='steal';else if(target>=0){action.choice='destroy';action.target=target;}else continue;}
    if(id==='avada'||id==='meteor'){if(target<0)continue;action.target=target;}
    if(id==='dispel'){if(!enemyEquip.length)continue;action.target=0;}
    if(id==='promote'){const candidate=s.board.findIndex(piece=>piece?.side===side&&!piece.promoted&&['P','L','N','S','B','R'].includes(piece.type));if(candidate<0)continue;action.target=candidate;}
    if(['amnesia','snatch'].includes(id)&&!s.cards[enemy].hand.length)continue;
    if(id==='recycle'&&(!p.grave.length||p.hand.length>=7))continue;
    if(id==='reinforce'&&s.hands[side].P>=18)continue;
    if(id==='warp'){if(own<0||empty<0)continue;action.from=own;action.target=empty;}
    if(CARD_CATALOG[id].type==='equipment'&&p.equipment.length>=3)action.replaceSlot=0;
    if(CARD_CATALOG[id].type==='equipment'&&p.equipment.some(e=>e.id===id))continue;
    return action;
  }
  return null;
}
