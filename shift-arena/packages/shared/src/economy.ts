/** Original SHIFT ARENA progression. Economy is authoritative on the server. */
export const MAX_POWER_LEVEL = 11;
export const powerCosts = [
  { coins: 35, sunPower: 20 },
  { coins: 65, sunPower: 35 },
  { coins: 105, sunPower: 55 },
  { coins: 160, sunPower: 75 },
  { coins: 240, sunPower: 105 },
  { coins: 340, sunPower: 140 },
  { coins: 465, sunPower: 185 },
  { coins: 600, sunPower: 235 },
  { coins: 750, sunPower: 290 },
  { coins: 950, sunPower: 350 }
] as const;
export type SunSkin = 'sun_skin';
export type PowerLevel = number;
export const powerLevel = (levels:Record<string,number> | undefined,character:string) =>
  Math.min(MAX_POWER_LEVEL,Math.max(1,Math.floor(levels?.[character]||1)));
/** Every level increases health and direct attack power by 10% of their level-1 base; Lv11 = 200%. */
export const powerMultiplier=(level:number)=>1+0.1*(Math.min(MAX_POWER_LEVEL,Math.max(1,Math.floor(level)))-1);
export function upgradeCost(level:number){
  return level<1||level>=MAX_POWER_LEVEL?null:powerCosts[Math.floor(level)-1];
}
export const skinPrice=60;
export const beginnerChoices=['gald','mina','jin','bom','frost'] as const;
export type DropKind='sun'|'glitch';
export const dropInfo={
  sun:{name:'サンドロップ',description:'コイン・サンパワー・まれにダイヤモンドが入る太陽の贈り物'},
  glitch:{name:'グリッチサンキューブ',description:'3回連続抽選。サンドロップより多くの報酬が手に入る'}
} as const;
export type Economy={
  coins:number;sun_power:number;diamonds:number;
  levels:Record<string,number>;skins:Record<string,string[]>;
  drops:{sun:number;glitch:number};
  tutorial_done:boolean;beginner_claimed:boolean;beginner_reward:{character:string;rarity:string}|null;
  total_matches:number;last_drop_day:string;daily_drops:number;
};
export function defaultEconomy():Economy{
  return {coins:250,sun_power:140,diamonds:0,levels:{},skins:{},drops:{sun:1,glitch:0},tutorial_done:false,beginner_claimed:false,beginner_reward:null,total_matches:0,last_drop_day:'',daily_drops:0};
}
