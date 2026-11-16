export type Role = 'balanced'|'tank'|'assassin'|'support'|'area'|'control'|'trick'|'sniper';
export type AttackKind = 'bolt'|'melee'|'lob'|'spread';
export type AbilityKind = 'rapid'|'shockwave'|'assassinate'|'healwave'|'megabomb'|'timefield'|'clones'|'icewall'|'dash'|'shield'|'invisible'|'drone'|'mine'|'warp'|'decoy'|'slowfield';
export interface AttackDefinition { kind: AttackKind; damage: number; range: number; projectileSpeed: number; cooldown: number; ammoCost: number; projectileCount: number; spread: number; pierce: number; splashRadius: number; }
export interface CharacterDefinition { id: string; name: string; role: Role; maxHp: number; moveSpeed: number; ammo: number; reload: number; color: number; accent: number; attack: AttackDefinition; ultimate: { kind: AbilityKind; label: string; instant?: boolean; baseDamage?: number; fixedDamage?: number; healAmount?: number; description?: string }; skill: { kind: AbilityKind; label: string; cooldown: number }; passive: string; }
const attack = (kind: AttackKind, damage: number, range: number, speed: number, cooldown: number, count=1, spread=0, splash=0): AttackDefinition => ({ kind, damage, range, projectileSpeed:speed, cooldown, ammoCost:1, projectileCount:count, spread, pierce:0, splashRadius:splash });
export const characters: CharacterDefinition[] = [
  { id:'rei',name:'レイ',role:'balanced',maxHp:5700,moveSpeed:5.1,ammo:3,reload:1.65,color:0x277ad6,accent:0x56eaff,attack:attack('bolt',425,9.5,13,.65,3,.13),ultimate:{kind:'rapid',label:'オーバードライブ',instant:true,description:'一定時間、通常攻撃の連射速度を強化（効果は固定）'},skill:{kind:'dash',label:'フォトンダッシュ',cooldown:8},passive:'連続命中で速度上昇' },
  { id:'gald',name:'ガルド',role:'tank',maxHp:8500,moveSpeed:3.6,ammo:3,reload:1.45,color:0xef995f,accent:0xffe6b6,attack:attack('melee',1150,2.3,0,.78),ultimate:{kind:'shockwave',label:'グラウンドインパクト',instant:true,baseDamage:1600},skill:{kind:'shield',label:'ガードウォール',cooldown:13},passive:'被弾で防御力上昇' },
  { id:'jin',name:'ジン',role:'assassin',maxHp:4900,moveSpeed:6.2,ammo:3,reload:1.15,color:0x39734d,accent:0xa4ff70,attack:attack('melee',820,2.5,0,.52),ultimate:{kind:'assassinate',label:'影縫い',baseDamage:1750},skill:{kind:'invisible',label:'薄影',cooldown:12},passive:'KOでスキル短縮' },
  { id:'mina',name:'ミナ',role:'support',maxHp:5500,moveSpeed:4.8,ammo:4,reload:1.25,color:0xe78dbc,accent:0x9bf08b,attack:attack('bolt',700,8.8,11,.60),ultimate:{kind:'healwave',label:'グリーンパルス',instant:true,healAmount:1600,description:'範囲内の味方を1600回復（固定）'},skill:{kind:'drone',label:'ケアドローン',cooldown:15},passive:'周囲の味方の回復増加' },
  { id:'bom',name:'ボム',role:'area',maxHp:6200,moveSpeed:4.2,ammo:3,reload:1.65,color:0xc44d39,accent:0xf5c44c,attack:attack('lob',1040,8.4,8,1.00,1,0,1.65),ultimate:{kind:'megabomb',label:'メガボム',baseDamage:1800},skill:{kind:'mine',label:'トラップボム',cooldown:10},passive:'複数巻き込みでゲージ増加' },
  { id:'chrono',name:'クロノ',role:'control',maxHp:5400,moveSpeed:4.7,ammo:4,reload:1.35,color:0x6d4ca0,accent:0xf2c357,attack:attack('bolt',840,8.8,11,.58),ultimate:{kind:'timefield',label:'タイムレンズ',description:'敵の動きを遅くする時空フィールドを設置（効果は固定）'},skill:{kind:'warp',label:'ブリンク',cooldown:9},passive:'状態異常の敵に追加ダメージ' },
  { id:'noise',name:'ノイズ',role:'trick',maxHp:5400,moveSpeed:5.2,ammo:4,reload:1.6,color:0x35c4d7,accent:0xdb59cd,attack:attack('spread',245,6.8,10,.73,5,.7),ultimate:{kind:'clones',label:'エコー分身',instant:true,fixedDamage:220,description:'分身を3体召喚し、各分身が毎秒220の固定ダメージで攻撃'},skill:{kind:'decoy',label:'フェイクステップ',cooldown:9},passive:'視界外からの攻撃強化' },
  { id:'frost',name:'フロスト',role:'control',maxHp:5900,moveSpeed:4.4,ammo:3,reload:1.35,color:0xa2e5ff,accent:0xffffff,attack:attack('bolt',855,9.2,10,.68),ultimate:{kind:'icewall',label:'氷晶の壁',description:'氷の障害物を生成（効果は固定）'},skill:{kind:'slowfield',label:'フリーズゾーン',cooldown:12},passive:'連続命中で鈍足付与' }
];
export const characterById = (id: string) => characters.find(c=>c.id===id) || characters[0];
export interface Wall { id:string; x:number; z:number; w:number; h:number; hp:number; kind:'wall'|'crate'|'ice'; }
export interface Zone { id?:string;x:number; z:number; radius:number; kind:'bush'|'speed'|'water'|'conveyor'|'slow'|'heal'|'danger'|'jump'; }
export interface MapDefinition { id:string; name:string; theme:number; ground:number; width:number; height:number; walls:Wall[]; zones:Zone[]; spawn:[[number,number][],[number,number][]]; goal:[number,number]; }
const box=(id:string,x:number,z:number,w:number,h:number,hp=0,kind:Wall['kind']='wall'):Wall=>({id,x,z,w,h,hp,kind});
const grass=(x:number,z:number,radius:number):Zone=>({x,z,radius,kind:'bush'});
const base={width:26,height:18,spawn:[[[3,5],[3,9],[3,13]],[[23,5],[23,9],[23,13]]] as MapDefinition['spawn'],goal:[13,9] as [number,number]};
const compactMaps:MapDefinition[]=[
  { ...base,id:'park',name:'グリーンパーク',theme:0x113c3b,ground:0x4f9d70,walls:[box('p1',7,5,1.5,3),box('p2',19,5,1.5,3),box('p3',7,13,1.5,3),box('p4',19,13,1.5,3),box('pc1',11,4,1.4,1.4,1200,'crate'),box('pc2',15,4,1.4,1.4,1200,'crate'),box('pc3',11,14,1.4,1.4,1200,'crate'),box('pc4',15,14,1.4,1.4,1200,'crate')],zones:[grass(6,9,2),grass(20,9,2),grass(12,5,1.5),grass(14,13,1.5),{x:13,z:9,radius:2,kind:'water'}] },
  { ...base,id:'factory',name:'ネオンファクトリー',theme:0x1c274b,ground:0x536382,walls:[box('f1',8,3,1.3,5),box('f2',18,3,1.3,5),box('f3',8,15,1.3,5),box('f4',18,15,1.3,5),box('fc1',12,6,1.3,1.4,1300,'crate'),box('fc2',14,12,1.3,1.4,1300,'crate')],zones:[{x:7,z:9,radius:2.1,kind:'conveyor'},{x:19,z:9,radius:2.1,kind:'conveyor'},{x:13,z:3,radius:2,kind:'speed'},{x:13,z:15,radius:2,kind:'speed'}] },
  { ...base,id:'canyon',name:'クリスタルキャニオン',theme:0x362344,ground:0x9777ac,walls:[box('c1',8,5,2,2.6),box('c2',18,5,2,2.6),box('c3',8,13,2,2.6),box('c4',18,13,2,2.6),box('cc1',13,3,1.5,1.5,1000,'crate'),box('cc2',13,15,1.5,1.5,1000,'crate')],zones:[grass(5.5,9,1.8),grass(20.5,9,1.8),{x:13,z:9,radius:2.5,kind:'speed'}] }
];
/** Match-specific arenas: 3v3 50×100; all other team sizes and modes 100×100.
 * Rebuild cover from symmetrical patterns instead of stretching the old tiny map.
 * x and z are the two horizontal axes in the 3D world (user-facing X × Y).
 */
