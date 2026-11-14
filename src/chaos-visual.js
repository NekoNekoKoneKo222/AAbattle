export function visualEvent(before,after,action){
  if(!action||!['move','drop','card','activate'].includes(action.kind))return null;
  const side=before.turn,removed=[];
  for(let i=0;i<before.board.length;i++)if(before.board[i]&&!after.board[i])removed.push(i);
  const event={kind:action.kind,side,revision:after.revision,size:after.size||9,removed:removed.slice(0,40)};
  if(action.kind==='move'){
    event.from=action.from;event.to=action.to;event.pieceType=before.board[action.from]?.type;
    event.promoted=Boolean(action.promote);event.capture=Boolean(before.board[action.to]);
  }else if(action.kind==='drop'){
    event.to=action.to;event.pieceType=action.type;
  }else{
    event.target=Number.isInteger(action.target)?action.target:null;
    event.cardId=action.kind==='card'?action.cardId:null;
    if(Number.isInteger(action.from)&&Number.isInteger(action.target)&&before.board[action.from]){
      event.from=action.from;event.to=action.target;event.pieceType=before.board[action.from].type;
    }
  }
  return event;
}
