import { SPRA_WEAPONS, SPRA_CATEGORIES } from './weapons.js';
import { createCity } from './city.js';

const $ = id => document.getElementById(id);
const W=160,H=100,TILE=16,PAINT_SCALE=4,INK_MAX=300;
const PW=W*PAINT_SCALE,PH=H*PAINT_SCALE;
const canvas=$('gameCanvas'),ctx=canvas.getContext('2d',{alpha:false});
const miniCanvas=$('miniMap'),mini=miniCanvas.getContext('2d',{alpha:false});
ctx.imageSmoothingEnabled=false;mini.imageSmoothingEnabled=false;
const paintCanvas=document.createElement('canvas');
paintCanvas.width=PW;paintCanvas.height=PH;
const paintCtx=paintCanvas.getContext('2d');
const paintImage=paintCtx.createImageData(PW,PH);
const COLORS=['#26d7ec','#ff9835'];
let paint=new Uint8Array(PW*PH),paintDirty=true;
let ws=null,myId=null,roomCode='',isHost=false,scene='city',phase='lobby',round=0;
let players=[],walls=[],bombs=[],effects=[],remaining=180,scores=[0,0],winner=-1;
let lastFrame=performance.now(),clock=0,cameraX=0,cameraY=0,smooth=new Map(),toastTimer=null;
let selectedWeapon=localStorage.getItem('spra_equipped_v2')||'shooter';
const defaultOwned=['shooter','roller','blaster'];
let owned;
try {owned=new Set([...defaultOwned,...JSON.parse(localStorage.getItem('spra_owned_v2')||'[]')]);}
catch {owned=new Set(defaultOwned);}
if(!owned.has(selectedWeapon)||!SPRA_WEAPONS[selectedWeapon])selectedWeapon='shooter';
let credits=Math.max(0,Number(localStorage.getItem('spra_coins_v2')||1200)||0);
const nickname=$('nickname');
nickname.value=localStorage.getItem('spra_name')||'';
const keys=new Set();
const pointer={x:W/2,y:H/2,active:false,down:false};
const touch={fire:false,swim:false,moveX:0,moveY:0,stickId:null};
let bombQueued=false,shopFilter='all';
const queryRoom=new URL(location.href).searchParams.get('room');
if(queryRoom&&/^[a-z0-9]{6}$/i.test(queryRoom))$('roomInput').value=queryRoom.toUpperCase();

