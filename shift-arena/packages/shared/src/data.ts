export type Role = 'balanced'|'tank'|'assassin'|'support'|'area'|'control'|'trick'|'sniper';
export type AttackKind = 'bolt'|'melee'|'lob'|'spread';
export type AbilityKind = 'rapid'|'shockwave'|'assassinate'|'healwave'|'megabomb'|'timefield'|'clones'|'icewall'|'dash'|'shield'|'invisible'|'drone'|'mine'|'warp'|'decoy'|'slowfield';
export interface AttackDefinition { kind: AttackKind; damage: number; range: number; projectileSpeed: number; cooldown: number; ammoCost: number; projectileCount: number; spread: number; pierce: number; splashRadius: number; }
export interface CharacterDefinition { id: string; name: string; role: Role; maxHp: number; moveSpeed: number; ammo: number; reload: number; color: number; accent: number; attack: AttackDefinition; ultimate: { kind: AbilityKind; label: string; instant?: boolean }; skill: { kind: AbilityKind; label: string; cooldown: number }; passive: string; }
const attack = (kind: AttackKind, damage: number, range: number, speed: number, cooldown: number, count=1, spread=0, splash=0): AttackDefinition => ({ kind, damage, range, projectileSpeed:speed, cooldown, ammoCost:1, projectileCount:count, spread, pierce:0, splashRadius:splash });
export const characters: CharacterDefinition[] = [
  { id:'rei',name:'レイ',role:'balanced',maxHp:4200,moveSpeed:5.1,ammo:3,reload:1.6,color:0x43d9de,accent:0xe9fff6,attack:attack('bolt',370,8.5,13,.57,3,.13),ultimate:{kind:'rapid',label:'オーバードライブ',instant:true},skill:{kind:'dash',label:'フォトンダッシュ',cooldown:8},passive:'連続命中で速度上昇' },
  { id:'gald',name:'ガルド',role:'tank',maxHp:7000,moveSpeed:3.6,ammo:3,reload:2.1,color:0xef995f,accent:0xffe6b6,attack:attack('melee',760,2.1,0,.85),ultimate:{kind:'shockwave',label:'グラウンドインパクト',instant:true},skill:{kind:'shield',label:'ガードウォール',cooldown:13},passive:'被弾で防御力上昇' },
  { id:'jin',name:'ジン',role:'assassin',maxHp:3600,moveSpeed:6.4,ammo:3,reload:1.4,color:0x9d80f4,accent:0xdac7ff,attack:attack('melee',620,2.4,0,.45),ultimate:{kind:'assassinate',label:'影縫い'},skill:{kind:'invisible',label:'薄影',cooldown:12},passive:'KOでスキル短縮' },
  { id:'mina',name:'ミナ',role:'support',maxHp:4000,moveSpeed:4.8,ammo:4,reload:1.35,color:0x62df9c,accent:0xebfff4,attack:attack('bolt',310,8.1,11,.5),ultimate:{kind:'healwave',label:'グリーンパルス',instant:true},skill:{kind:'drone',label:'ケアドローン',cooldown:15},passive:'周囲の味方の回復増加' },
  { id:'bom',name:'ボム',role:'area',maxHp:4600,moveSpeed:4.2,ammo:3,reload:2.0,color:0xf4c44c,accent:0xffefb5,attack:attack('lob',600,7.4,8,.9,1,0,1.6),ultimate:{kind:'megabomb',label:'メガボム'},skill:{kind:'mine',label:'トラップボム',cooldown:10},passive:'複数巻き込みでゲージ増加' },
  { id:'chrono',name:'クロノ',role:'control',maxHp:3800,moveSpeed:4.7,ammo:4,reload:1.5,color:0x5db5ef,accent:0xd9f6ff,attack:attack('bolt',330,8.2,10,.52),ultimate:{kind:'timefield',label:'タイムレンズ'},skill:{kind:'warp',label:'ブリンク',cooldown:9},passive:'状態異常の敵に追加ダメージ' },
  { id:'noise',name:'ノイズ',role:'trick',maxHp:4000,moveSpeed:5.2,ammo:4,reload:1.5,color:0xe477ce,accent:0xffdcf6,attack:attack('spread',260,6.1,10,.7,5,.7),ultimate:{kind:'clones',label:'エコー分身',instant:true},skill:{kind:'decoy',label:'フェイクステップ',cooldown:9},passive:'視界外からの攻撃強化' },
  { id:'frost',name:'フロスト',role:'control',maxHp:4400,moveSpeed:4.4,ammo:3,reload:1.8,color:0xa2e5ff,accent:0xffffff,attack:attack('bolt',390,8,10,.65),ultimate:{kind:'icewall',label:'氷晶の壁'},skill:{kind:'slowfield',label:'フリーズゾーン',cooldown:12},passive:'連続命中で鈍足付与' }
];
export const characterById = (id: string) => characters.find(c=>c.id===id) || characters[0];
export interface Wall { id:string; x:number; z:number; w:number; h:number; hp:number; kind:'wall'|'crate'|'ice'; }
export interface Zone { x:number; z:number; radius:number; kind:'bush'|'speed'|'water'|'conveyor'|'slow'|'heal'|'danger'|'jump'; }
export interface MapDefinition { id:string; name:string; theme:number; ground:number; width:number; height:number; walls:Wall[]; zones:Zone[]; spawn:[[number,number][],[number,number][]]; goal:[number,number]; }
const box=(id:string,x:number,z:number,w:number,h:number,hp=0,kind:Wall['kind']='wall'):Wall=>({id,x,z,w,h,hp,kind});
const grass=(x:number,z:number,radius:number):Zone=>({x,z,radius,kind:'bush'});
const base={width:26,height:18,spawn:[[[3,5],[3,9],[3,13]],[[23,5],[23,9],[23,13]]] as MapDefinition['spawn'],goal:[13,9] as [number,number]};
export const maps:MapDefinition[]=[
  { ...base,id:'park',name:'グリーンパーク',theme:0x113c3b,ground:0x4f9d70,walls:[box('p1',7,5,1.5,3),box('p2',19,5,1.5,3),box('p3',7,13,1.5,3),box('p4',19,13,1.5,3),box('pc1',11,4,1.4,1.4,1200,'crate'),box('pc2',15,4,1.4,1.4,1200,'crate'),box('pc3',11,14,1.4,1.4,1200,'crate'),box('pc4',15,14,1.4,1.4,1200,'crate')],zones:[grass(6,9,2),grass(20,9,2),grass(12,5,1.5),grass(14,13,1.5),{x:13,z:9,radius:2,kind:'water'}] },
  { ...base,id:'factory',name:'ネオンファクトリー',theme:0x1c274b,ground:0x536382,walls:[box('f1',8,3,1.3,5),box('f2',18,3,1.3,5),box('f3',8,15,1.3,5),box('f4',18,15,1.3,5),box('fc1',12,6,1.3,1.4,1300,'crate'),box('fc2',14,12,1.3,1.4,1300,'crate')],zones:[{x:7,z:9,radius:2.1,kind:'conveyor'},{x:19,z:9,radius:2.1,kind:'conveyor'},{x:13,z:3,radius:2,kind:'speed'},{x:13,z:15,radius:2,kind:'speed'}] },
  { ...base,id:'canyon',name:'クリスタルキャニオン',theme:0x362344,ground:0x9777ac,walls:[box('c1',8,5,2,2.6),box('c2',18,5,2,2.6),box('c3',8,13,2,2.6),box('c4',18,13,2,2.6),box('cc1',13,3,1.5,1.5,1000,'crate'),box('cc2',13,15,1.5,1.5,1000,'crate')],zones:[grass(5.5,9,1.8),grass(20.5,9,1.8),{x:13,z:9,radius:2.5,kind:'speed'}] }
];
export const mapById=(id:string)=>maps.find(m=>m.id===id)||maps[0];

