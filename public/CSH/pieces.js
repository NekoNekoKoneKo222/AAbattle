// Two-character Japanese labels are visual-only: the rules keep K/R/B/G/S/N/L/P.
export const PIECES=Object.freeze({
  K:'王将',R:'飛車',B:'角行',G:'金将',
  S:'銀将',N:'桂馬',L:'香車',P:'歩兵'
});

export const PROMOTED=Object.freeze({
  R:'龍王',B:'龍馬',S:'成銀',N:'成桂',L:'成香',P:'と金'
});

export function pieceLabel(piece){
  if(!piece)return '';
  return (piece.promoted&&PROMOTED[piece.type])||PIECES[piece.type]||String(piece.type||'');
}
