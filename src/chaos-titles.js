// CHAOS SHOGI collectible titles. Unlock conditions are enforced on the server.
import { masteryLevel } from './chaos-progression.js';

export const TITLE_CATALOG=Object.freeze({
  rookie:{id:'rookie',name:'見習い棋士',description:'初期称号',category:'starter'},
  firstWin:{id:'firstWin',name:'初勝利の棋士',description:'対人戦で1勝',category:'battle'},
  veteran:{id:'veteran',name:'百戦錬磨',description:'対人戦で10勝',category:'battle'},
  master:{id:'master',name:'熟練の使い手',description:'カード1種類のマスタリーLv.5到達',category:'mastery'},
  grandmaster:{id:'grandmaster',name:'究極を極めし者',description:'カードを究極覚醒Ⅱ',category:'ultimate'},
  avada:{id:'avada',name:'消滅の達人',description:'アバダ・ケダブラのマスタリーLv.10到達',category:'mastery'},
  collector:{id:'collector',name:'カード収集王',description:'30種類以上のカードを集める',category:'collection'},
  bossHunter:{id:'bossHunter',name:'ボスハンター',description:'ボスを1回撃破',category:'boss'},
  duo:{id:'duo',name:'共闘の絆',description:'2人協力でボス撃破',category:'boss'},
  guardian:{id:'guardian',name:'守護者キラー',description:'守護者ボス撃破',category:'boss'},
  nightmare:{id:'nightmare',name:'深淵の征服者',description:'深淵ボス撃破',category:'boss'}
});

export function refreshTitles(p){
  p.titles||={owned:['rookie'],equipped:'rookie'};
  p.titles.owned||=['rookie'];
  if(!p.titles.owned.includes('rookie'))p.titles.owned.unshift('rookie');
  const grant=id=>{if(!p.titles.owned.includes(id))p.titles.owned.push(id);};
  if((p.wins||0)>=1)grant('firstWin');
  if((p.wins||0)>=10)grant('veteran');
  if(Object.values(p.mastery||{}).some(x=>masteryLevel(x)>=5))grant('master');
  if((p.ultimate||[]).length)grant('grandmaster');
  if(masteryLevel(p.mastery?.avada||0)>=10)grant('avada');
  if(Object.entries(p.cards||{}).filter(([,n])=>n>0).length>=30)grant('collector');
  const boss=p.boss||{},clears=boss.clears||{};
  if(Object.values(clears).some(x=>x>0))grant('bossHunter');
  if((boss.duoClears||0)>0)grant('duo');
  if((clears.guardian||0)>0)grant('guardian');
  if((clears.nightmare||0)>0)grant('nightmare');
  if(!p.titles.owned.includes(p.titles.equipped))p.titles.equipped='rookie';
  return p.titles;
}
export const equippedTitle=p=>TITLE_CATALOG[refreshTitles(p).equipped]?.name||TITLE_CATALOG.rookie.name;
