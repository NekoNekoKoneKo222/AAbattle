export const characterRoad = {
  rei: { rarity: 'STARTER', cost: 0 },
  gald: { rarity: 'STANDARD', cost: 200 },
  mina: { rarity: 'STANDARD', cost: 200 },
  jin: { rarity: 'ADVANCED', cost: 600 },
  bom: { rarity: 'ADVANCED', cost: 600 },
  frost: { rarity: 'ADVANCED', cost: 600 },
  chrono: { rarity: 'EXPERT', cost: 1200 },
  noise: { rarity: 'EXPERT', cost: 1200 },
} as const;
export type CharacterId = keyof typeof characterRoad;
export const roadTiers:CharacterId[][]=[['gald','mina'],['jin','bom','frost'],['chrono','noise']];
export const rewardConfig={onlineWin:25,onlineLoss:12,firstWin:40,solo:8,soloDailyLimit:5,minActiveSeconds:45,minParticipation:5} as const;
export const masteryRewards=[
  {level:5,id:'icon',label:'キャラクターアイコン'},
  {level:10,id:'spray',label:'限定スプレー'},
  {level:15,id:'skin',label:'限定スキン'},
  {level:20,id:'attack',label:'限定攻撃エフェクト'},
  {level:25,id:'title',label:'限定称号'},
  {level:30,id:'master_skin',label:'マスター専用スキン'},
] as const;
export const masteryAchievements=[
  {id:'hits',label:'攻撃を100回命中',goal:100},
  {id:'wins',label:'15試合勝利',goal:15},
  {id:'ko',label:'50KO達成',goal:50},
  {id:'ultimates',label:'必殺技を10回使用',goal:10},
  {id:'terminal',label:'シフト端末を20回占領',goal:20},
] as const;
export const masteryLevel=(xp:number)=>Math.min(30,1+Math.floor((Math.sqrt(1+Math.max(0,xp)/25)-1)/2));
export const masteryThreshold=(level:number)=>level<=1?0:100*(level-1)*level;
export const missionDefs=[
  {id:'play3',label:'3試合プレイ',goal:3,credits:25},
  {id:'win1',label:'1試合勝利',goal:1,credits:30},
  {id:'ko10',label:'合計10KO',goal:10,credits:40},
  {id:'ult5',label:'必殺技を5回使用',goal:5,credits:35},
  {id:'objective30',label:'目標を30秒確保',goal:30,credits:40},
] as const;
export const loadoutOptions:Record<CharacterId,{skills:[{id:string;label:string;description:string;duration:number;cooldown:number;kind:string},{id:string;label:string;description:string;duration:number;cooldown:number;kind:string}];passives:[{id:string;label:string;description:string},{id:string;label:string;description:string}]}>= {
  rei:{skills:[{id:'dash',label:'短距離ダッシュ',description:'照準方向へ素早く移動',duration:.3,cooldown:8,kind:'dash'},{id:'energy_shield',label:'エネルギーシールド',description:'短時間ダメージを吸収',duration:3,cooldown:10,kind:'shield'}],passives:[{id:'combo_speed',label:'連撃加速',description:'3回連続命中で移動速度上昇'},{id:'ammo_return',label:'弾薬回収',description:'4回命中ごとに弾薬を1回復'}]},
  gald:{skills:[{id:'front_shield',label:'前方シールド',description:'攻撃を吸収するシールド',duration:4,cooldown:12,kind:'shield'},{id:'charge',label:'突進攻撃',description:'突進して接触した敵にダメージ',duration:.5,cooldown:10,kind:'charge'}],passives:[{id:'guard_after_hit',label:'堅守',description:'被弾後しばらく防御上昇'},{id:'ally_guard',label:'守護範囲',description:'近くの味方の被ダメージ軽減'}]},
  jin:{skills:[{id:'invisible',label:'透明化',description:'短時間姿を隠す',duration:4,cooldown:14,kind:'invisible'},{id:'shadow_step',label:'影移動',description:'分身を残して短距離移動',duration:.3,cooldown:12,kind:'shadow_step'}],passives:[{id:'ko_cooldown',label:'KO連鎖',description:'KOでスキルの待ち時間短縮'},{id:'dash_strike',label:'奇襲',description:'スキル移動後の次の攻撃を強化'}]},
  mina:{skills:[{id:'drone',label:'回復ドローン',description:'味方を継続回復',duration:8,cooldown:14,kind:'drone'},{id:'instant_heal',label:'緊急治療',description:'周囲の味方を即時回復',duration:0,cooldown:12,kind:'instant_heal'}],passives:[{id:'regen_aura',label:'回復の輪',description:'近くの味方の自然回復を強化'},{id:'heal_boost',label:'救護術',description:'味方への回復量を増加'}]},
  bom:{skills:[{id:'mine',label:'地雷設置',description:'踏むと爆発する地雷',duration:18,cooldown:11,kind:'mine'},{id:'remote_bomb',label:'遠隔爆破',description:'設置した爆弾を起爆',duration:12,cooldown:11,kind:'remote_bomb'}],passives:[{id:'multi_charge',label:'連鎖充填',description:'複数の敵に当てるとゲージ増加'},{id:'burn_blast',label:'余熱',description:'爆発後に火傷を付与'}]},
  chrono:{skills:[{id:'warp',label:'短距離ワープ',description:'障害物を避けて移動',duration:.2,cooldown:10,kind:'warp'},{id:'slowfield',label:'減速フィールド',description:'範囲内の敵を減速',duration:5,cooldown:13,kind:'slowfield'}],passives:[{id:'status_damage',label:'時差打撃',description:'状態異常中の敵に追加ダメージ'},{id:'assist_cooldown',label:'連携短縮',description:'アシストでスキル待ち時間短縮'}]},
  noise:{skills:[{id:'footsteps',label:'偽の足音',description:'敵を惑わす足音を発生',duration:5,cooldown:9,kind:'footsteps'},{id:'decoy',label:'デコイ',description:'自分に似た囮を生成',duration:5,cooldown:12,kind:'decoy'}],passives:[{id:'surprise_damage',label:'死角射撃',description:'隠れた位置からの攻撃を強化'},{id:'evasion',label:'残響回避',description:'スキル使用後の回避率上昇'}]},
  frost:{skills:[{id:'slowfield',label:'鈍足エリア',description:'敵を減速する氷エリア',duration:5,cooldown:12,kind:'slowfield'},{id:'ice_dash',label:'氷上疾走',description:'短時間加速して移動',duration:3,cooldown:10,kind:'ice_dash'}],passives:[{id:'chain_slow',label:'凍結連撃',description:'連続命中で敵を減速'},{id:'ice_guard',label:'氷壁守護',description:'氷壁の近くで防御上昇'}]},
};
export function validLoadout(character:string,skill:string,passive:string){const options=loadoutOptions[character as CharacterId];return !!options&&options.skills.some(s=>s.id===skill)&&options.passives.some(p=>p.id===passive);}
export function nextRoadTier(owned:string[]){return roadTiers.find(tier=>tier.some(id=>!owned.includes(id)))||[];}
