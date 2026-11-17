// Shared special abilities for SPRA V3; activated with R after filling the gauge.
const definitions = [
  ['tornado','インクタイフーン','巨大な竜巻が移動し、周囲の地面を塗り替える','◉'],
  ['flight','スカイジェット','一定時間空中飛行。障害物の上を移動可能','▲'],
  ['missiles','追尾インクロケット','敵を追いかけるインクミサイルを発射','✶'],
  ['shield','チームバリア','味方チーム全員にダメージ軽減シールド','⬡'],
  ['turret','超大型インクタレット','地面を塗りながら敵を狙う砲台を設置','▣'],
  ['final_frontier','ラストのフロンティア','発射→星の雨→巨大月面衝突の3段階スペシャル','★'],
  ['mega_bomb','メガインクボム','巨大なボムを投げ、着弾地点の広い範囲を塗る','✹']
];
export const SPRA_SPECIALS = Object.freeze(Object.fromEntries(definitions.map(([id,label,description,icon])=>[id,Object.freeze({id,label,description,icon})])));