function toast(msg){
 const box=$('toast');box.textContent=String(msg);box.classList.add('shown');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('shown'),3100);
}
function saveBag(){
 localStorage.setItem('spra_owned_v2',JSON.stringify([...owned]));
 localStorage.setItem('spra_equipped_v2',selectedWeapon);
 localStorage.setItem('spra_coins_v2',String(credits));
 $('cityCoins').textContent=credits;
 $('shopCoins').textContent=credits;
 $('shopCurrent').textContent='装備中：'+(SPRA_WEAPONS[selectedWeapon]?.label||'シューター');
}
function textItem(text,className=''){
 const elem=document.createElement('span');elem.textContent=text;elem.className=className;return elem;
}
function sceneTo(next){
 scene=next;
 for(const [id,key] of [['citySection','city'],['joinCard','reception'],['roomCard','room'],['arenaPanel','battle']])
  $(id).classList.toggle('hidden',key!==next);
 city.setActive(next==='city'&&$('shopOverlay').classList.contains('hidden'));
 if(next!=='battle'){pointer.down=false;touch.fire=false;touch.swim=false;}
 if(next!=='city'&&next!=='battle')$(next==='room'?'roomCard':'joinCard').scrollIntoView({block:'start',behavior:'smooth'});
}
function openReception(){
 $('shopOverlay').classList.add('hidden');
 sceneTo('reception');
}
function openShop(){
 if(scene==='battle')return;
 $('shopOverlay').classList.remove('hidden');
 city.setActive(false);
 drawShop();
}
function closeShop(){
 $('shopOverlay').classList.add('hidden');
 city.setActive(scene==='city');
}
const city=createCity($('cityCanvas'),{onShop:openShop,onBattle:openReception,onHint:toast});
function disconnectToCity(){
 if(ws){const old=ws;ws=null;old.onclose=null;old.close();}
 myId=null;roomCode='';isHost=false;phase='lobby';round=0;
 $('roomInput').value='';
 history.replaceState(null,'','/spra/');
 $('shopOverlay').classList.add('hidden');
 $('createBtn').disabled=false;$('joinBtn').disabled=false;
 updateConnection(false);sceneTo('city');
 toast('カラフルシティに戻りました');
}
$('openMatch').addEventListener('click',openReception);
$('openShop').addEventListener('click',openShop);
$('joinBackCity').addEventListener('click',()=>sceneTo('city'));
$('roomBackCity').addEventListener('click',disconnectToCity);
$('leaveToCity').addEventListener('click',disconnectToCity);
$('roomShopBtn').addEventListener('click',openShop);
$('closeShop').addEventListener('click',closeShop);
$('shopOverlay').addEventListener('click',e=>{if(e.target===$('shopOverlay'))closeShop();});
$('cityInteract').addEventListener('click',()=>city.interact());
for(const b of document.querySelectorAll('[data-city-control]')){
 const direction=b.dataset.cityControl;
 b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);city.control(direction,true);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>city.control(direction,false));
}
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&!$('shopOverlay').classList.contains('hidden'))closeShop();
});
function equip(id){
 if(!owned.has(id)||!SPRA_WEAPONS[id])return;
 selectedWeapon=id;
 saveBag();send({type:'weapon',weapon:id});
 drawShop();drawRoomWeapons();
 toast(SPRA_WEAPONS[id].label+' を装備！');
}
function purchase(id){
 const weapon=SPRA_WEAPONS[id];if(!weapon)return;
 if(!owned.has(id)){
  if(credits<weapon.price)return toast('コインが足りません。バトルで獲得できます。');
  credits-=weapon.price;owned.add(id);
 }
 equip(id);
}
function drawShop(){
 saveBag();
 const categories=$('shopCategories');categories.replaceChildren();
 for(const item of [{id:'all',label:'すべて'},...SPRA_CATEGORIES]){
  const b=document.createElement('button');
  b.className='shop-tab'+(shopFilter===item.id?' chosen':'');
  b.textContent=item.label;
  b.addEventListener('click',()=>{shopFilter=item.id;drawShop();});
  categories.append(b);
 }
 const list=$('shopItems');list.replaceChildren();
 for(const weapon of Object.values(SPRA_WEAPONS).filter(w=>shopFilter==='all'||w.type===shopFilter)){
  const card=document.createElement('button');
  card.className='shop-weapon'+(selectedWeapon===weapon.id?' equipped':'');
  const header=document.createElement('div');header.className='shop-weapon-name';
  const icon=document.createElement('span');icon.className='weapon-pixel-icon';
  icon.textContent={shooter:'⌁',dualies:'⌁⌁',roller:'▰',brush:'▥',blaster:'✸',charger:'→',slosher:'▤',splatling:'⊞',bow:'⋔',brella:'⌂'}[weapon.type]||'●';
  const title=document.createElement('strong');title.textContent=weapon.label;
  header.append(icon,title);
  const stat=document.createElement('small');
  stat.textContent='威力 '+weapon.damage+' / 射程 '+weapon.range+' / 連射 '+(1/weapon.delay).toFixed(1)+'/s';
  const price=document.createElement('b');
  price.textContent=selectedWeapon===weapon.id?'[ 装備中 ]':owned.has(weapon.id)?'[ 装備する ]':'◎ '+weapon.price;
  card.append(header,stat,price);
  card.addEventListener('click',()=>purchase(weapon.id));
  list.append(card);
 }
}
function drawRoomWeapons(){
 const list=$('roomWeaponList');list.replaceChildren();
 for(const weapon of Object.values(SPRA_WEAPONS).filter(w=>owned.has(w.id))){
  const b=document.createElement('button');
  b.className='weapon'+(selectedWeapon===weapon.id?' selected':'');
  b.dataset.weapon=weapon.id;
  b.append(textItem('■','weapon-icon'),textItem(weapon.label,'weapon-title'),textItem(''+weapon.type,'weapon-meta'));
  b.addEventListener('click',()=>equip(weapon.id));
  list.append(b);
 }
}
saveBag();drawShop();drawRoomWeapons();
if(queryRoom&&/^[a-z0-9]{6}$/i.test(queryRoom))sceneTo('reception');else sceneTo('city');

