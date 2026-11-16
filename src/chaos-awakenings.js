
import { emitEffect } from './chaos-effects.js';
import { setRule, terrainAt } from './chaos-meme-effects.js';

// Cards own exactly one non-generic awakening recipe. Recipes are server-only and
// invoked once per match on the first successful use, never in ranked matches.
const RAW_RECIPES = "avada|消滅連鎖：命中地点の隣にいる敵の歩をさらに1体破壊|blastNear:1:P\nmeteor|隕石跡：着弾地点の空きマスに一時的な穴を残す|terrain:hole:1\ndouble|超連続行動：さらにもう1回駒を動かせる|moves:1\ntax|追徴課税：相手の手札を追加で1枚捨てさせる|discardEnemy:1\nwarp|安全着陸：ワープした駒をカード破壊から1回守る|protectTarget:1\ndispel|装備ショック：相手の準備したカウンターも消去する|removeCounter:1\ndobby|悪戯のご褒美：強奪か破壊の後にデッキから1枚引く|draw:1\ninfinity|絶対結界：味方全体へのカード破壊を1回防ぐ|kingGuard:1\ngreed|底なしの強欲：装備時に相手の持ち駒を1枚奪う|stealHandPiece:1\nshield|二重防御：次のカード破壊を防ぐための盾を1回増やす|shieldCharge:1\nreflect|反射の余波：装備時に相手のCPを2奪う|drain:2\ncopier|予備コピー：今持っている通常カードを1枚複製する|copyHand:1\ntaxOffice|課税通知：相手の次のドローを1回停止させる|skipDraw:1\ncrown|王の威厳：王将を回復し次のカード破壊を1回防ぐ|cleanKing:1;kingGuard:1\nhourglass|時間の帳消し：相手にかかっている一時的な有利ルールを1つ消す|clearEnemyRule:1\nmultiply|工場稼働：歩の持ち駒を2枚補充する|hand:P:2\nimmortal|死なない準備：傷ついた味方の状態異常を1つ解除し、その駒を守る|clean:1;protectOwn:1\ngianism|横取り準備：相手の装備カウンターを消し、手札も1枚捨てさせる|removeCounter:1;discardEnemy:1\ngrant|次回予算：次の自分のターン開始時に追加で3CP回復|pending:3\ninsight|天才の着想：引いた後の手札から通常カードを1枚複製|copyHand:1;draw:1\namnesia|完全忘却：相手の次のドローを封じ、1CP奪う|skipDraw:1;drain:1\nsnatch|連続強奪：強奪の後に自分のデッキから2枚引く|draw:2\nreinforce|精鋭兵の加入：歩のほかに銀将を持ち駒へ追加する|hand:S:1\npromote|進化の鎧：成らせた駒にカード防御1回を付与|protectTarget:1;cleanTarget:1\nrecycle|墓地の奥から：もう1枚だけ自分の墓地から手札に戻す|returnGrave:1\nfatal|伝染する予言：近くの敵の歩にも時限破壊を付与|doomNear:1:P\nexplosion|爆発跡：爆心地の空きマスへバナナの皮を設置|terrain:banana:1\ndeleted|完全削除：相手の捨て札も1枚消去する|purgeEnemy:1\nbeam|貫通余波：同じ筋の別の敵の通常駒にも追撃する|blastLine:1\npen|弱体化の追撃：歩に変えた敵を1手番凍結する|freezeTarget:1\neject|追加退場：相手の持ち駒の歩を1枚奪う|stealPawn:1\nworld-end|瓦礫からの再建：自分の持ち駒に金将を1枚追加|hand:G:1;score:1\nrook-pawn|歩兵砲：飛車化した歩の効果をさらに2手番延長|extendRook:2\nfast-move|疾風：追加行動をさらに1回増やす|moves:1;guardOwn:1\nclone-piece|分身補給：複製後に歩の持ち駒を1枚獲得|hand:P:1;draw:1\nfull-dash|衝撃着地：移動した駒の周囲の敵1体を凍結する|freezeNear:1\nwormhole|安全な交換：交換した自分の駒2体をカード破壊から守る|protectSwap:1\nskip-work|帰還手当：駒を戻した後にカードを1枚引く|draw:1;pending:1\nuno|究極リバース：準備したカウンターの防御を強化する|counterPower:2\nblind-spot|死角ゼロ：味方の王将に追加の防御を1回付与|kingGuard:1;cleanKing:1\nnope|拒絶連鎖：使用時に相手の1CPも奪う|drain:1;counterPower:2\ndecoy|もう1体の身代わり：歩の持ち駒を1枚追加|hand:P:1;counterPower:2\nbarrier|防護結界：味方の通常駒1体を守る|protectOwn:1;counterPower:2\nnever-happened|歴史修正：相手の一時ルールを1つ解除|clearEnemyRule:1;counterPower:2\nemergency-dodge|緊急脱出訓練：味方の通常駒1体の凍結を解除|clean:1;counterPower:2\nreboot|完全復旧：対象を守り、次の自分のターンCPを1追加|protectTarget:1;pending:1\nreflect-armor|反射装甲強化：相手の準備カウンターを取り除く|removeCounter:1;counterPower:2\nmine-now|裏切りの強化：奪った駒を成り状態にする|promoteTarget:1\npuppet|操り続ける：動かされた敵の駒を次の1手番凍結|freezeFromTo:1\nfreeze|長期凍結：対象の凍結をさらに1手番延長|extendFreeze:1\nbanana|皮が増える：もう1つの空きマスにもバナナの皮を設置|terrain:banana:1;extendTerrain:1\nsleep|二度寝：睡眠の持続時間をさらに1手番延長|extendRule:sleep:enemy:1\nnetwork-error|通信障害が拡散：別の敵の通常駒も1手番凍結|freezeEnemy:1\nforced-swap|強制転送の衝撃：入れ替えられた敵駒を時限破壊状態にする|doomFrom:1\nrotate-board|遠心力：盤面回転後に敵の駒1体を凍結|freezeEnemy:1;terrain:banana:1\nhole|大きな穴：隣の空きマスにも穴を開ける|terrain:hole:1;extendTerrain:2\nlandslide|余震：周囲に一時的な通行止めを設置する|terrain:wall:2\nexpand-board|新天地：盤面拡張後に飛車の動きをする歩を1体配置|spawnRookPawn:1\nreverse-gravity|重力固定：相手だけ重力反転を1手番延長|extendRule:gravity:enemy:1\nmirror-world|鏡像の罠：左右反転後に相手の歩1体を別の空きマスへずらす|pushEnemy:1\ntraffic-jam|大渋滞：中央の空きマスへ追加の壁を2個置く|terrain:wall:2;extendTerrain:1\nwall|強化壁：設置した壁の寿命をさらに3手番延長|extendTerrain:3\nterrain-gacha|地形おかわり：さらにランダムな罠をもう1個設置|terrain:random:1\nignore-rules|反則大歓迎：自分のルール無視効果を追加で1手番延長|extendRule:ignore:self:1\nshogi-over|覚醒終幕：相手の駒が4体以下なら強制勝利を発動できる|freezeEnemy:1;score:2\npawn-rebellion|反乱軍の支援：銀将を持ち駒に追加して自分の歩1体を守る|hand:S:1;protectPawn:1\nking-at-work|王の出勤手当：味方全体に防御を与え王将の移動を延長|kingGuard:1;extendRule:king-dash:self:1\nall-rooks|総攻撃準備：飛車の移動ルールを1手番延長|extendRule:all-rooks:self:1;draw:1\nfree-promote|昇進ラッシュ：自分の別の駒を1体成らせる|promoteOwn:1;extendRule:free-promote:self:1\nno-diagonals|斜め厳禁：相手の桂馬も1手番凍結|freezeEnemyKnight:1;extendRule:no-diagonal:enemy:1\nturns-what|怒濤の4手：さらに駒を1回動かせる|moves:1;pending:1\nrule-override|独裁ルール：相手の準備カウンターを消し、自分の一時ルールを1手番延長|removeCounter:1;extendRule:free-promote:self:1\nwhat-the|突き飛ばしの追撃：押された敵駒を1手番凍結|freezeEnemy:1;score:1\ncat-invasion|猫の増援：歩の持ち駒を2枚獲得|hand:P:2;protectPawn:1\nmeme-bgm|頭から離れない：相手の次のドローを止める|skipDraw:1;pending:1\nninety-nine|幸運のおまけ：勝った時に次のターンのCPを2増やす|pending:2;draw:1\nfortune|運命の保険：ランダム効果後に味方の駒へ防御を付与|protectOwn:1;score:1\npray|祈願の実り：引いた後に自分の墓地から1枚も回収|returnGrave:1;hand:P:1\nbugged|バグ連鎖：さらに敵の通常駒を1体歩へ変える|enemyPawn:1\nfake-ad|案件達成：次の手番に追加1枚ドローを予約|pendingDraw:1;pending:1\nyou-said-it|言った責任：コピーした敵の使用済みカードを相手の墓地から追放|purgeEnemy:1;draw:1\ndivine-move|神の守護：さらに王将へ別の防御を1回追加|kingGuard:1;moves:1\nrebuild-world|世界の再建：銀将を1枚持ち駒に補充し味方の不調を解除|hand:S:1;clean:1\nnew-king|新王の護衛：王の2マス移動とカード防御を付与|rule:king-dash:self:2;kingGuard:1\nchess-now|ナイト急行：桂馬ルールを追加1手番延長して歩を守る|extendRule:chess:self:1;protectPawn:1\nall-assemble|総動員：さらに1体持ち駒を盤に自動配置|autoDrop:1\ngame-broken|本当に壊れる：盤面にランダムな罠を2個追加|terrain:random:2;kingGuard:1\navada-ex|終焉の閃光：同じ列にいる他の敵の通常駒にも追撃|blastLine:2;purgeEnemy:1\nforced-ending|有利判定：対局終了の比較で自分の駒を1体多く数える|score:3;hand:P:1\nadmin-power|管理者ボーナス：効果に応じて1枚ドローし相手のカウンターを破壊|draw:1;removeCounter:1";
const recipes = Object.fromEntries(RAW_RECIPES.trim().split('\n').map(line=>{
  const [id,description,rawSteps]=line.split('|');
  if(!id||!description||!rawSteps)throw new Error('Bad awakening specification: '+id);
  return [id,Object.freeze({description,steps:Object.freeze(rawSteps.split(';').map(x=>Object.freeze(x.split(':'))))})];
}));
export const AWAKENINGS = Object.freeze(recipes);

