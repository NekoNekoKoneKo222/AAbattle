// SPRA first-run hands-on tutorial, entirely offline and independent of PvP rooms.
// Original pixel-art practice course: move -> aim/fire -> paint -> swim ->
// regenerate -> throw bomb -> shoot targets -> enter the city.
const TW=48,TH=30,SCALE=20;
const $=id=>document.getElementById(id);
const KEYMAP={w:'up',arrowup:'up',s:'down',arrowdown:'down',
  a:'left',arrowleft:'left',d:'right',arrowright:'right'};
const STEPS=[
 {title:'まずは歩こう！',message:'WASD・方向キーで移動してみよう。タブレットでは左下の方向ボタンを使おう。',goal:'8マス分移動する'},
 {title:'インクを撃とう！',message:'マウスで照準を動かし、クリックで撃とう！ 画面タップやSHOTボタンでも撃てるよ。',goal:'的に3発命中させる'},
 {title:'地面を染めよう！',message:'インク弾が着弾すると、地面が自分の色に染まる。たくさん撃ってみよう！',goal:'40マス分の新しい地面を塗る'},
 {title:'インクに潜ろう！',message:'青い自分のインク上でShiftを長押し！ タブレットでは「潜る」を押し続けよう。',goal:'1秒間、インクの中に潜る'},
 {title:'インクを補充！',message:'潜伏中はインクとHPが速く回復するよ。自分のインクに潜ったまま回復しよう！',goal:'インクを160以上まで回復する'},
 {title:'ボムを投げよう！',message:'Qでボムを投げよう！ ボムは地面に落ちてから爆発して、広い範囲を塗るよ。',goal:'ボムを投げて爆発させる'},
 {title:'準備完了！',message:'これで基本操作はバッチリ。街のバトル受付でPvPを始められるよ！',goal:'カラフルシティへ出発'}
];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function createSpraTutorial(canvas,{onComplete=()=>{},onSkip=()=>{}}={}){
 const ctx=canvas.getContext('2d',{alpha:false});
 ctx.imageSmoothingEnabled=false;
 const paintCanvas=document.createElement('canvas');paintCanvas.width=TW*4;paintCanvas.height=TH*4;
 const paintCtx=paintCanvas.getContext('2d');
 const tiles=new Uint8Array(TW*TH);
 const obstacles=[{x:20,y:7,w:3,h:6},{x:32,y:19,w:3,h:5}];
 let player={x:8,y:15,aim:0,ink:220,hp:65,swim:false},aim={x:26,y:15};
 let running=false,step=0,moved=0,hitCount=0,newPaint=0,swimTime=0,shotCD=0,bomb=null,bombHits=0,last=performance.now(),clock=0,paintStart=0;
 let shots=[],effects=[],pointerDown=false,swimHeld=false,stickId=null;
 const move={up:false,down:false,left:false,right:false};
 const object=document.querySelector('#tutorialTarget');
 const counter=$('tutorialCounter'),heading=$('tutorialHeading'),description=$('tutorialDescription'),objective=$('tutorialObjective');
 const finish=$('tutorialFinish'),skip=$('tutorialSkip'),swimBtn=$('tutorialSwim'),fireBtn=$('tutorialFire'),bombBtn=$('tutorialBomb');
 const dpad=$('tutorialDpad');
 function solid(x,y){
  if(x<1||y<1||x>TW-1||y>TH-1)return true;
  return obstacles.some(o=>x>=o.x-.35&&x<=o.x+o.w+.35&&y>=o.y-.35&&y<=o.y+o.h+.35);
 }
 function drawBox(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));}
 function tileAt(x,y){return tiles[Math.floor(y)*TW+Math.floor(x)]===1;}
 function paintSpot(x,y,r=1.2){
  const seed=Math.sin((x+y)*17.2+clock*13)*36;
  const loX=clamp(Math.floor(x-r*1.4),0,TW-1),hiX=clamp(Math.ceil(x+r*1.4),0,TW-1);
  const loY=clamp(Math.floor(y-r*1.4),0,TH-1),hiY=clamp(Math.ceil(y+r*1.4),0,TH-1);
  for(let cy=loY;cy<=hiY;cy++)for(let cx=loX;cx<=hiX;cx++){
    if(solid(cx+.5,cy+.5))continue;
    const angle=Math.atan2(cy+.5-y,cx+.5-x);
    const edge=1+Math.sin(5*angle+seed)*.17+Math.cos(9*angle-seed)*.1;
    if(Math.hypot(cx+.5-x,cy+.5-y)>r*edge)continue;
    const index=cy*TW+cx;
    if(!tiles[index]){tiles[index]=1;newPaint++;}
    paintCtx.fillStyle=((cx*9+cy*7)%5===0)?'#10aec8':'#29d6f4';
    paintCtx.fillRect(cx*4,cy*4,4,4);
  }
  // Detached little droplets keep splashes organic instead of perfect squares.
  for(let i=0;i<7;i++){
    const a=i*2.399+seed,dist=r*(.7+(i%3)*.15);
    const xx=Math.floor(x+Math.cos(a)*dist),yy=Math.floor(y+Math.sin(a)*dist);
    if(xx>0&&yy>0&&xx<TW&&yy<TH&&!solid(xx+.5,yy+.5)){
      if(!tiles[yy*TW+xx]){tiles[yy*TW+xx]=1;newPaint++;}
      paintCtx.fillStyle='#29d6f4';paintCtx.fillRect(xx*4,yy*4,4,4);
    }
  }
 }
 function refreshStep(){
  const info=STEPS[step];
  if(!info)return;
  counter.textContent='TUTORIAL  '+String(step+1).padStart(2,'0')+' / '+String(STEPS.length).padStart(2,'0');
  heading.textContent=info.title;
  description.textContent=info.message;
  objective.textContent=info.goal;
  finish.classList.toggle('hidden',step!==STEPS.length-1);
  if(step===2)paintStart=newPaint;
  if(step===3){paintSpot(player.x,player.y,2.5);swimTime=0;}
  if(step===4){paintSpot(player.x,player.y,2.5);player.ink=56;player.hp=50;}
  if(step===5)player.ink=Math.max(100,player.ink);
 }
 function advance(){
  if(step>=STEPS.length-1)return;
  step++;
  effects.push({type:'message',time:clock});
  refreshStep();
 }
 function shoot(){
  if(!running||shotCD>0||player.ink<8||step===STEPS.length-1)return;
  shotCD=.14;player.ink-=8;
  const angle=Math.atan2(aim.y-player.y,aim.x-player.x);
  player.aim=angle;
  const dx=Math.cos(angle),dy=Math.sin(angle);
  let end={x:player.x,y:player.y};
  let targetHit=false;
  for(let dist=.7;dist<21;dist+=.55){
    const x=player.x+dx*dist,y=player.y+dy*dist;
    if(solid(x,y))break;
    end={x,y};
    if(Math.hypot(x-26,y-15)<1.5)targetHit=true;
  }
  for(let k=0;k<6;k++){
    const t=(k+1)/6;
    paintSpot(player.x+dx*t*Math.min(14,Math.hypot(end.x-player.x,end.y-player.y)),
      player.y+dy*t*Math.min(14,Math.hypot(end.x-player.x,end.y-player.y)),.48);
  }
  paintSpot(end.x,end.y,1.4);
  if(targetHit){
    hitCount++;effects.push({type:'hit',time:clock,x:26,y:15});
  }
  shots.push({x:player.x,y:player.y,tx:end.x,ty:end.y,time:clock});
  if(step===1&&hitCount>=3)advance();
  if(step===2&&newPaint-paintStart>=40)advance();
 }
 function throwBomb(){
  if(!running||bomb||step===STEPS.length-1||player.ink<28)return;
  player.ink-=28;
  const dx=Math.cos(player.aim),dy=Math.sin(player.aim);
  bomb={x:player.x,y:player.y,dx,dy,t:0};
 }
 function complete(){
  if(!running)return;
  stop();onComplete();
 }
 function skipTutorial(){
  stop();onSkip();
 }
 finish.addEventListener('click',complete);
 skip.addEventListener('click',skipTutorial);
 const keyDown=e=>{
  if(!running||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  const key=e.key.toLowerCase();
  if(KEYMAP[key])move[KEYMAP[key]]=true;
  if(key==='shift')swimHeld=true;
  if((key===' '||key==='enter')&&!e.repeat)shoot();
  if(key==='q'&&!e.repeat)throwBomb();
  if(KEYMAP[key]||[' ','enter','shift','q'].includes(key))e.preventDefault();
 };
 const keyUp=e=>{
  const key=e.key.toLowerCase();
  if(KEYMAP[key])move[KEYMAP[key]]=false;
  if(key==='shift')swimHeld=false;
 };
 const blur=()=>{Object.keys(move).forEach(k=>move[k]=false);swimHeld=false;pointerDown=false;};
 window.addEventListener('keydown',keyDown);
 window.addEventListener('keyup',keyUp);
 window.addEventListener('blur',blur);
 function aimEvent(e){
  const rect=canvas.getBoundingClientRect();
  aim={x:clamp((e.clientX-rect.left)*TW/rect.width,0,TW),
       y:clamp((e.clientY-rect.top)*TH/rect.height,0,TH)};
  player.aim=Math.atan2(aim.y-player.y,aim.x-player.x);
 }
 canvas.addEventListener('pointermove',e=>{if(running)aimEvent(e);});
 canvas.addEventListener('pointerdown',e=>{if(!running)return;aimEvent(e);pointerDown=true;shoot();});
 window.addEventListener('pointerup',()=>{pointerDown=false;});
 fireBtn.addEventListener('pointerdown',e=>{e.preventDefault();shoot();pointerDown=true;});
 for(const event of ['pointerup','pointercancel'])fireBtn.addEventListener(event,()=>{pointerDown=false;});
 swimBtn.addEventListener('pointerdown',e=>{e.preventDefault();swimBtn.setPointerCapture(e.pointerId);swimHeld=true;});
 for(const event of ['pointerup','pointercancel'])swimBtn.addEventListener(event,()=>{swimHeld=false;});
 bombBtn.addEventListener('pointerdown',e=>{e.preventDefault();throwBomb();});
 for(const button of dpad.querySelectorAll('[data-tutorial-move]')){
  const direction=button.dataset.tutorialMove;
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);move[direction]=true;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])
    button.addEventListener(event,()=>{move[direction]=false;});
 }
 function render(now){
  if(!running)return;
  requestAnimationFrame(render);
  if(now-last<25)return;
  const dt=Math.min(.05,(now-last)/1000);last=now;clock+=dt;shotCD=Math.max(0,shotCD-dt);
  let dx=(+move.right)-(+move.left),dy=(+move.down)-(+move.up);
  const d=Math.hypot(dx,dy);
  if(d>1){dx/=d;dy/=d;}
  const swimming=swimHeld&&tileAt(player.x,player.y);
  player.swim=swimming;
  const speed=swimming?11:7.5;
  const nx=player.x+dx*dt*speed,ny=player.y+dy*dt*speed;
  if(!solid(nx,player.y))player.x=nx;
  if(!solid(player.x,ny))player.y=ny;
  moved+=Math.hypot(dx,dy)*dt*speed;
  if(step===0&&moved>=8)advance();
  if(swimming){player.ink=clamp(player.ink+120*dt,0,300);player.hp=clamp(player.hp+24*dt,0,100);}
  else player.ink=clamp(player.ink+4*dt,0,300);
  if(step===3&&swimming)swimTime+=dt;
  if(step===3&&swimTime>=1.0)advance();
  if(step===4&&player.ink>=160)advance();
  if(pointerDown&&shotCD<=0&&!swimming)shoot();
  if(bomb){
    bomb.t+=dt;
    if(bomb.t>=.68){
      const bx=clamp(bomb.x+bomb.dx*8,1,TW-1),by=clamp(bomb.y+bomb.dy*8,1,TH-1);
      paintSpot(bx,by,3.3);
      effects.push({type:'bomb',time:clock,x:bx,y:by});
      bomb=null;bombHits++;
      if(step===5)advance();
    }
  }
  ctx.fillStyle='#142438';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let y=0;y<TH;y++)for(let x=0;x<TW;x++){
    drawBox(x*SCALE,y*SCALE,SCALE,SCALE,(x+y)%2?'#263a4c':'#223546');
    if((x*13+y*7)%19===0)drawBox(x*SCALE+4,y*SCALE+5,2,2,'#41556b');
  }
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(paintCanvas,0,0,canvas.width,canvas.height);
  for(const o of obstacles){
    drawBox(o.x*SCALE+6,o.y*SCALE+9,o.w*SCALE,o.h*SCALE,'#071423');
    drawBox(o.x*SCALE,o.y*SCALE,o.w*SCALE,o.h*SCALE,'#485f78');
    drawBox(o.x*SCALE+6,o.y*SCALE+6,o.w*SCALE-12,o.h*SCALE-12,'#607e8b');
  }
  // Bright visible target: easy to see and shoot before entering PvP.
  const targetX=26*SCALE,targetY=15*SCALE;
  drawBox(targetX-25,targetY-27,50,55,'#152535');
  drawBox(targetX-20,targetY-22,40,44,'#f68f39');
  drawBox(targetX-12,targetY-13,24,26,'#fff4b7');
  drawBox(targetX-6,targetY-6,12,12,'#ff9053');
  ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillStyle='#fbf6c6';
  ctx.fillText('TARGET',targetX,targetY-40);ctx.textAlign='left';
  for(const effect of effects.filter(f=>clock-f.time<.55)){
    const age=(clock-effect.time)/.55;
    if(effect.type==='bomb'||effect.type==='hit'){
      const radius=(effect.type==='bomb'?3.6:1.3)*SCALE*age;
      ctx.strokeStyle=effect.type==='bomb'?'#a6ff65':'#f8ffa9';
      ctx.lineWidth=6*(1-age)+1;ctx.beginPath();
      ctx.arc(effect.x*SCALE,effect.y*SCALE,radius,0,2*Math.PI);ctx.stroke();
    }
  }
  effects=effects.filter(f=>clock-f.time<.65);
  shots=shots.filter(f=>clock-f.time<.22);
  for(const shot of shots){
    ctx.globalAlpha=1-(clock-shot.time)/.22;
    ctx.strokeStyle='#c0fff7';ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(shot.x*SCALE,shot.y*SCALE);
    ctx.lineTo(shot.tx*SCALE,shot.ty*SCALE);ctx.stroke();ctx.globalAlpha=1;
  }
  if(bomb){
    const x=(bomb.x+bomb.dx*8*bomb.t/.68)*SCALE;
    const y=(bomb.y+bomb.dy*8*bomb.t/.68)*SCALE;
    const z=Math.sin(Math.PI*bomb.t/.68)*60;
    drawBox(x-9,y-z-9,18,18,'#fcbb69');
    drawBox(x-3,y-z-15,6,7,'#ebffbb');
  }
  const px=player.x*SCALE,py=player.y*SCALE;
  if(swimming){
    drawBox(px-13,py-6,26,15,'#1e9cba');
    drawBox(px-7,py-4,14,8,'#c1fff6');
  }else{
    drawBox(px-13,py+2,9,13,'#0c1e2c');
    drawBox(px+4,py+2,9,13,'#0c1e2c');
    drawBox(px-14,py-11,28,17,'#d5ff68');
    drawBox(px-9,py-23,18,15,'#f3b996');
    drawBox(px-14,py-23,28,7,'#5f61a7');
    drawBox(px-7,py-15,3,3,'#0a2131');
    drawBox(px+5,py-15,3,3,'#0a2131');
    const ang=player.aim;
    ctx.save();ctx.translate(px,py);ctx.rotate(ang);
    drawBox(8,-4,20,8,'#192e45');
    drawBox(21,-3,10,6,'#e7ff90');ctx.restore();
  }
  const crossX=aim.x*SCALE,crossY=aim.y*SCALE;
  ctx.strokeStyle='#eaff9e';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(crossX-13,crossY);ctx.lineTo(crossX-5,crossY);
  ctx.moveTo(crossX+5,crossY);ctx.lineTo(crossX+13,crossY);
  ctx.moveTo(crossX,crossY-13);ctx.lineTo(crossX,crossY-5);
  ctx.moveTo(crossX,crossY+5);ctx.lineTo(crossX,crossY+13);ctx.stroke();
  drawBox(18,18,192,38,'#0b203be5');
  ctx.font='bold 13px monospace';ctx.fillStyle='#e9ffb0';
  ctx.fillText('HP '+Math.round(player.hp)+'   INK '+Math.round(player.ink)+'/300',32,41);
  if(step===1) objective.textContent='的に命中：'+hitCount+' / 3';
  if(step===2) objective.textContent='塗装：'+Math.max(0,newPaint-paintStart)+' / 40';
  if(step===3) objective.textContent='潜伏：'+swimTime.toFixed(1)+' / 1.0秒';
  if(step===4) objective.textContent='インク：'+Math.round(player.ink)+' / 160';
  if(step===0) objective.textContent='移動：'+Math.floor(moved)+' / 8';
 }
 function start(){
  running=true;step=0;moved=0;hitCount=0;newPaint=0;swimTime=0;bombHits=0;paintStart=0;shotCD=0;
  player={x:8,y:15,aim:0,ink:220,hp:65,swim:false};aim={x:26,y:15};
  tiles.fill(0);paintCtx.clearRect(0,0,paintCanvas.width,paintCanvas.height);
  paintSpot(8,15,1.6);bomb=null;shots=[];effects=[];last=performance.now();
  refreshStep();requestAnimationFrame(render);
 }
 function stop(){running=false;blur();}
 return {start,stop,isRunning:()=>running,getStep:()=>step,complete,skip:skipTutorial};
}
