import { randomUUID, randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createInkSurface, INK_SCALE } from './spra-ink.js';
import { SPRA_WEAPONS } from '../public/spra/weapons.js';
import { SPRA_SPECIALS } from '../public/spra/specials.js';
import { createSpraLeaderboard } from './spra-leaderboard.js';
import { wallAt, isBlocked, wallCrossLanding, connectedInkLanding } from './spra-navigation.js';
export { SPRA_WEAPONS };

export const SPRA_WIDTH = 160;
export const SPRA_HEIGHT = 100;
export const SPRA_DURATION = 180;
export const SPRA_INK_MAX = 300;
const MAX_HUMANS = 8;
const STEP = 0.05;
const COLORS = ['#25d4f5', '#ff9c28'];
const WALLS = [
  { x: 26, y: 14, w: 9, h: 17 }, { x: 125, y: 69, w: 9, h: 17 },
  { x: 26, y: 69, w: 9, h: 17 }, { x: 125, y: 14, w: 9, h: 17 },
  { x: 51, y: 30, w: 14, h: 9 }, { x: 95, y: 61, w: 14, h: 9 },
  { x: 51, y: 61, w: 14, h: 9 }, { x: 95, y: 30, w: 14, h: 9 },
  { x: 75, y: 43, w: 10, h: 14 },
  { x: 12, y: 44, w: 10, h: 12 }, { x: 138, y: 44, w: 10, h: 12 },
  { x: 77, y: 10, w: 6, h: 12 }, { x: 77, y: 78, w: 6, h: 12 },
  { x: 38, y: 46, w: 5, h: 8 }, { x: 117, y: 46, w: 5, h: 8 }
];
const roomCode = () => randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearWall = (x, y, radius = 0.38) => x < 1 + radius || y < 1 + radius ||
  x > SPRA_WIDTH - 1 - radius || y > SPRA_HEIGHT - 1 - radius ||
  WALLS.some(r => x + radius > r.x && x - radius < r.x + r.w &&
    y + radius > r.y && y - radius < r.y + r.h);
const validTile = (x, y) => x >= 0 && y >= 0 && x < SPRA_WIDTH && y < SPRA_HEIGHT &&
  !WALLS.some(w => x + 0.5 > w.x && x + 0.5 < w.x + w.w && y + 0.5 > w.y && y + 0.5 < w.y + w.h);

function makeRoom(code) {
  return {
    code, host: null, state: 'lobby', ink: createInkSurface(SPRA_WIDTH, SPRA_HEIGHT, WALLS),
    players: new Map(), effects: [], bombs: [], gumShots: [], specials: [], wallInk: new Uint8Array(WALLS.length), nextBomb: 0, nextSpecial: 0, round:0, elapsed: 0,
    winner: -1, mode: 'turf', rankSaved: false, updatedAt: Date.now(), broadcastAt: 0, practice: false
  };
}

function makePlayer(id, name, team, ws = null, bot = false) {
  return {
    id, name, team, ws, bot, x: team === 0 ? 9 : SPRA_WIDTH - 9,
    y: SPRA_HEIGHT / 2 + (Math.random() - 0.5) * 28,
    aim: team === 0 ? 0 : Math.PI, hp: 100, ink: SPRA_INK_MAX, weapon: 'shooter', special: 'tornado', specialCharge: 0,
    input: { x: 0, y: 0, fire: false, swim: false },
    cooldown: 0, bombCd: 0, charge: 0, wasFiring: false,
    dodgeCd: 0, dodgeFor: 0, drillFor: 0, rollHitCd: 0,
    wallCd: 0, jumpCd: 0, jump: null, flightFor: 0, gumShotsFired:0, slowFor:0,
    shieldFor: 0, shieldHp: 0, stealth: false, deadFor: 0, invuln: 0,
    ko: 0, deaths: 0, cosmetics: {hat:0,shirt:0,shoes:0,skin:0}, connectedAt: Date.now(), inputsAt: 0, inputCount: 0
  };
}