const other=side=>side==='b'?'w':'b';
const width=s=>s.size||9;
const near=(s,i,j)=>Math.abs(i%width(s)-j%width(s))+Math.abs(Math.floor(i/width(s))-Math.floor(j/width(s)));
const point=(s,action)=>Number.isInteger(action?.target)&&action.target>=0&&action.target<s.board.length?action.target:
  Number.isInteger(action?.to)&&action.to>=0&&action.to<s.board.length?action.to:
  Math.floor(s.board.length/2);
const indexes=s=>s.board.map((_,i)=>i);
const validSquare=(s,i)=>!s.board[i]&&!terrainAt(s,i);
const candidates=(s,predicate,anchor)=>indexes(s).filter(i=>predicate(s.board[i],i)).sort((a,b)=>near(s,a,anchor)-near(s,b,anchor)||a-b);
const pickOwn=(s,side,anchor,predicate=()=>true)=>candidates(s,p=>p?.side===side&&p.type!=='K'&&predicate(p),anchor)[0];
const pickEnemy=(s,side,anchor,predicate=()=>true)=>candidates(s,p=>p?.side===other(side)&&p.type!=='K'&&predicate(p),anchor)[0];
const freeNear=(s,anchor,used=new Set())=>candidates(s,(_,i)=>validSquare(s,i)&&!used.has(i),anchor)[0];
const pickKing=(s,side)=>s.board.find(p=>p?.side===side&&p.type==='K');
const addHand=(s,side,type,amount)=>{if(!s.hands?.[side]||!Object.hasOwn(s.hands[side],type))return false;
  const before=s.hands[side][type];s.hands[side][type]=Math.min(18,before+amount);return s.hands[side][type]>before;};
