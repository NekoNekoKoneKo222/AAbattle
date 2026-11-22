// SPRA battle XP progression. Level 1 starts at zero XP.
// Higher-level weapon licenses are visible in the shop and earned in matches.
export const SPRA_MAX_LEVEL = 50;
export function totalXpForLevel(level){
  const l=Math.max(1,Math.min(SPRA_MAX_LEVEL,Math.floor(Number(level)||1)));
  const n=l-1;
  return 80*n+10*n*(n+1);
}
export function levelFromXp(xp){
  const total=Math.max(0,Number(xp)||0);
  let low=1,high=SPRA_MAX_LEVEL;
  while(low<high){
    const mid=Math.ceil((low+high)/2);
    if(totalXpForLevel(mid)<=total)low=mid;
    else high=mid-1;
  }
  return low;
}
export function battleXpReward({winner,team,kos=0,mode='turf'}){
  if(mode==='training')return 0;
  const base=winner<0?75:winner===team?150:100;
  return base+Math.min(30,Math.max(0,Math.floor(Number(kos)||0)))*12;
}
