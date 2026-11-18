import { BASE, BY_ID, validateLoadout } from './specials.js';

export const SIZE=9;
export const inside=(x,y)=>x>=0&&x<9&&y>=0&&y<9;
export const pos=(x,y)=>y*9+x;
export const xy=i=>[i%9,Math.floor(i/9)];
const same=(a,b)=>a&&b&&a.owner===b.owner;
const enemy=(a,b)=>a&&b&&a.owner!==b.owner;
const gold=[[0,-1],[-1,-1],[1,-1],[-1,0],[1,0],[0,1]];
const silver=[[0,-1],[-1,-1],[1,-1],[-1,1],[1,1]];
const king=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
const orth=[[0,-1],[0,1],[-1,0],[1,0]];
const diag=[[-1,-1],[1,-1],[-1,1],[1,1]];
const knight=[[-1,-2],[1,-2]];
const baseNames={P:'歩',L:'香',N:'桂',S:'銀',G:'金',B:'角',R:'飛',C:'城',A:'AA'};
const promotedNames={P:'と',L:'杏',N:'圭',S:'全',B:'馬',R:'龍'};
const automatic=new Set(['rage','execute','grow','guard','reflect','fortify','antimagic','flight','evade','wander','aura','pulse','pulseDamage','corrupt','rebirth','laser','migrate','aa','leech','steal','cheer','rescue','grass','charge']);
const moveKinds=new Set(['teleport','swap','swapEnemy','portal']);
export const labelOf=p=>p?(p.type==='special'?BY_ID[p.id]?.name||'?':p.type==='A'?p.aaKind==='attack'?'攻AA':p.aaKind==='defend'?'盾AA':'援AA':p.promoted?promotedNames[p.type]:baseNames[p.type]):'';
export const infoOf=p=>p?.type==='special'?BY_ID[p.id]:BASE[p?.type]||null;
export const maxHp=p=>p?.type==='special'?BY_ID[p.id]?.hp||1:p?.type==='C'?3:p?.type==='A'?p.aaKind==='defend'?2:1:1;
function createPiece(s,owner,type,id='',level=0,extra={}) {
  const spec=type==='special'?BY_ID[id]:BASE[type],hp=type==='A'?(extra.aaKind==='defend'?2:1):spec.hp;
  return {uid:s.nextId++,owner,type,id,hp,promoted:false,level,cd:0,shield:0,
    frozen:0,silenced:0,poison:0,burn:0,attackBuff:0,charges:0, ...extra};
}
function add(s,x,y,owner,type,id='',level=0,extra={}){s.board[pos(x,y)]=createPiece(s,owner,type,id,level,extra);}
function normalizeAA(text){return typeof text==='string'?text.replace(/\r/g,'').slice(0,160).split('\n').slice(0,6).map(x=>x.slice(0,24)).join('\n'):'';}
export function newGame(options={}){
  const loadouts={1:options.loadouts?.[1]||[], '-1':options.loadouts?.[-1]||[]};
  if(!validateLoadout(loadouts[1])||!validateLoadout(loadouts[-1]))throw Error('編成コストまたは特殊駒が不正です。');
  const levels=options.levels||{};
  const s={board:Array(81).fill(null),nextId:1,turn:1,ply:0,round:1,win:0,reason:'',log:[],history:[],
    loadouts,aa:{1:(options.aa?.[1]||[]).map(normalizeAA),'-1':(options.aa?.[-1]||[]).map(normalizeAA)},
    terrain:[],grave:[],pending:[],castleDamagedAt:-1,actions:0,lastSkill:null,seed:(options.seed>>>0)||159753};
  const rank=['L','N','S','G','C','G','S','N','L'];
  for(const owner of [-1,1]){
    const back=owner===1?8:0,minor=owner===1?7:1,pawns=owner===1?6:2;
    for(let x=0;x<9;x++){add(s,x,back,owner,rank[x]);add(s,x,pawns,owner,'P');}
    add(s,1,minor,owner,owner===1?'R':'B');
    add(s,7,minor,owner,owner===1?'B':'R');
    (loadouts[owner]||[]).forEach((id,i)=>{
      const x=[2,4,6][i],level=Math.max(0,Math.min(2,Number(levels[owner]?.[id])||0));
      add(s,x,pawns,owner,'special',id,level);
    });
  }
  for(const owner of [-1,1]) {
    if(loadouts[owner].includes('nich')){
      const y=owner===1?5:3;
      for(let i=0;i<2;i++){const art=s.aa[owner]?.[i]||'';if(!art)continue;
        const x=i===0?3:5;if(!s.board[pos(x,y)])add(s,x,y,owner,'A','',0,{art,aaKind:i===0?'attack':'defend',source:'nich'});
      }
    }
  }
  s.log=['対局開始。先手が行動します。'];
  return s;
}
function rawDirs(p){
  if(p.type==='A')return {steps:p.aaKind==='attack'?[[0,-1]]:p.aaKind==='support'?silver:king,slide:[]};
  if(p.type!=='special'){
    if(p.type==='C')return {steps:[],slide:[]};
    if(p.promoted&&['P','L','N','S'].includes(p.type))return {steps:gold,slide:[]};
    if(p.type==='P')return {steps:[[0,-1]],slide:[]};
    if(p.type==='G')return {steps:gold,slide:[]};
    if(p.type==='S')return {steps:silver,slide:[]};
    if(p.type==='N')return {steps:knight,slide:[]};
    if(p.type==='L')return {steps:[],slide:[[0,-1]],limit:8};
    if(p.type==='B')return {steps:p.promoted?orth:[],slide:diag,limit:8};
    if(p.type==='R')return {steps:p.promoted?diag:[],slide:orth,limit:8};
  }
  const m=BY_ID[p.id]?.move||'none';
  const cfg={
    gold:{steps:gold},silver:{steps:silver},king:{steps:king},
    spear:{steps:[[0,-1],[-1,0],[1,0]],slide:[[0,-1]],limit:2},
    cross:{steps:orth},cross2:{slide:orth,limit:2},rook3:{slide:orth,limit:3},
    diag2:{slide:diag,limit:2},diagonal:{steps:diag},forward:{steps:[[0,-1]]},
    horizontal:{steps:[[-1,0],[1,0]]},horse:{steps:[...knight,[-1,0],[1,0]]},
    knight:{steps:knight},jump2:{steps:orth.map(([dx,dy])=>[dx*2,dy*2]),leap:true},
    reverse:{steps:[[0,1],[-1,-1],[1,-1]]},none:{steps:[]}
  }[m]||{steps:king};
  return {...cfg,slide:cfg.slide||[],steps:cfg.steps||[]};
}
export function moves(s,from){
  const p=s.board[from];if(!p||p.frozen||!inside(...xy(from)))return [];
  const [x,y]=xy(from),cfg=rawDirs(p),result=[];
  const owner=p.reversed>0?-p.owner:p.owner;
  const canCapture=p.type==='special'?BY_ID[p.id].attack>0:p.type==='A'?p.aaKind==='attack':BASE[p.type].attack>0;
  function consider(tx,ty){
    if(!inside(tx,ty))return false;
    const to=pos(tx,ty),q=at(s,to);
    if(!same(p,q)&&(!q||canCapture)&&!terrainAt(s,to,'wall'))result.push(to);
    return !q;
  }
  for(const [dx,dy] of cfg.steps)consider(x+dx,y+dy*owner);
  for(const [dx,dy] of cfg.slide){
    for(let n=1;n<=cfg.limit;n++)if(!consider(x+dx*n,y+dy*n*owner))break;
  }
  return result;
}
export function canPromote(p,from,to){
  if(p.type==='special'||p.type==='A'||p.type==='G'||p.type==='C'||p.promoted)return false;
  return (p.owner===1?xy(from)[1]<=2||xy(to)[1]<=2:xy(from)[1]>=6||xy(to)[1]>=6);
}
function forcePromote(p,to){
  if(!['P','L','N'].includes(p.type))return false;
  const row=xy(to)[1];return p.owner===1?(row===0||p.type==='N'&&row===1):(row===8||p.type==='N'&&row===7);
}
function terrainAt(s,i,type){return s.terrain.some(t=>t.i===i&&t.type===type);}
function defense(p){return p.type==='special'?(BY_ID[p.id]?.defense||0)+(p.level>=1&&p.id==='berserk'&&p.hp===1?1:0):0;}
function attack(p){return (p.type==='special'?BY_ID[p.id]?.attack||0:p.type==='A'?p.aaKind==='attack'?1:0:BASE[p.type].attack)+(p.attackBuff||0)+(p.id==='berserk'&&p.hp===1?1:0);}
function rand(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function message(s,text){s.log.push(text);if(s.log.length>90)s.log.shift();}
function at(s,i){return s.board[i];}
function distance(a,b){const [x,y]=xy(a),[xx,yy]=xy(b);return Math.max(Math.abs(x-xx),Math.abs(y-yy));}
function isBlocked(s,from,to){
  const [x,y]=xy(from),[xx,yy]=xy(to),dx=Math.sign(xx-x),dy=Math.sign(yy-y);
  if(!(dx===0||dy===0||Math.abs(xx-x)===Math.abs(yy-y)))return true;
  for(let cx=x+dx,cy=y+dy;cx!==xx||cy!==yy;cx+=dx,cy+=dy)if(at(s,pos(cx,cy)))return true;
  return false;
}
function release(s,i,why='撃破'){
  const p=at(s,i);if(!p)return;
  s.grave.push({...p,place:i});s.board[i]=null;message(s,labelOf(p)+' '+why+'');
  if(p.type==='C'){s.win=-p.owner;s.reason='王城が破壊された';message(s,(s.win===1?'先手':'後手')+'の勝利！');}
  if(p.id==='nich'){
    const next=createPiece(s,p.owner,'special','goch',p.level);
    s.board[i]=next;message(s,'二局が消滅！ 五局へ人々が移住した。');
    for(let j=0;j<81;j++)if(at(s,j)?.id==='yaruo'&&at(s,j).owner===p.owner){
      const dead=at(s,j);s.grave.push({...dead,place:j});s.board[j]=null;message(s,'二局との連鎖で殺夫が消滅！');
    }
  }else if(p.id==='phoenix'&&!p.reborn){
    s.pending.push({kind:'rebirth',owner:p.owner,timer:2,level:p.level});
  }
  if(p.id==='phoenix'&&p.level>=2)for(const d of king){const [x,y]=xy(i),xx=x+d[0],yy=y+d[1];if(inside(xx,yy)&&at(s,pos(xx,yy))?.owner===-p.owner)hit(s,pos(xx,yy),1,p.owner,null);}
}
function hit(s,target,raw,by,source=null,{ignoreDefense=0}={}){
  let p=at(s,target);if(!p||p.owner===by||s.win)return false;
  if(p.type==='C'&&s.castleDamagedAt===s.ply)return false;
  if(p.shield>0){p.shield--;message(s,labelOf(p)+'が結界で攻撃を防いだ');return false;}
  const dmg=Math.max(1,raw-Math.max(0,defense(p)-ignoreDefense));
  const actual=p.type==='C'?Math.min(1,dmg):dmg;
  p.hp-=actual;if(p.type==='C')s.castleDamagedAt=s.ply;
  message(s,labelOf(p)+'に'+actual+'ダメージ（残HP'+Math.max(0,p.hp)+'）');
  if(p.hp<=0){release(s,target);return true;}
  if(p.id==='reflect'||p.id==='nullpo'){
    if(source!==null&&at(s,source)?.owner===by&&!(p.silenced>0)){
      const a=at(s,source);a.hp-=1;message(s,labelOf(p)+'が反射！');
      if(a.hp<=0)release(s,source);
    }
  }
  return false;
}
function findPos(s,uid){return s.board.findIndex(p=>p?.uid===uid);}
function spendTurn(s,actor){
  if(s.win)return;
  // Automatic reactions resolve in a deterministic order, after the active action.
  for(let i=0;i<81;i++){
    const p=at(s,i);if(!p||p.owner!==actor||p.silenced>0)continue;
    if(p.id==='yaruo'){
      let [x,y]=xy(i);const f=y-p.owner;
      if(inside(x,f)&&!at(s,pos(x,f))){s.board[pos(x,f)]=p;s.board[i]=null;i=pos(x,f);y=f;}
      const len=p.level>=1?4:3;
      for(let n=1;n<=len;n++){const ty=y-n*p.owner;if(!inside(x,ty))break;const q=at(s,pos(x,ty));if(q&&q.owner!==actor)hit(s,pos(x,ty),2,actor,i);}
      if(p.level>=2&&s.ply%6===0)for(let dx of [-1,1])for(let n=1;n<=3;n++){const xx=x+dx*n;if(inside(xx,y)&&at(s,pos(xx,y))?.owner!==actor)hit(s,pos(xx,y),2,actor,i);}
      message(s,'殺夫が自動前進し、口から光線を放った！');
    }
    if(p.id==='doomsday'&&s.ply%(p.level>=1?6:8)===0)for(let j=0;j<81;j++)if(at(s,j)?.owner===-actor&&distance(i,j)<=2)hit(s,j,1,actor,i);
    if(p.id==='festival'&&s.ply%6===0){const ally=s.board.find(q=>q?.owner===actor&&q.hp<maxHp(q));if(ally)ally.hp=Math.min(maxHp(ally),ally.hp+(p.level>=1?2:1));}
    if(p.id==='grass'){const [x,y]=xy(i);for(let dx of [-1,1]){const xx=x+dx;if(inside(xx,y)&&!at(s,pos(xx,y))&&!terrainAt(s,pos(xx,y),'grass')){s.terrain.push({type:'grass',i:pos(xx,y),owner:actor,ttl:2});if(p.level<1)break;}}}
    if(p.id==='engineer'&&p.charges>0){const target=s.board.findIndex(q=>q?.owner===-actor&&distance(i,findPos(s,p.uid))<=2);if(target>=0)hit(s,target,1,actor,i);}
  }
  // Damage over time and short crowd-control tick on the affected player's turn.
  for(let i=0;i<81;i++){const p=at(s,i);if(!p||p.owner!==actor)continue;
    if(p.poison>0||p.burn>0){p.hp-=1;message(s,labelOf(p)+'が継続ダメージを受けた');if(p.hp<=0){release(s,i);continue;}}
    for(const key of ['frozen','silenced','poison','burn'])p[key]=Math.max(0,(p[key]||0)-1);
  }
  s.terrain=s.terrain.map(t=>({...t,ttl:t.ttl-1})).filter(t=>t.ttl>0);
  for(const pend of [...s.pending]){pend.timer--;if(pend.timer<=0){
    if(pend.kind==='rebirth'){
      const y=pend.owner===1?5:3;const i=Array.from({length:9},(_,x)=>pos(x,y)).find(i=>!at(s,i));
      if(i!==undefined){const revived=createPiece(s,pend.owner,'special','phoenix',pend.level,{reborn:true});revived.hp=pend.level>=1?2:1;s.board[i]=revived;message(s,'不死鳥が復活した！');}
    }s.pending.splice(s.pending.indexOf(pend),1);
  }}
  s.turn=-actor;s.ply++;s.round=Math.floor(s.ply/2)+1;
  for(const p of s.board)if(p&&p.owner===s.turn&&p.cd>0)p.cd--;
  if(s.ply>=300&&!s.win){s.win=2;s.reason='150手の上限で引き分け';}
}
function skillConfig(p){
  const def=BY_ID[p.id],level=p.level||0;
  return {...def.skill,range:def.skill.range+(level>=1&&['sniper','blink','seal','exchange','medic','mirror','errorcat','fog','police','mute','shadejump'].includes(p.id)?1:0),
    power:def.skill.power+(level>=1&&['slash','thunder','kita','spear'].includes(p.id)?1:0),
    cd:Math.max(1,def.skill.cd-(level>=2&&['acrobat','mirror','copy'].includes(p.id)?1:0))};
}
export function skillTargets(s,from){
  const p=at(s,from);if(!p||p.type!=='special'||p.frozen||p.silenced||p.cd>0)return [];
  const k=skillConfig(p),kind=k.kind;
  if(automatic.has(kind))return [];
  const result=[];
  for(let i=0;i<81;i++){
    if(i===from)continue;
    const q=at(s,i),d=distance(from,i);
    if(d>Math.max(1,k.range))continue;
    if(kind==='line'&&!((xy(from)[0]===xy(i)[0]||xy(from)[1]===xy(i)[1])&&!isBlocked(s,from,i)))continue;
    if(['strike','pierce','push'].includes(kind)&&d>k.range)continue;
    if(['teleport','wall','trap','turret'].includes(kind)){if(!q&&!terrainAt(s,i,'wall'))result.push(i);continue;}
    if(['shield','heal','buff','swap','portal','fusion'].includes(kind)){if(q?.owner===p.owner)result.push(i);continue;}
    if(kind==='revive'){if(!q&&s.grave.some(z=>z.owner===p.owner&&z.type!=='C'&&z.id!=='yaruo'))result.push(i);continue;}
    if(kind==='copy'){if(q?.owner!==p.owner&&q?.type==='special')result.push(i);continue;}
    if(kind==='random'||kind==='burn'||kind==='poison'||kind==='freeze'||kind==='silence'||kind==='pull'||kind==='swapEnemy'||kind==='reverseDir'||kind==='chain'||kind==='blast'||kind==='line'||kind==='strike'||kind==='pierce'||kind==='push'){
      if(q?.owner===-p.owner)result.push(i);
    }
  }
  return result;
}
function useSkill(s,from,to){
  const p=at(s,from),k=skillConfig(p),kind=k.kind,unit=at(s,to);
  const damage=(target,amount=k.power,ignore=0)=>hit(s,target,amount,p.owner,from,{ignoreDefense:ignore});
  if(['strike','pierce','line','blast','push','chain','random'].includes(kind)){
    let dmg=k.power;if(kind==='random')dmg=1+Math.floor(rand(s)*3);
    if(kind==='pierce')damage(to,dmg,1);else damage(to,dmg);
    if(kind==='chain')for(let i=0,n=0;i<81&&n<(p.level>=2?2:1);i++)if(i!==to&&at(s,i)?.owner===-p.owner&&distance(to,i)<=2){damage(i,1);n++;}
    if(kind==='blast')for(let i=0;i<81;i++)if(i!==to&&at(s,i)?.owner===-p.owner&&distance(i,to)<=(p.level>=1?2:1))damage(i,1);
    if(kind==='push'&&at(s,to)){const [x,y]=xy(to),[sx,sy]=xy(from),nx=x+Math.sign(x-sx),ny=y+Math.sign(y-sy);if(inside(nx,ny)&&!at(s,pos(nx,ny))){s.board[pos(nx,ny)]=at(s,to);s.board[to]=null;}}
  }else if(['burn','poison','freeze','silence','reverseDir'].includes(kind)){
    if(kind==='burn')unit.burn=p.level>=1?3:2;
    if(kind==='poison')unit.poison=2;
    if(kind==='freeze')unit.frozen=1;
    if(kind==='silence')unit.silenced=1;
    if(kind==='reverseDir')unit.reversed=2;
    if(p.level>=1&&['freeze','burn'].includes(kind))damage(to,1);
    if(p.level>=2&&['freeze','reverseDir'].includes(kind)){const extra=s.board.find(q=>q?.owner===-p.owner&&q!==unit);if(extra)extra[kind==='freeze'?'frozen':'reversed']=1;}
  }else if(kind==='pull'){
    const [x,y]=xy(to),[sx,sy]=xy(from),nx=x+Math.sign(sx-x),ny=y+Math.sign(sy-y);
    if(inside(nx,ny)&&!at(s,pos(nx,ny))){s.board[pos(nx,ny)]=unit;s.board[to]=null;}
  }else if(kind==='swap'||kind==='swapEnemy'){
    s.board[to]=p;s.board[from]=unit;
    if(p.level>=2&&kind==='swapEnemy')unit.frozen=1;
  }else if(kind==='teleport'){s.board[to]=p;s.board[from]=null;if(p.level>=2)for(let i=0;i<81;i++)if(at(s,i)?.owner===-p.owner&&distance(to,i)===1)hit(s,i,1,p.owner,to);}
  else if(kind==='portal'){const [x,y]=xy(from);const empty=king.map(([dx,dy])=>pos(x+dx,y+dy)).find(i=>i>=0&&i<81&&distance(i,from)===1&&!at(s,i));if(empty!==undefined){s.board[empty]=unit;s.board[to]=null;}}
  else if(kind==='heal'){unit.hp=Math.min(maxHp(unit),unit.hp+k.power+(p.level>=1&&p.id==='festival'?1:0));unit.frozen=0;unit.poison=0;unit.burn=0;}
  else if(kind==='shield'){unit.shield+=(p.level>=1?2:1);}
  else if(kind==='buff'){unit.attackBuff=Math.min(2,(unit.attackBuff||0)+1);if(p.level>=2)unit.cd=Math.max(0,unit.cd-1);}
  else if(kind==='fusion'){unit.hp=Math.min(maxHp(unit)+1,unit.hp+1);}
  else if(kind==='wall'||kind==='trap'||kind==='turret'){s.terrain.push({i:to,type:kind,owner:p.owner,ttl:kind==='wall'?4:3,power:k.power});}
  else if(kind==='revive'){const idx=s.grave.findLastIndex(z=>z.owner===p.owner&&z.type!=='C'&&z.id!=='yaruo'&&(z.type!=='special'||p.level>=2));if(idx>=0){const dead=s.grave.splice(idx,1)[0];s.board[to]={...dead,hp:1,cd:0,frozen:0,poison:0,burn:0};}}
  else if(kind==='copy'){p.copied=unit.id;}
  p.cd=k.cd+1;message(s,labelOf(p)+'：'+BY_ID[p.id].ability);
}
function applyMove(s,from,to,promote){
  const p=at(s,from),q=at(s,to),a=attack(p);
  if(q){if(a<=0)throw Error('この駒では攻撃できません。');const defeated=hit(s,to,a,p.owner,from,{ignoreDefense:p.id==='slash'?1:0});
    if(!defeated||at(s,to))return;
    if(p.id==='vampire')p.hp=Math.min(maxHp(p),p.hp+1);
    if(p.id==='oni')p.attackBuff=Math.min(2,p.attackBuff+1);
    if(p.id==='void')s.terrain.push({i:to,type:'corrupt',owner:p.owner,ttl:p.level>=1?4:2});
  }
  s.board[to]=p;s.board[from]=null;
  if(canPromote(p,from,to)&&(promote||forcePromote(p,to)))p.promoted=true;
  if(p.reversed>0)p.reversed--;
  if(terrainAt(s,to,'trap')){const t=s.terrain.find(t=>t.i===to&&t.type==='trap'&&t.owner!==p.owner);if(t){hit(s,to,t.power||1,-p.owner,null);s.terrain.splice(s.terrain.indexOf(t),1);}}
  if(terrainAt(s,to,'corrupt')){const t=s.terrain.find(t=>t.i===to&&t.type==='corrupt'&&t.owner!==p.owner);if(t){hit(s,to,1,-p.owner,null);if(t.level>=2&&at(s,to))at(s,to).silenced=1;}}
  message(s,labelOf(p)+'が移動した');
}
export function play(state,action){
  if(state.win)throw Error('対局は終了しています。');
  if(!action||!['move','skill','pass'].includes(action.kind))throw Error('行動が不正です。');
  const s=structuredClone(state),from=Number(action.from),to=Number(action.to);
  if(action.kind==='pass'){message(s,'パス');spendTurn(s,s.turn);return s;}
  if(!Number.isInteger(from)||from<0||from>80||!Number.isInteger(to)||to<0||to>80)throw Error('マスの指定が不正です。');
  const p=at(s,from);if(!p||p.owner!==s.turn)throw Error('自分の駒を選んでください。');
  if(p.frozen)throw Error('この駒は凍結されています。');
  if(action.kind==='move'){
    if(!moves(s,from).includes(to))throw Error('移動できないマスです。');
    applyMove(s,from,to,Boolean(action.promote));
  }else{
    if(!skillTargets(s,from).includes(to))throw Error('能力の対象が不正、またはCD中です。');
    useSkill(s,from,to);
  }
  spendTurn(s,p.owner);
  return s;
}
export function cpuMove(s){
  const choices=[];
  for(let i=0;i<81;i++){const p=at(s,i);if(p?.owner!==s.turn)continue;
    for(const j of moves(s,i)){const q=at(s,j);choices.push({kind:'move',from:i,to:j,promote:true,score:(q?(q.type==='C'?60:9):0)+Math.random()*2});}
    for(const j of skillTargets(s,i)){const q=at(s,j);choices.push({kind:'skill',from:i,to:j,score:(q?.owner===-s.turn?(q.type==='C'?45:11):4)+Math.random()*2});}
  }
  choices.sort((a,b)=>b.score-a.score);return choices[0]||{kind:'pass'};
}
