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

export function applyAwakeningOnPlay(game,side,cardId,draw){
  if(game.onlineMode==='ranked'||!game.awakened?.[side]?.includes(cardId))return false;
  const player=game.cards[side];
  player.awakenedUsed ||= [];
  if(player.awakenedUsed.includes(cardId))return false;
  player.awakenedUsed.push(cardId);
  player.cp=Math.min(game.settings?.cpCap??10,player.cp+2);
  if(cardId==='dobby'&&typeof draw==='function')draw(player);
  game.log.push('覚醒 '+cardId+'：初回使用時に2CP返還'+(cardId==='dobby'?'・追加ドロー':''));
  return true;
}
