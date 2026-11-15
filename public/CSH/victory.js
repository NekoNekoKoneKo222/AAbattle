const PIECES={K:'王将',R:'飛車',B:'角行',G:'金将',S:'銀将',N:'桂馬',L:'香車',P:'歩兵'};

export function createVictoryDisplay({arena,catalog}){
  const overlay=document.createElement('div');overlay.className='king-victory';overlay.hidden=true;
  overlay.innerHTML='<div class="king-victory-content" role="status" aria-live="assertive"><div class="king-victory-crown">王</div><p class="king-victory-player"></p><strong>VICTORY!</strong><p class="king-victory-final"></p><button type="button">盤面を見る</button></div>';
  document.body.append(overlay);
  const close=()=>{overlay.hidden=true;arena.classList.remove('king-victory-dim');};
  overlay.querySelector('button').onclick=close;
  let shown='',pending=null;
  return {show(game){
    const kingWin=game?.status==='finished'&&game.winner&&['王将を取った','王将破壊'].includes(game.reason);
    if(!kingWin){clearTimeout(pending);shown='';close();return;}
    const key=`${game.id}:${game.revision}`;
    if(shown===key)return;
    shown=key;clearTimeout(pending);
    const side=game.winner,players=game.online?.teams?.[side],name=players?.length?players.map(player=>player.username).join('・'):game.cpu&&side==='w'?'CPU':side==='b'?'先手':'後手';
    const action=game.lastAction;
    const used=action?.cardId?catalog()[action.cardId]?.name||action.cardId:PIECES[action?.pieceType]||'';
    overlay.querySelector('.king-victory-player').textContent=`${name} の勝利`;
    overlay.querySelector('.king-victory-final').textContent=`相手の王将を${game.reason==='王将破壊'?'破壊':'捕獲'}${used?` · 最後の一手: ${used}`:''}`;
    pending=setTimeout(()=>{arena.classList.add('king-victory-dim');overlay.hidden=false;},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:420);
  }};
}
