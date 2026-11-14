export function installBoardKeyboard(board,{cancel}){
  let focusedIndex=0;
  board.addEventListener('keydown',event=>{
    if(event.key==='Escape'){cancel();return;}
    const width=Math.round(Math.sqrt(board.children.length));
    const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-width,ArrowDown:width}[event.key];
    if(!delta)return;
    event.preventDefault();const current=Array.prototype.indexOf.call(board.children,document.activeElement);if(current>=0)focusedIndex=current;
    const x=focusedIndex%width,y=Math.floor(focusedIndex/width),nextX=Math.max(0,Math.min(width-1,x+(delta===1?1:delta===-1?-1:0))),nextY=Math.max(0,Math.min(width-1,y+(delta===width?1:delta===-width?-1:0)));
    focusedIndex=nextY*width+nextX;board.children[focusedIndex]?.focus();
  });
  function sync(){const current=Array.prototype.indexOf.call(board.children,document.activeElement);if(current>=0)focusedIndex=current;focusedIndex=Math.max(0,Math.min(board.children.length-1,focusedIndex));for(let i=0;i<board.children.length;i++)board.children[i].tabIndex=i===focusedIndex?0:-1;}
  return {sync,focused:()=>Array.prototype.indexOf.call(board.children,document.activeElement),restore:index=>{if(index>=0){focusedIndex=Math.min(index,board.children.length-1);board.children[focusedIndex]?.focus({preventScroll:true});}}};
}

export function bindCardGestures(button,{inspect,drop}){
  let timer=0,tracking=false,dragging=false,longPressed=false,suppressClick=false,startX=0,startY=0,ghost=null;
  const cleanup=()=>{clearTimeout(timer);timer=0;ghost?.remove();ghost=null;tracking=false;dragging=false;};
  button.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'||button.disabled)return;cleanup();tracking=true;longPressed=false;startX=event.clientX;startY=event.clientY;timer=setTimeout(()=>{if(tracking&&!dragging){longPressed=true;suppressClick=true;inspect();}},520);});
  button.addEventListener('pointermove',event=>{if(!tracking||longPressed)return;const distance=Math.hypot(event.clientX-startX,event.clientY-startY);if(distance<12&&!dragging)return;clearTimeout(timer);if(!dragging&&distance>18){dragging=true;ghost=button.cloneNode(true);ghost.classList.add('card-drag-ghost');document.body.append(ghost);button.setPointerCapture?.(event.pointerId);}if(dragging&&ghost){ghost.style.left=`${event.clientX}px`;ghost.style.top=`${event.clientY}px`;event.preventDefault();}});
  button.addEventListener('pointerup',event=>{if(!tracking)return;const wasDragging=dragging,wasLong=longPressed;clearTimeout(timer);if(wasDragging){suppressClick=true;const square=document.elementFromPoint(event.clientX,event.clientY)?.closest('.square');if(square)drop(Array.prototype.indexOf.call(square.parentElement.children,square));}if(wasLong)suppressClick=true;cleanup();if(suppressClick)setTimeout(()=>{suppressClick=false;},250);});
  button.addEventListener('pointercancel',()=>{cleanup();suppressClick=false;});
  button.addEventListener('click',event=>{if(!suppressClick)return;suppressClick=false;event.preventDefault();event.stopImmediatePropagation();},true);
}
