export const RARITIES=['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY','MYTHIC','ANOMALY'] as const;
export type Rarity=typeof RARITIES[number];
export type GearSlot='head'|'body'|'feet'|'charm';
export type GearOption='hp'|'damage'|'guard';
export type Gear={id:string;name:string;slot:GearSlot;rarity:Rarity;level:number;upgrade:number;option:GearOption;value:number;favorite:boolean};
export type RpgState={inventory:Gear[];equipped:Record<GearSlot,string|null>;kills:number;bossKills:number;dungeonClears:number;claimed:string[];rebirths:number;rebirthPoints:number;mastery:Record<string,number>;explored:string[];discovered:string[];eventClaims:string[];openedChests:string[]};
export const QUESTS=[{id:'first',name:'最初の狩り',target:3,kind:'kills',coins:30},{id:'hunter',name:'グリフハンター',target:20,kind:'kills',coins:100},{id:'boss',name:'虚無の討伐',target:1,kind:'bossKills',coins:120},{id:'dungeon',name:'遺跡の踏破',target:1,kind:'dungeonClears',coins:160}] as const;
export function starterRpg():RpgState{return {inventory:[],equipped:{head:null,body:null,feet:null,charm:null},kills:0,bossKills:0,dungeonClears:0,claimed:[],rebirths:0,rebirthPoints:0,mastery:{},explored:[],discovered:['city'],eventClaims:[],openedChests:[]};}
export function normalizeRpg(raw:unknown):RpgState{
  const seed=starterRpg();if(!raw||typeof raw!=='object')return seed;
  const a=raw as Record<string,unknown>,positive=(v:unknown,max:number)=>Number.isSafeInteger(v)?Math.min(max,Math.max(0,Number(v))):0;
  const inventory:Array<Gear>=Array.isArray(a.inventory)?a.inventory.slice(0,60).flatMap(v=>{
    if(!v||typeof v!=='object')return [];const g=v as Record<string,unknown>;
    if(typeof g.id!=='string'||g.id.length>64||!['head','body','feet','charm'].includes(String(g.slot))||!RARITIES.includes(g.rarity as Rarity)||!['hp','damage','guard'].includes(String(g.option)))return [];
    return [{id:g.id,name:String(g.name??'装備').slice(0,40),slot:g.slot as GearSlot,rarity:g.rarity as Rarity,level:Math.max(1,positive(g.level,100)),upgrade:positive(g.upgrade,10),option:g.option as GearOption,value:Math.max(1,positive(g.value,50)),favorite:g.favorite===true}];
  }):[];
  const equip=a.equipped&&typeof a.equipped==='object'?a.equipped as Record<string,unknown>:{};
  const equipped={...seed.equipped};for(const slot of Object.keys(equipped) as GearSlot[]){const id=equip[slot];if(typeof id==='string'&&inventory.some(g=>g.id===id&&g.slot===slot))equipped[slot]=id;}
  const mastery:Record<string,number>={};if(a.mastery&&typeof a.mastery==='object')for(const [key,value] of Object.entries(a.mastery))if(key.length<32)mastery[key]=positive(value,10000);
  const strings=(value:unknown,max:number)=>Array.isArray(value)?[...new Set(value.filter((v):v is string=>typeof v==='string'&&v.length<40))].slice(0,max):[];
  return {inventory,equipped,kills:positive(a.kills,1e9),bossKills:positive(a.bossKills,1e9),dungeonClears:positive(a.dungeonClears,1e9),claimed:Array.isArray(a.claimed)?a.claimed.filter(v=>QUESTS.some(q=>q.id===v)):[],rebirths:positive(a.rebirths,1e6),rebirthPoints:positive(a.rebirthPoints,1e6),mastery,explored:strings(a.explored,36),discovered:['city',...strings(a.discovered,32).filter(v=>v!=='city')],eventClaims:strings(a.eventClaims,16),openedChests:strings(a.openedChests,36)};
}
export function rollGear(level:number,boss=false,random=Math.random,id=''):Gear{
  const roll=random(),rarity=RARITIES[roll<(boss?.02:.001)?6:roll<(boss?.08:.005)?5:roll<(boss?.2:.02)?4:roll<(boss?.45:.08)?3:roll<(boss?.72:.2)?2:roll<(boss?.92:.5)?1:0];
  const slots:GearSlot[]=['head','body','feet','charm'],slot=slots[Math.floor(random()*4)];
  const options:GearOption[]=['hp','damage','guard'],option=options[Math.floor(random()*3)];
  const names={head:'文字の兜',body:'刻印の鎧',feet:'疾走の靴',charm:'虚無の護符'};
  return {id,name:names[slot],slot,rarity,level:Math.max(1,Math.min(100,level)),upgrade:0,option,value:1+Math.floor(level/15)+RARITIES.indexOf(rarity)*2,favorite:false};
}
export function gearBonus(rpg:RpgState,option:GearOption):number{return (Object.values(rpg.equipped).map(id=>rpg.inventory.find(g=>g.id===id)).filter(Boolean) as Gear[]).filter(g=>g.option===option).reduce((sum,g)=>sum+g.value+g.upgrade*2,0);}
