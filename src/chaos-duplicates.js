import { masteryLevel, MASTERY_LEVEL_REWARD } from './chaos-progression.js';

// Gacha-only progression. Repeated copies of each card are counted across packs,
// regardless of whether excess copies are converted into shards later.
export const DUPLICATE_MASTERY_COPIES = 10;
export const DUPLICATE_MASTERY_XP = 5;

export function awardDuplicateMastery(profile,cardId){
  profile.duplicate_counts ||= {};
  profile.mastery ||= {};
  const previous=Math.max(0,Math.floor(Number(profile.duplicate_counts[cardId])||0));
  const current=previous+1;
  profile.duplicate_counts[cardId]=current;
  const completed=Math.floor(current/DUPLICATE_MASTERY_COPIES)-Math.floor(previous/DUPLICATE_MASTERY_COPIES);
  const xp=completed*DUPLICATE_MASTERY_XP;
  if(xp){
    const oldXp=Math.max(0,Math.floor(Number(profile.mastery[cardId])||0));
    const newXp=oldXp+xp;
    profile.mastery[cardId]=newXp;
    const levelUps=masteryLevel(newXp)-masteryLevel(oldXp);
    // Keep milestone rewards consistent with XP earned in battles.
    profile.coins=Math.min(100000000,profile.coins+levelUps*MASTERY_LEVEL_REWARD);
  }
  return {duplicateCount:current,duplicateProgress:current%DUPLICATE_MASTERY_COPIES,masteryXp:xp};
}
