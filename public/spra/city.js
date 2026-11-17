import { FACILITY_LABELS, FASHION_COLORS } from './facilities.js';
// SPRA: original pixel-art hub, locally simulated in every player's browser.
// The battle server remains authoritative for combat; the town is a navigable UI.
const MAP_W=176,MAP_H=118,S=16;
const tileHash=(x,y)=>{let v=(x*374761393+y*668265263)|0;v=(v^(v>>>13))*1274126177;return(v^(v>>>16))>>>0;};
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const buildings=[
 {x:45,y:26,w:26,h:24,color:'#263c65',roof:'#68d6ee',sign:'WEAPON',doorX:58,doorY:51,kind:'shop'},
 {x:99,y:23,w:30,h:27,color:'#43345d',roof:'#ffb454',sign:'BATTLE',doorX:113,doorY:51,kind:'battle'},
 {x:19,y:24,w:17,h:22,color:'#24464e',roof:'#55d6ad',sign:'FURNITURE',doorX:28,doorY:47,kind:'furniture'},
 {x:138,y:30,w:23,h:21,color:'#473655',roof:'#ce86ef',sign:'FASHION',doorX:151,doorY:52,kind:'fashion'},
 {x:27,y:85,w:25,h:23,color:'#284658',roof:'#3ff2df',sign:'WORKSHOP',doorX:39,doorY:109,kind:'workshop'},
 {x:112,y:86,w:33,h:27,color:'#31415c',roof:'#e8a859',sign:'MY ROOM',doorX:128,doorY:114,kind:'room'},
 {x:71,y:9,w:25,h:23,color:'#27384a',roof:'#af92fd',sign:'TRAINING',doorX:82,doorY:33,kind:'training'},
 {x:64,y:88,w:25,h:18,color:'#374958',roof:'#ffd163',sign:'RANKING',doorX:76,doorY:107,kind:'ranking'}
];
const bg='#112031';
function fill(ctx,x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
function drawTile(ctx,wx,wy,cameraX,cameraY,color){
  const x=Math.floor((wx-cameraX)*S),y=Math.floor((wy-cameraY)*S);
  fill(ctx,x,y,S+1,S+1,color);
}
function drawPerson(ctx,x,y,color,hat='#2d3151',arm=0,scale=1){
  x=Math.round(x);y=Math.round(y);
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  fill(ctx,-4,5,3,5,'#0d1831');fill(ctx,1,5,3,5,'#0d1831');
  fill(ctx,-6,-2,12,8,color);
  fill(ctx,-7,-7,14,8,'#f7bda5');
  fill(ctx,-8,-9,16,4,hat);
  fill(ctx,-4,-3,2,2,'#101629');fill(ctx,3,-3,2,2,'#101629');
  fill(ctx,-8,arm,2,5,'#f7bda5');fill(ctx,6,-arm,2,5,'#f7bda5');
  fill(ctx,0,-14,3,5,hat);fill(ctx,4,-12,3,5,hat);
  ctx.restore();
}
function drawSign(ctx,text,x,y,background,foreground){
 const size=Math.max(text.length*8+16,66);
 fill(ctx,x-size/2,y,size,17,background);
 fill(ctx,x-size/2+2,y+2,size-4,13,'#091725');
 ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillStyle=foreground;
 ctx.fillText(text,x,y+12);ctx.textAlign='left';
}
function drawBuilding(ctx,b,cameraX,cameraY,t) {
 const x=Math.floor((b.x-cameraX)*S),y=Math.floor((b.y-cameraY)*S),w=b.w*S,h=b.h*S;
 fill(ctx,x+7,y+8,w,h,'#061222');
 fill(ctx,x,y,w,h,b.color);
 fill(ctx,x-4,y+4,w+8,19,b.roof);
 fill(ctx,x,y+22,w,5,'#101827');
 for(let row=0;row<2;row++)for(let col=0;col<Math.floor(b.w/6);col++) {
   fill(ctx,x+22+col*88,y+66+row*100,44,42,'#091928');
   fill(ctx,x+27+col*88,y+72+row*100,32,29,(col+row)%3?'#35878a':'#cfb86a');
 }
 const doorX=(b.doorX-cameraX)*S,doorY=(b.doorY-cameraY)*S;
 fill(ctx,doorX-26,y+h-55,52,55,'#102738');
 fill(ctx,doorX-22,y+h-52,44,49,b.kind==='shop'?'#91e6dd':b.kind==='battle'?'#f0a44b':'#465767');
 fill(ctx,doorX-15,y+h-46,30,36,'#071927');
 fill(ctx,doorX-3,y+h-12,6,7,'#e6ecb9');
 drawSign(ctx,b.sign,x+w/2,y+31,b.roof,'#e9ffff');
 if(b.kind==='shop')drawPerson(ctx,doorX+19,y+h-38,'#d3ff73','#7b3b83',Math.sin(t*3)*2);
 if(b.kind==='battle')drawPerson(ctx,doorX+18,y+h-38,'#f7ad51','#1d2e56',Math.sin(t*2)*2);
}
function drawTree(ctx,x,y){fill(ctx,x-3,y-2,6,12,'#735337');fill(ctx,x-10,y-15,20,15,'#19585d');fill(ctx,x-14,y-11,28,7,'#237b80');fill(ctx,x-7,y-23,14,14,'#3c9c8d');}
function collision(x,y) {
 if(x<1||y<1||x>MAP_W-1||y>MAP_H-1)return true;
 return buildings.some(b=>x>b.x-1&&x<b.x+b.w+1&&y>b.y-1&&y<b.y+b.h);
}
export function createCity(canvas, {onShop,onBattle,onFacility,onHint,getAppearance}={}){
 const ctx=canvas.getContext('2d',{alpha:false});
 ctx.imageSmoothingEnabled=false;
 const player={x:85,y:73};
 const move={up:false,down:false,left:false,right:false};
 let run=true,active=true,camX=0,camY=0,last=performance.now(),time=0;
 const npcs=Array.from({length:15},(_,i)=>({
  x:25+(i*17)%130,y:64+(i*7)%17,
  color:['#f5aa72','#6ee2e9','#bd9bff','#eafa68'][i%4],
  phase:i*3.7,speed:.3+i*.12
 }));
 const near=()=> {
  const doors=buildings.filter(b=>b.kind&&Math.hypot(player.x-b.doorX,player.y-b.doorY)<6.2);
  return doors[0]?.kind||null;
 };
 function enterFacility(kind) {
   if(kind==='shop')onShop?.();
   else if(kind==='battle')onBattle?.();
   else if(FACILITY_LABELS[kind])onFacility?.(kind);
 }
 function interact() {
  const thing=near();
  if(thing){enterFacility(thing);return true;}
  onHint?.('施設の入り口付近へ移動してください。');
  return false;
 }
 const keyDown=e=>{
  if(!active || ['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
  const key=e.key.toLowerCase();
  if(['w','arrowup'].includes(key))move.up=true;
  if(['s','arrowdown'].includes(key))move.down=true;
  if(['a','arrowleft'].includes(key))move.left=true;
  if(['d','arrowright'].includes(key))move.right=true;
  if(key==='e'&&!e.repeat)interact();
  if(['w','a','s','d','e','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
 };
 const keyUp=e=>{
  const key=e.key.toLowerCase();
  if(['w','arrowup'].includes(key))move.up=false;
  if(['s','arrowdown'].includes(key))move.down=false;
  if(['a','arrowleft'].includes(key))move.left=false;
  if(['d','arrowright'].includes(key))move.right=false;
 };
 window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);
 canvas.addEventListener('pointerdown',e=>{
  if(!active)return;
  const box=canvas.getBoundingClientRect();
  const wx=(e.clientX-box.left)*canvas.width/box.width/S+camX;
  const wy=(e.clientY-box.top)*canvas.height/box.height/S+camY;
  const b=buildings.find(b=>b.kind&&wx>b.x&&wx<b.x+b.w&&wy>b.y&&wy<b.y+b.h);
  if(b)enterFacility(b.kind);
 });
 function frame(now) {
  if(!run)return;
  // The hub is hidden while playing. Keep its callback alive but do no
  // offscreen pixel-city rendering or NPC simulation during a battle.
  if(!active){ last=now; requestAnimationFrame(frame); return; }
  const dt=Math.min(.05,(now-last)/1000);last=now;time+=dt;
  if(active){
   let x=(+move.right)-(+move.left),y=(+move.down)-(+move.up);
   const d=Math.hypot(x,y);if(d>1){x/=d;y/=d;}
   const speed=13;
   if(!collision(player.x+x*dt*speed,player.y))player.x+=x*dt*speed;
   if(!collision(player.x,player.y+y*dt*speed))player.y+=y*dt*speed;
  }
  const width=canvas.width/S,height=canvas.height/S;
  const targetX=clamp(player.x-width/2,0,MAP_W-width);
  const targetY=clamp(player.y-height/2,0,MAP_H-height);
  camX+=(targetX-camX)*Math.min(1,dt*8);
  camY+=(targetY-camY)*Math.min(1,dt*8);
  fill(ctx,0,0,canvas.width,canvas.height,bg);
  const x0=Math.max(0,Math.floor(camX)),y0=Math.max(0,Math.floor(camY));
  const x1=Math.min(MAP_W-1,x0+Math.ceil(width)+2),y1=Math.min(MAP_H-1,y0+Math.ceil(height)+2);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const isRoad=(y>48&&y<85)||(x>75&&x<94);
   const c=isRoad?((x+y)%2===0?'#2b4151':'#2a3d4e'):
     (tileHash(x,y)%5===0?'#1e4451':'#1b3c49');
   drawTile(ctx,x,y,camX,camY,c);
   if(isRoad&&x%8===0&&y%10===0){
    fill(ctx,Math.floor((x-camX)*S+2),Math.floor((y-camY)*S+6),8,2,'#506271');
   }
  }
  for(let x=13;x<164;x+=17) {
   for(const y of [53,81]) {
    const px=(x-camX)*S,py=(y-camY)*S;
    drawTree(ctx,px,py);
   }
  }
  for(const b of buildings) drawBuilding(ctx,b,camX,camY,time);
  for(const npc of npcs) {
   const x=npc.x+Math.sin(time*npc.speed+npc.phase)*10;
   const y=npc.y+Math.cos(time*npc.speed+npc.phase)*3;
   if(buildings.some(b=>x>b.x&&x<b.x+b.w&&y>b.y&&y<b.y+b.h))continue;
   drawPerson(ctx,(x-camX)*S,(y-camY)*S,npc.color,'#29334e',Math.floor(time*6+npc.phase)%2?2:-2);
  }
  // Player is rendered last, with a bright pixel outline and directional marker.
  const px=(player.x-camX)*S,py=(player.y-camY)*S;
  fill(ctx,Math.round(px)-13,Math.round(py)-24,26,33,'#d7f9ff');
  const appearance=getAppearance?.()||{};
  drawPerson(ctx,px,py,FASHION_COLORS[appearance.shirt]||'#a3ff4a',
    FASHION_COLORS[appearance.hat]||'#3740a1',Math.floor(time*8)%2?2:-2);
  fill(ctx,Math.round(px)-2,Math.round(py)-30,5,5,'#c8ff60');
  const target=near();
  if(target) {
   const label='E : '+(FACILITY_LABELS[target]||'入る');
   fill(ctx,canvas.width/2-105,canvas.height-68,210,29,'#101728');
   fill(ctx,canvas.width/2-103,canvas.height-66,206,25,'#c7ff67');
   ctx.font='bold 17px monospace';ctx.textAlign='center';ctx.fillStyle='#162135';
   ctx.fillText(label,canvas.width/2,canvas.height-48);ctx.textAlign='left';
  }
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
 return {
  setActive(value){active=Boolean(value);for(const k of Object.keys(move))move[k]=false;},
  control(name,pressed){if(Object.hasOwn(move,name))move[name]=pressed;},
  interact,
  getPlayer:()=>({...player}),
  destroy(){run=false;window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);}
 };
}
