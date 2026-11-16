import { AWAKENINGS, resolveUniqueAwakening } from './chaos-awakenings.js';
// CHAOS SHOGI progression: persisted mastery and optional awakened card bonuses.
export const MASTERY_THRESHOLDS = Object.freeze([0,30,90,180,300,450,630,840,1080,1350]);
export const MASTERY_XP_PER_PLAY = 40;
export const MASTERY_MATCH_CAP = 120;
export const MASTERY_LEVEL_REWARD = 60;
export const AWAKEN_REQUIRED_LEVEL = 5;
export const AWAKEN_SHARD_COST = 120;

export function masteryLevel(xp=0){
  const value=Number.isFinite(Number(xp))?Math.max(0,Number(xp)):0;
  let level=1;
  for(let i=1;i<MASTERY_THRESHOLDS.length;i++)if(value>=MASTERY_THRESHOLDS[i])level=i+1;
  return level;
}

export function applyMasteryFromReplay(profile,match,playerId,catalog){
  profile.mastery ||= {};
  const earned=new Map();
  for(const frame of match.replay||[]){
    if(frame.actor!==playerId || frame.action?.kind!=='card')continue;
    const id=frame.action.cardId;
    if(!Object.hasOwn(catalog,id))continue;
    const old=earned.get(id)||0;
    earned.set(id,Math.min(MASTERY_MATCH_CAP,old+MASTERY_XP_PER_PLAY));
  }
  const changes=[];
  for(const [id,amount] of earned){
    const old=Math.max(0,Number(profile.mastery[id])||0);
    const current=old+amount;
    profile.mastery[id]=current;
    const from=masteryLevel(old),to=masteryLevel(current);
    const coins=(to-from)*MASTERY_LEVEL_REWARD;
    profile.coins+=coins;
    changes.push({cardId:id,gainedXp:amount,level:to,levelUp:to-from,coinReward:coins});
  }
  return changes;
}


export const AWAKEN_BONUSES = AWAKENINGS;
export const awakeningBonus = cardId=>AWAKENINGS[cardId]||null;
export const hasUnusedAwakening=(game,side,cardId)=>
  game?.onlineMode!=='ranked'&&game?.settings?.cardPool!=='ranked'&&
  game?.awakened?.[side]?.includes(cardId)===true&&
  !game?.cards?.[side]?.awakenedUsed?.includes(cardId);

export function applyAwakeningOnPlay(game,side,cardId,draw,action={},ops={}){
  if(!hasUnusedAwakening(game,side,cardId))return false;
  if(!awakeningBonus(cardId))return false;
  // Recording happens after the normal effect resolves. Rewinds must clone this flag.
  const applied=resolveUniqueAwakening(game,side,cardId,action,{...ops,draw});
  const player=game.cards[side];
  player.awakenedUsed||=[];
  player.awakenedUsed.push(cardId);
  return applied;
}