const shield=(piece,n=1)=>{if(!piece)return false;piece.awakenGuard=Math.min(2,(piece.awakenGuard||0)+n);return true;};
const freeze=(s,side,i,n=1)=>{const p=s.board[i];if(!p||p.side!==other(side)||p.type==='K')return false;
  p.frozenUntil=Math.max(p.frozenUntil||0,s.cards[p.side].turnSerial+n+1);return true;};
const doom=(s,side,i,n=1)=>{const p=s.board[i];if(!p||p.side!==other(side)||p.type==='K')return false;
  p.doomAt=Math.max(p.doomAt||0,s.cards[p.side].turnSerial+n);return true;};
const putTerrain=(s,anchor,type,count)=>{
  const used=new Set();let placed=0;const serial=s.cards.b.turnSerial+s.cards.w.turnSerial;
  for(let n=0;n<count;n++){
    const i=freeNear(s,anchor,used);if(i===undefined)break;
    const kind=type==='random'?['wall','banana','hole'][(n+anchor)%3]:type;
    s.chaos.terrain[i]={kind,expiresOn:serial+3};
    used.add(i);placed++;
  }
  return placed>0;
};
const clearStatus=(piece)=>{if(!piece)return false;const had=Boolean(piece.frozenUntil||piece.doomAt);delete piece.frozenUntil;delete piece.doomAt;return had;};
const protectSide=(s,side,anchor,which='piece')=>{
  const idx=which==='pawn'?pickOwn(s,side,anchor,p=>p.type==='P'):pickOwn(s,side,anchor);
  return idx!==undefined?shield(s.board[idx]):false;
};
const copyHand=(s,side,count=1,catalog={})=>{
  const hand=s.cards[side].hand;const id=hand.find(cardId=>catalog[cardId]?.type!=='equipment');
  if(!id||hand.length>=7)return false;
  for(let i=0;i<count&&hand.length<7;i++)hand.push(id);
  return true;
};
const reviveGrave=(s,side,n=1)=>{
  const p=s.cards[side];let added=0;
  for(let i=0;i<n&&p.grave.length&&p.hand.length<7;i++){p.hand.push(p.grave.splice(0,1)[0]);added++;}
  return added>0;
};
const destroyNearby=(s,side,anchor,n,restrict,ops)=>{
  if(typeof ops?.destroy!=='function')return false;
  let done=false;
  for(let t=0;t<n;t++){
    const index=pickEnemy(s,side,anchor,p=>(restrict!=='P'||p.type==='P'));
    // 「隣」は上下左右1マスに限定する。対象がない・防御された場合は未発動。
    if(index===undefined||near(s,index,anchor)!==1)break;
    done=ops.destroy(s,side,index)||done;
  }
  return done;
};
const specsRun=(s,side,id,action,ops)=>{
  const rec=AWAKENINGS[id];if(!rec)return false;
  const anchor=point(s,action),p=s.cards[side],enemy=other(side),otherCards=s.cards[enemy];
  const one=(arr)=>arr.length?arr[0]:undefined;
  let any=false;
  for(const [kind,a,b,c] of rec.steps){
    const n=Math.max(1,Math.min(4,Number(a)||1));
    switch(kind){
      case 'draw':for(let i=0;i<n;i++)any=Boolean(ops.draw?.(p))||any;break;
      case 'hand':any=addHand(s,side,a,Math.max(1,Number(b)||1))||any;break;
      case 'moves':s.movesLeft=Math.min(4,(s.movesLeft||1)+n);any=true;break;
      case 'drain':{const cost=Math.min(otherCards.cp,n);otherCards.cp-=cost;p.cp=Math.min(s.settings?.cpCap??10,p.cp+cost);any=cost>0||any;break;}
      case 'pending':s.chaos.pendingBonus[side]=(s.chaos.pendingBonus[side]||0)+n;any=true;break;
      case 'pendingDraw':s.chaos.pendingDraw??={};s.chaos.pendingDraw[side]=Math.min(2,(s.chaos.pendingDraw[side]||0)+n);any=true;break;
      case 'skipDraw':s.chaos.skipDraw??={};s.chaos.skipDraw[enemy]=Math.min(2,(s.chaos.skipDraw[enemy]||0)+n);any=true;break;
      case 'kingGuard':s.chaos.kingGuard[side]=Math.min(3,(s.chaos.kingGuard[side]||0)+n);any=true;break;
      case 'guardOwn':any=protectSide(s,side,anchor)||any;break;
      case 'guardKingPiece':any=shield(pickKing(s,side))||any;break;
      case 'protectOwn':any=protectSide(s,side,anchor)||any;break;
      case 'protectPawn':any=protectSide(s,side,anchor,'pawn')||any;break;
      case 'protectTarget':any=shield(s.board[action?.target]?.side===side?s.board[action.target]:s.board[action?.from]?.side===side?s.board[action.from]:undefined)||any;break;
      case 'protectSwap':any=shield(s.board[action?.from]?.side===side?s.board[action.from]:undefined)||any;any=shield(s.board[action?.target]?.side===side?s.board[action.target]:undefined)||any;break;
      case 'shieldCharge':{const item=p.equipment.find(x=>x.id===id);if(item){item.shieldCharges=Math.max(2,(item.shieldCharges||1)+n);any=true;}break;}
      case 'counterPower':{const counter=s.chaos.counters?.[side];if(counter){counter.awakened=true;counter.uses=Math.min(2,n);any=true;}break;}
      case 'cleanKing':any=clearStatus(pickKing(s,side))||any;break;
      case 'cleanTarget':any=clearStatus(s.board[action?.target]?.side===side?s.board[action.target]:null)||any;break;
      case 'clean':{const index=pickOwn(s,side,anchor,q=>Boolean(q.doomAt||q.frozenUntil));if(index!==undefined)any=clearStatus(s.board[index])||any;break;}
      case 'freezeTarget':any=freeze(s,side,anchor,n)||any;break;
      case 'freezeFromTo':any=freeze(s,side,anchor,n)||any;break;
      case 'freezeEnemy':{const index=pickEnemy(s,side,anchor);if(index!==undefined)any=freeze(s,side,index,n)||any;break;}
      case 'freezeEnemyKnight':{const index=pickEnemy(s,side,anchor,q=>q.type==='N');if(index!==undefined)any=freeze(s,side,index,n)||any;break;}
      case 'freezeNear':{const index=pickEnemy(s,side,anchor);if(index!==undefined&&near(s,index,anchor)<=2)any=freeze(s,side,index,n)||any;break;}
      case 'extendFreeze':{const q=s.board[anchor];if(q?.side===enemy&&q.type!=='K'){q.frozenUntil=Math.max(q.frozenUntil||0,s.cards[enemy].turnSerial+2)+n;any=true;}break;}
      case 'doomTarget':any=doom(s,side,anchor,n)||any;break;
      case 'doomFrom':any=doom(s,side,action?.from,n)||any;break;
      case 'doomNear':{const index=pickEnemy(s,side,anchor,q=>b!=='P'||q.type==='P');if(index!==undefined&&near(s,index,anchor)<=2)any=doom(s,side,index,n)||any;break;}
      case 'enemyPawn':{const index=pickEnemy(s,side,anchor,q=>q.type!=='P'||q.promoted);if(index!==undefined){s.board[index].type='P';s.board[index].promoted=false;any=true;}break;}
      case 'promoteTarget':{const q=s.board[anchor];if(q?.side===side&&q.type!=='K'&&!q.promoted){q.promoted=true;any=true;}break;}
      case 'promoteOwn':{const index=pickOwn(s,side,anchor,q=>!q.promoted&&['P','L','N','S','B','R'].includes(q.type));if(index!==undefined){s.board[index].promoted=true;any=true;}break;}
      case 'extendRook':{const q=s.board[anchor];if(q?.side===side&&q.type==='P'){q.rookUntil=Math.max(q.rookUntil||0,p.turnSerial+3)+n;any=true;}break;}
      case 'blastNear':any=destroyNearby(s,side,anchor,n,b,ops)||any;break;
      case 'blastLine':{let count=0;const column=anchor%width(s);for(const i of candidates(s,q=>q?.side===enemy&&q.type!=='K',anchor))if(i%width(s)===column&&i!==anchor&&count<n){if(ops.destroy?.(s,side,i)){count++;any=true;}}break;}
      case 'terrain':any=putTerrain(s,anchor,a,Math.max(1,Number(b)||1))||any;break;
      case 'extendTerrain':{const at=s.chaos.terrain?.[anchor];if(at){at.expiresOn+=n;any=true;}break;}
      case 'removeCounter':if(s.chaos.counters?.[enemy]){delete s.chaos.counters[enemy];any=true;}break;
      case 'clearEnemyRule':{const key=Object.keys(s.chaos.rules||{}).find(k=>k.endsWith(':'+enemy));if(key){delete s.chaos.rules[key];any=true;}break;}
      case 'rule':setRule(s,a,b==='enemy'?enemy:side,Math.max(1,Number(c)||1));any=true;break;
      case 'extendRule':{const owner=b==='enemy'?enemy:side,key=a+':'+owner,v=s.chaos.rules?.[key];if(v){v.expiresOn+=Math.max(1,Number(c)||1);any=true;}break;}
      case 'discardEnemy':for(let k=0;k<n&&otherCards.hand.length;k++){otherCards.grave.push(otherCards.hand.shift());any=true;}break;
      case 'purgeEnemy':for(let k=0;k<n&&otherCards.grave.length;k++){otherCards.grave.shift();any=true;}break;
      case 'stealHandPiece':{const [type]=Object.entries(s.hands[enemy]||{}).find(([t,cnt])=>t!=='K'&&cnt>0)||[];if(type){s.hands[enemy][type]--;addHand(s,side,type,1);any=true;}break;}
      case 'stealPawn':{if(s.hands[enemy].P>0){s.hands[enemy].P--;addHand(s,side,'P',1);any=true;}break;}
      case 'copyHand':any=copyHand(s,side,n,ops.catalog)||any;break;
      case 'returnGrave':any=reviveGrave(s,side,n)||any;break;
      case 'score':s.scores[side]=(s.scores[side]||0)+n;any=true;break;
      case 'pushEnemy':{const index=pickEnemy(s,side,anchor);if(index!==undefined){const to=freeNear(s,index);if(to!==undefined&&near(s,index,to)===1){s.board[to]=s.board[index];s.board[index]=null;any=true;}}break;}
      case 'spawnRookPawn':{const to=freeNear(s,anchor);if(to!==undefined){s.board[to]={side,type:'P',promoted:false,rookUntil:p.turnSerial+2};any=true;}break;}
      case 'autoDrop':{const [type]=Object.entries(s.hands[side]||{}).find(([t,cnt])=>t!=='K'&&cnt>0)||[];const to=freeNear(s,anchor);if(type&&to!==undefined){s.hands[side][type]--;s.board[to]={side,type,promoted:false};any=true;}break;}
      default:throw new Error('Unknown awakening operation '+kind+' for '+id);
    }
  }
  s.log.push('覚醒：'+rec.description+(any?'':'（追加対象なし）'));
  return any;
};
export function resolveUniqueAwakening(s,side,cardId,action,ops={}){return specsRun(s,side,cardId,action,ops);}