export type ArenaLayout = 'standard' | '3v3';
function expandArena(source:MapDefinition,width:50|100):MapDefinition{
  const height=100,centerX=width/2,centerZ=height/2;
  const offsetX=centerX-13,offsetZ=centerZ-9;
  const columns=width===50?[.18,.36,.64,.82]:[.14,.30,.42,.58,.70,.86];
  const rows=[12,26,38,62,74,88];
  const walls:Wall[]=source.walls.map(w=>({...w,id:source.id+'-center-'+w.id,x:w.x+offsetX,z:w.z+offsetZ}));
  const zones:Zone[]=source.zones.map(z=>({...z,x:z.x+offsetX,z:z.z+offsetZ}));
  for(let row=0;row<rows.length;row++){
    for(let col=0;col<columns.length;col++){
      const x=Number((width*columns[col]).toFixed(2)),z=rows[row];
      const variant=(row*2+col+source.id.length)%4;
      walls.push(box(
        source.id+'-cover-'+row+'-'+col,x,z,
        variant===0?1.8:variant===1?3:2.2,
        variant===0?3:variant===1?1.8:2.5,
        variant===2?1150:0,
        variant===2?'crate':'wall'
      ));
    }
  }
  // Open flank corridors with bush cover. No generated wall is placed on a spawn.
  const bushes=width===50?[.10,.27,.73,.90]:[.09,.24,.76,.91];
  for(const z of [19,32,68,81])for(const x of bushes)zones.push(grass(width*x,z,2.2));
  if(source.id==='factory'){
    for(const z of [18,82])zones.push({kind:'speed',x:centerX,z,radius:2.5});
  }else if(source.id==='canyon'){
    for(const z of [25,75])zones.push({kind:'jump',x:centerX,z,radius:2.1});
  }else{
    for(const z of [15,85])zones.push(grass(centerX,z,3));
  }
  const spawnZ=[50,25,75,13,87];
  const spawnX=width===50?5:8;
  const makeSpawns=(x:number):[number,number][]=>spawnZ.map(z=>[x,z]);
  return {...source,width,height,goal:[centerX,centerZ],
    spawn:[makeSpawns(spawnX),makeSpawns(width-spawnX)],
    walls,zones};
}
/** Standard selection and non-3v3 modes use a 100×100 world. */
export const maps:MapDefinition[]=compactMaps.map(m=>expandArena(m,100));
const teamMaps:MapDefinition[]=compactMaps.map(m=>expandArena(m,50));
export const mapById=(id:string,layout:ArenaLayout='standard')=>{
  const pool=layout==='3v3'?teamMaps:maps;
  return pool.find(m=>m.id===id)||pool[0];
};
