export const ROUND_LIMIT=20;
export const NO_REVIVE_FROM=17;
export const PIECE_POINTS=Object.freeze({P:1,L:2,N:2,S:3,G:4,B:6,R:7});

export const revivalBlocked=game=>(game.round||1)>=NO_REVIVE_FROM;

export function awardPiecePoints(game,attacker,defender,type){
  if(!game.scores||attacker===defender||!['b','w'].includes(attacker))return;
  game.scores[attacker]+=PIECE_POINTS[type]||0;
}

export function finishByPoints(game){
  game.status='finished';
  game.winner=game.scores.b===game.scores.w?null:game.scores.b>game.scores.w?'b':'w';
  game.reason='20ラウンド終了・ポイント判定';
  game.log.push(`20ラウンド終了 · 先手${game.scores.b}点 / 後手${game.scores.w}点${game.winner?` · ${game.winner==='b'?'先手':'後手'}の勝ち`:' · 引き分け'}`);
}
