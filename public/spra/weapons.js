// SPRA original-name pixel arsenal. The same catalog is imported by browser and server.
// All class archetypes are original reinterpretations; no Nintendo character assets.
// name | speedMultiplier | damageMultiplier | rangeMultiplier | inkMultiplier | spread bonus
const CATEGORIES = [
  ['shooter','シューター','連射で塗りと戦闘を両立',0.15,27,26,1.35,10,4,0.10,[
    ['shooter','スプラッシュ・Mk1',1,1,1,1,0],
    ['shooter_spark','スパークシューター',0.8,.88,.93,.88,.08],
    ['shooter_burst','バーストインカー',1.25,1.17,1.15,1.23,-.05],
    ['shooter_light','ライト・リーフ',.68,.7,.90,.82,.09],
    ['shooter_neon','ネオンシュート',1.08,1.12,1.12,.98,.02],
    ['shooter_wave','ウェーブ・ガン',.9,1.04,1.27,1.15,.02],
    ['shooter_turbo','ターボシューター',.58,.72,.92,1.15,.10],
    ['shooter_march','マーチング・インク',1.3,1.32,1.35,1.35,-.02]
  ]],
  ['dualies','デュアル','連続発射と素早い制圧',.10,17,18,.83,8,6,.16,[
    ['dualies','ツイン・スパッタ',1,1,1,1,0],
    ['dualies_jet','ジェットツイン',1.1,1.13,1.38,1.15,-.03],
    ['dualies_rush','ラッシュペア',.62,.83,.9,.89,.11],
    ['dualies_spiral','スパイラルツイン',1.25,1.44,1.18,1.25,.06]
  ]],
  ['roller','ローラー','太い線で地面を一気に塗る',.44,42,6.5,2.5,25,3,0,[
    ['roller','ベーシックローラー',1,1,1,1,0],
    ['roller_heavy','ヘビー・ローラー',1.7,1.67,.95,1.3,0],
    ['roller_speed','スピンローラー',.68,.68,1.25,.84,0],
    ['roller_wide','ワイド・ペイント',1.35,.89,.9,1.25,.12],
    ['roller_giga','ギガペイント',2.1,1.9,1.08,1.64,0]
  ]],
  ['brush','ブラシ','近距離で素早く振り回す',.20,19,5,1.65,12,4,.06,[
    ['brush','パレットブラシ',1,1,1,1,0],
    ['brush_wave','ウェーブブラシ',1.12,1.18,1.5,1.14,.08],
    ['brush_flash','フラッシュブラシ',.62,.7,1.08,.86,.04],
    ['brush_mop','モップブラシ',1.3,1.4,1.33,1.21,.08]
  ]],
  ['blaster','ブラスター','着弾の爆風で広く塗る',.7,49,18,2.8,28,3,0,[
    ['blaster','ブラスター・01',1,1,1,1,0],
    ['blaster_short','ショート・ボムーン',.72,.78,.74,.9,0],
    ['blaster_nova','ノヴァブラスター',1.25,1.4,1.3,1.35,0],
    ['blaster_arc','アークバースト',1.12,1.22,1.15,1.22,0]
  ]],
  ['cosmic','コスモブラスター','ガム風船：反射する星型のインク弾を放つ宇宙系ブラスター',.48,18,21,1.3,16,4,.03,[
    ['star_gum','アスターガム',1,1,1,1,0]
  ]],
  ['charger','チャージャー','遠距離の直線射撃',.8,71,39,.8,32,2,0,[
    ['charger','ストレートチャージ',1,1,1,1,0],
    ['charger_needle','ニードル・ピン',.75,.8,1.4,.9,0],
    ['charger_heavy','ハイパーチャージ',1.5,1.7,1.65,1.5,0],
    ['charger_quick','クイック・ライン',.57,.67,.85,.82,0]
  ]],
  ['slosher','スロッシャー','広範囲のインクを放射',.49,36,12,2.25,24,4,.18,[
    ['slosher','ウェーブバケット',1,1,1,1,0],
    ['slosher_drum','ドラム・スロッシュ',1.3,1.48,1.2,1.3,.05],
    ['slosher_short','ショート・ウェーブ',.75,.75,.82,.78,.13],
    ['slosher_long','ハイドロバケット',1.18,1.12,1.55,1.15,.13]
  ]],
  ['splatling','スピナー','連射で押し込む重量級',.09,15,23,1.05,9,5,.11,[
    ['splatling','ミニ・スピナー',1,1,1,1,0],
    ['splatling_hyper','ハイパーガトリング',1.33,1.56,1.44,1.33,.07],
    ['splatling_rush','ラッシュスピナー',.64,.8,.94,.92,.09],
    ['splatling_titan','タイタンスピナー',1.5,1.9,1.5,1.4,0]
  ]],
  ['bow','ストリンガー','複数の矢状インクを放つ',.58,24,30,1.05,23,3,.22,[
    ['bow','トライ・ストリンガ',1,1,1,1,0],
    ['bow_bolt','ボルトストリンガ',.8,.9,1.37,.98,-.09],
    ['bow_gale','ゲイル・ボウ',1.25,1.4,1.12,1.35,.17],
    ['bow_quick','クイックアロー',.62,.76,.82,.79,.12]
  ]],
  ['wiper','ワイパー','近接の斬撃と遠距離のインク衝撃波',.45,35,17,1.6,19,4,.06,[
    ['wiper','スラッシュエッジ',1,1,1,1,0],
    ['wiper_quick','クイックワイパー',.68,.8,1.06,.9,.02],
    ['wiper_heavy','ヘヴィエッジ',1.4,1.55,1.3,1.3,0],
    ['wiper_wave','ウェーブブレード',1.05,1.12,1.6,1.2,.04]
  ]],
  ['drill','インクドリル','自分のインクを掘り進む突進武器',.63,45,8,1.65,21,4,.02,[
    ['drill','インクドリル・D1',1,1,1,1,0],
    ['drill_turbo','ターボドリル',.74,.87,1.2,1,.01],
    ['drill_titan','タイタンドリル',1.48,1.65,1.12,1.32,0]
  ]],
  ['brella','シェルター','近距離にインクを扇状散布',.55,23,10,1.65,28,5,.32,[
    ['brella','アンブレル',1,1,1,1,0],
    ['brella_giant','ジャイアントシェル',1.5,1.6,1.1,1.4,.17],
    ['brella_sprint','スプリントシェル',.7,.82,.88,.8,.1],
    ['brella_wave','ウェーブシェル',1.22,1.25,1.52,1.2,.1]
  ]]
];
export const SPRA_CATEGORIES = Object.freeze(CATEGORIES.map(([id,label,description]) => ({id,label,description})));
const weapons = [];
for (const [type,,description,baseDelay,baseDamage,baseRange,baseRadius,baseCost,basePaint,baseSpread,variants] of CATEGORIES) {
  variants.forEach(([id,label,delay,damage,range,radius,spread], index) => {
    weapons.push([id, Object.freeze({
      id, label, type, description,
      delay: Math.round(baseDelay*delay*100)/100,
      damage: Math.round(baseDamage*damage),
      range: Math.round(baseRange*range*10)/10,
      radius: Math.round(baseRadius*radius*100)/100,
      cost: Math.round(baseCost*(.9 + index*.06)),
      spread: Math.max(0, Math.round((baseSpread+spread)*100)/100),
      projectiles: ['dualies','bow','brella','slosher'].includes(type) ? (type==='bow' ? 3 : type==='dualies' ? 2 : 5) : 1,
      price: id === 'shooter' || id==='roller' || id==='blaster' ? 0 : 70 + index*75 + ['charger','splatling'].includes(type)*180
    })]);
  });
}
export const SPRA_WEAPONS = Object.freeze(Object.fromEntries(weapons));
