import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { TILE, canStand, norm, zoneAt, type Actor, type Effect, type Input, type Snapshot } from '@glyph/shared';

export type User = { id: string; username: string };
export type Profile = { x: number; y: number; hp: number; xp: number; level: number; coins: number };
type Save = (user: User, profile: Profile) => Promise<void>;
type Load = (user: User) => Promise<Profile>;
type Enemy = Actor & { targetX: number; targetY: number; speed: number; damage: number; lastAttack: number; respawn: number };
type Session = { user: User; ws: WebSocket; player: Actor; input: Input; profile: Profile; enemies: Enemy[]; effects: Effect[]; lastSwing: number; lastDash: number; invulnUntil: number; lastSave: number; lastSnapshot: number; kills: number };
const emptyInput: Input = { x:0,y:0,aimX:1,aimY:0,attack:false,dash:false };
const templates = [
  {kind:'melee',glyph:'g',name:'森のグリフ',hp:35,speed:42,damage:6},
  {kind:'ranged',glyph:'r',name:'文字射手',hp:26,speed:30,damage:5},
  {kind:'fast',glyph:'v',name:'疾走文字',hp:20,speed:75,damage:4},
  {kind:'elite',glyph:'G',name:'古きグリフ',hp:90,speed:33,damage:9},
  {kind:'boss',glyph:'Ø',name:'THE NULL',hp:240,speed:27,damage:14}
];
const spots = [[410,50],[540,190],[340,-200],[-430,-90],[210,550],[390,650],[-360,520],[-470,650],[70,760]];
let effectId=0;
function spawn(index:number):Enemy {
  const t=templates[index===8?4:index===7?3:index%3];
  let [x,y]=spots[index];
  if(!canStand(x,y)){for(let r=1;r<10&&!canStand(x,y);r++)for(let a=0;a<8;a++){const xx=spots[index][0]+Math.cos(a*Math.PI/4)*r*TILE, yy=spots[index][1]+Math.sin(a*Math.PI/4)*r*TILE;if(canStand(xx,yy)){x=xx;y=yy;break;}}}
  return {id:`e${index}`,name:t.name,x,y,hp:t.hp,maxHp:t.hp,glyph:t.glyph,kind:t.kind,targetX:x,targetY:y,speed:t.speed,damage:t.damage,lastAttack:0,respawn:0};
}
function safeNumber(v:unknown):number { return typeof v==='number' && Number.isFinite(v) ? Math.max(-1,Math.min(1,v)) : 0; }
function validInput(raw:unknown):Input|null {
  if (!raw || typeof raw!=='object' || (raw as {type?:unknown}).type!=='input') return null;
  const a=raw as Record<string,unknown>, move=norm(safeNumber(a.x),safeNumber(a.y));
  const aim=norm(safeNumber(a.aimX),safeNumber(a.aimY));
  return {x:move.x,y:move.y,aimX:aim.x,aimY:aim.y,attack:a.attack===true,dash:a.dash===true};
}
export function attachGlyphInfinity(load:Load,save:Save) {
  const wss=new WebSocketServer({noServer:true,maxPayload:512});
  const sessions=new Map<string,Session>();
  const addEffect=(s:Session,x:number,y:number,text:string,color:string,now:number)=>s.effects.push({id:++effectId,x,y,text,color,born:now});
  function tick(s:Session,now:number,dt:number) {
    const {player:p,input:i}=s;
    const moving=i.x!==0||i.y!==0;
    if (moving) { p.facingX=i.x; p.facingY=i.y; }
    else if (i.aimX||i.aimY) {p.facingX=i.aimX;p.facingY=i.aimY;}
    let speed=120;
    if (i.dash && moving && now-s.lastDash>1400) {s.lastDash=now;s.invulnUntil=now+260;speed=420;addEffect(s,p.x,p.y,'⋆','#68e8ff',now);}
    const nx=p.x+i.x*speed*dt,ny=p.y+i.y*speed*dt;
    if(canStand(nx,p.y))p.x=nx;
    if(canStand(p.x,ny))p.y=ny;
    if(i.attack && now-s.lastSwing>490 && p.hp>0) {
      s.lastSwing=now;
      const aim=norm(i.aimX||p.facingX||1,i.aimY||p.facingY||0);
      addEffect(s,p.x+aim.x*22,p.y+aim.y*22,'✦','#ffe17f',now);
      for(const e of s.enemies) {
        if(e.hp<=0)continue;
        const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy);
        if(d>65 || d<1 || (dx*aim.x+dy*aim.y)/d<0.25)continue;
        const damage=14+Math.min(12,s.profile.level*2);
        e.hp=Math.max(0,e.hp-damage);addEffect(s,e.x,e.y,`-${damage}`,'#ff8f8f',now);
        if(e.hp===0){e.respawn=now+8000;s.profile.xp+=e.kind==='boss'?60:e.kind==='elite'?25:10;s.profile.coins+=e.kind==='boss'?50:5;s.kills++;addEffect(s,e.x,e.y,'✧ +XP','#f5dc77',now);}
      }
    }
    const need=20*s.profile.level;
    if(s.profile.xp>=need){s.profile.xp-=need;s.profile.level++;p.maxHp+=8;p.hp=p.maxHp;addEffect(s,p.x,p.y,'LEVEL UP!','#7bffa5',now);}
    for(let n=0;n<s.enemies.length;n++){
      const e=s.enemies[n];
      if(e.hp<=0){if(now>=e.respawn)s.enemies[n]=spawn(n);continue;}
      const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy);
      if(d>300||p.hp<=0)continue;
      const range=e.kind==='ranged'?125:25;
      if(d>range){const v=norm(dx,dy),nx=e.x+v.x*e.speed*dt,ny=e.y+v.y*e.speed*dt;if(canStand(nx,e.y))e.x=nx;if(canStand(e.x,ny))e.y=ny;}
      else if(now-e.lastAttack>(e.kind==='ranged'?1700:1100)){
        e.lastAttack=now;
        if(now>s.invulnUntil){p.hp=Math.max(0,p.hp-e.damage);addEffect(s,p.x,p.y,`-${e.damage}`,'#ff7777',now);}
      }
    }
    if(p.hp<=0){p.x=16;p.y=16;p.hp=p.maxHp;addEffect(s,p.x,p.y,'街で復活','#b6e9ff',now);}
    s.effects=s.effects.filter(e=>now-e.born<800);
    s.profile.x=p.x;s.profile.y=p.y;s.profile.hp=p.hp;
    if(now-s.lastSnapshot>90&&s.ws.readyState===WebSocket.OPEN){
      s.lastSnapshot=now;
      const snapshot:Snapshot={type:'state',you:s.user.id,players:[p],enemies:s.enemies.filter(e=>e.hp>0),effects:s.effects,xp:s.profile.xp,level:s.profile.level,coins:s.profile.coins,zone:zoneAt(p.x,p.y),time:now};
      s.ws.send(JSON.stringify(snapshot));
    }
    if(now-s.lastSave>15000){s.lastSave=now;void save(s.user,{...s.profile}).catch(console.error);}
  }
  const timer=setInterval(()=>{const now=Date.now();for(const s of sessions.values())tick(s,now,1/30);},1000/30);
  return {
    async upgrade(req:IncomingMessage,socket:any,head:Buffer,user:User){
      let profile:Profile;
      try{
        const existing=sessions.get(user.id);
        if(existing){await save(existing.user,{...existing.profile});existing.ws.close(4000,'new connection');sessions.delete(user.id);}
        profile=await load(user);
      }catch{socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}
      wss.handleUpgrade(req,socket,head,ws=>{
        const hp=Math.min(100+(profile.level-1)*8,Math.max(1,profile.hp));
        const player:Actor={id:user.id,name:user.username,x:profile.x,y:profile.y,hp,maxHp:100+(profile.level-1)*8,glyph:'@',facingX:1,facingY:0};
        const s:Session={user,ws,player,input:{...emptyInput},profile,enemies:spots.map((_,i)=>spawn(i)),effects:[],lastSwing:0,lastDash:0,invulnUntil:0,lastSave:Date.now(),lastSnapshot:0,kills:0};
        sessions.set(user.id,s);
        ws.on('message',data=>{try{const input=validInput(JSON.parse(data.toString()));if(input)s.input=input;}catch{}});
        ws.on('close',()=>{if(sessions.get(user.id)===s){sessions.delete(user.id);void save(user,{...s.profile}).catch(console.error);}});
      });
    },
    async shutdown(){clearInterval(timer);for(const s of sessions.values())s.ws.close();await Promise.all([...sessions.values()].map(s=>save(s.user,{...s.profile})));wss.close();}
  };
}