function score(room) { return room.ink.score(); }
function splash(room, x, y, r, team, angle=0, seed=1, style='impact') {
  room.ink.impact(x, y, r, team, angle, seed, style);
}
function spawn(p) {
  p.x = p.team === 0 ? 9 : SPRA_WIDTH - 9;
  p.y = SPRA_HEIGHT / 2 + (Math.random() - 0.5) * 28;
  p.aim = p.team === 0 ? 0 : Math.PI;
  p.hp = 100; p.ink = SPRA_INK_MAX; p.deadFor = 0; p.invuln = 1.5;
  p.cooldown = 0; p.bombCd = 0; p.swimming=false;
  p.charge=0; p.wasFiring=false; p.flightFor=0; p.slowFor=0;
  p.shieldFor=0; p.shieldHp=0; p.dodgeCd=0; p.dodgeFor=0;
  p.drillFor=0; p.rollHitCd=0; p.wallCd=0;
  p.jumpCd=0; p.jump=null; p.stealth=false;
}
function inflict(room, target, damage, by) {
  if (target.deadFor > 0 || target.invuln > 0 || target.team === by.team || target.jump) return;
  let incoming=Math.max(0,damage);
  if(target.shieldFor>0&&target.shieldHp>0) {
    const blocked=Math.min(target.shieldHp,incoming);
    target.shieldHp-=blocked; incoming-=blocked;
    if(target.shieldHp<=0)target.shieldFor=0;
  }
  if(incoming<=0)return;
  target.hp = Math.max(0, target.hp - incoming);
  if (target.hp === 0) {
    target.deadFor = 3;
    target.deaths++;
    by.ko++;
    by.specialCharge=clamp(by.specialCharge+14,0,100);
    room.effects.push({ type: 'ko', x: target.x, y: target.y, team: by.team });
    splash(room, target.x, target.y, 1.7, by.team);
  }
}
function awardPaint(room, player, beforeCount) {
  const gained=Math.max(0,room.ink.counts[player.team]-beforeCount);
  player.specialCharge=clamp(player.specialCharge+gained/19,0,100);
}
function coatWall(room, x, y, team) {
  const i=wallAt(WALLS,x,y,.55);
  if(i<0)return false;
  room.wallInk[i]=team+1;
  return true;
}
function shoot(room,p,charge=1) {
  const gun=SPRA_WEAPONS[p.weapon]||SPRA_WEAPONS.shooter;
  if(p.cooldown>0||p.ink<gun.cost||p.deadFor>0||p.jump)return;
  const type=gun.type;
  p.cooldown=gun.delay;
  p.ink-=gun.cost;
  const before=room.ink.counts[p.team];
  const seed=Math.round(room.elapsed*1000)+p.id.charCodeAt(0)*37;
  if(type==='cosmic'){
    if(room.gumShots.length>=64)return;
    const power=clamp(charge,0,1);
    const angle=p.aim;
    const speed=24-4*power;
    room.gumShots.push({id:++room.nextSpecial,owner:p.id,team:p.team,
      x:p.x+Math.cos(angle)*.9,y:p.y+Math.sin(angle)*.9,
      vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
      radius:.38+power*.72,power,bounces:0,time:2.5,hit:new Set()});
    room.effects.push({type:'gum_launch',team:p.team,x:p.x,y:p.y,charge:power});
    return;
  }
  if(type==='drill'){
    // Holding fire starts a short burrowing rush. Its physical collision and
    // ground-paint trail are resolved in move(), not client-side.
    p.drillFor=1.1;
    p.drillHeading=p.aim;
    room.effects.push({type:'drill',x:p.x,y:p.y,team:p.team});
    return;
  }
  const count=gun.projectiles||1;
  const hit=new Set(), ends=[];
  for(let j=0;j<count;j++){
    const spread=(j-(count-1)/2)*gun.spread+Math.sin(seed*1.17+j*9.74)*.035;
    const angle=p.aim+spread,dx=Math.cos(angle),dy=Math.sin(angle);
    let end={x:p.x,y:p.y},struck=false,ignoredWall=-1;
    const range=gun.range*(1-Math.abs(spread)*.11);
    for(let r=.7;r<=range;r+=.58){
      const x=p.x+dx*r,y=p.y+dy*r;
      const blocked=nearWall(x,y,.09);
      if(blocked){
        const wall=wallAt(WALLS,x,y,.35);
        if(type==='slosher'&&wall>=0&&(ignoredWall<0||ignoredWall===wall)){
          ignoredWall=wall;continue; // lob over one painted obstacle
        }
        coatWall(room,x,y,p.team);
        break;
      }
      end={x,y};
      if(['roller','brush','drill'].includes(type))continue;
      for(const other of room.players.values()){
        if(other.team===p.team||other.deadFor>0||hit.has(other.id))continue;
        // Submerged players cannot be targeted from long range; splashes and
        // point-blank counterattacks can still hit them.
        if(other.swimming&&Math.hypot(p.x-other.x,p.y-other.y)>2.7)continue;
        if(Math.hypot(x-other.x,y-other.y)<.79){
          hit.add(other.id);
          inflict(room,other,Math.round(gun.damage*(type==='charger'?Math.max(.5,charge):1)),p);
          struck=true;
          if(['shooter','dualies','splatling'].includes(type))break;
        }
      }
      if(struck&&['shooter','dualies','splatling'].includes(type))break;
    }
    const sx=p.x+dx*.55,sy=p.y+dy*.55;
    if(type==='wiper'){
      const slashX=p.x+dx*3,slashY=p.y+dy*3;
      splash(room,slashX,slashY,1.8,p.team,angle,seed+j,'roller');
      room.ink.trail(sx,sy,end.x,end.y,.42,p.team,seed+j,false);
      for(const other of room.players.values()){
        if(other.team===p.team||other.deadFor>0||hit.has(other.id))continue;
        const ox=other.x-p.x,oy=other.y-p.y;
        const distance=Math.hypot(ox,oy),forward=ox*dx+oy*dy;
        if(distance<4.3&&forward>0&&Math.abs(ox*dy-oy*dx)<2.7){
          hit.add(other.id);inflict(room,other,Math.round(gun.damage*1.65),p);
        }
      }
      room.effects.push({type:'slash',x:p.x,y:p.y,tx:end.x,ty:end.y,team:p.team});
    }else if(type==='roller'||type==='brush'){
      room.ink.trail(sx,sy,end.x,end.y,type==='roller'?gun.radius*.35:gun.radius*.21,p.team,seed+j,true);
      splash(room,end.x,end.y,gun.radius*.65,p.team,angle,seed+j,'roller');
    }else if(type==='charger'){
      room.ink.trail(sx,sy,end.x,end.y,.19*(charge+.25),p.team,seed+j,true);
      splash(room,end.x,end.y,gun.radius*charge,p.team,angle,seed+j,'shooter');
    }else if(type==='blaster'){
      room.ink.trail(sx,sy,end.x,end.y,.14,p.team,seed+j,false);
      splash(room,end.x,end.y,gun.radius,p.team,angle,seed+j,'bomb');
    }else{
      room.ink.trail(sx,sy,end.x,end.y,type==='slosher'?.35:.19,p.team,seed+j,false);
      splash(room,end.x,end.y,gun.radius*(count>1?.64:1),p.team,angle,seed+j,'shooter');
    }
    ends.push(end);
  }
  if(['roller','brush','blaster','slosher','brella'].includes(type)){
    for(const other of room.players.values()){
      if(other.team===p.team||other.deadFor>0||hit.has(other.id))continue;
      if(ends.some(end=>Math.hypot(other.x-end.x,other.y-end.y)<gun.radius*.75+.65)){
        hit.add(other.id);inflict(room,other,gun.damage,p);
      }
    }
  }
  const end=ends[Math.floor(ends.length/2)]||{x:p.x,y:p.y};
  awardPaint(room,p,before);
  room.effects.push({type:'shot',x:p.x,y:p.y,tx:end.x,ty:end.y,
    team:p.team,weapon:p.weapon,weaponType:type,charge,seed});
}
// Q launches a real projectile. The server integrates its arc and paints only
// after ground contact or obstacle collision; clients render the same flight.
function throwBomb(room,p,mega=false){
  const inkCost=mega?0:48;
  if(p.deadFor>0||p.jump||room.bombs.length>=32||(!mega&&(p.bombCd>0||p.ink<inkCost)))return false;
  if(!mega){p.ink-=inkCost;p.bombCd=7;}
  room.bombs.push({
    id:++room.nextBomb, owner:p.id, team:p.team,kind:mega?'mega':'normal',
    x:p.x,y:p.y,z:.7,vx:Math.cos(p.aim)*(mega?11.5:13.5),
    vy:Math.sin(p.aim)*(mega?11.5:13.5),
    vz:mega?11:9,seed:Math.round(room.elapsed*1000)+room.nextBomb
  });
  return true;
}
function bomb(room,p){return throwBomb(room,p,false);}
function updateBombs(room,dt){
  for(let i=room.bombs.length-1;i>=0;i--){
    const b=room.bombs[i];
    const oldX=b.x,oldY=b.y;
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.vz-=19*dt;
    const collision=nearWall(b.x,b.y,.2);
    if(collision){b.x=oldX;b.y=oldY;}
    if(b.z>0&&!collision)continue;
    room.bombs.splice(i,1);
    const owner=room.players.get(b.owner);
    if(!owner)continue;
    const large=b.kind==='mega',radius=large?10.5:5.1;
    splash(room,b.x,b.y,radius,b.team,Math.atan2(b.vy,b.vx),b.seed,'bomb');
    for(const other of room.players.values()){
      if(other.team===b.team||other.deadFor>0)continue;
      const distance=Math.hypot(other.x-b.x,other.y-b.y);
      if(distance<radius-.2)inflict(room,other,
        distance<radius*.55?(large?95:80):(large?58:42),owner);
    }
    room.effects.push({type:large?'mega_bomb':'bomb',x:b.x,y:b.y,team:b.team,seed:b.seed});
  }
}
function activateSpecial(room,p){
  if(p.deadFor>0||p.jump||p.specialCharge<100||!SPRA_SPECIALS[p.special])return false;
  p.specialCharge=0;
  const direction={x:Math.cos(p.aim),y:Math.sin(p.aim)};
  const at={x:p.x+direction.x*3.5,y:p.y+direction.y*3.5};
  if(p.special==='flight'){
    p.flightFor=7;
    room.effects.push({type:'flight',x:p.x,y:p.y,team:p.team});
  }else if(p.special==='shield'){
    for(const ally of room.players.values())if(ally.team===p.team&&ally.deadFor===0){
      ally.shieldFor=8;ally.shieldHp=80;
    }
    room.effects.push({type:'shield',x:p.x,y:p.y,team:p.team});
  }else if(p.special==='final_frontier'){
    // A 6s chain: LAUNCH -> STAR RAIN -> MOON CRASH.
    const distance=19;
    const x=clamp(p.specialTarget?.x??p.x+direction.x*distance,4,SPRA_WIDTH-4);
    const y=clamp(p.specialTarget?.y??p.y+direction.y*distance,4,SPRA_HEIGHT-4);
    p.flightFor=6.3;
    room.specials.push({id:++room.nextSpecial,kind:'frontier',owner:p.id,team:p.team,
      x:p.x,y:p.y,time:6.3,elapsed:0,phase:'launch',interval:0,
      targetX:x,targetY:y,radius:0});
  }else if(p.special==='mega_bomb'){
    throwBomb(room,p,true);
  }else if(p.special==='tornado'){
    if(room.specials.length>=30)return false;
    room.specials.push({
      id:++room.nextSpecial,kind:'tornado',x:at.x,y:at.y,
      vx:direction.x*3.2,vy:direction.y*3.2,
      team:p.team,owner:p.id,time:7,interval:0
    });
  }else if(p.special==='turret'){
    if(room.specials.length>=30)return false;
    let x=at.x,y=at.y;
    if(isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,x,y,.6)){x=p.x;y=p.y;}
    room.specials.push({
      id:++room.nextSpecial,kind:'turret',x,y,
      team:p.team,owner:p.id,time:13,interval:0
    });
  }else if(p.special==='missiles'){
    if(room.specials.length>24)return false;
    const enemies=[...room.players.values()].filter(e=>e.team!==p.team&&e.deadFor===0);
    for(let j=0;j<Math.min(6,Math.max(3,enemies.length+2));j++){
      room.specials.push({
        id:++room.nextSpecial,kind:'missile',
        x:p.x,y:p.y,team:p.team,owner:p.id,time:4.8,
        target:enemies[j%Math.max(1,enemies.length)]?.id||null,
        vx:direction.x*8,vy:direction.y*8,interval:0
      });
    }
  }
  room.effects.push({type:'special',kind:p.special,x:p.x,y:p.y,team:p.team});
  return true;
}
// The gum bullet bounces at most twice and leaves a circular paint burst on termination.
function resolveGum(room,g,enemyHit=false){
  const owner=room.players.get(g.owner);
  if(!owner)return;
  splash(room,g.x,g.y,1.15+g.power*2.15,g.team,0,room.elapsed*1000,'bomb');
  if(enemyHit){
    // Direct-hit damage was applied on collision; the final ink pop is paint-only.
  }
  room.effects.push({type:'gum_pop',x:g.x,y:g.y,team:g.team,
    radius:1.15+g.power*2.15});
}
function updateGumShots(room,dt){
  for(let i=room.gumShots.length-1;i>=0;i--){
    const g=room.gumShots[i];
    g.time-=dt;
    const oldX=g.x,oldY=g.y;
    let nextX=oldX+g.vx*dt,nextY=oldY+g.vy*dt;
    let bounceX=isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,nextX,oldY,g.radius*.7);
    let bounceY=isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,oldX,nextY,g.radius*.7);
    const corner=isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,nextX,nextY,g.radius*.7);
    if(corner&&!bounceX&&!bounceY){bounceX=true;bounceY=true;}
    if(bounceX){g.vx=-g.vx;g.bounces++;nextX=oldX;}
    if(bounceY){g.vy=-g.vy;g.bounces++;nextY=oldY;}
    g.x=clamp(nextX,1.4,SPRA_WIDTH-1.4);
    g.y=clamp(nextY,1.4,SPRA_HEIGHT-1.4);
    // Aster Gum actively paints the entire travelled path, including rebound
    // segments. Charge increases the footprint, not only its final explosion.
    const owner=room.players.get(g.owner);
    if(bounceX||bounceY)coatWall(room,oldX+g.vx*dt,oldY+g.vy*dt,g.team);
    const paintedBefore=room.ink.counts[g.team];
    room.ink.trail(oldX,oldY,g.x,g.y,.22+g.power*.25,
      g.team,g.id*23+Math.floor(room.elapsed*20),true);
    if(owner)awardPaint(room,owner,paintedBefore);
    let collision=false;
    for(const enemy of room.players.values()){
      if(enemy.team===g.team||enemy.deadFor>0||g.hit.has(enemy.id))continue;
      if(Math.hypot(enemy.x-g.x,enemy.y-g.y)<.72+g.radius){
        g.hit.add(enemy.id);
        if(owner)inflict(room,enemy,18,owner);
        collision=true;break;
      }
    }
    if(collision||g.bounces>2||g.time<=0){
      resolveGum(room,g,collision);
      room.gumShots.splice(i,1);
    }
  }
}
// Q: unstable balloon spends 75% of the 300-unit ink tank (225).
function unstableBalloon(room,p){
  if(p.deadFor>0||p.jump||p.bombCd>0||p.ink<SPRA_INK_MAX*.75||
      room.specials.length>=32)return false;
  p.ink-=SPRA_INK_MAX*.75;p.bombCd=12;
  let x=p.x+Math.cos(p.aim)*4,y=p.y+Math.sin(p.aim)*4;
  if(isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,x,y,.7)){x=p.x;y=p.y;}
  room.specials.push({id:++room.nextSpecial,kind:'gravity_balloon',
    owner:p.id,team:p.team,x,y,time:3,elapsed:0,phase:'inflate',radius:.4,interval:0});
  return true;
}
function updateSpecials(room,dt){
  for(let i=room.specials.length-1;i>=0;i--){
    const s=room.specials[i],owner=room.players.get(s.owner);
    if(!owner){room.specials.splice(i,1);continue;}
    s.time-=dt;s.interval-=dt;
    if(s.kind==='gravity_balloon'){
      s.elapsed=(s.elapsed||0)+dt;
      s.radius=Math.min(4,.45+s.elapsed*1.7);
      s.phase='inflate';
      const range=4;
      for(const target of room.players.values()){
        if(target.team===s.team||target.deadFor>0||target.jump)continue;
        const dx=s.x-target.x,dy=s.y-target.y;
        const distance=Math.hypot(dx,dy);
        if(distance>range||distance<.15)continue;
        const pull=dt*(3.8+2.8*(1-distance/range));
        const nx=target.x+dx/distance*pull,ny=target.y+dy/distance*pull;
        if(!isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,nx,target.y,.38))target.x=nx;
        if(!isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,target.x,ny,.38))target.y=ny;
        target.slowFor=Math.max(target.slowFor,.24);
      }
      if(s.time<=0){
        splash(room,s.x,s.y,3.8,s.team,0,room.elapsed*900,'bomb');
        room.effects.push({type:'bubble_pop',x:s.x,y:s.y,team:s.team,radius:3.8});
      }
    }else if(s.kind==='frontier'){
      s.elapsed=(s.elapsed||0)+dt;
      if(s.elapsed<1.3){
        s.phase='launch';
        s.x=owner.x;s.y=owner.y;
      }else if(s.elapsed<4.85){
        s.phase='star_rain';
        s.x=owner.x;s.y=owner.y;
        // The aiming cursor can retarget the rain while airborne.
        if(owner.specialTarget){
          s.targetX=owner.specialTarget.x;
          s.targetY=owner.specialTarget.y;
        }
        if(s.interval<=0){
          s.interval=.17;
          const index=Math.floor(s.elapsed*100);
          const angle=index*2.39996323;
          const distance=Math.sqrt((index%31)/31)*5.6;
          const x=clamp(s.targetX+Math.cos(angle)*distance,2.5,SPRA_WIDTH-2.5);
          const y=clamp(s.targetY+Math.sin(angle)*distance,2.5,SPRA_HEIGHT-2.5);
          const size=.75+(index%5)*.18;
          splash(room,x,y,size,s.team,angle,index,'shooter');
          room.effects.push({type:'star_rain',x,y,team:s.team,seed:index});
          for(const target of room.players.values())if(target.team!==s.team&&target.deadFor===0 &&
             Math.hypot(target.x-x,target.y-y)<size+.4)inflict(room,target,9,owner);
        }
      }else{
        s.phase='moon_crash';
        s.x=s.targetX;s.y=s.targetY;s.radius=7.2;
        if(!s.crashed && s.elapsed>=5.2){
          s.crashed=true;
          splash(room,s.targetX,s.targetY,7.2,s.team,0,room.elapsed*1000,'bomb');
          for(const target of room.players.values()){
            if(target.team===s.team||target.deadFor>0)continue;
            const d=Math.hypot(target.x-s.targetX,target.y-s.targetY);
            if(d<=7.2)inflict(room,target,Math.round(80*Math.max(0,1-d/7.2)),owner);
          }
          room.effects.push({type:'moon_crash',x:s.targetX,y:s.targetY,team:s.team,radius:7.2});
        }
      }
    }else if(s.kind==='tornado'){
      const nx=s.x+s.vx*dt,ny=s.y+s.vy*dt;
      if(isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,nx,ny,.5)){
        s.vx*=-.8;s.vy*=-.8;
      }else{s.x=nx;s.y=ny;}
      if(s.interval<=0){
        s.interval=.29;
        splash(room,s.x,s.y,3.5,s.team,room.elapsed*5,Math.floor(room.elapsed*1000),'bomb');
        for(const target of room.players.values()){
          if(target.team!==s.team&&target.deadFor===0&&Math.hypot(target.x-s.x,target.y-s.y)<4)
            inflict(room,target,12,owner);
        }
      }
    }else if(s.kind==='turret'&&s.interval<=0){
      s.interval=.5;
      splash(room,s.x,s.y,1.45,s.team,room.elapsed,Math.floor(room.elapsed*400),'shooter');
      const targets=[...room.players.values()].filter(t=>t.team!==s.team&&t.deadFor===0&&!t.swimming)
        .sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y));
      const target=targets.find(t=>Math.hypot(t.x-s.x,t.y-s.y)<21);
      if(target){
        let blocked=false;
        const dx=target.x-s.x,dy=target.y-s.y,dist=Math.hypot(dx,dy);
        for(let d=1.5;d<dist;d+=1){
          if(isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,s.x+dx*d/dist,s.y+dy*d/dist,.05)){blocked=true;break;}
        }
        if(!blocked){
          inflict(room,target,15,owner);
          room.ink.trail(s.x,s.y,target.x,target.y,.17,s.team,room.elapsed*1000,false);
          splash(room,target.x,target.y,1.2,s.team,0,room.elapsed*130,'shooter');
          room.effects.push({type:'shot',x:s.x,y:s.y,tx:target.x,ty:target.y,team:s.team,weaponType:'splatling'});
        }
      }
    }else if(s.kind==='missile'){
      const target=room.players.get(s.target);
      if(target&&target.deadFor===0){
        const dx=target.x-s.x,dy=target.y-s.y,dist=Math.hypot(dx,dy)||1;
        s.vx+=(dx/dist*23-s.vx)*Math.min(1,dt*5);
        s.vy+=(dy/dist*23-s.vy)*Math.min(1,dt*5);
      }
      const nx=s.x+s.vx*dt,ny=s.y+s.vy*dt;
      const hit=isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,nx,ny,.2);
      if(!hit){s.x=nx;s.y=ny;}
      const close=target&&target.deadFor===0&&Math.hypot(target.x-s.x,target.y-s.y)<1.5;
      if(hit||close||s.time<=0){
        splash(room,s.x,s.y,2.35,s.team,0,room.elapsed*1000,'bomb');
        for(const enemy of room.players.values())if(enemy.team!==s.team&&enemy.deadFor===0
          &&Math.hypot(enemy.x-s.x,enemy.y-s.y)<2.7)inflict(room,enemy,36,owner);
        room.effects.push({type:'bomb',x:s.x,y:s.y,team:s.team});
        room.specials.splice(i,1);
        continue;
      }
    }
    if(s.time<=0)room.specials.splice(i,1);
  }
}
function attemptSuperJump(room,p,message){
  if(p.deadFor>0||p.jump||p.jumpCd>0||p.flightFor>0)return false;
  const source={x:p.x,y:p.y};
  let dest;
  if(typeof message.targetPlayerId==='string'){
    const teammate=room.players.get(message.targetPlayerId);
    if(!teammate||teammate.team!==p.team||teammate.deadFor>0||teammate.id===p.id)return false;
    dest={x:teammate.x,y:teammate.y};
  }else{
    if(!Number.isFinite(message.x)||!Number.isFinite(message.y))return false;
    dest={x:message.x,y:message.y};
  }
  const landing=connectedInkLanding({ink:room.ink,width:SPRA_WIDTH,height:SPRA_HEIGHT,
    walls:WALLS},source,dest,p.team);
  if(!landing||Math.hypot(landing.x-p.x,landing.y-p.y)<3)return false;
  const dist=Math.hypot(landing.x-p.x,landing.y-p.y);
  p.jump={from:{x:p.x,y:p.y},to:landing,progress:0,duration:clamp(.5+dist/110,.55,1.55)};
  p.jumpCd=14;
  p.swimming=false;
  room.effects.push({type:'jump',x:p.x,y:p.y,tx:landing.x,ty:landing.y,team:p.team});
  return true;
}
function botInput(room, p) {
  const enemy = [...room.players.values()]
    .filter(v => v.team !== p.team && v.deadFor <= 0)
    .sort((a, b) => distance(a, p) - distance(b, p))[0];
  if (!enemy) {
    p.input = { x: 0, y: 0, fire: false, swim: false };
    return;
  }
  const dx=enemy.x-p.x, dy=enemy.y-p.y, d=Math.hypot(dx,dy)||1;
  const desired=Math.atan2(dy,dx);
  const gun=SPRA_WEAPONS[p.weapon]||SPRA_WEAPONS.shooter;
  p.aim=desired+Math.sin(room.elapsed*.8+p.id.length)*.14;

  // Find a safe 2.4-unit step among 16 possible directions. This prevents
  // bots from remaining pinned against the big walls of the expanded arena.
  const previous=Number.isFinite(p.botHeading)?p.botHeading:desired;
  let best=-Infinity, chosen=desired;
  for(let i=0;i<16;i++){
    const angle=i*Math.PI/8;
    const x=Math.cos(angle), y=Math.sin(angle);
    if(nearWall(p.x+x*2.4,p.y+y*2.4,.5))continue;
    if(nearWall(p.x+x*1.1,p.y+y*1.1,.5))continue;
    const progress=Math.cos(angle-desired);
    const momentum=Math.cos(angle-previous);
    const score=progress*1.3+momentum*.55+
      Math.sin(room.elapsed*.3+p.id.charCodeAt(0)+i)*.055;
    if(score>best){best=score;chosen=angle;}
  }
  if(best===-Infinity){
    const fallbacks=[0,Math.PI/2,Math.PI,-Math.PI/2];
    chosen=fallbacks.find(angle=>!nearWall(p.x+Math.cos(angle),p.y+Math.sin(angle),.38))??previous;
  }
  p.botHeading=chosen;
  const own=room.ink.sample(p.x,p.y)===p.team+1;
  p.input={
    x:Math.cos(chosen)*(d<5?.45:1),
    y:Math.sin(chosen)*(d<5?.45:1),
    fire:d<gun.range*.93 && !nearWall(p.x+Math.cos(desired)*3,p.y+Math.sin(desired)*3,.1),
    swim:p.ink<80&&own
  };
  if(d<12&&p.bombCd===0&&p.ink>100&&Math.random()<.0025)bomb(room,p);
}
function move(room,p,dt){
  if(p.deadFor>0){
    p.deadFor=Math.max(0,p.deadFor-dt);
    if(p.deadFor===0)spawn(p);
    return;
  }
  p.cooldown=Math.max(0,p.cooldown-dt);
  p.bombCd=Math.max(0,p.bombCd-dt);
  p.invuln=Math.max(0,p.invuln-dt);
  p.dodgeCd=Math.max(0,p.dodgeCd-dt);
  p.wallCd=Math.max(0,p.wallCd-dt);
  p.jumpCd=Math.max(0,p.jumpCd-dt);
  p.shieldFor=Math.max(0,p.shieldFor-dt);
  if(!p.shieldFor)p.shieldHp=0;
  p.flightFor=Math.max(0,p.flightFor-dt);
  p.slowFor=Math.max(0,(p.slowFor||0)-dt);
  if(p.flightFor===0&&isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,p.x,p.y,.4)&&p.flightSafe){
    p.x=p.flightSafe.x;p.y=p.flightSafe.y;
  }
  if(p.jump){
    const jump=p.jump;
    jump.progress=Math.min(1,jump.progress+dt/jump.duration);
    const t=jump.progress;
    p.x=jump.from.x+(jump.to.x-jump.from.x)*t;
    p.y=jump.from.y+(jump.to.y-jump.from.y)*t;
    if(t>=1){p.x=jump.to.x;p.y=jump.to.y;p.jump=null;p.invuln=Math.max(p.invuln,.3);}
    return;
  }
  if(p.bot)botInput(room,p);
  const own=room.ink.sample(p.x,p.y)===p.team+1;
  const enemyInk=room.ink.sample(p.x,p.y)>0&&!own;
  const swim=Boolean(p.input.swim&&own&&p.flightFor<=0);
  p.swimming=swim;
  p.stealth=swim;
  const gun=SPRA_WEAPONS[p.weapon]||SPRA_WEAPONS.shooter;
  const isRoll=gun.type==='roller'&&p.input.fire&&!swim&&p.ink>0;
  const isDrill=p.drillFor>0;
  p.drillFor=Math.max(0,p.drillFor-dt);
  p.dodgeFor=Math.max(0,p.dodgeFor-dt);
  let speed=swim?13.2:own?9.3:enemyInk?4.3:7.2;
  if(isRoll)speed=13.4;
  if(isDrill)speed=17.2;
  if(p.dodgeFor>0)speed=19;
  if(p.flightFor>0)speed=15.5;
  if(p.slowFor>0)speed*=.53;
  let {x,y}=p.input;
  let magnitude=Math.hypot(x,y);
  if(magnitude>1){x/=magnitude;y/=magnitude;}
  if(isDrill){x=Math.cos(p.drillHeading);y=Math.sin(p.drillHeading);}
  const nextX=p.x+x*speed*dt,nextY=p.y+y*speed*dt;
  if(!isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,nextX,p.y,.38)||p.flightFor>0) {
    p.x=clamp(nextX,1.5,SPRA_WIDTH-1.5);
  }else if(swim&&p.wallCd<=0){
    const crossing=wallCrossLanding({
      walls:WALLS,width:SPRA_WIDTH,height:SPRA_HEIGHT,wallInk:room.wallInk
    },p,x,y);
    if(crossing){
      p.x=crossing.x;p.y=crossing.y;p.wallCd=2.5;
      room.effects.push({type:'wall_climb',x:p.x,y:p.y,team:p.team});
    }
  }
  if(!isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,p.x,nextY,.38)||p.flightFor>0) {
    p.y=clamp(nextY,1.5,SPRA_HEIGHT-1.5);
  }else if(swim&&p.wallCd<=0){
    const crossing=wallCrossLanding({
      walls:WALLS,width:SPRA_WIDTH,height:SPRA_HEIGHT,wallInk:room.wallInk
    },p,x,y);
    if(crossing){
      p.x=crossing.x;p.y=crossing.y;p.wallCd=2.5;
      room.effects.push({type:'wall_climb',x:p.x,y:p.y,team:p.team});
    }
  }
  if(p.flightFor>0&&!isBlocked(WALLS,SPRA_WIDTH,SPRA_HEIGHT,p.x,p.y,.45))p.flightSafe={x:p.x,y:p.y};
  p.ink=clamp(p.ink+(swim?147:own?41:enemyInk?3:8)*dt,0,SPRA_INK_MAX);
  if(swim){
    p.hp=clamp(p.hp+23*dt,0,100);
    p.charge=0;p.wasFiring=false;
    return;
  }
  const before=room.ink.counts[p.team];
  if(isDrill||isRoll){
    const radius=isDrill?1.55:gun.radius*.8;
    room.ink.trail(p.x-x*speed*dt,p.y-y*speed*dt,p.x,p.y,radius,p.team,room.elapsed*2000,true);
    splash(room,p.x,p.y,radius,p.team,p.aim,room.elapsed*1000,'roller');
    p.ink=clamp(p.ink-(isDrill?10:16)*dt,0,SPRA_INK_MAX);
    if(p.rollHitCd<=0){
      for(const target of room.players.values())if(target.team!==p.team&&target.deadFor<=0
        &&Math.hypot(target.x-p.x,target.y-p.y)<2.3){
        inflict(room,target,isDrill?48:32,p);p.rollHitCd=.5;
      }
    }
    awardPaint(room,p,before);
  }
  p.rollHitCd=Math.max(0,p.rollHitCd-dt);
  if(p.input.fire) {
    if(gun.type==='cosmic'){
      p.charge=clamp(p.charge+dt/1.55,0,1);
    }else if(gun.type==='charger'){
      p.charge=clamp(p.charge+dt/1.3,0,1);
    }else if(gun.type==='roller'){
      if(p.cooldown<=0){p.cooldown=.42;shoot(room,p);}
    }else shoot(room,p);
    p.wasFiring=true;
  }else{
    if(p.wasFiring&&(gun.type==='charger'||gun.type==='cosmic')&&p.charge>.015&&p.cooldown<=0)
      shoot(room,p,Math.max(.12,p.charge));
    p.charge=0;p.wasFiring=false;
  }
}
function roomSafeSwim(p) { return Boolean(p.swimming); }
function pack(p) {
  return { id: p.id, name: p.name, team: p.team, x: +p.x.toFixed(2), y: +p.y.toFixed(2),
    aim: +p.aim.toFixed(2), hp: p.hp, ink: Math.floor(p.ink),
    weapon: p.weapon, cosmetics: p.cosmetics, special: p.special, specialCharge: Math.floor(p.specialCharge),
    ko: p.ko, deaths: p.deaths, dead: p.deadFor > 0,
    bombCd: +p.bombCd.toFixed(1), maxInk: SPRA_INK_MAX,
    swim: p.input.swim && roomSafeSwim(p), bot: p.bot,
    shield: Math.round(p.shieldHp), flight: +(p.flightFor||0).toFixed(1), slow:+(p.slowFor||0).toFixed(1),
    dodgeCd: +(p.dodgeCd||0).toFixed(1),
    wallCd: +(p.wallCd||0).toFixed(1),
    jumpCd: +(p.jumpCd||0).toFixed(1),
    charge: +(p.charge||0).toFixed(2),
    drill: p.drillFor>0,
    jumping: p.jump ? {t:+p.jump.progress.toFixed(2),duration:p.jump.duration,from:p.jump.from,to:p.jump.to} : null };
}
function send(ws, object) {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(object)); } catch {}
  }
}
const MAX_SOCKET_BACKLOG = 200 * 1024;
function broadcast(room, object) {
  // Serialize the large ink delta only once per frame, not once for each
  // member of an eight-player room.
  const payload = JSON.stringify(object);
  for (const p of room.players.values()) {
    const ws = p.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    if (object.type === 'state' && ws.bufferedAmount > MAX_SOCKET_BACKLOG) {
      // Do not pile up megabytes of obsolete paint events. The next
      // successfully delivered frame must resynchronize its full paint.
      ws.spraNeedsPaint = true;
      continue;
    }
    try {
      if (object.type === 'state' && (ws.spraNeedsPaint || payload.length > 230_000)) {
        const fullState = { ...object, changes: [], fullPaint: room.ink.snapshot() };
        ws.send(JSON.stringify(fullState));
        ws.spraNeedsPaint = false;
      } else {
        ws.send(payload);
      }
    } catch {
      if (object.type === 'state') ws.spraNeedsPaint = true;
    }
  }
}
function snapshot(room) {
  return { type: 'state', code: room.code, host: room.host, round: room.round, mode: room.mode, phase: room.state,
    remaining: Math.max(0, Math.ceil(SPRA_DURATION - room.elapsed)),
    scores: score(room), players: [...room.players.values()].map(pack),
    changes: room.ink.flush(), paintScale: INK_SCALE, effects: room.effects.splice(0, 30),
    winner: room.winner, colors: COLORS,
    wallsInk: [...room.wallInk],
    specials: room.specials.map(o=>({id:o.id,kind:o.kind,team:o.team,
       x:+o.x.toFixed(2),y:+o.y.toFixed(2),time:+o.time.toFixed(1),
       phase:o.phase||'',radius:+(o.radius||0).toFixed(2),targetX:o.targetX||0,targetY:o.targetY||0})),
    gumShots:room.gumShots.map(o=>({id:o.id,team:o.team,x:+o.x.toFixed(2),y:+o.y.toFixed(2),
      radius:+o.radius.toFixed(2),bounces:o.bounces})),
    bombs: room.bombs.map(b => ({id:b.id,x:+b.x.toFixed(2),y:+b.y.toFixed(2),z:+b.z.toFixed(2),team:b.team})) };
}
function reset(room) {
  room.state = 'lobby'; room.elapsed = 0; room.winner = -1; room.rankSaved=false;
  room.ink.clear(); room.bombs=[]; room.gumShots=[]; room.specials=[]; room.wallInk.fill(0);
  for (const p of room.players.values()) { spawn(p); p.ko = 0; p.deaths = 0; p.invuln = 0; p.specialCharge=0; }
}
function addBot(room) {
  if (room.players.size >= MAX_HUMANS) return;
  const left = [...room.players.values()].filter(p => p.team === 0).length;
  const right = room.players.size - left;
  const team = left <= right ? 0 : 1;
  const bot = makePlayer(randomUUID(), 'INK BOT ' + ([...room.players.values()].filter(p => p.bot).length + 1), team, null, true);
  room.players.set(bot.id, bot);
}
function fillBots(room) {
  while(room.players.size < MAX_HUMANS) addBot(room);
}
function cleanName(value) {
  return String(value || 'PLAYER').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || 'PLAYER';
}

