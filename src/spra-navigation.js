// Server-side turf navigation: wall ink and connected-team-ink landing checks.
// Pure functions are tested independently to avoid bypassing the PvP server.
export function wallAt(walls, x, y, margin = 0) {
  return walls.findIndex(w => x >= w.x - margin && y >= w.y - margin &&
    x <= w.x + w.w + margin && y <= w.y + w.h + margin);
}

export function isBlocked(walls, width, height, x, y, margin = .36) {
  return x < 1 + margin || y < 1 + margin ||
    x > width - 1 - margin || y > height - 1 - margin ||
    wallAt(walls, x, y, margin) >= 0;
}

// Return a landing on the *same connected patch of friendly ink* as the
// departure tile. BFS is intentionally grid-bounded (160*100 tiles at most).
export function connectedInkLanding({ink, width, height, walls}, start, target, team) {
  if ((team !== 0 && team !== 1) ||
      ![start.x,start.y,target.x,target.y].every(Number.isFinite)) return null;
  const cols = Math.ceil(width), rows = Math.ceil(height);
  const targetX = Math.floor(target.x), targetY = Math.floor(target.y);
  if (targetX < 0 || targetY < 0 || targetX >= cols || targetY >= rows) return null;
  const allowed = new Uint8Array(cols * rows);
  const point = (x,y) => ({ x:x+.5,y:y+.5 });
  const isFriendly = (x,y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const px=x+.5,py=y+.5;
    return !isBlocked(walls,width,height,px,py,.15) &&
      (ink.sample(px,py)===team+1 ||
        ink.sample(px-.2,py)===team+1 ||
        ink.sample(px+.2,py)===team+1 ||
        ink.sample(px,py-.2)===team+1 ||
        ink.sample(px,py+.2)===team+1);
  };
  function nearest(pointIn) {
    const baseX=Math.floor(pointIn.x),baseY=Math.floor(pointIn.y);
    for(let radius=0;radius<=2;radius++){
      for(let y=baseY-radius;y<=baseY+radius;y++){
        for(let x=baseX-radius;x<=baseX+radius;x++){
          if(Math.max(Math.abs(x-baseX),Math.abs(y-baseY))!==radius)continue;
          if(isFriendly(x,y))return {x,y};
        }
      }
    }
    return null;
  }
  const source=nearest(start),destination=nearest(target);
  if(!source||!destination)return null;
  const sourceIndex=source.y*cols+source.x;
  const targetIndex=destination.y*cols+destination.x;
  const queue=new Int32Array(cols*rows);
  let head=0,tail=1;
  queue[0]=sourceIndex;
  allowed[sourceIndex]=1;
  while(head<tail){
    const index=queue[head++];
    if(index===targetIndex)return point(destination.x,destination.y);
    const x=index%cols,y=Math.floor(index/cols);
    const candidates=[
      [x-1,y],[x+1,y],[x,y-1],[x,y+1]
    ];
    for(const [nx,ny] of candidates){
      if(nx<0||ny<0||nx>=cols||ny>=rows)continue;
      const ni=ny*cols+nx;
      if(allowed[ni]||!isFriendly(nx,ny))continue;
      allowed[ni]=1;queue[tail++]=ni;
    }
  }
  return null;
}

// A submerged player can climb *across* a wall coated with their own colour.
// This is not noclip: there must be clear floor on the far side.
export function wallCrossLanding({walls,width,height,wallInk},player,moveX,moveY) {
  if(!player.input?.swim||player.ink < 16||player.wallCd>0)return null;
  const length=Math.hypot(moveX,moveY);
  if(length<.45)return null;
  const dx=moveX/length,dy=moveY/length;
  let touched=-1;
  for(let step=.45;step<=2;step+=.3){
    const wx=player.x+dx*step,wy=player.y+dy*step;
    const index=wallAt(walls,wx,wy,.22);
    if(index>=0){touched=index;break;}
  }
  if(touched<0||wallInk[touched]!==player.team+1)return null;
  const wall=walls[touched];
  // Advance across the same obstacle until a clear exit is reached.
  const maxDistance=Math.min(30,Math.hypot(wall.w,wall.h)+5);
  for(let d=1;d<=maxDistance;d+=.5){
    const x=player.x+dx*d,y=player.y+dy*d;
    if(d<1.4||!isBlocked(walls,width,height,x,y,.45)) {
      if(d>=1.4&&!isBlocked(walls,width,height,x,y,.45)){
        // Do not exit inside any neighbouring obstacle.
        return {x,y,wallIndex:touched};
      }
    }
  }
  return null;
}
