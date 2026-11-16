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

export const AWAKEN_BONUSES=Object.freeze({
  dobby:{cp:2,draw:1,description:'最初の発動時に2CP返還＋1枚ドロー'},
  avada:{cp:3,draw:0,description:'最初の使用時に3CP返還'},
  meteor:{cp:2,draw:1,description:'最初の使用時に2CP返還＋1枚ドロー'},
  insight:{cp:1,draw:1,description:'最初の使用時に1CP返還＋追加1枚ドロー'},
  grant:{cp:3,draw:0,description:'最初の使用時に3CP返還'},
  infinity:{cp:2,draw:1,description:'最初の装備時に2CP返還＋1枚ドロー'},
  warp:{cp:2,draw:1,description:'最初の使用時に2CP返還＋1枚ドロー'}
});
export const awakeningBonus=cardId=>AWAKEN_BONUSES[cardId]||{cp:2,draw:0,description:'最初の使用時に2CP返還'};

export function applyAwakeningOnPlay(game,side,cardId,draw){
  if(game.onlineMode==='ranked'||!game.awakened?.[side]?.includes(cardId))return false;
  const player=game.cards[side];
  player.awakenedUsed ||= [];
  if(player.awakenedUsed.includes(cardId))return false;
  player.awakenedUsed.push(cardId);
  const bonus=awakeningBonus(cardId);
  player.cp=Math.min(game.settings?.cpCap??10,player.cp+bonus.cp);
  let drawn=0;
  if(typeof draw==='function')for(let i=0;i<bonus.draw;i++)if(draw(player))drawn++;
  game.log.push('覚醒 '+cardId+'：'+bonus.cp+'CP返還'+(drawn?'・'+drawn+'枚ドロー':''));
  return true;
}
