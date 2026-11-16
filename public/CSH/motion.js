const GLYPHS={K:'王',R:'飛',B:'角',G:'金',S:'銀',N:'桂',L:'香',P:'歩'};
const PROMOTED={R:'龍',B:'馬',S:'全',N:'圭',L:'杏',P:'と'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function createMotionPlayer({board,cardDetails,sound,reducedMotion,skinForEvent}){
  let lastGame='',lastRevision=-1,generation=0,summon=null,boardOverlay=null;
  const activeImpacts=new Set();
  const reduced=()=>reducedMotion?.()??window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function square(index){return Number.isInteger(index)?board.children[index]||null:null;}
  function center(index){const rect=square(index)?.getBoundingClientRect();return rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2,width:rect.width,height:rect.height}:null;}
  function impact(index,tone='move'){
    const point=center(index);if(!point)return;
    const ring=document.createElement('span');ring.className=`motion-impact motion-${tone}`;ring.style.left=`${point.x}px`;ring.style.top=`${point.y}px`;ring.style.width=`${point.width*1.3}px`;ring.style.height=`${point.height*1.3}px`;document.body.append(ring);activeImpacts.add(ring);setTimeout(()=>{ring.remove();activeImpacts.delete(ring);},reduced()?120:520);
  }
  function label(event){const card=cardDetails?.(event.cardId);if(!card)return;summon?.remove();const selected=skinForEvent?.(event)||'default',skin=['hologram','gold','rainbow','glitch'].includes(selected)?selected:'default';const el=document.createElement('div');el.className=`motion-card-summon skin-${skin}`;el.setAttribute('role','img');el.setAttribute('aria-label',`${card.name}を使用`);if(card.imagePath){const art=document.createElement('img');art.src=card.imagePath;art.alt='';el.append(art);}const title=document.createElement('strong');title.textContent=card.name;el.append(title);document.body.append(el);summon=el;setTimeout(()=>{el.remove();if(summon===el)summon=null;},reduced()?160:680);}
  function boardEffect(kind){if(reduced())return;boardOverlay?.remove();const effect=document.createElement('span');effect.className=`motion-board-effect motion-board-${kind}`;board.parentElement?.append(effect);boardOverlay=effect;setTimeout(()=>{effect.remove();if(boardOverlay===effect)boardOverlay=null;},450);}
  async function animate(event,token){
    if(token!==generation||!board.isConnected||document.hidden)return;
    const tone=event.fx|| (event.kind==='card'||event.kind==='activate'?'card':event.capture?'capture':event.promoted?'promote':'move');
    if(event.kind==='card'||event.kind==='activate')label(event);
    if(event.fx==='rule'||event.fx==='steal')boardEffect(event.fx);
    if(event.kind==='move'||event.kind==='drop'||Number.isInteger(event.from)&&Number.isInteger(event.to)){
      const end=center(event.to),start=event.kind==='drop'?end&&{...end,y:end.y-end.height}:center(event.from);
      if(start&&end){
        const ghost=document.createElement('span');ghost.className=`motion-ghost piece${event.side==='w'?' white':''}${event.promoted?' promoted':''}`;
        ghost.textContent=event.promoted?PROMOTED[event.pieceType]||GLYPHS[event.pieceType]:GLYPHS[event.pieceType]||'◆';
        ghost.style.left=`${start.x-start.width*.38}px`;ghost.style.top=`${start.y-start.height*.44}px`;
        ghost.style.width=`${start.width*.76}px`;ghost.style.height=`${start.height*.88}px`;
        document.body.append(ghost);
        const finalToken=square(event.to)?.querySelector('.piece');if(finalToken)finalToken.classList.add('motion-hidden');
        if(!reduced())await Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),wait(100)]);
        ghost.style.left=`${end.x-end.width*.38}px`;ghost.style.top=`${end.y-end.height*.44}px`;
        await wait(reduced()?30:event.kind==='card'||event.kind==='activate'?140:250);
        ghost.remove();finalToken?.classList.remove('motion-hidden');
        if(token!==generation)return;
      }
    }
    impact(event.target??event.to??Math.floor(board.children.length/2),tone);
    if(event.kind==='card'||event.kind==='activate')for(const index of (event.removed||[]).slice(0,6))impact(index,'capture');
    sound?.(tone);
    await wait(reduced()?20:50);
  }
  function play(game){
    if(!game?.visualEvents?.length)return;
    if(lastGame!==game.id){lastGame=game.id;lastRevision=-1;}
    if(game.revision<=lastRevision)return;
    lastRevision=game.revision;const token=++generation,events=game.visualEvents.slice(-4);
    summon?.remove();summon=null;boardOverlay?.remove();boardOverlay=null;for(const ring of activeImpacts)ring.remove();activeImpacts.clear();
    (async()=>{for(const event of events){if(token!==generation)break;await animate(event,token);}})().catch(()=>{});
  }
  return {play};
}
