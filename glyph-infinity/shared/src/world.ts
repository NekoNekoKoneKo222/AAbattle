export const CHUNK_SIZE=64;
export type Biome='city'|'forest'|'mine'|'desert'|'fallen'|'anomaly'|'abyss'|'boundary'|'ruins'|'arena'|'secret';
export const BIOMES:Record<Biome,{name:string;danger:number;color:string}>={
  city:{name:'始まりの街',danger:0,color:'#e9bb72'},forest:{name:'古代森林',danger:1,color:'#4eab77'},
  mine:{name:'地下鉱山',danger:2,color:'#8c89ad'},desert:{name:'滅びの砂漠',danger:2,color:'#d7ad65'},
  fallen:{name:'崩壊都市',danger:3,color:'#ad8191'},anomaly:{name:'異常領域',danger:4,color:'#b187db'},
  abyss:{name:'深淵',danger:5,color:'#7761aa'},boundary:{name:'無限境界',danger:6,color:'#79b9c5'},
  ruins:{name:'虚無の遺跡',danger:3,color:'#c78bd9'},arena:{name:'訓練闘技場',danger:0,color:'#76c9b8'},
  secret:{name:'隠された文字庫',danger:4,color:'#f1c96b'}
};
export type WorldSite={id:string;name:string;tx:number;ty:number;glyph:string;kind:'waypoint'|'npc'|'merchant'|'secret';hidden?:boolean};
export const WORLD_SITES:WorldSite[]=[
  {id:'city',name:'始まりの街',tx:0,ty:0,glyph:'◎',kind:'waypoint'},
  {id:'guide',name:'案内人リラ',tx:3,ty:1,glyph:'?',kind:'npc'},
  {id:'merchant',name:'商人ノア',tx:-3,ty:1,glyph:'＄',kind:'merchant'},
  {id:'forest',name:'古代森林の道標',tx:36,ty:0,glyph:'◇',kind:'waypoint'},
  {id:'mine',name:'地下鉱山の道標',tx:-42,ty:-38,glyph:'◇',kind:'waypoint'},
  {id:'desert',name:'滅びの砂漠の道標',tx:42,ty:-38,glyph:'◇',kind:'waypoint'},
  {id:'fallen',name:'崩壊都市の道標',tx:-42,ty:38,glyph:'◇',kind:'waypoint'},
  {id:'anomaly',name:'異常領域の道標',tx:42,ty:38,glyph:'◇',kind:'waypoint'},
  {id:'abyss',name:'深淵の道標',tx:0,ty:72,glyph:'◇',kind:'waypoint'},
  {id:'boundary',name:'無限境界の道標',tx:76,ty:0,glyph:'◇',kind:'waypoint'},
  {id:'secret',name:'隠された文字庫',tx:-56,ty:54,glyph:'✧',kind:'secret',hidden:true}
];
export function chunkKey(tx:number,ty:number):string{return `${Math.floor(tx/CHUNK_SIZE)},${Math.floor(ty/CHUNK_SIZE)}`;}
export function chestAt(cx:number,cy:number):{id:string;tx:number;ty:number}{return {id:`${cx},${cy}`,tx:cx*CHUNK_SIZE+33,ty:cy*CHUNK_SIZE+31};}
export function biomeAt(tx:number,ty:number):Biome{
  if(Math.hypot(tx+56,ty-54)<8)return 'secret';
  if(Math.abs(tx)<9&&Math.abs(ty)<8)return 'city';
  if(tx<-13&&tx>-27&&ty>10&&ty<27)return 'arena';
  if(ty>15&&ty<30&&Math.abs(tx)<18)return 'ruins';
  if(Math.abs(tx)>68||Math.abs(ty)>95)return 'boundary';
  if(ty>52&&Math.abs(tx)<32)return 'abyss';
  if(tx<-28&&ty<-20)return 'mine';
  if(tx>28&&ty<-20)return 'desert';
  if(tx<-28&&ty>20)return 'fallen';
  if(tx>28&&ty>20)return 'anomaly';
  return 'forest';
}
function hash(x:number,y:number,salt=0):number{
  let n=Math.imul(x,374761393)+Math.imul(y,668265263)+salt*1442695041;
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967296;
}
export function generatedTile(tx:number,ty:number):string{
  const site=WORLD_SITES.find(s=>s.tx===tx&&s.ty===ty);if(site)return site.glyph;
  const chest=chestAt(Math.floor(tx/CHUNK_SIZE),Math.floor(ty/CHUNK_SIZE));
  if(chest.tx===tx&&chest.ty===ty&&Math.hypot(tx,ty)>12)return '▣';
  if(Math.hypot(tx-chest.tx,ty-chest.ty)<2)return '·';
  if(WORLD_SITES.some(s=>Math.hypot(tx-s.tx,ty-s.ty)<3))return '·';
  const biome=biomeAt(tx,ty),n=hash(tx,ty),clump=hash(Math.floor(tx/4),Math.floor(ty/4),7);
  if(biome==='forest')return n<.06?'♣':n<.1?'♠':n<.16?'░':'·';
  if(biome==='mine')return n<.09?'▲':n<.16?'#':n<.3?'▒':'·';
  if(biome==='desert')return n<.04?'▲':n<.12?'░':n<.28?':':'·';
  if(biome==='fallen')return n<.11?'#':n<.24?'▓':n<.32?'▒':'·';
  if(biome==='anomaly')return n<.06?'≋':n<.15?'▲':n<.28?'✦':'·';
  if(biome==='abyss')return n<.12?'▓':n<.2?'▲':n<.4?'░':'·';
  if(biome==='boundary')return n<.09?'#':n<.17?'≋':n<.35?'✧':'·';
  if(biome==='secret')return n<.08?'#':'✧';
  return clump<.11&&n<.2?'♣':n<.1?'▒':'·';
}
const chunkCache=new Map<string,readonly string[]>();
export function generatedChunk(cx:number,cy:number):readonly string[]{
  const key=`${cx},${cy}`,cached=chunkCache.get(key);
  if(cached){chunkCache.delete(key);chunkCache.set(key,cached);return cached;}
  const tiles=Array.from({length:CHUNK_SIZE*CHUNK_SIZE},(_,i)=>generatedTile(cx*CHUNK_SIZE+i%CHUNK_SIZE,cy*CHUNK_SIZE+Math.floor(i/CHUNK_SIZE)));
  chunkCache.set(key,tiles);if(chunkCache.size>16)chunkCache.delete(chunkCache.keys().next().value!);
  return tiles;
}
export function currentWorldEvent(now:number):{id:string;name:string;tx:number;ty:number;reward:string}{
  const day=Math.floor((now+9*3600000)/86400000),spots=[{tx:36,ty:4,name:'文字の流星',reward:'crystal'},{tx:-42,ty:-34,name:'鉱石の共鳴',reward:'iron'},{tx:42,ty:-34,name:'砂の財宝',reward:'coins'}];
  return {id:`${day}`, ...spots[day%spots.length]};
}