export function createSpra({pool=null}={}) {
  const rankings=createSpraLeaderboard(pool);
  const rooms = new Map();
  const links = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  function leave(ws) {
    const connection = links.get(ws);
    if (!connection) return;
    links.delete(ws);
    const room = rooms.get(connection.code);
    if (!room) return;
    room.players.delete(connection.id);
    if (room.host === connection.id) room.host = [...room.players.values()].find(p => !p.bot)?.id || null;
    room.updatedAt = Date.now();
    if (![...room.players.values()].some(p => !p.bot)) rooms.delete(room.code);
    else broadcast(room, snapshot(room));
  }

  wss.on('connection', ws => {
    ws.on('error', () => {});
    send(ws, { type: 'connected' });
    ws.on('message', payload => {
      let msg;
      try { msg = JSON.parse(payload.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      if (msg.type === 'join') {
        if (links.has(ws)) return;
        let code = String(msg.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        let room = code ? rooms.get(code) : null;
        if (code && !room) return send(ws, { type: 'error', message: '部屋が見つかりません。コードを確認してください。' });
        if (!room) {
          for (let i = 0; i < 20; i++) { code = roomCode(); if (!rooms.has(code)) break; }
          if (rooms.has(code)) return send(ws, { type: 'error', message: '部屋を作成できませんでした。' });
          room = makeRoom(code);
          if(['turf','ko','training'].includes(msg.mode))room.mode=msg.mode;
          rooms.set(code, room);
        }
        if (room.players.size >= MAX_HUMANS || room.state === 'playing') return send(ws, { type: 'error', message: '対戦中、または満員の部屋には入れません。' });
        const id = randomUUID();
        const humans = [...room.players.values()].filter(p => !p.bot);
        const countBlue = [...room.players.values()].filter(p => p.team === 0).length;
        const countOrange = room.players.size - countBlue;
        const team = countBlue <= countOrange ? 0 : 1;
        const player = makePlayer(id, cleanName(msg.name), team, ws);
        const getCosmetics=input=>{
          const src=input&&typeof input==='object'?input:{};
          const n=v=>Number.isInteger(v)&&v>=0&&v<=15?v:0;
          return {hat:n(src.hat),shirt:n(src.shirt),shoes:n(src.shoes),skin:n(src.skin)};
        };
        player.cosmetics=getCosmetics(msg.cosmetics);
        room.players.set(id, player);
        room.host ||= id;
        room.updatedAt = Date.now();
        links.set(ws, { id, code });
        send(ws, { type: 'welcome', id, code, width: SPRA_WIDTH, height: SPRA_HEIGHT, maxInk:SPRA_INK_MAX,
          walls: WALLS, duration: SPRA_DURATION, colors: COLORS,
          paint: room.ink.snapshot(), paintScale: INK_SCALE });
        broadcast(room, snapshot(room));
        return;
      }
      const link = links.get(ws);
      if (!link) return;
      const room = rooms.get(link.code), player = room?.players.get(link.id);
      if (!room || !player) return;
      const now = Date.now();
      room.updatedAt = now;
      if (msg.type === 'input' && room.state === 'playing') {
        if (now - player.inputsAt > 1000) { player.inputsAt = now; player.inputCount = 0; }
        if (++player.inputCount > 35) return;
        player.input.x = clamp(Number(msg.x), -1, 1);
        player.input.y = clamp(Number(msg.y), -1, 1);
        player.input.fire = msg.fire === true;
        player.input.swim = msg.swim === true;
        if (Number.isFinite(msg.aim)) player.aim = clamp(msg.aim, -Math.PI * 2, Math.PI * 2);
        if (msg.bomb === true) {
          if(SPRA_WEAPONS[player.weapon]?.type==='cosmic') unstableBalloon(room,player);
          else bomb(room,player);
        }
        if(msg.specialTarget && typeof msg.specialTarget==='object' &&
            Number.isFinite(msg.specialTarget.x)&&Number.isFinite(msg.specialTarget.y)){
          player.specialTarget={x:clamp(msg.specialTarget.x,1,SPRA_WIDTH-1),
            y:clamp(msg.specialTarget.y,1,SPRA_HEIGHT-1)};
        }
        if (msg.special === true) activateSpecial(room,player);
        if (msg.dodge === true && player.dodgeCd<=0 && player.deadFor<=0 &&
          SPRA_WEAPONS[player.weapon]?.type==='shooter' && player.ink>=18){
          player.dodgeCd=2;player.dodgeFor=.25;player.ink-=18;
          player.invuln=Math.max(player.invuln,.17);
          room.effects.push({type:'dodge',x:player.x,y:player.y,team:player.team});
        }
        if (msg.jump && typeof msg.jump==='object') attemptSuperJump(room,player,msg.jump);
      } else if (msg.type==='cosmetics'&&room.state==='lobby'){
        const value=msg.cosmetics;
        if(value&&typeof value==='object'){
          const n=v=>Number.isInteger(v)&&v>=0&&v<=15?v:0;
          player.cosmetics={hat:n(value.hat),shirt:n(value.shirt),shoes:n(value.shoes),skin:n(value.skin)};
          broadcast(room,snapshot(room));
        }
      } else if (msg.type === 'special' && room.state !== 'playing' && Object.hasOwn(SPRA_SPECIALS,msg.special)){
        if(SPRA_WEAPONS[player.weapon]?.type==='cosmic' && msg.special!=='final_frontier')return;
        if(SPRA_WEAPONS[player.weapon]?.type!=='cosmic' && msg.special==='final_frontier')return;
        player.special=msg.special;
        broadcast(room,snapshot(room));
      } else if (msg.type === 'mode' && player.id === room.host && room.state==='lobby') {
        if (['turf','ko','training'].includes(msg.mode)) {
          room.mode=msg.mode;
          broadcast(room,snapshot(room));
        }
      } else if (msg.type === 'weapon' && room.state !== 'playing' && Object.hasOwn(SPRA_WEAPONS, msg.weapon)) {
        player.weapon = msg.weapon;
        if(SPRA_WEAPONS[msg.weapon]?.type==='cosmic')player.special='final_frontier';
        else if(player.special==='final_frontier')player.special='tornado';
        broadcast(room, snapshot(room));
      } else if (msg.type === 'team' && room.state === 'lobby') {
        const team = Number(msg.team);
        if (team === 0 || team === 1) {
          const teammates = [...room.players.values()].filter(other => other.id !== player.id && other.team === team);
          if (teammates.length >= 4) return send(ws, { type: 'error', message: 'そのチームは4人で満員です。' });
          player.team = team;
          spawn(player);
          broadcast(room, snapshot(room));
        }
      } else if (msg.type === 'bot' && player.id === room.host && room.state !== 'playing') {
        addBot(room);
        broadcast(room, snapshot(room));
      } else if (msg.type === 'start' && player.id === room.host && room.state !== 'playing') {
        fillBots(room);
        const blues = [...room.players.values()].filter(p => p.team === 0).length;
        const oranges = room.players.size - blues;
        if (!blues || !oranges) return send(ws, { type: 'error', message: 'PvPには青・オレンジ両方のチームが必要です。' });
        reset(room);
        room.round++;
        room.state = 'playing';
        broadcast(room, { type: 'reset', paint: room.ink.snapshot(), paintScale: INK_SCALE });
        broadcast(room, snapshot(room));
      } else if (msg.type === 'lobby' && player.id === room.host && room.state === 'results') {
        reset(room);
        broadcast(room, { type: 'reset', paint: room.ink.snapshot(), paintScale: INK_SCALE });
        broadcast(room, snapshot(room));
      }
    });
    ws.on('close', () => leave(ws));
  });

  const tick = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.state !== 'playing') continue;
      room.elapsed += STEP;
      for (const p of room.players.values()) move(room, p, STEP);
      updateBombs(room,STEP);
      updateGumShots(room,STEP);
      updateSpecials(room,STEP);
      const kills=[0,0];
      for(const p of room.players.values())kills[p.team]+=p.ko;
      const elapsed=room.elapsed>=SPRA_DURATION;
      const koEnd=room.mode==='ko'&&Math.max(...kills)>=20;
      if (elapsed || koEnd) {
        room.state='results';
        if(room.mode==='ko')room.winner=kills[0]===kills[1]?-1:kills[0]>kills[1]?0:1;
        else room.winner=room.ink.counts[0]===room.ink.counts[1]?-1:
          room.ink.counts[0]>room.ink.counts[1]?0:1;
        if(!room.rankSaved){
          room.rankSaved=true;
          void rankings.award([...room.players.values()],room.winner,room.mode);
        }
      }
      if (now - room.broadcastAt >= 125 || room.state === 'results') {
        room.broadcastAt = now;
        broadcast(room, snapshot(room));
      }
    }
    for (const [code, room] of rooms) if (now - room.updatedAt > 20 * 60 * 1000) rooms.delete(code);
  }, 50);
  tick.unref?.();

  return {
    listRankings: limit => rankings.top(limit),
    upgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    },
    close() {
      clearInterval(tick);
      for (const ws of wss.clients) ws.close();
      wss.close();
      rooms.clear();
    }
  };
}
