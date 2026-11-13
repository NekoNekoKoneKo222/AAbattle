import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { TILE, WORLD_SITES, BIOMES, BOSS_PARTS, biomeAt, chunkKey, chestAt, currentWorldEvent, canStand, norm, zoneAt, compileSkill, compileWeapon, starterCraft, normalizeRpg, rollGear, gearBonus, QUESTS, WEAPON_BASES, type Actor, type CraftState, type Effect, type Input, type Projectile, type SkillProgram, type Snapshot, type Weapon } from '@glyph/shared';

export type User = { id: string; username: string };
export type Profile = { x: number; y: number; hp: number; xp: number; level: number; coins: number };
type Save = (user: User, profile: Profile) => Promise<void>;
type Load = (user: User) => Promise<Profile>;
type SaveCraft = (user: User, craft: CraftState) => Promise<void>;
type LoadCraft = (user: User) => Promise<CraftState>;
type AreFriends = (firstId:string,secondId:string)=>Promise<boolean>;
type Enemy = Actor & { targetX: number; targetY: number; speed: number; damage: number; lastAttack: number; respawn: number; windupUntil: number; staggerUntil: number; staggerImmuneUntil: number; poise: number; poiseMax: number; knockbackUntil: number; slowUntil: number; dotUntil: number; dotAt: number; attackMode?: 'strike'|'sweep'|'volley' };
type EnemyProjectile = Projectile & { vx: number; vy: number; damage: number; expires: number };
type FriendlyProjectile = Projectile & { vx: number; vy: number; damage: number; expires: number; program: SkillProgram | null; hitIds: Set<string>; pierce: number; special: string; element: string };
type Session = { user: User; ws: WebSocket; disconnectTimer: ReturnType<typeof setTimeout>|null; player: Actor; input: Input; inputAt: number; hasInput:boolean; profile: Profile; craft: CraftState; craftSave: Promise<void>; craftDirty: boolean; pendingWorld:boolean; pendingCraft:boolean; lastCraftAt: number; lastChatAt:number; lastWorldChatAt:number; partyId:string|null; dungeon: number; abyssRun:number; dungeonReturn: {x:number;y:number}|null; pvpMatch:string|null; pvpReturn:{x:number;y:number;hp:number}|null; awakeningUntil:number; lastAwaken:number; wildChunk:string; enemies: Enemy[]; projectiles: EnemyProjectile[]; friendly: FriendlyProjectile[]; effects: Effect[]; lastSwing: number; combo: number; lastDash: number; dashLatch: boolean; rollUntil: number; rollX: number; rollY: number; lastTrail: number; invulnUntil: number; lastParry: number; parryUntil: number; parrySuccessUntil: number; ep: number; skillCooldowns: number[]; lastSave: number; lastSnapshot: number; lastPresence:number; kills: number };
type PvpMatch={id:string;mode:'ranked'|'casual'|'unrestricted';size:number;teams:[string[],string[]];score:[number,number];round:number;roundStarted:number;intermissionUntil:number;finished:boolean};
type PvpQueue={mode:PvpMatch['mode'];size:number;members:string[];joined:number;rating:number};
const emptyInput: Input = { x:0,y:0,aimX:1,aimY:0,attack:false,dash:false };
const templates = [
  {kind:'melee',glyph:'g',name:'森のグリフ',hp:72,speed:54,damage:9},
  {kind:'ranged',glyph:'r',name:'文字射手',hp:58,speed:42,damage:8},
  {kind:'fast',glyph:'v',name:'疾走文字',hp:48,speed:85,damage:7},
  {kind:'elite',glyph:'G',name:'古きグリフ',hp:190,speed:48,damage:15},
  {kind:'boss',glyph:'Ø',name:'THE NULL',hp:680,speed:45,damage:22}
];
const spots = [[410,50],[540,190],[340,-200],[-430,-90],[210,550],[390,650],[-360,520],[-470,650],[70,760],[-620,470]];
const inTown=(x:number,y:number)=>biomeAt(Math.floor(x/TILE),Math.floor(y/TILE))==='city';
const canEnemyStand=(x:number,y:number)=>canStand(x,y)&&!inTown(x,y);
let effectId=0;
let projectileId=0;
function spawn(index:number):Enemy {
  const t=index===9?{kind:'dummy',glyph:'☷',name:'訓練人形',hp:250,speed:0,damage:0}:templates[index===8?4:index===7?3:index%3];
  const origin=spots[index],position=t.kind==='dummy'?safeNear(origin[0],origin[1]):safeEnemyNear(origin[0],origin[1]);
  const {x,y}=position;
  const poiseMax=t.kind==='boss'?150:t.kind==='elite'?65:30;
  return {id:`e${index}`,name:t.name,x,y,hp:t.hp,maxHp:t.hp,glyph:t.glyph,kind:t.kind,targetX:x,targetY:y,speed:t.speed,damage:t.damage,lastAttack:0,respawn:0,windupUntil:0,staggerUntil:0,staggerImmuneUntil:0,poise:poiseMax,poiseMax,knockbackUntil:0,slowUntil:0,dotUntil:0,dotAt:0};
}
function spawnWild(cx:number,cy:number,index:number):Enemy{
  const tx=cx*64+(index===0?18:46),ty=cy*64+(index===0?44:18),biome=biomeAt(tx,ty),danger=BIOMES[biome].danger;
  const e=spawn(danger>=5&&index===0?8:danger>=3?7:index),pos=safeNear((tx+.5)*TILE,(ty+.5)*TILE);
  e.id=`w:${cx},${cy},${index}`;e.name=`${BIOMES[biome].name}の${danger>=5&&index===0?'主':danger>=3?'守護文字':'野生文字'}`;
  e.kind=danger>=5&&index===0?'boss':danger>=3?'elite':index===1?'ranged':'melee';
  e.glyph=danger>=5&&index===0?'Ω':danger>=3?'◆':index===1?'r':'g';
  const enemyPos=safeEnemyNear(pos.x,pos.y);
  e.x=enemyPos.x;e.y=enemyPos.y;e.targetX=e.x;e.targetY=e.y;
  e.maxHp=65+danger*35+(e.kind==='boss'?430:e.kind==='elite'?120:0);e.hp=e.maxHp;
  e.damage=8+danger*3;e.speed=45+danger*5;
  e.poiseMax=e.kind==='boss'?150:e.kind==='elite'?65:30;e.poise=e.poiseMax;
  return e;
}
function safeNumber(v:unknown):number { return typeof v==='number' && Number.isFinite(v) ? Math.max(-1,Math.min(1,v)) : 0; }
function validInput(raw:unknown):Input|null {
  if (!raw || typeof raw!=='object' || (raw as {type?:unknown}).type!=='input') return null;
  const a=raw as Record<string,unknown>, move=norm(safeNumber(a.x),safeNumber(a.y));
  const aim=norm(safeNumber(a.aimX),safeNumber(a.aimY));
  return {x:move.x,y:move.y,aimX:aim.x,aimY:aim.y,attack:a.attack===true,dash:a.dash===true};
}
function normalizeCraft(raw:unknown):CraftState {
  const seed=starterCraft();
  if(!raw||typeof raw!=='object')return seed;
  const a=raw as Record<string,unknown>;
  const skills=Array.isArray(a.skills)?a.skills.slice(0,12).flatMap(v=>{try{return [compileSkill(v).skill];}catch{return [];}}):[];
  const weapons=Array.isArray(a.weapons)?a.weapons.slice(0,8).flatMap(v=>{try{return [compileWeapon(v).weapon];}catch{return [];}}):[];
  const ids=new Set(skills.map(s=>s.id)),weaponIds=new Set(weapons.map(w=>w.id));
  const materials=a.materials&&typeof a.materials==='object'?a.materials as Record<string,unknown>:{};
  const bag={iron:0,wood:0,crystal:0};
  for(const key of ['iron','wood','crystal'] as const)bag[key]=Number.isSafeInteger(materials[key])?Math.max(0,Math.min(9999,Number(materials[key]))):seed.materials[key];
  const equippedSkills=Array.from({length:4},(_,i)=>{const id=Array.isArray(a.equippedSkills)?a.equippedSkills[i]:null;return typeof id==='string'&&ids.has(id)?id:null;});
  const equippedWeaponId=typeof a.equippedWeaponId==='string'&&weaponIds.has(a.equippedWeaponId)?a.equippedWeaponId:null;
  const legacyParts=[...skills.flatMap(skill=>skill.nodes.map(node=>node.part)),...weapons.map(weapon=>weapon.element)];
  const unlockedParts=[...new Set([...(Array.isArray(a.unlockedParts)?a.unlockedParts:[]),...legacyParts].filter(v=>typeof v==='string'&&(BOSS_PARTS as readonly string[]).includes(v)))];
  const bossParts=Number.isSafeInteger(a.bossParts)?Math.max(0,Math.min(999,Number(a.bossParts))):0;
  const pvp=a.pvp&&typeof a.pvp==='object'?a.pvp as Record<string,unknown>:{};
  const rating=Number.isSafeInteger(pvp.rating)?Math.max(0,Math.min(99999,Number(pvp.rating))):1000;
  const wins=Number.isSafeInteger(pvp.wins)?Math.max(0,Number(pvp.wins)):0,losses=Number.isSafeInteger(pvp.losses)?Math.max(0,Number(pvp.losses)):0;
  const abyssDepth=Number.isSafeInteger(a.abyssDepth)?Math.max(0,Math.min(999,Number(a.abyssDepth))):0;
  return {skills,weapons,equippedSkills,equippedWeaponId,materials:bag,bossParts,unlockedParts,pvp:{rating,wins,losses,season:'1'},abyssDepth,awakened:a.awakened===true,rpg:normalizeRpg(a.rpg)};
}
function safeNear(x:number,y:number):{x:number;y:number} {
  if(canStand(x,y))return {x,y};
  for(let r=1;r<10;r++)for(let a=0;a<16;a++){
    const px=x+Math.cos(a*Math.PI/8)*r*TILE,py=y+Math.sin(a*Math.PI/8)*r*TILE;
    if(canStand(px,py))return {x:px,y:py};
  }
  return {x:16,y:16};
}
function safeEnemyNear(x:number,y:number):{x:number;y:number}{
  if(canEnemyStand(x,y))return {x,y};
  for(let r=1;r<12;r++)for(let a=0;a<16;a++){const px=x+Math.cos(a*Math.PI/8)*r*TILE,py=y+Math.sin(a*Math.PI/8)*r*TILE;if(canEnemyStand(px,py))return {x:px,y:py};}
  return {x:400,y:40};
}
export function attachGlyphInfinity(load:Load,save:Save,loadCraft:LoadCraft=async()=>starterCraft(),saveCraft:SaveCraft=async()=>{},areFriends:AreFriends=async()=>false) {
  const wss=new WebSocketServer({noServer:true,maxPayload:16384});
  const sessions=new Map<string,Session>();
  const worldChat:{from:string;message:string;time:number}[]=[];
  const upgrading=new Set<string>();
  const worldEnemies=spots.map((_,i)=>spawn(i));
  const contributors=new WeakMap<Enemy,Map<string,number>>();
  const parties=new Map<string,{id:string;code:string;leaderId:string;members:Set<string>}>();
  const invites=new Map<string,{id:string;partyId:string;targetId:string;fromName:string;expiresAt:number}>();
  const pvpQueue:PvpQueue[]=[];
  const pvpMatches=new Map<string,PvpMatch>();
  const encounterMembers=(s:Session):Session[]=>s.pvpMatch?[...sessions.values()].filter(other=>other.ws.readyState===WebSocket.OPEN&&other.pvpMatch===s.pvpMatch):s.dungeon?s.partyId?[...sessions.values()].filter(other=>other.ws.readyState===WebSocket.OPEN&&other.dungeon>0&&other.partyId===s.partyId):[s]:[...sessions.values()].filter(other=>other.ws.readyState===WebSocket.OPEN&&!other.dungeon&&!other.pvpMatch);
  const sendJson=(s:Session,value:unknown)=>{if(s.ws.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify(value));};
  const partyView=(s:Session)=>{const party=s.partyId?parties.get(s.partyId):null;return {type:'party:state',party:party?{id:party.id,code:party.code,leaderId:party.leaderId,members:[...party.members].map(id=>({id,name:sessions.get(id)?.user.username??'オフライン'}))}:null,invites:[...invites.values()].filter(v=>v.targetId===s.user.id&&v.expiresAt>Date.now()).map(({id,fromName})=>({id,fromName})),onlineIds:[...sessions.values()].filter(member=>member.ws.readyState===WebSocket.OPEN).map(member=>member.user.id)};};
  const broadcastParty=(partyId:string)=>{const party=parties.get(partyId);if(party)for(const id of party.members){const member=sessions.get(id);if(member)sendJson(member,partyView(member));}};
  const leaveParty=(s:Session)=>{if(!s.partyId)return;const id=s.partyId,party=parties.get(id);s.partyId=null;if(party){party.members.delete(s.user.id);if(!party.members.size)parties.delete(id);else{if(party.leaderId===s.user.id)party.leaderId=party.members.values().next().value!;broadcastParty(id);}}sendJson(s,partyView(s));};
  const addEffect=(s:Session,x:number,y:number,text:string,color:string,now:number,kind?:Effect['kind'],dx?:number,dy?:number)=>s.effects.push({id:++effectId,x,y,text,color,born:now,kind,dx,dy});
  const queueCraftSave=(s:Session)=>{
    const copy=structuredClone(s.craft);
    s.craftSave=s.craftSave.catch(()=>{}).then(()=>saveCraft(s.user,copy));
    s.craftDirty=false;
    return s.craftSave;
  };
  const sendCraft=(s:Session)=>{if(s.ws.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify({type:'craft:state',craft:s.craft}));};
  const refreshWild=(s:Session)=>{
    const tx=Math.floor(s.player.x/TILE),ty=Math.floor(s.player.y/TILE),key=chunkKey(tx,ty);
    if(s.wildChunk===key||s.dungeon)return;
    s.wildChunk=key;
    const cx=Math.floor(tx/64),cy=Math.floor(ty/64);
    for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)for(let i=0;i<2;i++){
      const gx=x*64+(i===0?18:46),gy=y*64+(i===0?44:18);
      if(Math.abs(gx)>120||Math.abs(gy)>120)continue;
      const id=`w:${x},${y},${i}`;if(!worldEnemies.some(e=>e.id===id))worldEnemies.push(spawnWild(x,y,i));
    }
  };
  const dungeonWave=(wave:number,depth=0):Enemy[]=>{
    const count=wave===3?1:wave+1;
    return Array.from({length:count},(_,i)=>{
      const e=spawn(wave===3?8:wave===2?7:i%3),pos=safeNear((i-(count-1)/2)*75,110);
      e.id=`d${wave}-${i}`;e.x=pos.x;e.y=pos.y;e.targetX=e.x;e.targetY=e.y;
      const scale=1+Math.min(10,depth)*.22;
      e.maxHp=Math.round(e.maxHp*(wave===3?1.3:1+wave*.45)*scale);e.hp=e.maxHp;e.damage+=wave*3+Math.min(10,depth)*3;
      return e;
    });
  };
  const leaveDungeon=(s:Session,now:number,complete:boolean,group=true)=>{
    const members=group&&s.partyId?encounterMembers(s):[s];
    for(const member of members){
      if(complete){member.craft.rpg.dungeonClears++;member.profile.coins+=100;member.craft.materials.crystal=Math.min(9999,member.craft.materials.crystal+3);member.craftDirty=true;void queueCraftSave(member).catch(console.error);sendCraft(member);}
      const pos=member.dungeonReturn??{x:16,y:16};member.player.x=pos.x;member.player.y=pos.y;member.player.hp=member.player.maxHp;
      member.profile.x=pos.x;member.profile.y=pos.y;member.profile.hp=member.player.hp;
      member.dungeon=0;member.abyssRun=0;member.dungeonReturn=null;member.wildChunk='';member.enemies=worldEnemies;member.projectiles=[];member.friendly=[];
      addEffect(member,pos.x,pos.y,complete?'遺跡踏破！':'ダンジョンから帰還',complete?'#f6d77b':'#9ff4ec',now);
    }
  };
  const equippedWeapon=(s:Session):Weapon|null=>s.craft.weapons.find(w=>w.id===s.craft.equippedWeaponId)??null;
  const heal=(s:Session,amount:number,now:number)=>{
    const gained=Math.min(Math.max(0,Math.round(amount)),s.player.maxHp-s.player.hp);
    if(gained){s.player.hp+=gained;addEffect(s,s.player.x,s.player.y,`+${gained}`,'#8effbc',now);}
  };
  const effectAllowed=(s:Session,guards:string[],now:number)=>guards.every(g=>g==='on_hit'||g==='low_hp'&&s.player.hp<=s.player.maxHp/2||g==='on_parry'&&now<s.parrySuccessUntil);
  function damageEnemy(s:Session,e:Enemy,rawDamage:number,now:number,element='neutral',program:SkillProgram|null=null,special='none',credit=true,basic=false) {
    if(e.hp<=0||(!s.dungeon&&!s.pvpMatch&&inTown(s.player.x,s.player.y)))return;
    let hits=contributors.get(e);if(!hits){hits=new Map();contributors.set(e,hits);}if(credit)hits.set(s.user.id,now);
    const offense=(rawDamage+(element==='void'&&e.kind==='boss'?rawDamage*.2:0)+gearBonus(s.craft.rpg,'damage')+Math.min(10,Math.floor((s.craft.rpg.mastery[equippedWeapon(s)?.primary??'bare']??0)/20))+Math.min(10,s.craft.rpg.rebirths))*(s.awakeningUntil>now?1.25:1);
    const damage=Math.min(150,Math.max(1,Math.round(offense*(basic&&e.kind==='boss'?.5:1))));
    e.hp=Math.max(0,e.hp-damage);
    if(e.kind!=='dummy'&&now>=e.staggerImmuneUntil){
      e.poise-=Math.max(3,damage*.45);
      if(e.poise<=0){e.poise=e.poiseMax;e.staggerUntil=now+(e.kind==='boss'?650:e.kind==='elite'?800:500);e.staggerImmuneUntil=now+(e.kind==='boss'?5000:3000);e.windupUntil=0;addEffect(s,e.x,e.y,'BREAK!','#ffe08a',now);}
    }
    addEffect(s,e.x,e.y,`-${damage}`,'#ff9393',now,'hit');
    if(element==='fire'||element==='poison'){e.dotUntil=now+(element==='fire'?2400:3600);e.dotAt=now+700;}
    if(element==='ice')e.slowUntil=now+2500;
    if(element==='light')heal(s,4,now);
    if(element==='dark'||special==='leech')heal(s,Math.min(10,damage*.2),now);
    if(special==='stun'&&e.kind!=='boss'&&now>=e.staggerImmuneUntil){e.staggerUntil=now+400;e.staggerImmuneUntil=now+2500;}
    const push=(distance:number)=>{if(e.kind==='boss'||e.kind==='elite'||now<e.knockbackUntil)return;const v=norm(e.x-s.player.x,e.y-s.player.y);const x=e.x+v.x*distance,y=e.y+v.y*distance;if(s.dungeon?canStand(x,y):canEnemyStand(x,y)){e.x=x;e.y=y;e.knockbackUntil=now+1100;}};
    if(special==='burst')for(const other of s.enemies)if(other!==e&&other.hp>0&&Math.hypot(other.x-e.x,other.y-e.y)<65){damageEnemy(s,other,Math.max(1,Math.floor(damage*.3)),now);addEffect(s,other.x,other.y,'✦','#ffb474',now);}
    if(element==='lightning'){
      const other=s.enemies.find(other=>other!==e&&other.hp>0&&Math.hypot(other.x-e.x,other.y-e.y)<90);
      if(other){damageEnemy(s,other,Math.max(1,Math.floor(damage*.35)),now);addEffect(s,other.x,other.y,'⚡','#f4e887',now);}
    }
    if(program)for(const effect of program.effects){
      if(!effectAllowed(s,effect.guards,now))continue;
      if(effect.part==='heal')heal(s,12,now);
      else if(effect.part==='absorb')heal(s,damage*.25,now);
      else if(effect.part==='knockback')push(32);
      else if(effect.part==='sunder'){const extra=Math.max(1,Math.round(damage*.22));e.hp=Math.max(0,e.hp-extra);addEffect(s,e.x,e.y,`-${extra}`,'#d99bff',now);}
      else if(effect.part==='ward')heal(s,16,now);
      else if(effect.part==='dot'){e.dotUntil=now+3000;e.dotAt=now+700;}
      else if(effect.part==='explosion'){
        addEffect(s,e.x,e.y,'✹','#ffbc6b',now);
        for(const other of s.enemies)if(other!==e&&other.hp>0&&Math.hypot(other.x-e.x,other.y-e.y)<72){damageEnemy(s,other,Math.max(1,Math.floor(damage*.5)),now);addEffect(s,other.x,other.y,'✹','#ffbc6b',now);}
      }
    }
    if(e.hp===0){
      e.respawn=now+(e.kind==='dummy'?1800:8000);
      if(e.kind!=='dummy'){
        const wildBiome=e.id.startsWith('w:')?biomeAt(e.x/TILE,e.y/TILE):null;
        const material=wildBiome&&['anomaly','abyss','boundary','secret'].includes(wildBiome)?'crystal':wildBiome==='forest'?'wood':e.kind==='boss'?'crystal':e.kind==='ranged'?'wood':'iron';
        const recipients=[...sessions.values()].filter(member=>member.dungeon===s.dungeon&&member.pvpMatch===null&&Math.hypot(member.player.x-e.x,member.player.y-e.y)<430&&((hits?.get(member.user.id)??0)>=now-30000||!!s.partyId&&member.partyId===s.partyId));
        for(const member of recipients){
          member.profile.xp+=e.kind==='boss'?60:e.kind==='elite'?25:10;
          member.profile.coins+=e.kind==='boss'?50:5;
          member.craft.rpg.kills++;
          if(e.kind==='boss'){member.craft.rpg.bossKills++;member.craft.bossParts=Math.min(999,(member.craft.bossParts??0)+1);addEffect(member,e.x,e.y,'◆ ボスの核 +1','#f6aaff',now);}
          const masteryKey=equippedWeapon(member)?.primary??'bare';member.craft.rpg.mastery[masteryKey]=Math.min(10000,(member.craft.rpg.mastery[masteryKey]??0)+1);
          if(member.craft.rpg.inventory.length<60&&(e.kind==='boss'||Math.random()<.22)){
            const gear=rollGear(member.profile.level,e.kind==='boss',Math.random,randomUUID());member.craft.rpg.inventory.push(gear);
            addEffect(member,e.x,e.y,`◆ ${gear.rarity} ${gear.name}`,'#f9db89',now);
          }
          member.craft.materials[material]=Math.min(9999,member.craft.materials[material]+1);
          member.craftDirty=true;member.pendingCraft=true;member.kills++;
          void queueCraftSave(member).catch(console.error);
          addEffect(member,e.x,e.y,`✧ +XP +${material}`,'#f5dc77',now);
        }
      }else addEffect(s,e.x,e.y,'訓練成功','#9ff6e6',now);
    }
  }
  function damagePlayer(s:Session,source:Enemy|null,damage:number,now:number){
    if(!s.pvpMatch && s.hasInput && now-s.inputAt>750)return;
    if(!s.dungeon&&!s.pvpMatch&&inTown(s.player.x,s.player.y))return;
    if(now<s.invulnUntil){addEffect(s,s.player.x,s.player.y,'MISS','#95eeff',now);return;}
    if(now<s.parryUntil){
      s.parrySuccessUntil=now+500;
      addEffect(s,s.player.x,s.player.y,'PARRY!','#b4f9ff',now);
      if(source){damageEnemy(s,source,Math.max(8,damage*2),now);if(source.kind!=='boss'&&now>=source.staggerImmuneUntil){source.staggerUntil=now+550;source.staggerImmuneUntil=now+2500;source.windupUntil=0;}}
      return;
    }
    const received=Math.max(1,Math.round(damage-gearBonus(s.craft.rpg,'guard')));
    s.player.hp=Math.max(0,s.player.hp-received);
    s.invulnUntil=now+450;
    addEffect(s,s.player.x,s.player.y,`-${received}`,'#ff7777',now,'hit');
  }
  const pvpTargets=(s:Session):Session[]=>{const match=s.pvpMatch?pvpMatches.get(s.pvpMatch):null;if(!match||match.finished||match.intermissionUntil>Date.now())return [];const own=match.teams.findIndex(team=>team.includes(s.user.id));return own<0?[]:match.teams[1-own].map(id=>sessions.get(id)).filter((v):v is Session=>!!v&&v.player.hp>0);};
  const enemyDamage=(e:Enemy,target:Session,bonus=0)=>{
    if(e.kind!=='boss')return e.damage+bonus;
    const fraction=e.hp<e.maxHp/2?.19:.14;
    return Math.max(e.damage+bonus,Math.round(target.player.maxHp*fraction));
  };
  const damageOpponent=(attacker:Session,target:Session,raw:number,now:number)=>{
    if(target.player.hp<=0||now<target.invulnUntil)return;
    if(now<target.parryUntil){target.parrySuccessUntil=now+500;addEffect(target,target.player.x,target.player.y,'PARRY!','#b4f9ff',now);return;}
    const match=attacker.pvpMatch?pvpMatches.get(attacker.pvpMatch):null;
    const damage=Math.max(1,Math.round(Math.min(55,raw)*(match?.mode==='ranked'?.8:1)-(match?.mode==='ranked'?0:gearBonus(target.craft.rpg,'guard'))));
    target.player.hp=Math.max(0,target.player.hp-damage);target.invulnUntil=now+180;
    addEffect(target,target.player.x,target.player.y,`-${damage}`,'#ff7777',now,'hit');
  };
  const resetPvpRound=(match:PvpMatch,now:number)=>{
    match.roundStarted=now;match.intermissionUntil=now+3000;match.round++;
    for(let team=0;team<2;team++)for(const [index,id] of match.teams[team].entries()){
      const member=sessions.get(id);if(!member)continue;
      const pos=safeNear((team===0?-1:1)*170,(index-(match.size-1)/2)*65);
      member.player.x=pos.x;member.player.y=pos.y;member.player.hp=match.mode==='ranked'?120:member.player.maxHp;
      member.ep=100;member.invulnUntil=now+3000;member.projectiles=[];member.friendly=[];member.skillCooldowns=[0,0,0,0];
      sendJson(member,{type:'pvp:notice',message:`第${match.round}ラウンド。3秒後に開始！`});
    }
  };
  const finishPvp=(match:PvpMatch,winner:number,now:number)=>{
    if(match.finished)return;match.finished=true;pvpMatches.delete(match.id);
    const avg=(team:string[])=>team.reduce((n,id)=>n+(sessions.get(id)?.craft.pvp.rating??1000),0)/Math.max(1,team.length);
    const expected=1/(1+Math.pow(10,(avg(match.teams[1])-avg(match.teams[0]))/400));
    const delta=Math.max(8,Math.round(32*(1-expected)));
    for(let team=0;team<2;team++)for(const id of match.teams[team]){
      const member=sessions.get(id);if(!member)continue;
      const won=team===winner;
      if(match.mode==='ranked')member.craft.pvp.rating=Math.max(0,member.craft.pvp.rating+(won?delta:-delta));
      if(won)member.craft.pvp.wins++;else member.craft.pvp.losses++;
      member.craftDirty=true;void queueCraftSave(member).catch(console.error);sendCraft(member);
      const pos=member.pvpReturn??{x:16,y:16,hp:member.player.maxHp};member.player.x=pos.x;member.player.y=pos.y;member.player.hp=Math.max(1,pos.hp);
      member.pvpMatch=null;member.pvpReturn=null;member.enemies=worldEnemies;member.wildChunk='';member.projectiles=[];member.friendly=[];
      sendJson(member,{type:'pvp:notice',message:`${won?'勝利':'敗北'}。${match.mode==='ranked'?`レーティング ${won?'+':'-'}${delta}`:'戦績を保存しました。'}`});
    }
  };
  const updatePvp=(match:PvpMatch,now:number)=>{
    if(match.finished||now<match.intermissionUntil)return;
    const alive=match.teams.map(team=>team.some(id=>(sessions.get(id)?.player.hp??0)>0));
    if(alive[0]&&alive[1]&&now-match.roundStarted<120000)return;
    const hp=match.teams.map(team=>team.reduce((n,id)=>n+(sessions.get(id)?.player.hp??0),0));
    const winner=!alive[0]?1:!alive[1]?0:hp[0]>=hp[1]?0:1;
    match.score[winner]++;
    for(const id of match.teams.flat()){const member=sessions.get(id);if(member)sendJson(member,{type:'pvp:notice',message:`ラウンド終了 ${match.score[0]} - ${match.score[1]}`});}
    if(match.score[winner]>=2)finishPvp(match,winner,now);else resetPvpRound(match,now);
  };
  function fireFriendly(s:Session,x:number,y:number,dx:number,dy:number,damage:number,now:number,program:SkillProgram|null,special:string,element:string,range:number,glyph:string){
    if(s.friendly.length>=36)return;
    const speed=program?.modifiers.includes('speed')?390:290;
    s.friendly.push({id:++projectileId,x,y,vx:dx*speed,vy:dy*speed,damage,expires:now+Math.min(2500,range/speed*1000),program,hitIds:new Set(),pierce:program?.effects.some(e=>e.part==='pierce')?2:0,special,element,glyph,color:element==='fire'?'#ffad72':element==='ice'?'#9beaff':'#e7d1ff'});
  }
  function castSkill(s:Session,slot:number,now:number){
    if(s.player.hp<=0)return;
    if(!Number.isInteger(slot)||slot<0||slot>3)return;
    const id=s.craft.equippedSkills[slot],graph=s.craft.skills.find(g=>g.id===id);
    if(!graph)return;
    const program=compileSkill(graph),{stats}=program;
    if(s.ep<stats.ep||now<s.skillCooldowns[slot]||now<s.rollUntil)return;
    if(program.trigger==='counter'&&now>s.parrySuccessUntil)return;
    s.ep-=stats.ep;s.skillCooldowns[slot]=now+stats.cooldownMs;
    const p=s.player,i=s.input;
    let aim=norm(i.aimX||p.facingX||1,i.aimY||p.facingY||0);
    if(!i.aimX&&!i.aimY){const near=s.enemies.filter(e=>e.hp>0&&e.kind!=='dummy'&&Math.hypot(e.x-p.x,e.y-p.y)<300).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(near)aim=norm(near.x-p.x,near.y-p.y);}
    const range=(program.modifiers.includes('range')?1.35:1)*(program.shape==='laser'?270:program.shape==='point'?180:program.shape==='cone'?120:program.shape==='circle'||program.shape==='self'?100:300);
    addEffect(s,p.x,p.y,graph.glyph,'#d5afff',now,'slash',aim.x,aim.y);
    if(program.shape==='line'||program.shape==='homing'||program.trigger==='shoot'){
      const shots=program.modifiers.includes('multishot')?[-.22,0,.22]:[0];
      for(const angle of shots){const direction=Math.atan2(aim.y,aim.x)+angle;fireFriendly(s,p.x,p.y,Math.cos(direction),Math.sin(direction),stats.damage,now,program,'none',program.element,range,graph.glyph);}
      return;
    }
    const targetPoint=program.shape==='point'?{x:p.x+aim.x*range,y:p.y+aim.y*range}:p;
    let hits=0;
    for(const e of s.enemies){
      if(e.hp<=0)continue;
      const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy),cos=d?((dx*aim.x+dy*aim.y)/d):0;
      const selected=program.shape==='laser'?d<=range&&cos>.93:program.shape==='cone'||program.trigger==='melee'?d<=range&&cos>.2:program.shape==='point'?Math.hypot(e.x-targetPoint.x,e.y-targetPoint.y)<75:d<=range;
      if(selected){damageEnemy(s,e,stats.damage,now,program.element,program);hits++;}
    }
    for(const target of pvpTargets(s)){
      const dx=target.player.x-p.x,dy=target.player.y-p.y,d=Math.hypot(dx,dy),cos=d?((dx*aim.x+dy*aim.y)/d):0;
      const selected=program.shape==='laser'?d<=range&&cos>.93:program.shape==='cone'||program.trigger==='melee'?d<=range&&cos>.2:program.shape==='point'?Math.hypot(target.player.x-targetPoint.x,target.player.y-targetPoint.y)<75:d<=range;
      if(selected){damageOpponent(s,target,stats.damage,now);hits++;}
    }
    if(!hits)for(const effect of program.effects)if(effect.part==='heal'&&effectAllowed(s,effect.guards,now)&&!effect.guards.includes('on_hit'))heal(s,12,now);
  }
  async function handleCommand(s:Session,raw:unknown){
    if(!raw||typeof raw!=='object')return;
    const a=raw as Record<string,unknown>,type=String(a.type??''),now=Date.now();
    if(type==='input'){const input=validInput(a);if(input){s.input=input;s.inputAt=now;s.hasInput=true;}return;}
    if(type==='chat:world'){
      if(now-s.lastWorldChatAt<1500){sendJson(s,{type:'chat:error',message:'チャットは少し間を空けて送信してください。'});return;}
      const message=Array.from(String(a.message??'').replace(/[\r\n\x00-\x1f]/g,' ').trim()).slice(0,160).join('');
      if(!message)return;
      s.lastWorldChatAt=now;
      const entry={from:s.user.username,message,time:now};
      worldChat.push(entry);if(worldChat.length>50)worldChat.shift();
      for(const member of sessions.values())sendJson(member,{type:'chat:world',...entry});
      return;
    }
    if(type==='cast'){castSkill(s,Number(a.slot),now);return;}
    if(type==='pvp:leave'){
      for(let i=pvpQueue.length-1;i>=0;i--)if(pvpQueue[i].members.includes(s.user.id)){const entry=pvpQueue.splice(i,1)[0];for(const id of entry.members){const member=sessions.get(id);if(member)sendJson(member,{type:'pvp:notice',message:'対戦待機を解除しました。'});}}
      if(s.pvpMatch){const match=pvpMatches.get(s.pvpMatch);if(match){const own=match.teams.findIndex(team=>team.includes(s.user.id));finishPvp(match,1-own,now);}}
      return;
    }
    if(type==='pvp:queue'){
      const mode=String(a.mode??''),size=Number(a.size);
      if(!['ranked','casual','unrestricted'].includes(mode)||![1,2,3].includes(size)){sendJson(s,{type:'pvp:notice',message:'対戦形式が不正です。'});return;}
      const party=s.partyId?parties.get(s.partyId):null;
      const members=party?[...party.members].map(id=>sessions.get(id)).filter((v):v is Session=>!!v):[s];
      if(party&&party.leaderId!==s.user.id){sendJson(s,{type:'pvp:notice',message:'パーティーのリーダーが申請してください。'});return;}
      if(members.length!==size||members.some(member=>member.dungeon||member.pvpMatch||pvpQueue.some(entry=>entry.members.includes(member.user.id)))){sendJson(s,{type:'pvp:notice',message:`${size}人のグループで通常ワールドにいる必要があります。`});return;}
      if(mode==='ranked'&&members.some(member=>member.craft.equippedSkills.some(id=>{const skill=member.craft.skills.find(g=>g.id===id);return skill?compileSkill(skill).stats.budget>80:false;}))){sendJson(s,{type:'pvp:notice',message:'ランク戦では予算80以下のスキルを装備してください。'});return;}
      const rating=members.reduce((n,member)=>n+member.craft.pvp.rating,0)/members.length;
      const entry:PvpQueue={mode:mode as PvpMatch['mode'],size,members:members.map(member=>member.user.id),joined:now,rating};
      const opponentIndex=pvpQueue.map((other,index)=>({other,index})).filter(({other})=>other.mode===mode&&other.size===size&&other.members.every(id=>sessions.has(id))).sort((a,b)=>Math.abs(a.other.rating-rating)-Math.abs(b.other.rating-rating)||a.other.joined-b.other.joined)[0]?.index??-1;
      if(opponentIndex<0){pvpQueue.push(entry);for(const member of members)sendJson(member,{type:'pvp:notice',message:`${size}対${size} ${mode} の対戦相手を探しています。`});return;}
      const opponent=pvpQueue.splice(opponentIndex,1)[0],match:PvpMatch={id:randomUUID(),mode:entry.mode,size,teams:[opponent.members,entry.members],score:[0,0],round:0,roundStarted:now,intermissionUntil:now,finished:false};
      pvpMatches.set(match.id,match);
      for(const id of match.teams.flat()){const member=sessions.get(id);if(!member)continue;member.pvpReturn={x:member.player.x,y:member.player.y,hp:member.player.hp};member.pvpMatch=match.id;member.enemies=[];member.projectiles=[];member.friendly=[];}
      resetPvpRound(match,now);return;
    }
    if(s.pvpMatch&&type!=='parry'&&type!=='rpg:surge'&&type!=='party:state'){sendJson(s,{type:'pvp:notice',message:'対戦中は装備やワールドを変更できません。'});return;}
    if(type.startsWith('party:')){
      try{
        if(type==='party:state'){sendJson(s,partyView(s));return;}
        if(now-s.lastChatAt<400)throw new Error('操作が速すぎます。');
        s.lastChatAt=now;
        if(type==='party:create'){
          if(s.partyId)throw new Error('すでにパーティーに参加しています。');
          const id=randomUUID();let code='';do{code=randomUUID().replace(/-/g,'').slice(0,6).toUpperCase();}while([...parties.values()].some(p=>p.code===code));parties.set(id,{id,code,leaderId:s.user.id,members:new Set([s.user.id])});s.partyId=id;broadcastParty(id);
        }else if(type==='party:join-code'){
          const code=String(a.code??'').trim().toUpperCase();const party=[...parties.values()].find(p=>p.code===code);
          if(!/^[A-F0-9]{6}$/.test(code)||!party)throw new Error('参加コードが見つかりません。リーダーに最新のコードを確認してください。');
          if(s.partyId||s.dungeon||party.members.size>=4||[...party.members].some(id=>sessions.get(id)?.dungeon))throw new Error('現在このパーティーには参加できません。');
          s.partyId=party.id;party.members.add(s.user.id);broadcastParty(party.id);
        }else if(type==='party:invite'){
          const party=s.partyId?parties.get(s.partyId):null,target=sessions.get(String(a.targetId??''));
          if(!party||party.leaderId!==s.user.id)throw new Error('リーダーだけが招待できます。');
          if(party.members.size>=4)throw new Error('パーティーは4人までです。');
          if(!target||target.partyId||target.user.id===s.user.id)throw new Error('相手は参加できません。');
          if(!await areFriends(s.user.id,target.user.id))throw new Error('フレンドだけ招待できます。');
          for(const [key,old] of invites)if(old.expiresAt<now||old.partyId===party.id&&old.targetId===target.user.id)invites.delete(key);
          const id=randomUUID(),invite={id,partyId:party.id,targetId:target.user.id,fromName:s.user.username,expiresAt:now+5*60_000};
          invites.set(id,invite);sendJson(target,partyView(target));sendJson(s,{type:'party:notice',message:`${target.user.username}を招待しました。`});
        }else if(type==='party:join'){
          const invite=invites.get(String(a.id??'')),party=invite?parties.get(invite.partyId):null;
          if(!invite||invite.targetId!==s.user.id||invite.expiresAt<now||!party)throw new Error('招待が見つからないか期限切れです。');
          if(s.partyId||party.members.size>=4||[...party.members].some(id=>sessions.get(id)?.dungeon))throw new Error('パーティーに参加できません。');
          if(!await areFriends(party.leaderId,s.user.id))throw new Error('フレンド関係を確認できません。');
          s.partyId=party.id;party.members.add(s.user.id);invites.delete(invite.id);broadcastParty(party.id);
        }else if(type==='party:leave'){
          if(s.dungeon)leaveDungeon(s,now,false,false);
          leaveParty(s);
        }else if(type==='party:chat'){
          const party=s.partyId?parties.get(s.partyId):null,message=String(a.message??'').trim().replace(/[\r\n\x00-\x1f]/g,' ').slice(0,160);
          if(!party||!message)throw new Error('パーティーに参加してメッセージを入力してください。');
          for(const id of party.members){const member=sessions.get(id);if(member)sendJson(member,{type:'party:chat',from:s.user.username,message});}
        }else return;
      }catch(error){sendJson(s,{type:'party:error',message:error instanceof Error?error.message:'パーティー操作に失敗しました。'});}
      return;
    }
    if(type==='parry'){
      if(now-s.lastParry>=1200&&now>=s.rollUntil){s.lastParry=now;s.parryUntil=now+230;addEffect(s,s.player.x,s.player.y,'◇','#9bf8ff',now);}
      return;
    }
    if(type==='rpg:surge'){
      if(s.craft.awakened&&s.player.hp>0&&now-s.lastAwaken>=45000){s.lastAwaken=now;s.awakeningUntil=now+12000;addEffect(s,s.player.x,s.player.y,'覚醒！ 12秒間攻撃+25%','#ffd88a',now);}
      return;
    }
    if(type==='arena'){
      if(s.dungeon)return;
      const pos=a.enter===true?safeNear(-620,390):{x:16,y:16};
      s.player.x=pos.x;s.player.y=pos.y;s.player.hp=s.player.maxHp;s.projectiles=[];s.friendly=[];
      addEffect(s,pos.x,pos.y,a.enter===true?'訓練場':'街へ帰還','#9ff4ec',now);
      return;
    }
    if(type==='rpg:dungeon'||type==='rpg:abyss'){
      const abyss=type==='rpg:abyss';
      if(s.dungeon||s.pvpMatch||s.profile.level<(abyss?10:2))return;
      const party=s.partyId?parties.get(s.partyId):null;
      if(party&&party.leaderId!==s.user.id){sendJson(s,{type:'party:error',message:'リーダーが協力ダンジョンを開始します。'});return;}
      const members=party?[...party.members].map(id=>sessions.get(id)).filter((v):v is Session=>!!v):[s];
      if(members.some(member=>member.dungeon||member.pvpMatch||member.profile.level<(abyss?10:2))){sendJson(s,{type:'party:error',message:`全員がLv.${abyss?10:2}以上で通常ワールドにいる必要があります。`});return;}
      const enemies=dungeonWave(1,abyss?1:0);
      for(const [index,member] of members.entries()){member.dungeonReturn={x:member.player.x,y:member.player.y};member.dungeon=1;member.abyssRun=abyss?1:0;const pos=safeNear((index-(members.length-1)/2)*24,-16);member.player.x=pos.x;member.player.y=pos.y;member.player.hp=member.player.maxHp;member.enemies=enemies;member.projectiles=[];member.friendly=[];addEffect(member,pos.x,pos.y,abyss?'無限深淵：第1層':'虚無の遺跡：第1波','#d9acff',now);}
      return;
    }
    if(type==='rpg:leave'){if(s.dungeon)leaveDungeon(s,now,false,false);return;}
    if(!type.startsWith('craft:')&&!type.startsWith('rpg:')&&!type.startsWith('world:'))return;
    if(now-s.lastCraftAt<200){s.ws.send(JSON.stringify({type:'craft:error',message:'操作が速すぎます。少し待ってください。'}));return;}
    s.lastCraftAt=now;
    try{
      if(type==='world:interact'){
        if(s.dungeon)throw new Error('ダンジョン内では探索できません。');
        const event=currentWorldEvent(now),eventNear=Math.hypot(s.player.x-(event.tx+.5)*TILE,s.player.y-(event.ty+.5)*TILE)<80;
        const site=WORLD_SITES.find(site=>Math.hypot(s.player.x-(site.tx+.5)*TILE,s.player.y-(site.ty+.5)*TILE)<80);
        const chest=chestAt(Math.floor(s.player.x/TILE/64),Math.floor(s.player.y/TILE/64));
        const chestNear=Math.hypot(s.player.x-(chest.tx+.5)*TILE,s.player.y-(chest.ty+.5)*TILE)<80;
        let message='近くに調べられるものはありません。';
        if(eventNear){
          if(s.craft.rpg.eventClaims.includes(event.id))message=`${event.name}：今日の報酬は受け取り済みです。`;
          else{
            s.craft.rpg.eventClaims.push(event.id);s.craft.rpg.eventClaims=s.craft.rpg.eventClaims.slice(-16);
            if(event.reward==='coins')s.profile.coins+=40;
            else s.craft.materials[event.reward as 'iron'|'crystal']=Math.min(9999,s.craft.materials[event.reward as 'iron'|'crystal']+3);
            message=`${event.name}を発見！ ${event.reward==='coins'?'40コイン':event.reward==='iron'?'鉄3個':'結晶3個'}を獲得。`;
            await queueCraftSave(s);await save(s.user,{...s.profile});sendCraft(s);
          }
        }else if(chestNear){
          if(s.craft.rpg.openedChests.includes(chest.id))message='この宝箱は開封済みです。';
          else{
            s.craft.rpg.openedChests.push(chest.id);
            const danger=BIOMES[biomeAt(chest.tx,chest.ty)].danger,reward=20+danger*10;
            s.profile.coins+=reward;s.craft.materials.crystal=Math.min(9999,s.craft.materials.crystal+Math.max(1,Math.floor(danger/2)));
            message=`宝箱を開封！ ${reward}コインと結晶を獲得。`;
            await queueCraftSave(s);await save(s.user,{...s.profile});sendCraft(s);
          }
        }else if(site?.kind==='merchant')message='商人ノア：鉄・木は各10コイン、結晶は25コイン。マップから購入できます。';
        else if(site?.kind==='npc')message='案内人リラ：道標に近づくと地図に記録されます。記録した道標から別の道標へ移動できます。今日は光るイベント地点も探してみて。';
        else if(site)message=`${site.name}を発見しました。マップからファストトラベルできます。`;
        s.ws.send(JSON.stringify({type:'world:dialog',message}));return;
      }else if(type==='world:buy'){
        const merchant=WORLD_SITES.find(site=>site.id==='merchant')!;
        if(s.dungeon||Math.hypot(s.player.x-(merchant.tx+.5)*TILE,s.player.y-(merchant.ty+.5)*TILE)>90)throw new Error('商人の近くで購入してください。');
        const item=String(a.item??'');if(!['iron','wood','crystal'].includes(item))throw new Error('商品がありません。');
        const cost=item==='crystal'?25:10;if(s.profile.coins<cost)throw new Error('コインが足りません。');
        const key=item as 'iron'|'wood'|'crystal';if(s.craft.materials[key]>=9999)throw new Error('素材の所持上限です。');
        s.profile.coins-=cost;s.craft.materials[key]++;
      }else if(type==='world:travel'){
        if(s.dungeon)throw new Error('ダンジョン内では移動できません。');
        const target=WORLD_SITES.find(site=>site.id===a.id&&site.kind==='waypoint');
        if(!target||!s.craft.rpg.discovered.includes(target.id))throw new Error('未発見の道標です。');
        const origin=WORLD_SITES.find(site=>site.kind==='waypoint'&&s.craft.rpg.discovered.includes(site.id)&&Math.hypot(s.player.x-(site.tx+.5)*TILE,s.player.y-(site.ty+.5)*TILE)<100);
        if(!origin)throw new Error('道標の近くから移動してください。');
        const pos=safeNear((target.tx+.5)*TILE,(target.ty+.5)*TILE);s.player.x=pos.x;s.player.y=pos.y;s.profile.x=pos.x;s.profile.y=pos.y;
        s.projectiles=[];s.friendly=[];s.player.hp=s.player.maxHp;s.profile.hp=s.player.hp;
        addEffect(s,pos.x,pos.y,`${target.name}へ移動`,'#7feada',now);
      }else if(type==='rpg:equip'){
        const id=String(a.id??''),gear=s.craft.rpg.inventory.find(g=>g.id===id);
        if(!gear)throw new Error('装備が見つかりません。');s.craft.rpg.equipped[gear.slot]=gear.id;
      }else if(type==='rpg:upgrade'){
        const gear=s.craft.rpg.inventory.find(g=>g.id===a.id);
        if(!gear)throw new Error('装備が見つかりません。');if(gear.upgrade>=10)throw new Error('強化上限です。');
        const cost=(gear.upgrade+1)*10;if(s.profile.coins<cost||s.craft.materials.iron<gear.upgrade+1)throw new Error('コインか鉄が足りません。');
        s.profile.coins-=cost;s.craft.materials.iron-=gear.upgrade+1;gear.upgrade++;
      }else if(type==='rpg:reroll'){
        const gear=s.craft.rpg.inventory.find(g=>g.id===a.id);
        if(!gear)throw new Error('装備が見つかりません。');if(s.profile.coins<30||s.craft.materials.crystal<1)throw new Error('コインか結晶が足りません。');
        s.profile.coins-=30;s.craft.materials.crystal--;gear.option=(['hp','damage','guard'] as const).filter(option=>option!==gear.option)[Math.floor(Math.random()*2)];
      }else if(type==='rpg:favorite'){
        const gear=s.craft.rpg.inventory.find(g=>g.id===a.id);if(!gear)throw new Error('装備が見つかりません。');gear.favorite=!gear.favorite;
      }else if(type==='rpg:salvage'){
        const gear=s.craft.rpg.inventory.find(g=>g.id===a.id);if(!gear)throw new Error('装備が見つかりません。');
        if(gear.favorite)throw new Error('お気に入りは解体できません。');
        s.craft.rpg.inventory=s.craft.rpg.inventory.filter(g=>g.id!==gear.id);
        if(s.craft.rpg.equipped[gear.slot]===gear.id)s.craft.rpg.equipped[gear.slot]=null;
        s.craft.materials.iron=Math.min(9999,s.craft.materials.iron+1+Math.floor(gear.upgrade/2));
      }else if(type==='rpg:claim'){
        const quest=QUESTS.find(q=>q.id===a.id);if(!quest)throw new Error('クエストが見つかりません。');
        if(s.craft.rpg.claimed.includes(quest.id))throw new Error('受取済みです。');
        if(s.craft.rpg[quest.kind]<quest.target)throw new Error('クエスト未達成です。');
        s.craft.rpg.claimed.push(quest.id);s.profile.coins+=quest.coins;
      }else if(type==='rpg:rebirth'){
        if(s.dungeon||s.profile.level<100)throw new Error('Lv.100で街にいると転生できます。');
        s.profile.level=1;s.profile.xp=0;s.craft.rpg.rebirths++;s.craft.rpg.rebirthPoints++;s.player.maxHp=100+gearBonus(s.craft.rpg,'hp');s.player.hp=s.player.maxHp;
      }else if(type==='rpg:awaken'){
        if(s.craft.awakened)throw new Error('覚醒済みです。');
        if(s.craft.rpg.bossKills<5||s.craft.abyssDepth<3)throw new Error('ボス5体撃破と無限深淵3層到達で覚醒できます。');
        s.craft.awakened=true;
      }else if(type==='craft:unlock-part'){
        const id=String(a.id??'');if(!(BOSS_PARTS as readonly string[]).includes(id))throw new Error('解放できないパーツです。');
        if(s.craft.unlockedParts.includes(id))throw new Error('解放済みです。');
        if(s.craft.bossParts<1)throw new Error('ボスの核が足りません。');
        s.craft.bossParts--;s.craft.unlockedParts.push(id);
      }else if(type==='craft:save-skill'){
        const parsed=compileSkill(a.skill),index=s.craft.skills.findIndex(g=>g.id===parsed.skill.id);
        if(parsed.skill.nodes.some(node=>(BOSS_PARTS as readonly string[]).includes(node.part)&&!s.craft.unlockedParts.includes(node.part)))throw new Error('ボスの核でパーツを解放してください。');
        if(index<0&&s.craft.skills.length>=12)throw new Error('保存できるスキルは12個までです。');
        const skill={...parsed.skill,id:index>=0?parsed.skill.id:randomUUID()};
        if(index>=0)s.craft.skills[index]=skill;else s.craft.skills.push(skill);
      }else if(type==='craft:delete-skill'){
        const id=String(a.id??'');
        if(!s.craft.skills.some(g=>g.id===id))throw new Error('スキルが見つかりません。');
        s.craft.skills=s.craft.skills.filter(g=>g.id!==id);
        s.craft.equippedSkills=s.craft.equippedSkills.map(v=>v===id?null:v);
      }else if(type==='craft:equip-skill'){
        const slot=Number(a.slot),id=a.id===null?null:String(a.id??'');
        if(!Number.isInteger(slot)||slot<0||slot>3||id!==null&&!s.craft.skills.some(g=>g.id===id))throw new Error('装備するスキルが不正です。');
        s.craft.equippedSkills[slot]=id;
      }else if(type==='craft:make-weapon'){
        const {weapon,stats}=compileWeapon(a.weapon);
        if((BOSS_PARTS as readonly string[]).includes(weapon.element)&&!s.craft.unlockedParts.includes(weapon.element))throw new Error('ボスの核で属性を解放してください。');
        if(s.craft.weapons.length>=8)throw new Error('保存できる武器は8個までです。');
        for(const key of ['iron','wood','crystal'] as const)if(s.craft.materials[key]<stats.cost[key])throw new Error('武器素材が足りません。');
        for(const key of ['iron','wood','crystal'] as const)s.craft.materials[key]-=stats.cost[key];
        s.craft.weapons.push({...weapon,id:randomUUID()});
      }else if(type==='craft:equip-weapon'){
        const id=a.id===null?null:String(a.id??'');
        if(id!==null&&!s.craft.weapons.some(w=>w.id===id))throw new Error('武器が見つかりません。');
        s.craft.equippedWeaponId=id;
      }else if(type==='craft:salvage-weapon'){
        const id=String(a.id??''),weapon=s.craft.weapons.find(w=>w.id===id);
        if(!weapon)throw new Error('武器が見つかりません。');
        const cost=compileWeapon(weapon).stats.cost;
        for(const key of ['iron','wood','crystal'] as const)s.craft.materials[key]=Math.min(9999,s.craft.materials[key]+Math.floor(cost[key]/2));
        s.craft.weapons=s.craft.weapons.filter(w=>w.id!==id);
        if(s.craft.equippedWeaponId===id)s.craft.equippedWeaponId=null;
      }else return;
      await queueCraftSave(s);
      if(type==='rpg:rebirth'||type==='rpg:claim'||type==='rpg:upgrade'||type==='rpg:reroll'||type==='world:buy'||type==='world:travel')await save(s.user,{...s.profile});
      sendCraft(s);
    }catch(error){
      if(s.ws.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify({type:'craft:error',message:error instanceof Error?error.message:'保存に失敗しました。'}));
    }
  }
  function tick(s:Session,now:number,dt:number,simulateEnemies:boolean) {
    const p=s.player;
    s.ep=Math.min(100,s.ep+dt*9);
    const i=now-s.inputAt<250&&p.hp>0?s.input:emptyInput;
    const moving=i.x!==0||i.y!==0;
    if (i.aimX||i.aimY) {p.facingX=i.aimX;p.facingY=i.aimY;}
    else if (moving) {p.facingX=i.x;p.facingY=i.y;}
    if (i.dash && !s.dashLatch && moving && now-s.lastDash>=1400 && now>=s.rollUntil) {
      s.lastDash=now;s.rollUntil=now+240;s.invulnUntil=now+270;
      s.rollX=i.x;s.rollY=i.y;
      addEffect(s,p.x,p.y,'✧','#68e8ff',now,'trail');
    }
    s.dashLatch=i.dash;
    const rolling=now<s.rollUntil;
    const moveX=rolling?s.rollX:i.x,moveY=rolling?s.rollY:i.y;
    const speed=rolling?320:120;
    const nx=p.x+moveX*speed*dt,ny=p.y+moveY*speed*dt;
    if(canStand(nx,p.y)&&(!s.pvpMatch||Math.abs(nx)<290))p.x=nx;
    if(canStand(p.x,ny)&&(!s.pvpMatch||Math.abs(ny)<230))p.y=ny;
    if(!s.pvpMatch)refreshWild(s);
    if(!s.dungeon&&!s.pvpMatch){
      const rpg=s.craft.rpg,key=chunkKey(Math.floor(p.x/TILE),Math.floor(p.y/TILE));let discovered=false;
      if(!rpg.explored.includes(key)&&rpg.explored.length<36){rpg.explored.push(key);discovered=true;addEffect(s,p.x,p.y,'新しい地域を探索','#8fe9d9',now);}
      for(const site of WORLD_SITES){
        if(rpg.discovered.includes(site.id)||Math.hypot(p.x-(site.tx+.5)*TILE,p.y-(site.ty+.5)*TILE)>96)continue;
        rpg.discovered.push(site.id);discovered=true;addEffect(s,p.x,p.y,`${site.name}を発見`,'#f7db8e',now);
        if(site.kind==='secret'){s.craft.materials.crystal=Math.min(9999,s.craft.materials.crystal+5);addEffect(s,p.x,p.y,'秘密の結晶 +5','#dfa9ff',now);}
      }
      if(discovered){s.craftDirty=true;s.pendingWorld=true;void queueCraftSave(s).catch(console.error);}
    }
    if(rolling && now-s.lastTrail>60){s.lastTrail=now;addEffect(s,p.x,p.y,'·','#6de8fb',now,'trail');}

    const weapon=equippedWeapon(s),weaponStats=weapon?compileWeapon(weapon).stats:null;
    const attackInterval=weaponStats?.interval??390;
    if(i.attack && !rolling && now-s.lastSwing>=attackInterval && p.hp>0) {
      s.combo=now-s.lastSwing<950?s.combo%3+1:1;
      s.lastSwing=now;
      let aim=norm(i.aimX||p.facingX||1,i.aimY||p.facingY||0);
      if(!i.aimX&&!i.aimY){
        const nearby=s.enemies.filter(e=>e.hp>0&&Math.hypot(e.x-p.x,e.y-p.y)<108).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
        if(nearby)aim=norm(nearby.x-p.x,nearby.y-p.y);
      }
      p.facingX=aim.x;p.facingY=aim.y;
      addEffect(s,p.x,p.y,weapon?.glyph??'⚔','#ffe17f',now,'slash',aim.x,aim.y);
      const ranked=s.pvpMatch&&pvpMatches.get(s.pvpMatch)?.mode==='ranked';
      const damage=(ranked?(weapon?WEAPON_BASES[weapon.primary].damage:12):(weaponStats?.damage??12)+Math.min(12,s.profile.level*2))+(s.combo===3?9:s.combo===2?4:0);
      if(weaponStats?.mode==='ranged'){
        fireFriendly(s,p.x,p.y,aim.x,aim.y,damage,now,null,weapon?.special??'none',weapon?.element??'neutral',weaponStats.range,weapon?.glyph??'✦');
      }else for(const e of s.enemies) {
        if(e.hp<=0)continue;
        const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy);
        if(d>(weaponStats?.range??78) || d<1 || (dx*aim.x+dy*aim.y)/d<0.05)continue;
        damageEnemy(s,e,damage,now,weapon?.element??'neutral',null,weapon?.special??'none',true,true);
        if(e.kind!=='boss'&&e.kind!=='elite'&&now>=e.knockbackUntil){const push=norm(dx,dy),knock=8+(s.combo===3?8:0);if(s.dungeon?canStand(e.x+push.x*knock,e.y+push.y*knock):canEnemyStand(e.x+push.x*knock,e.y+push.y*knock)){e.x+=push.x*knock;e.y+=push.y*knock;e.knockbackUntil=now+900;}}
      }
      if(weaponStats?.mode!=='ranged')for(const target of pvpTargets(s)){
        const dx=target.player.x-p.x,dy=target.player.y-p.y,d=Math.hypot(dx,dy);
        if(d>Math.min(125,weaponStats?.range??78)||d<1||(dx*aim.x+dy*aim.y)/d<.05)continue;
        damageOpponent(s,target,damage,now);
      }
    }
    while(s.profile.level<100&&s.profile.xp>=20*s.profile.level){s.profile.xp-=20*s.profile.level;s.profile.level++;p.maxHp=100+(s.profile.level-1)*8+gearBonus(s.craft.rpg,'hp');p.hp=p.maxHp;addEffect(s,p.x,p.y,'LEVEL UP!','#7bffa5',now);}
    if(s.profile.level>=100)s.profile.xp=0;
    p.maxHp=s.pvpMatch&&pvpMatches.get(s.pvpMatch)?.mode==='ranked'?120:100+(s.profile.level-1)*8+gearBonus(s.craft.rpg,'hp');p.hp=Math.min(p.hp,p.maxHp);

    if(simulateEnemies)for(let n=0;n<s.enemies.length;n++){
      const e=s.enemies[n];
      if(e.hp<=0){if(!s.dungeon&&now>=e.respawn){if(e.id.startsWith('w:')){const [cx,cy,index]=e.id.slice(2).split(',').map(Number);s.enemies[n]=spawnWild(cx,cy,index);}else s.enemies[n]=spawn(n);}continue;}
      if(e.kind==='boss'&&e.hp<e.maxHp/2&&e.speed<70){e.damage+=8;e.speed=72;addEffect(s,e.x,e.y,'狂暴化 : PHASE 2','#e389ff',now);}
      if(e.dotUntil>now&&e.dotAt<=now){e.dotAt=now+700;damageEnemy(s,e,3,now,'neutral',null,'none',false);}
      if(e.kind==='dummy')continue;
      const target=encounterMembers(s).filter(member=>member.player.hp>0&&(!member.hasInput||now-member.inputAt<=750)&&(s.dungeon||!inTown(member.player.x,member.player.y))).sort((a,b)=>Math.hypot(a.player.x-e.x,a.player.y-e.y)-Math.hypot(b.player.x-e.x,b.player.y-e.y))[0];
      if(!target){e.windupUntil=0;continue;}
      const tp=target.player,dx=tp.x-e.x,dy=tp.y-e.y,d=Math.hypot(dx,dy);
      if(d>330){e.windupUntil=0;continue;}
      if(now<e.staggerUntil)continue;
      const ranged=e.kind==='ranged';
      const range=ranged?170:e.kind==='boss'?85:29;
      if(e.windupUntil){
        if(now<e.windupUntil)continue;
        e.windupUntil=0;e.lastAttack=now;
        if(e.kind==='boss'&&e.attackMode==='volley'){
          const direction=Math.atan2(e.targetY-e.y,e.targetX-e.x);
          for(const angle of [-.36,-.18,0,.18,.36]){
            const a=direction+angle;
            for(const member of encounterMembers(s))if(member.projectiles.length<30)member.projectiles.push({id:++projectileId,x:e.x,y:e.y,vx:Math.cos(a)*230,vy:Math.sin(a)*230,damage:enemyDamage(e,member),expires:now+1900,glyph:'◆',color:'#f581e9'});
          }
          addEffect(s,e.x,e.y,'五連弾','#ef87df',now);
        }else if(e.kind==='boss'&&e.attackMode==='sweep'){
          for(const member of encounterMembers(s))if(member.player.hp>0&&Math.hypot(member.player.x-e.x,member.player.y-e.y)<86)damagePlayer(member,e,enemyDamage(e,member,5),now);
          addEffect(s,e.x,e.y,'薙ぎ払い','#f58d9d',now);
        }else if(ranged){
          const v=norm(tp.x-e.x,tp.y-e.y);
          if(target.projectiles.length<24)target.projectiles.push({id:++projectileId,x:e.x,y:e.y,vx:v.x*220,vy:v.y*220,damage:e.damage,expires:now+1800,glyph:'✦',color:'#ff9e77'});
          addEffect(s,e.x,e.y,'✦','#ffb078',now);
        } else if(d<(e.kind==='boss'?55:range+13)){
          damagePlayer(target,e,enemyDamage(e,target),now);
        }
        continue;
      }
      if(d>range){const v=norm(dx,dy),speed=e.speed*(e.slowUntil>now?.55:1),ex=e.x+v.x*speed*dt,ey=e.y+v.y*speed*dt;if(s.dungeon?canStand(ex,e.y):canEnemyStand(ex,e.y))e.x=ex;if(s.dungeon?canStand(e.x,ey):canEnemyStand(e.x,ey))e.y=ey;}
      else if(now-e.lastAttack>(ranged?1700:e.kind==='boss'?e.hp<e.maxHp/2?850:1050:1100)){
        if(e.kind==='boss'){
          e.attackMode=Math.floor(now/1650)%3===0?'volley':Math.floor(now/1650)%3===1?'sweep':'strike';
          e.targetX=tp.x;e.targetY=tp.y;
          addEffect(s,e.x,e.y,e.attackMode==='volley'?'◆ 五連弾の予兆':e.attackMode==='sweep'?'◯ 薙ぎ払いの予兆':'! 強打の予兆','#ff7777',now);
        }
        e.windupUntil=now+(ranged?520:e.kind==='fast'?300:e.kind==='boss'?780:450);
      }
    }
    s.projectiles=s.projectiles.filter(b=>{
      if(now>b.expires)return false;
      const x=b.x+b.vx*dt,y=b.y+b.vy*dt;
      if(!canStand(x,y))return false;
      b.x=x;b.y=y;
      if(Math.hypot(p.x-x,p.y-y)<16){damagePlayer(s,null,b.damage,now);return false;}
      return true;
    });
    s.friendly=s.friendly.filter(b=>{
      if(now>b.expires)return false;
      if(b.program?.shape==='homing'){
        const target=s.enemies.filter(e=>e.hp>0&&!b.hitIds.has(e.id)).sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];
        if(target){const v=norm(target.x-b.x,target.y-b.y),speed=Math.hypot(b.vx,b.vy);b.vx=v.x*speed;b.vy=v.y*speed;}
      }
      const x=b.x+b.vx*dt,y=b.y+b.vy*dt;
      if(!canStand(x,y))return false;
      b.x=x;b.y=y;
      const target=s.enemies.find(e=>e.hp>0&&!b.hitIds.has(e.id)&&Math.hypot(e.x-x,e.y-y)<18);
      if(target){
        b.hitIds.add(target.id);
        damageEnemy(s,target,b.damage,now,b.element,b.program,b.special,true,b.program===null);
        if(b.pierce>0){b.pierce--;return true;}
        return false;
      }
      const opponent=pvpTargets(s).find(target=>!b.hitIds.has(target.user.id)&&Math.hypot(target.player.x-x,target.player.y-y)<18);
      if(opponent){b.hitIds.add(opponent.user.id);damageOpponent(s,opponent,b.damage,now);if(b.pierce>0){b.pierce--;return true;}return false;}
      return true;
    });
    if(p.hp<=0){if(s.pvpMatch){}else if(s.dungeon&&encounterMembers(s).length>1){p.x=0;p.y=0;p.hp=Math.max(1,Math.floor(p.maxHp/2));s.invulnUntil=now+2500;addEffect(s,p.x,p.y,'仲間のもとで復活','#b6e9ff',now);}else if(s.dungeon)leaveDungeon(s,now,false);else{p.x=16;p.y=16;p.hp=p.maxHp;s.projectiles=[];addEffect(s,p.x,p.y,'街で復活','#b6e9ff',now);}}
    if(simulateEnemies&&s.dungeon&&s.enemies.every(e=>e.hp<=0)){
      if(s.dungeon===3&&!s.abyssRun)leaveDungeon(s,now,true);
      else{
        const members=encounterMembers(s),clearedDepth=s.dungeon===3&&s.abyssRun>0,completedDepth=s.abyssRun,nextDepth=s.dungeon===3?s.abyssRun+1:s.abyssRun,wave=s.dungeon===3?1:s.dungeon+1,enemies=dungeonWave(wave,nextDepth);
        for(const member of members){
          if(clearedDepth){member.craft.abyssDepth=Math.max(member.craft.abyssDepth,completedDepth);member.profile.coins+=80+completedDepth*20;member.craft.materials.crystal=Math.min(9999,member.craft.materials.crystal+2);member.craftDirty=true;void queueCraftSave(member).catch(console.error);sendCraft(member);}
          member.abyssRun=nextDepth;member.dungeon=wave;member.enemies=enemies;member.projectiles=[];member.player.hp=Math.min(member.player.maxHp,member.player.hp+Math.round(member.player.maxHp*.25));addEffect(member,member.player.x,member.player.y,nextDepth?`深淵 第${nextDepth}層 第${wave}波`:`第${wave}波`,'#d9acff',now);
        }
      }
    }
    s.effects=s.effects.filter(e=>now-e.born<650);
    if(!s.pvpMatch){s.profile.x=p.x;s.profile.y=p.y;s.profile.hp=p.hp;}
    if(now-s.lastSnapshot>=80&&s.ws.readyState===WebSocket.OPEN){
      s.lastSnapshot=now;
      const nearby=encounterMembers(s).filter(member=>member===s||Math.hypot(member.player.x-p.x,member.player.y-p.y)<700);
      const match=s.pvpMatch?pvpMatches.get(s.pvpMatch):null;
      const snapshot:Snapshot={type:'state',you:s.user.id,players:[p,...nearby.filter(member=>member!==s).map(member=>({...member.player,kind:member.partyId&&member.partyId===s.partyId?'party':'player'}))],enemies:s.enemies.filter(e=>e.hp>0&&(!e.id.startsWith('w:')||Math.hypot(e.x-p.x,e.y-p.y)<650)),projectiles:nearby.flatMap(member=>[...member.projectiles,...member.friendly]).filter(b=>Math.hypot(b.x-p.x,b.y-p.y)<700).map(({id,x,y,glyph,color})=>({id,x,y,glyph,color})),effects:nearby.flatMap(member=>member.effects).filter(effect=>Math.hypot(effect.x-p.x,effect.y-p.y)<700).slice(-120),xp:s.profile.xp,level:s.profile.level,coins:s.profile.coins,zone:match?'PvP アリーナ':s.dungeon?s.abyssRun?`無限深淵 第${s.abyssRun}層 第${s.dungeon}波`:`虚無の遺跡 第${s.dungeon}波`:zoneAt(p.x,p.y),dungeon:s.dungeon,pvp:match?{mode:match.mode,size:match.size,round:match.round,score:match.score,remaining:Math.max(0,Math.ceil((120000-(now-match.roundStarted))/1000)),team:match.teams.findIndex(team=>team.includes(s.user.id))}:undefined,world:s.pendingWorld?{explored:s.craft.rpg.explored,discovered:s.craft.rpg.discovered}:undefined,craft:s.pendingCraft?s.craft:undefined,time:now,rollUntil:s.rollUntil,rollX:s.rollX,rollY:s.rollY,rollReadyAt:s.lastDash+1400,parryUntil:s.parryUntil,parryReadyAt:s.lastParry+1200,swingAt:s.lastSwing,combo:now-s.lastSwing<1000?s.combo:0,ep:Math.floor(s.ep),maxEp:100,skillCooldowns:s.skillCooldowns,weaponGlyph:weapon?.glyph??'⚔'};
      s.ws.send(JSON.stringify(snapshot));
      s.pendingWorld=false;
      s.pendingCraft=false;
    }
    if(now-s.lastSave>15000){s.lastSave=now;if(!s.pvpMatch)void save(s.user,{...s.profile}).catch(console.error);if(s.craftDirty)void queueCraftSave(s).catch(console.error);}
    if(!s.dungeon&&!s.pvpMatch&&now-s.lastPresence>=1000){
      s.lastPresence=now;
      sendJson(s,{type:'world:presence',players:[...sessions.values()].filter(member=>member.ws.readyState===WebSocket.OPEN&&!member.dungeon&&!member.pvpMatch).map(member=>({id:member.user.id,name:member.user.username,x:member.player.x,y:member.player.y,hp:member.player.hp,maxHp:member.player.maxHp,party:!!s.partyId&&member.partyId===s.partyId})),enemies:worldEnemies.filter(e=>e.hp>0&&e.kind!=='dummy').map(e=>({id:e.id,name:e.name,x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,kind:e.kind}))});
    }
  }
  let lastTick=Date.now();
  const timer=setInterval(()=>{const now=Date.now(),dt=Math.min(.05,Math.max(0,(now-lastTick)/1000));lastTick=now;const processed=new Set<string>();for(const s of sessions.values()){if(s.ws.readyState!==WebSocket.OPEN)continue;const key=s.pvpMatch?s.pvpMatch:s.dungeon?s.partyId??s.user.id:'world',simulate=!processed.has(key);processed.add(key);tick(s,now,dt,simulate);}for(const match of pvpMatches.values())updatePvp(match,now);},1000/30);
  let shuttingDown=false;
  return {
    onlineCount(){return [...sessions.values()].filter(s=>s.ws.readyState===WebSocket.OPEN).length;},
    chatHistory(){return worldChat.slice();},
    broadcast(payload:unknown){for(const s of sessions.values())sendJson(s,payload);},
    refreshWorld(world:{source:string;version:number}){
      for(const s of sessions.values()){
        if(!s.dungeon&&!s.pvpMatch&&!canStand(s.player.x,s.player.y)){
          const pos=safeNear(s.player.x,s.player.y);s.player.x=pos.x;s.player.y=pos.y;s.profile.x=pos.x;s.profile.y=pos.y;
        }
        s.wildChunk='';sendJson(s,{type:'world:map',source:world.source,version:world.version});
      }
      for(const e of worldEnemies){if(!canEnemyStand(e.x,e.y)){const pos=safeEnemyNear(e.x,e.y);e.x=pos.x;e.y=pos.y;e.targetX=pos.x;e.targetY=pos.y;}}
    },
    async adminAction(userId:string,raw:unknown){
      const s=sessions.get(userId);
      if(!s)return {ok:false,error:'ゲームに接続してから操作してください。'};
      if(!raw||typeof raw!=='object')return {ok:false,error:'操作が不正です。'};
      const a=raw as Record<string,unknown>,action=a.action;
      if(action==='heal'){
        s.player.hp=s.player.maxHp;s.profile.hp=s.player.hp;addEffect(s,s.player.x,s.player.y,'管理者：HP回復','#a4ffbd',Date.now());
      }else if(action==='travel'){
        if(s.dungeon||s.pvpMatch)return {ok:false,error:'戦闘中は移動できません。'};
        const site=WORLD_SITES.find(v=>v.id===a.site&&v.kind==='waypoint');
        if(!site)return {ok:false,error:'移動先が不正です。'};
        const pos=safeNear((site.tx+.5)*TILE,(site.ty+.5)*TILE);
        s.player.x=pos.x;s.player.y=pos.y;s.profile.x=pos.x;s.profile.y=pos.y;s.wildChunk='';
      }else if(action==='resources'){
        const amount=a.amount;
        if(!Number.isSafeInteger(amount)||Number(amount)<1||Number(amount)>100)return {ok:false,error:'補充数は1～100にしてください。'};
        for(const key of ['iron','wood','crystal'] as const)s.craft.materials[key]=Math.min(9999,s.craft.materials[key]+Number(amount));
        s.craft.bossParts=Math.min(999,s.craft.bossParts+Number(amount));
        s.craftDirty=true;sendCraft(s);
        await queueCraftSave(s);
      }else return {ok:false,error:'操作が不正です。'};
      await save(s.user,{...s.profile});
      return {ok:true,action};
    },
    async upgrade(req:IncomingMessage,socket:any,head:Buffer,user:User){
      if(upgrading.has(user.id)){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}
      upgrading.add(user.id);
      let profile:Profile|undefined,craft:CraftState|undefined;
      const existing=sessions.get(user.id);
      try{
        if(!existing)[profile,craft]=await Promise.all([load(user),loadCraft(user).then(normalizeCraft)]);
      }catch{upgrading.delete(user.id);socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}
      try{wss.handleUpgrade(req,socket,head,ws=>{
        let s:Session;
        if(existing){
          const wasDisconnected=existing.ws.readyState!==WebSocket.OPEN;
          if(!wasDisconnected)existing.ws.close(4000,'new connection');
          if(existing.disconnectTimer)clearTimeout(existing.disconnectTimer);
          existing.disconnectTimer=null;existing.ws=ws;existing.user=user;
          existing.input={...emptyInput};existing.inputAt=Date.now();
          existing.lastSnapshot=0;existing.lastPresence=0;existing.pendingWorld=true;
          if(existing.dungeon&&existing.partyId){
            const teammate=[...sessions.values()].find(member=>member!==existing&&member.partyId===existing.partyId&&member.dungeon>0&&member.ws.readyState===WebSocket.OPEN);
            if(teammate){existing.dungeon=teammate.dungeon;existing.abyssRun=teammate.abyssRun;existing.enemies=teammate.enemies;}
          }
          if(wasDisconnected)existing.invulnUntil=Date.now()+1500;
          s=existing;
        }else{
          const loadedProfile=profile!,loadedCraft=craft!;
          const maxHp=100+(loadedProfile.level-1)*8+gearBonus(loadedCraft.rpg,'hp');
          const hp=Math.min(maxHp,Math.max(1,loadedProfile.hp));
          const player:Actor={id:user.id,name:user.username,x:loadedProfile.x,y:loadedProfile.y,hp,maxHp,glyph:'@',facingX:1,facingY:0};
          s={user,ws,disconnectTimer:null,player,input:{...emptyInput},inputAt:Date.now(),hasInput:false,profile:loadedProfile,craft:loadedCraft,craftSave:Promise.resolve(),craftDirty:false,pendingWorld:false,pendingCraft:false,lastCraftAt:0,lastChatAt:0,lastWorldChatAt:0,partyId:null,dungeon:0,abyssRun:0,dungeonReturn:null,pvpMatch:null,pvpReturn:null,awakeningUntil:0,lastAwaken:0,wildChunk:'',enemies:worldEnemies,projectiles:[],friendly:[],effects:[],lastSwing:0,combo:0,lastDash:0,dashLatch:false,rollUntil:0,rollX:0,rollY:0,lastTrail:0,invulnUntil:0,lastParry:0,parryUntil:0,parrySuccessUntil:0,ep:100,skillCooldowns:[0,0,0,0],lastSave:Date.now(),lastSnapshot:0,lastPresence:0,kills:0};
        }
        sessions.set(user.id,s);
        sendCraft(s);
        sendJson(s,partyView(s));
        if(s.partyId)broadcastParty(s.partyId);
        ws.on('message',data=>{if(s.ws!==ws)return;try{void handleCommand(s,JSON.parse(data.toString()));}catch{}});
        ws.on('close',()=>{
          if(shuttingDown||sessions.get(user.id)!==s||s.ws!==ws)return;
          s.input={...emptyInput};s.inputAt=0;
          void Promise.all([save(s.user,{...s.profile}),queueCraftSave(s)]).catch(console.error);
          if(s.partyId)broadcastParty(s.partyId);
          if(s.pvpMatch){const match=pvpMatches.get(s.pvpMatch);if(match){const own=match.teams.findIndex(team=>team.includes(s.user.id));finishPvp(match,1-own,Date.now());}}
          for(let i=pvpQueue.length-1;i>=0;i--)if(pvpQueue[i].members.includes(user.id))pvpQueue.splice(i,1);
          // Keep the current dungeon, wave, boss HP and party for a brief reconnect.
          s.disconnectTimer=setTimeout(()=>{
            if(sessions.get(user.id)!==s||s.ws!==ws)return;
            if(s.dungeon)leaveDungeon(s,Date.now(),false,false);
            sessions.delete(user.id);leaveParty(s);
            void Promise.all([save(s.user,{...s.profile}),queueCraftSave(s)]).catch(console.error);
          },120000);
          s.disconnectTimer.unref();
        });
      });}finally{upgrading.delete(user.id);}
    },
    async shutdown(){shuttingDown=true;clearInterval(timer);for(const s of sessions.values()){if(s.disconnectTimer)clearTimeout(s.disconnectTimer);s.ws.close();}await Promise.all([...sessions.values()].flatMap(s=>[save(s.user,{...s.profile}),queueCraftSave(s)]));wss.close();}
  };
}
