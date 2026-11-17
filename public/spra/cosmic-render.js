// Pure Canvas 2D pixel-style overlays for SPRA cosmic equipment and specials.
// Draw in world coordinates after the floor, but BEFORE avatars so targets stay visible.
const COLORS=['#23d7ef','#ff9c35'];
const rect=(ctx,x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));};
function star(ctx,x,y,r,color){
 const points=[[0,-1],[.25,-.25],[1,-.32],[.4,.17],[.63,.94],[0,.55],[-.63,.94],[-.4,.17],[-1,-.32],[-.25,-.25]];
 ctx.fillStyle=color;ctx.beginPath();
 points.forEach(([u,v],i)=>{const px=Math.round(x+u*r),py=Math.round(y+v*r);
  if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
 });
 ctx.closePath();ctx.fill();
 rect(ctx,x-r*.15,y-r*.2,r*.3,r*.3,'#fff8ca');
}
export function drawCosmic(ctx,game){
 const {specials=[],shots=[],effects=[],cameraX=0,cameraY=0,tile=16,
  width=960,height=600,elapsed=0,now=0}=game;
 const big=16,frontier=specials.some(s=>s.kind==='frontier');
 if(frontier){
  // Light dimming is deliberately behind players and UI, never covering enemies.
  rect(ctx,cameraX*tile,cameraY*tile,width,height,'#0b103c76');
  for(let i=0;i<40;i++){
   const x=(i*223.7+125)%(160*tile);
   const y=(i*173.4+87)%(100*tile);
   if(x<cameraX*tile-10||x>cameraX*tile+width+10||
      y<cameraY*tile-10||y>cameraY*tile+height+10)continue;
   star(ctx,x,y,2+(i%4),'#d5e5ff');
  }
 }
 for(const o of specials){
  const x=o.x*tile,y=o.y*tile;
  if(o.kind==='gravity_balloon'){
   ctx.save();ctx.globalAlpha=.65;
   ctx.fillStyle='#a4a4f566';ctx.strokeStyle='#efd7ff';ctx.lineWidth=3;
   const radius=Math.max(7,(o.radius||.5)*tile);
   ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.restore();
   for(let i=0;i<6;i++){
    const a=i*Math.PI/3+elapsed*2;
    star(ctx,x+Math.cos(a)*radius*.78,y+Math.sin(a)*radius*.78,4,'#ffeeb3');
   }
  }else if(o.kind==='frontier'){
    const tx=o.targetX*tile,ty=o.targetY*tile;
    if(o.phase==='launch'){
     ctx.strokeStyle='#efe7ff';ctx.lineWidth=4;
     ctx.beginPath();ctx.arc(x,y,24+Math.sin(elapsed*10)*3,0,Math.PI*2);ctx.stroke();
     star(ctx,x,y-28,12,'#fff4bb');
    }else if(o.phase==='star_rain'){
     for(let i=0;i<22;i++){
      const angle=i*2.39996+elapsed*.3;
      const d=Math.sqrt((i+.5)/22)*86;
      const yy=ty+Math.sin(angle)*d-((elapsed*43+i*17)%55);
      star(ctx,tx+Math.cos(angle)*d,yy,4+(i%4)*2,'#f9f0b5');
     }
    }else if(o.phase==='moon_crash'){
     const radius=Math.max(30,(o.radius||7)*tile*.65);
     ctx.save();ctx.globalAlpha=.62;ctx.fillStyle='#c8c2ff';
     ctx.beginPath();ctx.arc(tx,ty,radius,0,Math.PI*2);ctx.fill();
     ctx.restore();
     star(ctx,tx,ty,24,'#fff9c0');
    }
  }else if(o.kind==='tornado'){
   for(let i=0;i<13;i++){const a=elapsed*5+i*.73,r=8+i*3;
    rect(ctx,x+Math.cos(a)*r,y+Math.sin(a)*r,7,7,COLORS[o.team]);
   }
  }else if(o.kind==='missile')star(ctx,x,y,11,'#fff0a7');
  else if(o.kind==='turret'){
   rect(ctx,x-18,y-14,36,28,'#152c45');
   rect(ctx,x-10,y-22,20,18,COLORS[o.team]);
   rect(ctx,x+7,y-4,18,7,'#ddff94');
  }
 }
 for(const shot of shots){
  const x=shot.x*tile,y=shot.y*tile,r=8+(shot.radius||.5)*9;
  ctx.save();ctx.globalAlpha=.22;
  ctx.fillStyle=COLORS[shot.team];ctx.beginPath();
  ctx.arc(x,y,r*1.5,0,Math.PI*2);ctx.fill();ctx.restore();
  star(ctx,x,y,r,shot.team===0?'#5afaff':'#ffbd69');
 }
 for(const fx of effects){
  if(!['gum_pop','bubble_pop','moon_crash','star_rain','gum_launch'].includes(fx.type))continue;
  const age=Math.max(0,Math.min(1,(now-fx.time)/600)),fade=1-age;
  ctx.save();ctx.globalAlpha=fade*.85;
  const radius=(fx.radius|| (fx.type==='moon_crash'?7.2:2.5))*tile*age;
  const x=fx.x*tile,y=fx.y*tile;
  for(let i=0;i<16;i++){
   const a=i*Math.PI*2/16+elapsed;
   const d=radius*(.55+(i%4)*.13);
   star(ctx,x+Math.cos(a)*d,y+Math.sin(a)*d,3+(i%3)*2,COLORS[fx.team]);
  }
  ctx.restore();
 }
}
