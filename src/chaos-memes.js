// The eight lists are the 72 cards in the original design. String entries use
// an existing card definition; every other entry has a server-side effect.
const card=(id,name,effect,cost,target,description,{rarity='rare',type='instant',modes=['normal','collapse'],power=1}={})=>({
  id,name,effect:{kind:effect,power},effects:[{kind:effect,power}],cost,target,targetType:target,description,rarity,type,
  tags:[],allowedModes:modes,imageId:`meme-${id}`
});

export const MEME_CATEGORIES=Object.freeze({
  destruction:[
    'avada','meteor',
    card('fatal','お前はもう死んでいる','doom',3,'enemy-piece','敵の通常駒を時限破壊状態にする。'),
    card('explosion','爆発オチ','blast',5,'square','指定マス周囲の敵の通常駒を爆破する。'),
    card('deleted','削除しました','erase',4,'enemy-piece','敵の通常駒を消し、持ち駒にも渡さない。'),
    card('beam','ビーム発射！','beam',4,'enemy-piece','敵の通常駒とその奥の敵駒を射抜く。'),
    card('pen','これはペンです','turn-pawn',2,'enemy-piece','敵の通常駒を歩に変える。'),
    card('eject','強制退場','eject',3,'enemy-piece','敵の通常駒を相手の持ち駒へ戻す。'),
    card('world-end','世界終了ボタン','world-end',9,'none','盤上の王将以外の駒をすべて破壊する。',{rarity:'mythic'})
  ],
  movement:[
    card('rook-pawn','お前、飛車な','rook-pawn',3,'own-pawn','自分の歩を3手番だけ飛車の動きにする。'),
    'warp','double',
    card('fast-move','高速移動','extra-moves',4,'none','この手番の駒移動を2回追加する。',{power:2}),
    'promote',
    card('clone-piece','分身の術','clone-piece',3,'own-piece-and-square','自分の通常駒を隣の空きマスへ複製する。'),
    card('full-dash','全力ダッシュ','full-dash',3,'own-piece-and-square','自分の通常駒を空きマスへ移し、1CPを得る。'),
    card('wormhole','ワープホール','swap-own',3,'two-own-pieces','自分の通常駒2体の位置を交換する。'),
    card('skip-work','出勤拒否','recall-own',2,'own-piece','自分の通常駒を持ち駒へ戻す。')
  ],
  defense:[
    card('uno','UNOリバース','counter-reverse',3,'none','次に受ける対象指定カードを打ち消し、相手のCPを2減らす。',{type:'counter'}),
    card('blind-spot','死角？特にありません','counter-guard',2,'none','次に受けるカード破壊を1回防ぐ。',{type:'counter'}),
    card('nope','無効です','counter-null',3,'none','次に受ける対象指定カードを無効化する。',{type:'counter'}),
    card('decoy','身代わり人形','counter-decoy',2,'none','次に受けるカード破壊を1回防ぐ。',{type:'counter'}),
    card('barrier','バリア展開','counter-guard',3,'none','次に受けるカード破壊を1回防ぐ。',{type:'counter'}),
    card('never-happened','なかったことに','counter-null',4,'none','次に受ける対象指定カードを無効化する。',{type:'counter'}),
    card('emergency-dodge','緊急回避','counter-dodge',2,'none','次に狙われた駒を隣の空きマスに逃がす。',{type:'counter'}),
    card('reboot','再起動','reboot',2,'own-piece','自分の駒の凍結・時限破壊を解除する。',{type:'counter'}),
    card('reflect-armor','反射装甲','counter-reverse',4,'none','次に受ける対象指定カードを反射して2CP奪う。',{type:'counter'})
  ],
  disruption:[
    card('mine-now','お前のものは俺のもの','steal-piece',5,'enemy-piece','敵の歩・香・桂を味方へ変える。'),
    'tax',
    card('puppet','操り人形','puppet',3,'enemy-piece-and-square','敵の通常駒を隣の空きマスへ動かす。'),
    card('freeze','フリーズ','freeze',3,'enemy-piece','敵の通常駒を2手番動けなくする。',{power:2}),
    card('banana','バナナの皮','banana',2,'square','空きマスに2手番続く滑る罠を置く。'),
    card('sleep','睡眠時間','sleep',3,'none','相手の次の手番のカード使用を封じる。'),
    card('network-error','通信エラー','random-freeze',2,'none','敵の通常駒1体をランダムに1手番凍結する。'),
    card('forced-swap','強制交換','swap-enemy',4,'own-piece-and-enemy-piece','自分と敵の通常駒の位置を交換する。'),
    'amnesia'
  ],
  board:[
    card('rotate-board','盤面回転','rotate',6,'none','王将以外の駒を盤面の中心で180度回転する。',{rarity:'superRare'}),
    card('hole','穴が開きました','hole',2,'square','空きマスに2手番続く穴を作る。'),
    card('landslide','地盤沈下','landslide',5,'square','指定マス周囲の通常駒を敵味方とも破壊する。',{rarity:'superRare'}),
    card('expand-board','盤面拡張','expand',7,'none','盤面の外側を追加して11×11にする。',{rarity:'superRare'}),
    card('reverse-gravity','重力反転','rule-gravity',4,'none','2手番、歩・桂・香の前進方向を反転する。'),
    card('mirror-world','ミラーワールド','mirror',5,'none','王将以外の駒を左右反転する。',{rarity:'superRare'}),
    card('traffic-jam','駒大渋滞','traffic',3,'none','中央付近に2手番の通行止めを作る。'),
    card('wall','突然の壁','wall',2,'square','空きマスを2手番通れない壁にする。'),
    card('terrain-gacha','地形ガチャ','terrain-random',2,'square','空きマスに壁・穴・滑る罠をランダム配置する。')
  ],
  rules:[
    card('ignore-rules','ルール？知らんな','rule-ignore',4,'none','2手番、二歩と成り位置の制限を無視する。',{type:'rule'}),
    card('shogi-over','将棋終了のお知らせ','shogi-over',7,'none','相手の盤上駒が王将を含め3体以下なら勝利する。',{type:'rule',rarity:'superRare'}),
    card('pawn-rebellion','歩の反乱','rule-pawn-gold',4,'none','2手番、すべての歩が金将の動きをする。',{type:'rule'}),
    card('king-at-work','王様出勤','rule-king-dash',4,'none','2手番、自分の王将は縦横2マスにも動ける。',{type:'rule'}),
    card('all-rooks','全員飛車','rule-all-rooks',6,'none','次の自分の手番終了まで自分の駒が飛車の動きをする。',{type:'rule',rarity:'superRare'}),
    card('free-promote','成り放題','rule-free-promote',3,'none','2手番、自分の駒をどこでも成らせる。',{type:'rule'}),
    card('no-diagonals','斜め禁止令','rule-no-diagonal',3,'none','相手は2手番、斜め移動ができない。',{type:'rule'}),
    card('turns-what','将棋はターン制？','three-moves',6,'none','この手番の駒移動を3回にする。',{type:'rule',rarity:'superRare'}),
    card('rule-override','ルール上書き','rule-override',5,'none','現在の一時ルールを消し、自分に成り放題を付ける。',{type:'rule'})
  ],
  gamble:[
    card('what-the','なんでやねん！','push-random',2,'none','敵の通常駒をランダムに1マス押す。'),
    card('cat-invasion','ぬこ襲来','spawn-pawn',3,'none','中央付近の空きマスに味方の歩を呼ぶ。'),
    card('meme-bgm','例のBGM','bgm',2,'none','自分が2CPを得て相手が1CPを失う。'),
    card('ninety-nine','99%の確率で勝てる','ninety-nine',5,'none','99%で3CPと2枚ドロー、1%で3CP失う。',{rarity:'superRare'}),
    card('fortune','今日の運勢','fortune',1,'none','自分のCPがランダムに1～3増減する。'),
    card('pray','お祈りタイム','pray',2,'none','ランダムに1～3枚ドローする。'),
    card('bugged','バグりました','bugged',2,'none','自分か相手の通常駒1体をランダムに歩へ変える。'),
    card('fake-ad','動画広告（偽物）','fake-ad',2,'none','次の自分の手番開始時に3CP得る。'),
    card('you-said-it','お前が言うな','copy-grave',2,'none','相手が最後に使用した通常カードを手札へコピーする。')
  ],
  myth:[
    card('divine-move','神の一手','divine-move',8,'none','この手番の駒移動を1回増やし、王将を次のカード破壊から守る。',{rarity:'mythic'}),
    card('rebuild-world','世界再構築','rebuild',8,'none','一時ルールと地形を消し、自分の歩を2体補充する。',{rarity:'mythic'}),
    card('new-king','お前が王になるんだよ','new-king',7,'own-gold','自分の金将を王将にし、元の王将を金将にする。',{rarity:'mythic'}),
    card('chess-now','チェスになりました','rule-chess',6,'none','2手番、自分の桂馬がチェスのナイトの動きをする。',{rarity:'mythic',type:'rule'}),
    card('all-assemble','全員集合','assemble',7,'none','自分の持ち駒を最大3体、空きマスに自動で打つ。',{rarity:'mythic'}),
    card('game-broken','このゲーム壊れてます','game-broken',8,'none','歩の反乱・成り放題・重力反転を同時に2手番発動。',{rarity:'mythic',type:'rule'}),
    card('avada-ex','アバダ・ケダブラ EX','avada-ex',9,'enemy-piece','完全崩壊モードで敵の王将を直接破壊する。',{rarity:'mythic',modes:['collapse']}),
    card('forced-ending','強制エンディング','forced-ending',9,'none','完全崩壊モードで盤上駒数が多い側を勝者として対局を終える。',{rarity:'mythic',modes:['collapse']}),
    card('admin-power','管理者権限','admin-power',8,'choice','破壊・CP獲得・ドローから1つ選ぶ。',{rarity:'mythic'})
  ]
});

export const MEME_CARD_IDS=Object.freeze(Object.values(MEME_CATEGORIES).flat().map(entry=>typeof entry==='string'?entry:entry.id));
export const MEME_CARDS=Object.freeze(Object.fromEntries(Object.entries(MEME_CATEGORIES).flatMap(([category,entries])=>entries.filter(entry=>typeof entry!=='string').map(entry=>[entry.id,{...entry,tags:[category]}]))));