function send(data){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function updateConnection(online){
 $('connection').classList.toggle('online',online);
 $('connection').lastChild.textContent=online?' ONLINE':' OFFLINE';
}
function join(code=''){
 if(ws&&[WebSocket.OPEN,WebSocket.CONNECTING].includes(ws.readyState))return toast('すでに接続しています');
 const name=nickname.value.trim().slice(0,18)||'PLAYER';
 localStorage.setItem('spra_name',name);
 $('createBtn').disabled=$('joinBtn').disabled=true;
 const proto=location.protocol==='https:'?'wss:':'ws:';
 const socket=new WebSocket(proto+'//'+location.host+'/spra/ws');
 ws=socket;
 socket.onopen=()=>{updateConnection(true);send({type:'join',name,code});};
 socket.onerror=()=>toast('サーバーに接続できませんでした');
 socket.onclose=()=>{
  if(socket!==ws)return;
  ws=null;myId=null;
  $('createBtn').disabled=$('joinBtn').disabled=false;
  updateConnection(false);sceneTo('reception');
  toast('切断されました。もう一度参加してください。');
 };
 socket.onmessage=event=>{
  let data;try{data=JSON.parse(event.data);}catch{return;}
  receive(data);
 };
}
$('createBtn').addEventListener('click',()=>join());
$('joinBtn').addEventListener('click',()=>{
 const code=$('roomInput').value.toUpperCase().trim().replace(/[^A-Z0-9]/g,'');
 if(code.length!==6)return toast('6文字の部屋コードを入力してください');
 join(code);
});
$('roomInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinBtn').click();});
$('copyBtn').addEventListener('click',async()=>{
 const url=location.origin+'/spra/?room='+roomCode;
 try{await navigator.clipboard.writeText(url);toast('招待URLをコピーしました');}
 catch{toast(url);}
});
$('blueBtn').addEventListener('click',()=>send({type:'team',team:0}));
$('orangeBtn').addEventListener('click',()=>send({type:'team',team:1}));
$('startBtn').addEventListener('click',()=>send({type:'start'}));
$('botBtn').addEventListener('click',()=>send({type:'bot'}));
$('backLobbyBtn').addEventListener('click',()=>send({type:'lobby'}));

