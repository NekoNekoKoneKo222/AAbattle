import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { TILE, canStand, norm, zoneAt, compileSkill, compileWeapon, starterCraft, normalizeRpg, rollGear, gearBonus, QUESTS, WEAPON_BASES, type Actor, type CraftState, type Effect, type Input, type Projectile, type SkillProgram, type Snapshot, type Weapon } from '@glyph/shared';

export type User = { id: string; username: string };
export type Profile = { x: number; y: number; hp: number; xp: number; level: number; coins: number };
type Save = (user: User, profile: Profile) => Promise<void>;
type Load = (user: User) => Promise<Profile>;
type SaveCraft = (user: User, craft: CraftState) => Promise<void>;
type LoadCraft = (user: User) => Promise<CraftState>;
type Enemy = Actor & { targetX: number; targetY: number; speed: number; damage: number; lastAttack: number; respawn: number; windupUntil: number; staggerUntil: number; slowUntil: number; dotUntil: number; dotAt: number };
type EnemyProjectile = Projectile & { vx: number; vy: number; damage: number; expires: number };
type FriendlyProjectile = Projectile & { vx: number; vy: number; damage: number; expires: number; program: SkillProgram | null; hitIds: Set<string>; pierce: number; special: string; element: string };
type Session = { user: User; ws: WebSocket; player: Actor; input: Input; inputAt: number; profile: Profile; craft: CraftState; craftSave: Promise<void>; craftDirty: boolean; lastCraftAt: number; dungeon: number; dungeonReturn: {x:number;y:number}|null; enemies: Enemy[]; projectiles: EnemyProjectile[]; friendly: FriendlyProjectile[]; effects: Effect[]; lastSwing: number; combo: number; lastDash: number; dashLatch: boolean; rollUntil: number; rollX: number; rollY: number; lastTrail: number; invulnUntil: number; lastParry: number; parryUntil: number; parrySuccessUntil: number; ep: number; skillCooldowns: number[]; lastSave: number; lastSnapshot: number; kills: number };
const emptyInput: Input = { x:0,y:0,aimX:1,aimY:0,attack:false,dash:false };
const templates = [
  {kind:'melee',glyph:'g',name:'森のグリフ',hp:35,speed:42,damage:6},
  {kind:'ranged',glyph:'r',name:'文字射手',hp:26,speed:30,damage:5},
  {kind:'fast',glyph:'v',name:'疾走文字',hp:20,speed:75,damage:4},
  {kind:'elite',glyph:'G',name:'古きグリフ',hp:90,speed:33,damage:9},
  {kind:'boss',glyph:'Ø',name:'THE NULL',hp:240,speed:27,damage:14}
];
const spots = [[410,50],[540,190],[340,-200],[-430,-90],[210,550],[390,650],[-360,520],[-470,650],[70,760],[-620,470]];
let effectId=0;
let projectileId=0;
function spawn(index:number):Enemy {
  const t=index===9?{kind:'dummy',glyph:'☷',name:'訓練人形',hp:250,speed:0,damage:0}:templates[index===8?4:index===7?3:index%3];
  let [x,y]=spots[index];
  if(!canStand(x,y)){for(let r=1;r<10&&!canStand(x,y);r++)for(let a=0;a<8;a++){const xx=spots[index][0]+Math.cos(a*Math.PI/4)*r*TILE, yy=spots[index][1]+Math.sin(a*Math.PI/4)*r*TILE;if(canStand(xx,yy)){x=xx;y=yy;break;}}}
  return {id:`e${index}`,name:t.name,x,y,hp:t.hp,maxHp:t.hp,glyph:t.glyph,kind:t.kind,targetX:x,targetY:y,speed:t.speed,damage:t.damage,lastAttack:0,respawn:0,windupUntil:0,staggerUntil:0,slowUntil:0,dotUntil:0,dotAt:0};
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
  return {skills,weapons,equippedSkills,equippedWeaponId,materials:bag,rpg:normalizeRpg(a.rpg)};
}
function safeNear(x:number,y:number):{x:number;y:number} {
  if(canStand(x,y))return {x,y};
  for(let r=1;r<10;r++)for(let a=0;a<16;a++){
    const px=x+Math.cos(a*Math.PI/8)*r*TILE,py=y+Math.sin(a*Math.PI/8)*r*TILE;
    if(canStand(px,py))return {x:px,y:py};
  }
  return {x:16,y:16};
}
export function attachGlyphInfinity(load:Load,save:Save,loadCraft:LoadCraft=async()=>starterCraft(),saveCraft:SaveCraft=async()=>{}) {
  const wss=new WebSocketServer({noServer:true,maxPayload:16384});
  const sessions=new Map<string,Session>();
  const addEffect=(s:Session,x:number,y:number,text:string,color:string,now:number,kind?:Effect['kind'],dx?:number,dy?:number)=>s.effects.push({id:++effectId,x,y,text,color,born:now,kind,dx,dy});
  const queueCraftSave=(s:Session)=>{
    const copy=structuredClone(s.craft);
    s.craftSave=s.craftSave.catch(()=>{}).then(()=>saveCraft(s.user,copy));
    s.craftDirty=false;
    return s.craftSave;
  };
  const sendCraft=(s:Session)=>{if(s.ws.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify({type:'craft:state',craft:s.craft}));};
  const dungeonWave=(wave:number):Enemy[]=>{
    const count=wave===3?1:wave+1;
    return Array.from({length:count},(_,i)=>{
      const e=spawn(wave===3?8:wave===2?7:i%3),pos=safeNear((i-(count-1)/2)*75,110);
      e.id=`d${wave}-${i}`;e.x=pos.x;e.y=pos.y;e.targetX=e.x;e.targetY=e.y;
      e.maxHp=Math.round(e.maxHp*(wave===3?1.5:1+wave*.3));e.hp=e.maxHp;e.damage+=wave*2;
      return e;
    });
  };
  const leaveDungeon=(s:Session,now:number,complete:boolean)=>{
    if(complete){s.craft.rpg.dungeonClears++;s.profile.coins+=100;s.craft.materials.crystal=Math.min(9999,s.craft.materials.crystal+3);s.craftDirty=true;void queueCraftSave(s).catch(console.error);sendCraft(s);}
    const pos=s.dungeonReturn??{x:16,y:16};s.player.x=pos.x;s.player.y=pos.y;s.player.hp=s.player.maxHp;
    s.dungeon=0;s.dungeonReturn=null;s.enemies=spots.map((_,i)=>spawn(i));s.projectiles=[];s.friendly=[];
    addEffect(s,pos.x,pos.y,complete?'遺跡踏破！':'ダンジョンから帰還',complete?'#f6d77b':'#9ff4ec',now);
  };
  const equippedWeapon=(s:Session):Weapon|null=>s.craft.weapons.find(w=>w.id===s.craft.equippedWeaponId)??null;
  const heal=(s:Session,amount:number,now:number)=>{
    const gained=Math.min(Math.max(0,Math.round(amount)),s.player.maxHp-s.player.hp);
    if(gained){s.player.hp+=gained;addEffect(s,s.player.x,s.player.y,`+${gained}`,'#8effbc',now);}
  };
  const effectAllowed=(s:Session,guards:string[],now:number)=>guards.every(g=>g==='on_hit'||g==='low_hp'&&s.player.hp<=s.player.maxHp/2||g==='on_parry'&&now<s.parrySuccessUntil);
  function damageEnemy(s:Session,e:Enemy,rawDamage:number,now:number,element='neutral',program:SkillProgram|null=null,special='none') {
    if(e.hp<=0)return;
    const damage=Math.min(150,Math.max(1,Math.round(rawDamage+gearBonus(s.craft.rpg,'damage')+Math.min(10,Math.floor((s.craft.rpg.mastery[equippedWeapon(s)?.primary??'bare']??0)/20))+Math.min(10,s.craft.rpg.rebirths))));
    e.hp=Math.max(0,e.hp-damage);e.windupUntil=0;e.staggerUntil=Math.max(e.staggerUntil,now+170);
    addEffect(s,e.x,e.y,`-${damage}`,'#ff9393',now,'hit');
    if(element==='fire'||element==='poison'){e.dotUntil=now+(element==='fire'?2400:3600);e.dotAt=now+700;}
    if(element==='ice')e.slowUntil=now+2500;
    if(element==='light')heal(s,4,now);
    if(element==='dark'||special==='leech')heal(s,Math.min(10,damage*.2),now);
    if(special==='stun')e.staggerUntil=now+500;
    const push=(distance:number)=>{const v=norm(e.x-s.player.x,e.y-s.player.y);const x=e.x+v.x*distance,y=e.y+v.y*distance;if(canStand(x,y)){e.x=x;e.y=y;}};
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
      else if(effect.part==='dot'){e.dotUntil=now+3000;e.dotAt=now+700;}
      else if(effect.part==='explosion'){
        addEffect(s,e.x,e.y,'✹','#ffbc6b',now);
        for(const other of s.enemies)if(other!==e&&other.hp>0&&Math.hypot(other.x-e.x,other.y-e.y)<72){damageEnemy(s,other,Math.max(1,Math.floor(damage*.5)),now);addEffect(s,other.x,other.y,'✹','#ffbc6b',now);}
      }
    }
    if(e.hp===0){
      e.respawn=now+(e.kind==='dummy'?1800:8000);
      if(e.kind!=='dummy'){
        s.profile.xp+=e.kind==='boss'?60:e.kind==='elite'?25:10;
        s.profile.coins+=e.kind==='boss'?50:5;
        s.craft.rpg.kills++;
        if(e.kind==='boss')s.craft.rpg.bossKills++;
        const masteryKey=equippedWeapon(s)?.primary??'bare';s.craft.rpg.mastery[masteryKey]=Math.min(10000,(s.craft.rpg.mastery[masteryKey]??0)+1);
        if(s.craft.rpg.inventory.length<60&&(e.kind==='boss'||Math.random()<.22)){
          const gear=rollGear(s.profile.level,e.kind==='boss',Math.random,randomUUID());s.craft.rpg.inventory.push(gear);
          addEffect(s,e.x,e.y,`◆ ${gear.rarity} ${gear.name}`,'#f9db89',now);
        }
        const material=e.kind==='boss'?'crystal':e.kind==='ranged'?'wood':'iron';
        s.craft.materials[material]++;
        s.craftDirty=true;s.kills++;
        void queueCraftSave(s).catch(console.error);
        addEffect(s,e.x,e.y,`✧ +XP +${material}`,'#f5dc77',now);
      }else addEffect(s,e.x,e.y,'訓練成功','#9ff6e6',now);
    }
  }
  function damagePlayer(s:Session,source:Enemy|null,damage:number,now:number){
    if(now<s.invulnUntil){addEffect(s,s.player.x,s.player.y,'MISS','#95eeff',now);return;}
    if(now<s.parryUntil){
      s.parrySuccessUntil=now+500;
      addEffect(s,s.player.x,s.player.y,'PARRY!','#b4f9ff',now);
      if(source){source.staggerUntil=now+650;damageEnemy(s,source,Math.max(8,damage*2),now);}
      return;
    }
    const received=Math.max(1,Math.round(damage-gearBonus(s.craft.rpg,'guard')));
    s.player.hp=Math.max(0,s.player.hp-received);
    addEffect(s,s.player.x,s.player.y,`-${received}`,'#ff7777',now,'hit');
  }
  function fireFriendly(s:Session,x:number,y:number,dx:number,dy:number,damage:number,now:number,program:SkillProgram|null,special:string,element:string,range:number,glyph:string){
    if(s.friendly.length>=36)return;
    const speed=program?.modifiers.includes('speed')?390:290;
    s.friendly.push({id:++projectileId,x,y,vx:dx*speed,vy:dy*speed,damage,expires:now+Math.min(2500,range/speed*1000),program,hitIds:new Set(),pierce:program?.effects.some(e=>e.part==='pierce')?2:0,special,element,glyph,color:element==='fire'?'#ffad72':element==='ice'?'#9beaff':'#e7d1ff'});
  }
  function castSkill(s:Session,slot:number,now:number){
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
    if(!hits)for(const effect of program.effects)if(effect.part==='heal'&&effectAllowed(s,effect.guards,now)&&!effect.guards.includes('on_hit'))heal(s,12,now);
  }
  async function handleCommand(s:Session,raw:unknown){
    if(!raw||typeof raw!=='object')return;
    const a=raw as Record<string,unknown>,type=String(a.type??''),now=Date.now();
    if(type==='input'){const input=validInput(a);if(input){s.input=input;s.inputAt=now;}return;}
    if(type==='cast'){castSkill(s,Number(a.slot),now);return;}
    if(type==='parry'){
      if(now-s.lastParry>=1200&&now>=s.rollUntil){s.lastParry=now;s.parryUntil=now+230;addEffect(s,s.player.x,s.player.y,'◇','#9bf8ff',now);}
      return;
    }
    if(type==='arena'){
      if(s.dungeon)return;
      const pos=a.enter===true?safeNear(-620,390):{x:16,y:16};
      s.player.x=pos.x;s.player.y=pos.y;s.player.hp=s.player.maxHp;s.projectiles=[];s.friendly=[];
      addEffect(s,pos.x,pos.y,a.enter===true?'訓練場':'街へ帰還','#9ff4ec',now);
      return;
    }
    if(type==='rpg:dungeon'){
      if(s.dungeon||s.profile.level<2)return;
      s.dungeonReturn={x:s.player.x,y:s.player.y};s.dungeon=1;s.player.x=0;s.player.y=0;s.player.hp=s.player.maxHp;s.enemies=dungeonWave(1);s.projectiles=[];s.friendly=[];
      addEffect(s,0,0,'虚無の遺跡：第1波','#d9acff',now);sendCraft(s);return;
    }
    if(type==='rpg:leave'){if(s.dungeon)leaveDungeon(s,now,false);return;}
    if(!type.startsWith('craft:')&&!type.startsWith('rpg:'))return;
    if(now-s.lastCraftAt<200){s.ws.send(JSON.stringify({type:'craft:error',message:'操作が速すぎます。少し待ってください。'}));return;}
    s.lastCraftAt=now;
    try{
      if(type==='rpg:equip'){
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
      }else if(type==='craft:save-skill'){
        const parsed=compileSkill(a.skill),index=s.craft.skills.findIndex(g=>g.id===parsed.skill.id);
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
      if(type==='rpg:rebirth'||type==='rpg:claim'||type==='rpg:upgrade'||type==='rpg:reroll')await save(s.user,{...s.profile});
      sendCraft(s);
    }catch(error){
      if(s.ws.readyState===WebSocket.OPEN)s.ws.send(JSON.stringify({type:'craft:error',message:error instanceof Error?error.message:'保存に失敗しました。'}));
    }
  }
  function tick(s:Session,now:number,dt:number) {
    const p=s.player;
    s.ep=Math.min(100,s.ep+dt*9);
    const i=now-s.inputAt<250?s.input:emptyInput;
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
    if(canStand(nx,p.y))p.x=nx;
    if(canStand(p.x,ny))p.y=ny;
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
      const damage=(weaponStats?.damage??12)+Math.min(12,s.profile.level*2)+(s.combo===3?9:s.combo===2?4:0);
      if(weaponStats?.mode==='ranged'){
        fireFriendly(s,p.x,p.y,aim.x,aim.y,damage,now,null,weapon?.special??'none',weapon?.element??'neutral',weaponStats.range,weapon?.glyph??'✦');
      }else for(const e of s.enemies) {
        if(e.hp<=0)continue;
        const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy);
        if(d>(weaponStats?.range??78) || d<1 || (dx*aim.x+dy*aim.y)/d<0.05)continue;
        damageEnemy(s,e,damage,now,weapon?.element??'neutral',null,weapon?.special??'none');
        const push=norm(dx,dy),knock=12+(s.combo===3?12:0);
        if(canStand(e.x+push.x*knock,e.y+push.y*knock)){e.x+=push.x*knock;e.y+=push.y*knock;}
      }
    }
    while(s.profile.level<100&&s.profile.xp>=20*s.profile.level){s.profile.xp-=20*s.profile.level;s.profile.level++;p.maxHp=100+(s.profile.level-1)*8+gearBonus(s.craft.rpg,'hp');p.hp=p.maxHp;addEffect(s,p.x,p.y,'LEVEL UP!','#7bffa5',now);}
    if(s.profile.level>=100)s.profile.xp=0;
    p.maxHp=100+(s.profile.level-1)*8+gearBonus(s.craft.rpg,'hp');p.hp=Math.min(p.hp,p.maxHp);

    for(let n=0;n<s.enemies.length;n++){
      const e=s.enemies[n];
      if(e.hp<=0){if(!s.dungeon&&now>=e.respawn)s.enemies[n]=spawn(n);continue;}
      if(s.dungeon&&e.kind==='boss'&&e.hp<e.maxHp/2&&e.damage<25){e.damage=25;e.speed=42;addEffect(s,e.x,e.y,'THE NULL : PHASE 2','#e389ff',now);}
      if(e.dotUntil>now&&e.dotAt<=now){e.dotAt=now+700;damageEnemy(s,e,3,now);}
      if(e.kind==='dummy')continue;
      const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy);
      if(d>330||p.hp<=0){e.windupUntil=0;continue;}
      if(now<e.staggerUntil)continue;
      const ranged=e.kind==='ranged';
      const range=ranged?170:e.kind==='boss'?43:29;
      if(e.windupUntil){
        if(now<e.windupUntil)continue;
        e.windupUntil=0;e.lastAttack=now;
        if(ranged){
          const v=norm(p.x-e.x,p.y-e.y);
          if(s.projectiles.length<24)s.projectiles.push({id:++projectileId,x:e.x,y:e.y,vx:v.x*220,vy:v.y*220,damage:e.damage,expires:now+1800,glyph:'✦',color:'#ff9e77'});
          addEffect(s,e.x,e.y,'✦','#ffb078',now);
        } else if(d<range+13){
          damagePlayer(s,e,e.damage,now);
        }
        continue;
      }
      if(d>range){const v=norm(dx,dy),speed=e.speed*(e.slowUntil>now?.55:1),ex=e.x+v.x*speed*dt,ey=e.y+v.y*speed*dt;if(canStand(ex,e.y))e.x=ex;if(canStand(e.x,ey))e.y=ey;}
      else if(now-e.lastAttack>(ranged?1700:e.kind==='boss'?1800:1100)){
        e.windupUntil=now+(ranged?520:e.kind==='fast'?230:e.kind==='boss'?650:380);
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
        damageEnemy(s,target,b.damage,now,b.element,b.program,b.special);
        if(b.pierce>0){b.pierce--;return true;}
        return false;
      }
      return true;
    });
    if(p.hp<=0){if(s.dungeon)leaveDungeon(s,now,false);else{p.x=16;p.y=16;p.hp=p.maxHp;s.projectiles=[];addEffect(s,p.x,p.y,'街で復活','#b6e9ff',now);}}
    if(s.dungeon&&s.enemies.every(e=>e.hp<=0)){
      if(s.dungeon===3)leaveDungeon(s,now,true);
      else{s.dungeon++;s.enemies=dungeonWave(s.dungeon);s.projectiles=[];addEffect(s,p.x,p.y,`第${s.dungeon}波`,'#d9acff',now);}
    }
    s.effects=s.effects.filter(e=>now-e.born<650);
    s.profile.x=p.x;s.profile.y=p.y;s.profile.hp=p.hp;
    if(now-s.lastSnapshot>=50&&s.ws.readyState===WebSocket.OPEN){
      s.lastSnapshot=now;
      const snapshot:Snapshot={type:'state',you:s.user.id,players:[p],enemies:s.enemies.filter(e=>e.hp>0),projectiles:[...s.projectiles,...s.friendly].map(({id,x,y,glyph,color})=>({id,x,y,glyph,color})),effects:s.effects,xp:s.profile.xp,level:s.profile.level,coins:s.profile.coins,zone:s.dungeon?`虚無の遺跡 第${s.dungeon}波`:zoneAt(p.x,p.y),dungeon:s.dungeon,time:now,rollUntil:s.rollUntil,rollX:s.rollX,rollY:s.rollY,rollReadyAt:s.lastDash+1400,parryUntil:s.parryUntil,parryReadyAt:s.lastParry+1200,swingAt:s.lastSwing,combo:now-s.lastSwing<1000?s.combo:0,ep:Math.floor(s.ep),maxEp:100,skillCooldowns:s.skillCooldowns,weaponGlyph:weapon?.glyph??'⚔'};
      s.ws.send(JSON.stringify(snapshot));
    }
    if(now-s.lastSave>15000){s.lastSave=now;void save(s.user,{...s.profile}).catch(console.error);if(s.craftDirty)void queueCraftSave(s).catch(console.error);}
  }
  let lastTick=Date.now();
  const timer=setInterval(()=>{const now=Date.now(),dt=Math.min(.05,Math.max(0,(now-lastTick)/1000));lastTick=now;for(const s of sessions.values())tick(s,now,dt);},1000/30);
  return {
    async upgrade(req:IncomingMessage,socket:any,head:Buffer,user:User){
      let profile:Profile,craft:CraftState;
      try{
        const existing=sessions.get(user.id);
        if(existing){await save(existing.user,{...existing.profile});await queueCraftSave(existing);existing.ws.close(4000,'new connection');sessions.delete(user.id);}
        [profile,craft]=await Promise.all([load(user),loadCraft(user).then(normalizeCraft)]);
      }catch{socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}
      wss.handleUpgrade(req,socket,head,ws=>{
        const maxHp=100+(profile.level-1)*8+gearBonus(craft.rpg,'hp');
        const hp=Math.min(maxHp,Math.max(1,profile.hp));
        const player:Actor={id:user.id,name:user.username,x:profile.x,y:profile.y,hp,maxHp,glyph:'@',facingX:1,facingY:0};
        const s:Session={user,ws,player,input:{...emptyInput},inputAt:Date.now(),profile,craft,craftSave:Promise.resolve(),craftDirty:false,lastCraftAt:0,dungeon:0,dungeonReturn:null,enemies:spots.map((_,i)=>spawn(i)),projectiles:[],friendly:[],effects:[],lastSwing:0,combo:0,lastDash:0,dashLatch:false,rollUntil:0,rollX:0,rollY:0,lastTrail:0,invulnUntil:0,lastParry:0,parryUntil:0,parrySuccessUntil:0,ep:100,skillCooldowns:[0,0,0,0],lastSave:Date.now(),lastSnapshot:0,kills:0};
        sessions.set(user.id,s);
        sendCraft(s);
        ws.on('message',data=>{try{void handleCommand(s,JSON.parse(data.toString()));}catch{}});
        ws.on('close',()=>{if(sessions.get(user.id)===s){sessions.delete(user.id);void Promise.all([save(user,{...s.profile}),queueCraftSave(s)]).catch(console.error);}});
      });
    },
    async shutdown(){clearInterval(timer);for(const s of sessions.values())s.ws.close();await Promise.all([...sessions.values()].flatMap(s=>[save(s.user,{...s.profile}),queueCraftSave(s)]));wss.close();}
  };
}
