// CASTLE SHOGI ∞ shared catalogue. No copyrighted images or external assets required.
// id | name | class | HP | attack | defense | move | effect | range | power | cooldown | normal | awakening | ultimate
const DATA = `
slash|斬鉄|攻撃|2|2|0|gold|pierce|1|1|3|防御を1無視する斬撃|攻撃後に退避できる|直線2マスへ貫通斬撃
combo|連撃士|攻撃|2|1|0|silver|strike|1|2|3|隣接敵に2ダメージ|命中でHP1回復|撃破すると追加移動
spear|槍兵|攻撃|2|1|1|spear|strike|2|2|3|前方2マスを突く|敵を1マス押し出す|前方3マスへ貫通攻撃
berserk|狂戦士|攻撃|3|2|0|king|rage|1|1|0|HP1で攻撃力+1|HP1で防御力+1|一度だけ致命傷を耐える
execute|処刑人|攻撃|2|2|0|king|execute|1|1|2|負傷した敵へのダメージ+1|撃破すると回復|撃破時に追加行動
oni|鬼武者|攻撃|3|2|1|gold|grow|1|1|0|撃破ごとに次の攻撃が強化|最初の被害を軽減|撃破時に範囲斬撃
fist|鉄拳|攻撃|2|2|0|cross|push|1|1|2|攻撃対象を押し出す|後方の敵にも衝撃|敵を2マス飛ばす
shadow|影刃|攻撃|1|2|0|diag2|evade|2|1|3|1回の遠距離攻撃を回避|斜め斬撃を強化|撃破後に瞬間移動
guardian|守護者|防御|3|1|1|gold|guard|1|1|3|隣接味方への攻撃を肩代わり|被害を1軽減|王城も2マスから守る
ironwall|鉄壁|防御|4|1|2|king|shield|0|1|3|防御姿勢で次のダメージ軽減|押し出しにも耐える|周囲味方へ結界を展開
barrier|結界師|防御|2|1|0|silver|shield|1|1|4|味方に1回の防壁を付与|状態異常も防御|周囲全味方へ防壁
reflect|反射盾|防御|2|1|1|gold|reflect|1|1|0|被弾時に1ダメージ反射|反射時に自身を回復|直線2マスからも反射
statue|石像|防御|4|1|2|forward|fortify|0|1|3|静止してHPを回復|防御を追加強化|周囲の敵を石化
wallmaker|城壁職人|防御|2|1|1|king|wall|1|2|3|空きマスに城壁を設置|城壁HP+1|城壁を2つ維持
decoy|身代り人形|防御|1|0|0|diagonal|guard|2|1|0|味方への攻撃を肩代わり|破壊時に反撃|破壊時に味方を回復
police|治安兵|防御|2|1|1|gold|antimagic|1|1|0|周囲の敵の転移を妨害|妨害範囲+1|敵の追加行動を封じる
sniper|狙撃手|遠距離|1|2|0|silver|line|3|2|2|直線3マスを狙撃|射程+1|2体まで貫通
cannon|砲兵|遠距離|2|2|0|cross|blast|3|2|4|着弾と周囲を砲撃|爆発範囲+1|炎上地形を残す
fire|火術師|遠距離|2|1|0|diag2|burn|2|1|3|敵に炎上を付与|炎上持続延長|炎上を隣に伝える
ice|氷術師|遠距離|2|1|0|diag2|freeze|2|1|4|敵を1ターン凍結|凍結時1ダメージ|敵2体を同時凍結
thunder|雷術師|遠距離|1|2|0|knight|chain|2|1|3|敵2体に雷を連鎖|連鎖が3体に増加|初弾ダメージ増加
horsebow|弓騎兵|遠距離|2|1|0|horse|line|2|1|2|移動後にも射撃できる|斜め前にも射撃|射撃で撃破すると追加移動
poison|毒投師|遠距離|2|1|0|gold|poison|3|1|3|敵を2ターン毒にする|治療を妨害|毒を周囲へ拡散
starshot|星砲|遠距離|1|2|0|cross2|charge|3|2|2|充填してから強力な直線砲撃|充填中に防御増加|射程5に伸びる
shadejump|影渡り|機動|1|1|0|horse|swap|2|1|3|味方と位置交換する|交換後に防壁|敵との交換も可能
blink|瞬歩|機動|1|2|0|diag2|teleport|3|1|3|離れた空きマスへ転移|射程4になる|転移後に周囲へ衝撃波
wing|翼兵|機動|2|1|0|horse|flight|0|1|0|味方を飛び越える|敵も飛び越える|着地時の範囲攻撃
acrobat|曲芸師|機動|1|1|0|jump2|evade|1|1|3|攻撃を回避し移動|回避時に反撃|回避CD短縮
wind|風走り|機動|2|1|0|rook3|dash|3|2|3|直線で突進攻撃|突進後に1マス退避|経路の敵にも衝撃
exchange|位置交換師|機動|1|1|0|gold|swapEnemy|2|1|4|敵と位置交換する|射程3に延長|交換相手を停止
reverse|逆歩兵|機動|2|1|0|reverse|heal|0|1|3|後退すると回復できる|後退時に敵を攻撃|前後を自由に切替
wander|迷走者|機動|2|2|0|king|wander|0|1|0|移動後にランダム移動|2候補から選べる|着地点に衝撃波
time|時使い|妨害|1|1|0|silver|freeze|3|0|5|敵の動きを1ターン停止|停止時1ダメージ|2体同時停止
seal|封印師|妨害|2|1|0|gold|silence|2|0|4|敵の能力を封印|射程3に延長|受動能力も封印
gravity|重力術師|妨害|2|1|0|diag2|pull|2|1|3|敵を1マス引き寄せる|2マス引き寄せる|周囲複数の敵を吸引
chain|鎖使い|妨害|2|1|1|cross2|freeze|2|0|3|敵の移動を止める|敵の防御を下げる|2体同時に拘束
mute|沈黙鐘|妨害|3|0|1|king|antimagic|1|1|0|隣接する敵の能力を封じる|妨害範囲+1|敵のCDを延長
trapper|罠師|妨害|1|1|0|silver|trap|1|1|2|1ダメージの罠を設置|罠を隠す|罠を2つ維持
fog|霧撒き|妨害|2|1|0|king|fog|2|1|4|遠距離攻撃を防ぐ霧|霧持続延長|霧内の味方を強化
direction|方向師|妨害|1|1|0|diagonal|reverseDir|2|1|5|敵の前後を反転|効果持続延長|敵2体を反転
priest|祈祷師|支援|2|0|0|gold|heal|2|1|3|味方のHPを回復|2体を同時回復|通常駒を復帰させる
tactician|軍師|支援|1|1|0|silver|buff|1|1|3|味方の次の攻撃を強化|効果射程が2|味方のCDを短縮
banner|旗手|支援|2|1|1|cross|aura|1|1|0|味方の移動を支援|支援範囲+1|封印耐性を与える
engineer|機工師|支援|2|1|0|king|turret|1|1|4|自動砲台を設置|砲台射程を強化|2基まで設置
medic|医療兵|支援|2|0|1|gold|heal|2|1|3|回復か状態異常解除|射程3に拡張|周囲の味方を全体回復
fusion|合体師|支援|2|1|0|diagonal|fusion|1|1|5|味方の召喚物を強化|合体後HP+1|追加能力を獲得
salvage|回収屋|支援|2|1|0|cross2|revive|1|1|6|通常駒を1体復活|復活マスを選択|特殊駒も1体復活
festival|祝祭師|支援|1|0|0|knight|pulse|2|1|3|3ターンごとに味方を回復|回復量を強化|状態異常も解除
void|虚無|異常|2|2|0|diag2|corrupt|1|1|0|敵を倒したマスを侵食|侵食を2ターン維持|侵食対象を封印
mirror|鏡|異常|2|1|1|king|copy|2|1|4|敵の能力をコピー|コピー範囲+1|コピーCD短縮
phoenix|不死鳥|異常|2|1|0|cross2|rebirth|0|1|0|一度だけ破壊後に復活|HP2で復活|破壊時に爆発
portal|異次元門|異常|3|0|1|none|portal|2|1|3|味方を門へ転送|転送距離増加|2体同時転送
vampire|吸血鬼|異常|2|2|0|diag2|leech|1|1|0|攻撃成功でHP1吸収|撃破時追加回復|吸収が防御を無視
luck|確率王|異常|1|2|0|gold|random|2|2|3|ランダムなダメージを与える|再抽選可能|良い結果を選択
doomsday|終末時計|異常|3|0|1|cross|pulseDamage|2|1|4|周囲に周期的なダメージ|発動間隔短縮|直線上にもダメージ
relic|遺物喰らい|異常|2|1|0|silver|steal|1|1|0|特殊駒を倒すと能力吸収|吸収を2回使える|2種の能力を保持
nich|二局|ミーム|3|0|0|none|aa|1|1|0|貼り付けたAAを2体召喚|追加で1体召喚|AAが破壊時に反撃
goch|五局|ミーム|3|0|1|none|migrate|0|1|0|二局の破壊で出現、AAが移住|移住したAAに結界|HP1でAAが追加移動
yaruo|殺夫|ミーム|1|0|0|king|laser|3|2|0|ターン終了時に自動前進し光線|射程4と斜め移動|横方向にも光線
nullpo|ぬるぽ|ミーム|1|1|0|silver|reflect|1|1|3|攻撃されるとガッ！で反撃|攻撃者を押し出す|攻撃者を封印
gatsu|ガッ|ミーム|2|2|0|king|rescue|2|1|3|ぬるぽへの攻撃を援護|援護のダメージ増加|援護後に転移
kita|キター|ミーム|2|1|0|cross2|cheer|1|1|3|味方撃破で追加移動|自分を回復|味方にも追加移動
grass|草原|ミーム|3|0|0|horizontal|grass|1|1|0|周囲に草を生やして足止め|3マス草を生成|草上の敵の能力を妨害
errorcat|エラー猫|ミーム|2|1|0|king|silence|2|0|4|敵の能力を不発にする|射程3に延長|自動能力も停止
`;
export const SPECIALS = Object.freeze(DATA.trim().split('\n').map((line) => {
  const [id,name,category,hp,attack,defense,move,kind,range,power,cd,ability,awakening,ultimate] = line.split('|');
  return Object.freeze({id,name,category,hp:+hp,attack:+attack,defense:+defense,move,
    skill:Object.freeze({kind,range:+range,power:+power,cd:+cd}),ability,awakening,ultimate,
    cost:({攻撃:3,防御:3,遠距離:3,機動:3,妨害:3,支援:3,異常:4,ミーム:4})[category] || 3,
    unique: id === 'goch' || id === 'yaruo'
  });
}));
export const BY_ID = Object.freeze(Object.fromEntries(SPECIALS.map(p => [p.id,p])));
export const CATEGORIES = Object.freeze([...new Set(SPECIALS.map(p=>p.category))]);
export const BASE = Object.freeze({
  P:{name:'歩兵',hp:1,attack:1,defense:0},L:{name:'香車',hp:1,attack:1,defense:0},
  N:{name:'桂馬',hp:1,attack:1,defense:0},S:{name:'銀将',hp:1,attack:1,defense:0},
  G:{name:'金将',hp:1,attack:1,defense:0},B:{name:'角行',hp:1,attack:1,defense:0},
  R:{name:'飛車',hp:1,attack:1,defense:0},C:{name:'王城',hp:3,attack:0,defense:0}
});
export const COST_CAP = 9;
export function validateLoadout(ids) {
  if (!Array.isArray(ids)||ids.length>3||ids.some(id=>typeof id!=='string')) return false;
  const unique=new Set(ids);
  if(unique.size!==ids.length||ids.includes('goch')||(ids.includes('yaruo')&&!ids.includes('nich')))return false;
  return ids.every(id=>BY_ID[id]) && ids.reduce((n,id)=>n+BY_ID[id].cost,0)<=COST_CAP;
}