function setInkPixel(index,value){
 if(index<0||index>=paint.length||value<0||value>2)return;
 paint[index]=value;
 const i=index*4,d=paintImage.data;
 if(!value){d[i+3]=0;return;}
 const noise=((index*2654435761>>>8)%13)-6;
 if(value===1){d[i]=23+noise;d[i+1]=206+noise;d[i+2]=235+noise;}
 else{d[i]=250+Math.min(5,noise);d[i+1]=147+noise;d[i+2]=47+noise;}
 d[i+3]=255;
}
function decodePaint(encoded){
 try{
  const bytes=atob(encoded||'');
  if(bytes.length!==PW*PH)return toast('マップのインク形式が不一致です。ページを再読み込みしてください');
  for(let i=0;i<bytes.length;i++)setInkPixel(i,bytes.charCodeAt(i));
  paintDirty=true;
 }catch{toast('インクの同期に失敗しました');}
}
function readChanges(changes){
 if(!Array.isArray(changes))return;
 for(let i=0;i+2<changes.length;i+=3){
  const index=changes[i],count=changes[i+1],value=changes[i+2];
  if(!Number.isInteger(index)||!Number.isInteger(count)||index<0||count<1||index+count>paint.length||![0,1,2].includes(value))continue;
  for(let j=index;j<index+count;j++)setInkPixel(j,value);
  paintDirty=true;
 }
}
function playerRoster(team){
 const root=$(team===0?'blueRoster':'orangeRoster');root.replaceChildren();
 const list=players.filter(p=>p.team===team);
 if(!list.length)root.append(textItem('参加者なし','empty'));
 for(const p of list){
  const row=document.createElement('div');row.className='member';
  row.append(textItem((p.id===myId?'★ ':'')+p.name),
    textItem(p.bot?'CPU':'PLAYER'));
  root.append(row);
 }
}
function maybeReward(){
 if(phase!=='results'||!myId||!round)return;
 const key='spra_reward_'+roomCode+'_'+round;
 if(localStorage.getItem(key))return;
 const me=players.find(p=>p.id===myId);
 if(!me)return;
 const reward=winner===-1?180:me.team===winner?350:150;
 localStorage.setItem(key,'1');
 credits+=reward;saveBag();
 toast('バトル報酬 +'+reward+'コイン！');
}
function receive(msg){
 if(msg.type==='error'){toast(msg.message||'エラー');if(!myId)ws?.close();return;}
 if(msg.type==='welcome'){
  myId=msg.id;roomCode=msg.code;walls=msg.walls||[];
  if(msg.width!==W||msg.height!==H||msg.paintScale!==PAINT_SCALE)
    toast('画面のバージョンが違います。ページを更新してください。');
  decodePaint(msg.paint);
  $('roomCode').textContent=roomCode;
  $('roomInput').value=roomCode;
  history.replaceState(null,'','/spra/?room='+roomCode);
  send({type:'weapon',weapon:selectedWeapon});
  sceneTo('room');
  toast('部屋に参加しました');
  return;
 }
 if(msg.type==='reset'){
  decodePaint(msg.paint);
  effects=[];smooth.clear();bombs=[];cameraX=0;cameraY=0;
  $('result').classList.add('hidden');
  return;
 }
 if(msg.type==='state'){
  if(!myId)return;
  phase=msg.phase;round=msg.round||0;remaining=msg.remaining;
  scores=Array.isArray(msg.scores)?msg.scores:[0,0];
  winner=msg.winner;isHost=msg.host===myId;
  players=msg.players||[];bombs=msg.bombs||[];
  readChanges(msg.changes);
  if(Array.isArray(msg.effects))for(const fx of msg.effects)effects.push({...fx,time:performance.now()});
  if(effects.length>90)effects.splice(0,effects.length-90);
  updateUI();
  maybeReward();
 }
}
function updateUI(){
 const active=phase==='playing'||phase==='results';
 if(scene!==(active?'battle':'room'))sceneTo(active?'battle':'room');
 if(!active){
  playerRoster(0);playerRoster(1);
  $('startBtn').disabled=!isHost;
  $('botBtn').disabled=!isHost||players.length>=8;
  $('hostNote').textContent=isHost?
   'あなたがホストです。試合開始時に足りない人数をCPUで補充し、4対4で始まります。':
   'ホストが試合開始すると、空き枠をCPUが埋めます。';
 }
 const me=players.find(p=>p.id===myId);
 if(me){
  $('myTeam').textContent=me.team===0?'BLUE TEAM':'ORANGE TEAM';
  $('myTeam').style.color=COLORS[me.team];
  $('myHp').textContent=me.hp;
  $('myInk').textContent=me.ink+'/'+(me.maxInk||INK_MAX);
  $('myKo').textContent=me.ko;
  $('myBomb').textContent=me.bombCd>0?Math.ceil(me.bombCd)+'s':'READY';
  const pct=Math.max(0,Math.min(100,(me.ink/(me.maxInk||INK_MAX))*100));
  $('inkFill').style.width=pct+'%';
  $('inkCounter').textContent=me.ink+' / '+(me.maxInk||INK_MAX);
  $('inkStatus').textContent=me.swim?'■ 潜伏中 / INK REFILL':'INK TANK';
  $('inkHud').classList.toggle('recovering',Boolean(me.swim));
  $('inkRecovery').textContent=me.swim?'自分のインクで高速回復中！':
     '自分のインクに潜ると高速で回復';
 }
 $('blueScore').textContent=(scores[0]||0).toFixed(1)+'%';
 $('orangeScore').textContent=(scores[1]||0).toFixed(1)+'%';
 $('blueBar').style.width=Math.min(100,scores[0]||0)+'%';
 $('orangeBar').style.width=Math.min(100,scores[1]||0)+'%';
 $('clock').textContent=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');
 $('result').classList.toggle('hidden',phase!=='results');
 if(phase==='results'){
  $('resultTitle').textContent=winner<0?'DRAW!':winner===0?'BLUE WIN!':'ORANGE WIN!';
  $('resultTitle').style.color=winner<0?'#fff':COLORS[winner];
  $('resultScores').textContent='BLUE '+scores[0].toFixed(1)+'% / ORANGE '+scores[1].toFixed(1)+'%';
  $('backLobbyBtn').classList.toggle('hidden',!isHost);
  $('resultHint').textContent=isHost?'次の試合を開始するにはロビーへ戻ってください。':
   'ホストの再開を待つか、街へ戻れます。';
 }
}
const controls=new Set(['w','a','s','d','q','shift','arrowup','arrowdown','arrowleft','arrowright',' ']);
window.addEventListener('keydown',e=>{
 if(scene!=='battle'||phase!=='playing'||['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
 const key=e.key.toLowerCase();
 if(controls.has(key))e.preventDefault();
 if(key==='q'&&!keys.has(key))bombQueued=true;
 keys.add(key);
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{keys.clear();pointer.down=false;touch.fire=false;touch.swim=false;touch.moveX=touch.moveY=0;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function aimAtPointer(e){
 const bounds=canvas.getBoundingClientRect();
 pointer.x=cameraX+(e.clientX-bounds.left)/bounds.width*canvas.width/TILE;
 pointer.y=cameraY+(e.clientY-bounds.top)/bounds.height*canvas.height/TILE;
 pointer.active=true;
}
canvas.addEventListener('pointermove',e=>{
 if(e.pointerType==='mouse'||(e.pointerType!=='mouse'&&pointer.down))aimAtPointer(e);
});
canvas.addEventListener('pointerdown',e=>{
 if(phase!=='playing')return;
 aimAtPointer(e);
 if(e.button===0){pointer.down=true;if(e.pointerType==='mouse')canvas.setPointerCapture(e.pointerId);}
});
window.addEventListener('pointerup',()=>{pointer.down=false;});
canvas.addEventListener('pointercancel',()=>{pointer.down=false;});
const stick=$('joystick'),thumb=$('thumb');
function updateStick(e){
 const bounds=stick.getBoundingClientRect();
 const radius=bounds.width*.35;
 let x=e.clientX-(bounds.left+bounds.width/2),y=e.clientY-(bounds.top+bounds.height/2);
 const length=Math.hypot(x,y);
 if(length>radius){x=x*radius/length;y=y*radius/length;}
 touch.moveX=x/radius;touch.moveY=y/radius;
 thumb.style.transform='translate(calc(-50% + '+x+'px),calc(-50% + '+y+'px))';
}
stick.addEventListener('pointerdown',e=>{e.preventDefault();touch.stickId=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===touch.stickId)updateStick(e);});
function releaseStick(e){if(e.pointerId!==touch.stickId)return;touch.stickId=null;touch.moveX=touch.moveY=0;thumb.style.transform='translate(-50%,-50%)';}
stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
function holdButton(id,name){
 const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch[name]=true;});
 for(const event of ['pointerup','pointercancel'])b.addEventListener(event,()=>{touch[name]=false;});
}
holdButton('fireTouch','fire');holdButton('swimTouch','swim');
$('bombTouch').addEventListener('pointerdown',e=>{e.preventDefault();bombQueued=true;});
setInterval(()=>{
 if(scene!=='battle'||phase!=='playing'||!myId||ws?.readyState!==WebSocket.OPEN)return;
 const x=(+keys.has('d')||+keys.has('arrowright'))-(+keys.has('a')||+keys.has('arrowleft'))+touch.moveX;
 const y=(+keys.has('s')||+keys.has('arrowdown'))-(+keys.has('w')||+keys.has('arrowup'))+touch.moveY;
 const me=players.find(p=>p.id===myId);
 let aim=me?.aim||0;
 if(me&&pointer.active)aim=Math.atan2(pointer.y-me.y,pointer.x-me.x);
 send({type:'input',x,y,aim,fire:pointer.down||touch.fire||keys.has(' '),
  swim:keys.has('shift')||touch.swim,bomb:bombQueued});
 bombQueued=false;
},65);

function drawBox(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function worldBox(x,y,w,h,c){drawBox(x*TILE,y*TILE,w*TILE,h*TILE,c);}
function drawFloor(){
 const startX=Math.max(0,Math.floor(cameraX)-2),startY=Math.max(0,Math.floor(cameraY)-2);
 const endX=Math.min(W,Math.ceil(cameraX+canvas.width/TILE)+2);
 const endY=Math.min(H,Math.ceil(cameraY+canvas.height/TILE)+2);
 for(let y=startY;y<endY;y++)for(let x=startX;x<endX;x++){
  const hash=(x*73856093 ^ y*19349663)>>>0;
  worldBox(x,y,1.02,1.02,hash%7===0?'#213646':(x+y)%2?'#1b303f':'#1c3242');
  if(hash%23===0)worldBox(x+.25,y+.25,.14,.1,'#314f5c');
 }
 if(paintDirty){paintCtx.putImageData(paintImage,0,0);paintDirty=false;}
 ctx.imageSmoothingEnabled=false;
 ctx.drawImage(paintCanvas,0,0,W*TILE,H*TILE);
 for(const b of walls){
  worldBox(b.x+.3,b.y+.5,b.w,b.h,'#071522');
  worldBox(b.x,b.y,b.w,b.h,'#3a5069');
  worldBox(b.x+.25,b.y+.25,b.w-.5,b.h-.5,'#506c83');
  worldBox(b.x+.75,b.y+.7,b.w-1.5,.5,'#688f9c');
  for(let i=2;i<b.w;i+=3)worldBox(b.x+i,b.y+b.h-1,.65,.65,'#263d51');
 }
 for(const [team,x] of [9,W-9].entries()){
  worldBox(x-2,H/2-2,4,4,team?'#a95c36':'#21738c');
  worldBox(x-1.2,H/2-1.2,2.4,2.4,team?'#f09836':'#24b8df');
 }
}
function drawBombs(){
 for(const b of bombs){
  const x=b.x*TILE,y=b.y*TILE,z=b.z*TILE;
  drawBox(x-7,y-3,14,8,'#03182688');
  drawBox(x-8,y-z-9,16,16,'#071d27');
  drawBox(x-6,y-z-9,12,12,COLORS[b.team]);
  drawBox(x-2,y-z-11,5,4,'#e7f8a4');
  drawBox(x-4,y-z-3,7,3,'#ecffbd');
 }
}
function drawEffects(now){
 effects=effects.filter(f=>now-f.time<480);
 for(const fx of effects){
  const age=(now-f.time)/480,fade=1-age;
  if(fx.type==='shot'){
   const dx=fx.tx-fx.x,dy=fx.ty-fx.y;
   const n=fx.weaponType==='roller'?20:12;
   ctx.globalAlpha=fade*.6;
   for(let i=0;i<n;i++){
    const t=i/n,shake=Math.sin(i*3.4+(fx.seed||0))*.24;
    worldBox(fx.x+dx*t+shake,fx.y+dy*t, .22+((i%3)*.12),.22,COLORS[fx.team]);
   }
  } else if(fx.type==='bomb'||fx.type==='ko'){
   const radius=(fx.type==='bomb'?5.4:2.5)*age;
   ctx.globalAlpha=fade*.7;
   for(let i=0;i<20;i++){
    const a=(i*17%20)*Math.PI*2/20;
    const d=radius*(.65+(i%4)*.15);
    worldBox(fx.x+Math.cos(a)*d,fx.y+Math.sin(a)*d,.52,.52,COLORS[fx.team]);
   }
  }
 }
 ctx.globalAlpha=1;
}
function drawAvatar(p,dt,now){
 if(p.dead)return;
 let s=smooth.get(p.id);
 if(!s){s={x:p.x,y:p.y,aim:p.aim};smooth.set(p.id,s);}
 const t=Math.min(1,dt*14);
 s.x+=(p.x-s.x)*t;s.y+=(p.y-s.y)*t;
 s.aim+=Math.atan2(Math.sin(p.aim-s.aim),Math.cos(p.aim-s.aim))*t;
 const x=s.x*TILE,y=s.y*TILE,color=COLORS[p.team],mine=p.id===myId;
 if(p.swim){
  // Hidden in their own ink; show rippling pixel wake and an ink-meter above self.
  drawBox(x-11,y-6,22,13,'#09243b');
  drawBox(x-8,y-4,16,9,color);
  drawBox(x+Math.cos(s.aim)*7-3,y+Math.sin(s.aim)*7-3,6,6,'#eafaff');
  if(mine){
   drawBox(x-36,y-26,72,10,'#0a1524');
   drawBox(x-34,y-24,68,6,'#284455');
   drawBox(x-34,y-24,68*p.ink/INK_MAX,6,'#d9ff5e');
   ctx.font='bold 9px monospace';ctx.fillStyle='#efffc6';
   ctx.textAlign='center';ctx.fillText('INK +',x,y-30);ctx.textAlign='left';
  }
 }else{
  if(mine){drawBox(x-15,y-16,30,31,'#d7ff62');drawBox(x-13,y-14,26,27,'#112c42');}
  drawBox(x-9,y+2,7,10,'#102534');drawBox(x+3,y+2,7,10,'#102534');
  drawBox(x-11,y-8,22,16,color);
  drawBox(x-9,y-18,18,13,'#f5bb9e');
  drawBox(x-11,y-19,22,7,p.team?'#55295c':'#194961');
  drawBox(x-5,y-11,3,3,'#071522');drawBox(x+4,y-11,3,3,'#071522');
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.rotate(s.aim);
  drawBox(4,-4,15,7,'#132537');drawBox(12,-3,10,5,'#e1ff96');ctx.restore();
 }
 // Label and health pip remain pixel-based.
 ctx.textAlign='center';ctx.font='bold 10px monospace';ctx.fillStyle='#f6ffff';
 ctx.fillText((mine?'★ ':'')+p.name,x,y-29);ctx.textAlign='left';
 if(!p.swim){
  drawBox(x-13,y-26,26,4,'#081522');
  drawBox(x-13,y-26,26*p.hp/100,4,p.hp<40?'#ff5573':'#bdff76');
 }
}
function drawAim(){
 const me=players.find(p=>p.id===myId);
 if(!me||me.dead||!pointer.active)return;
 const ax=pointer.x*TILE,ay=pointer.y*TILE;
 drawBox(ax-1,ay-13,2,10,'#efffa1');drawBox(ax-1,ay+4,2,10,'#efffa1');
 drawBox(ax-13,ay-1,10,2,'#efffa1');drawBox(ax+4,ay-1,10,2,'#efffa1');
}
function drawMiniMap(){
 mini.imageSmoothingEnabled=false;
 mini.fillStyle='#101f2b';mini.fillRect(0,0,miniCanvas.width,miniCanvas.height);
 mini.drawImage(paintCanvas,0,0,miniCanvas.width,miniCanvas.height);
 const sx=miniCanvas.width/W,sy=miniCanvas.height/H;
 for(const b of walls){mini.fillStyle='#445a6b';mini.fillRect(b.x*sx,b.y*sy,b.w*sx,b.h*sy);}
 for(const p of players){
  if(p.dead)continue;
  mini.fillStyle=COLORS[p.team];
  mini.fillRect(p.x*sx-2,p.y*sy-2,5,5);
  if(p.id===myId){mini.strokeStyle='#f2ff8d';mini.lineWidth=2;mini.strokeRect(p.x*sx-4,p.y*sy-4,9,9);}
 }
 mini.strokeStyle='#e0f7ff';mini.lineWidth=1.5;
 mini.strokeRect(cameraX*sx,cameraY*sy,canvas.width/TILE*sx,canvas.height/TILE*sy);
}
let frames=0;
function render(now){
 const dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;clock+=dt;
 requestAnimationFrame(render);
 if(scene!=='battle')return;
 const me=players.find(p=>p.id===myId);
 const viewW=canvas.width/TILE,viewH=canvas.height/TILE;
 if(me){
  const nextX=Math.max(0,Math.min(W-viewW,me.x-viewW/2));
  const nextY=Math.max(0,Math.min(H-viewH,me.y-viewH/2));
  cameraX+=(nextX-cameraX)*Math.min(1,dt*9);
  cameraY+=(nextY-cameraY)*Math.min(1,dt*9);
 }
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#122336';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.save();
 ctx.translate(-Math.round(cameraX*TILE),-Math.round(cameraY*TILE));
 drawFloor();drawBombs();drawEffects(now);
 for(const p of players)drawAvatar(p,dt,now);
 drawAim();ctx.restore();
 if((frames++%4)===0)drawMiniMap();
}
requestAnimationFrame(render);
