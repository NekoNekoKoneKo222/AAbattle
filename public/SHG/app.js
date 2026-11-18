import {SPECIALS,BY_ID,CATEGORIES,validateLoadout,COST_CAP} from './specials.js';
import {newGame,play,moves,skillTargets,infoOf,labelOf,canPromote,cpuMove,maxHp} from './engine.js';
const $=id=>document.getElementById(id);
const gameState={profile:null,loadout:[],game:null,mode:'',selected:-1,kind:'move',history:[],room:null,revision:0,poll:null,busy:false,quick:false,logged:false};
const names={common:'コモン',rare:'レア',epic:'エピック',legendary:'レジェンダリー',mythic:'ミシック',special:'変化専用'};
const values={common:12,rare:26,epic:65,legendary:150,mythic:300},prices={common:90,rare:190,epic:450,legendary:1000,mythic:1800};
function rarityOf(p){if(p.id==='goch')return 'special';if(['nich','yaruo','phoenix','void','luck'].includes(p.id))return 'mythic';const i=SPECIALS.findIndex(q=>q.id===p.id);return i%11===0?'legendary':i%5===0?'epic':i%3===0?'rare':'common';}
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>t.classList.remove('show'),3300);}
function showTab(name){document.querySelectorAll('.page').forEach(e=>e.hidden=e.id!==name);document.querySelectorAll('[data-tab]').forEach(e=>e.classList.toggle('active',e.dataset.tab===name));}
async function api(path,payload){
  const init={credentials:'same-origin',headers:{Accept:'application/json'}};
  if(payload!==undefined){init.method='POST';init.headers['Content-Type']='application/json';init.body=JSON.stringify(payload);}
  const resp=await fetch(path,init),data=await resp.json().catch(()=>({}));
  if(!resp.ok)throw Error(data.error||'通信エラー '+resp.status);
  return data;
}
function owned(id){return (gameState.profile?.pieces?.[id]||0)>0;}
function total(){return gameState.loadout.reduce((v,id)=>v+(BY_ID[id]?.cost||0),0);}
function lvl(id){return Math.min(100,Math.floor(Number(gameState.profile?.mastery?.[id]||0)/25));}
function saved(){localStorage.setItem('shg-loadout',JSON.stringify(gameState.loadout));}
function renderLoadout(){
  $('costText').textContent=total()+' / '+COST_CAP;
  const box=$('loadout');box.replaceChildren();
  for(let i=0;i<3;i++){
    const id=gameState.loadout[i],p=BY_ID[id],slot=document.createElement('div');slot.className='load-slot';
    if(p){
      const name=document.createElement('strong');name.textContent=p.name;
      const info=document.createElement('small');info.textContent='HP'+p.hp+' / 攻'+p.attack+' / 防'+p.defense+' · コスト'+p.cost;
      const b=document.createElement('button');b.textContent='外す';b.onclick=()=>toggle(id);
      slot.append(name,info,b);
    }else slot.textContent='空き枠 '+(i+1);
    box.append(slot);
  }
}
function toggle(id){
  if(id==='goch'){toast('五局は変化専用です。');return;}
  if(gameState.loadout.includes(id)){
    gameState.loadout=gameState.loadout.filter(x=>x!==id&&(id!=='nich'||x!=='yaruo'));
  }else{
    if(!owned(id)){toast('ガチャまたは欠片交換で駒を獲得してください。');return;}
    if(gameState.loadout.length>=3||total()+BY_ID[id].cost>COST_CAP){toast('編成は3体以内・コスト9以下です。');return;}
    if(id==='yaruo'&&!gameState.loadout.includes('nich')){toast('殺夫には二局の編成が必要です。');return;}
    gameState.loadout.push(id);
  }
  saved();renderLoadout();renderCatalog();
}
function ptag(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
function renderCatalog(){
  const term=$('pieceSearch').value.trim().toLowerCase(),cat=$('category').value,filter=$('ownership').value,box=$('catalog');box.replaceChildren();
  const list=SPECIALS.filter(p=>(!term||[p.name,p.ability,p.awakening,p.ultimate].join(' ').toLowerCase().includes(term))&&(!cat||p.category===cat)&&(!filter||(filter==='owned'?owned(p.id):!owned(p.id))));
  $('catalogCount').textContent=list.length+' / '+SPECIALS.length+'種類';
  for(const p of list){
    const r=rarityOf(p),card=document.createElement('article');card.className='piece-card'+(owned(p.id)?'':' locked');
    const title=ptag('h3',p.name+'　'+p.category+' / '+names[r]),attrs=document.createElement('div');attrs.className='attrs';
    ['HP '+p.hp,'攻 '+p.attack,'防 '+p.defense,'コスト '+p.cost,'移動 '+p.move].forEach(t=>attrs.append(ptag('span',t)));
    const base=ptag('p','固有能力：'+p.ability),awake=ptag('p','覚醒：'+p.awakening),ultimate=ptag('p','究極覚醒：'+p.ultimate);
    awake.className='upgrade';ultimate.className='ultimate';
    const footer=document.createElement('footer');footer.append(ptag('small','所持 '+(gameState.profile?.pieces?.[p.id]||0)+' / マスタリーLv.'+lvl(p.id)));
    if(p.id==='goch')footer.append(ptag('small','二局の変化専用'));
    else{
      const equip=ptag('button',gameState.loadout.includes(p.id)?'解除':'編成');
      equip.disabled=!owned(p.id);equip.onclick=()=>toggle(p.id);footer.append(equip);
      if(owned(p.id)){
        const sell=ptag('button','変換 +'+values[r]);
        sell.onclick=()=>convert(p.id);footer.append(sell);
      }
      const buy=ptag('button','交換 '+prices[r]+'欠片');buy.disabled=!gameState.profile||gameState.profile.shards<prices[r];buy.onclick=()=>craft(p.id);footer.append(buy);
    }
    card.append(title,attrs,base,awake,ultimate,footer);box.append(card);
  }
}
function setProfile(p){
  gameState.profile=p;
  gameState.loadout=gameState.loadout.filter(owned);
  if(gameState.loadout.includes('yaruo')&&!gameState.loadout.includes('nich'))gameState.loadout=gameState.loadout.filter(id=>id!=='yaruo');
  if(!validateLoadout(gameState.loadout))gameState.loadout=[];
  saved();$('coins').textContent=p.coins.toLocaleString('ja-JP');$('shards').textContent=p.shards.toLocaleString('ja-JP');
  $('daily').disabled=!p.dailyAvailable;renderLoadout();renderCatalog();
}
async function collection(){
  try{
    const p=await api('/api/SHG/collection');setProfile(p);
    gameState.logged=true;
    $('loginInfo').textContent='AAbattleアカウントでログイン済み。ガチャ・所持駒はサーバーに保存されます。';
    ['gacha','gachaTen','createRoom','joinRoom','quickMatch'].forEach(id=>$(id).disabled=false);
  }catch(e){
    gameState.logged=false;
    $('loginInfo').textContent='データベースへの接続またはログインが必要です：'+e.message;
    setProfile({coins:0,shards:0,pieces:{slash:1,guardian:1,sniper:1},mastery:{},dailyAvailable:false});
    ['gacha','gachaTen','createRoom','joinRoom','quickMatch','daily'].forEach(id=>$(id).disabled=true);
  }
}
async function pull(count){
  try{
    const r=await api('/api/SHG/collection/pull',{count});setProfile(r.profile);
    const msg=r.results.map(p=>(p.newPiece?'NEW ':'')+p.name+'('+names[p.rarity]+')').join('、');
    $('gachaMessage').textContent=msg;toast('獲得：'+msg);
  }catch(e){toast(e.message);}
}
async function convert(id){
  const p=BY_ID[id],last=Number(gameState.profile.pieces[id])===1,rarity=rarityOf(p);
  if(!window.confirm(p.name+'を1体消費して欠片'+values[rarity]+'個に変換しますか？'+(last?' 最後の1体を失います。':'')))return;
  try{const r=await api('/api/SHG/collection/convert',{id,count:1});setProfile(r.profile);$('collectionMessage').textContent=r.name+'を変換。欠片 +'+r.gained;toast('変換完了！');}catch(e){toast(e.message);}
}
async function craft(id){
  const p=BY_ID[id],price=prices[rarityOf(p)];
  if(!window.confirm(p.name+'を欠片'+price+'個で確定入手しますか？'))return;
  try{const r=await api('/api/SHG/collection/craft',{id});setProfile(r.profile);toast(r.name+'を獲得しました！');}catch(e){toast(e.message);}
}
function config(){
  const aa=[$('aa1').value,$('aa2').value].map(s=>s.slice(0,160));
  localStorage.setItem('shg-aa',JSON.stringify(aa));return {loadout:gameState.loadout.slice(),aa};
}
function stopPoll(){if(gameState.poll){clearInterval(gameState.poll);gameState.poll=null;}}
function enterGame(game,mode,room=null){
  stopPoll();gameState.game=game;gameState.mode=mode;gameState.room=room;gameState.selected=-1;gameState.kind='move';gameState.history=[];gameState.busy=false;
  $('gamePanel').hidden=false;$('emptyMatch').hidden=true;$('roomBanner').hidden=!room;
  $('matchMode').textContent=mode==='cpu'?'CPU戦':mode==='local'?'ローカル2人対戦':'オンラインPvP';
  showTab('match');renderBoard();
}
function startTraining(cpu){
  if(!validateLoadout(gameState.loadout)){toast('編成条件を確認してください。');return;}
  const cfg=config(),levels={};for(const id of cfg.loadout)levels[id]=lvl(id)>=75?2:lvl(id)>=30?1:0;
  try{
    const g=newGame({loadouts:{1:cfg.loadout,'-1':cpu?['combo','ice']:cfg.loadout},aa:{1:cfg.aa,'-1':cpu?[]:cfg.aa},
      levels:{1:levels,'-1':cpu?{}:levels}});
    enterGame(g,cpu?'cpu':'local');
  }catch(e){toast(e.message);}
}
function side(){return gameState.mode==='online'?gameState.room?.side:gameState.mode==='cpu'?1:gameState.game?.turn;}
function renderBoard(){
  const g=gameState.game;if(!g)return;
  const mine=g.turn===side(),p=gameState.selected>=0?g.board[gameState.selected]:null,targets=new Set(mine&&p?(gameState.kind==='move'?moves(g,gameState.selected):skillTargets(g,gameState.selected)):[]);
  $('turnText').textContent=g.win?(g.win===2?'引き分け':(g.win===1?'先手':'後手')+'の勝利！'):(g.turn===1?'▲ 先手':'△ 後手')+'の番';
  for(const owner of [1,-1]){
    const castle=g.board.find(q=>q?.type==='C'&&q.owner===owner);
    $('castle'+(owner===1?'Plus':'Minus')).textContent='城 '+(castle?.hp||0)+' / 3';
    $('side'+(owner===1?'Plus':'Minus')).classList.toggle('current',g.turn===owner);
  }
  $('moveMode').classList.toggle('active',gameState.kind==='move');$('skillMode').classList.toggle('active',gameState.kind==='skill');
  $('passTurn').disabled=!mine||Boolean(g.win)||gameState.busy;$('undo').disabled=gameState.mode!=='local'||!gameState.history.length;
  const board=$('board');board.replaceChildren();
  for(let i=0;i<81;i++){
    const el=document.createElement('button');el.className='square';el.type='button';el.setAttribute('role','gridcell');
    if(i===gameState.selected)el.classList.add('selected');
    if(targets.has(i))el.classList.add(gameState.kind==='move'?'target':'skill-target');
    const q=g.board[i];
    if(q){
      const token=document.createElement('span');token.className='token'+(q.owner===-1?' back':'')+(q.type==='special'?' special':'')+(q.type==='C'?' castle':'');
      token.append(ptag('span',q.type==='special'?(BY_ID[q.id]?.name||'?').slice(0,2):labelOf(q)));
      const hp=ptag('span','♥'+q.hp+(q.cd?' ⏱'+q.cd:''));hp.className='hp';token.append(hp);el.append(token);
    }else if(g.terrain?.some(t=>t.i===i))el.append(ptag('span','✦'));
    el.title=(i%9+1)+'筋'+(Math.floor(i/9)+1)+'段：'+(q?labelOf(q):'空きマス');
    el.addEventListener('click',()=>click(i));board.append(el);
  }
  const detail=$('selectedPanel');detail.replaceChildren(ptag('h3','駒の情報'));
  if(p){
    const spec=infoOf(p);
    detail.append(ptag('p',labelOf(p)+'（'+(p.owner===1?'先手':'後手')+'） HP'+p.hp+'/'+maxHp(p)+' 攻'+(spec?.attack||0)+' 防'+(spec?.defense||0)));
    if(p.type==='special')detail.append(ptag('p','能力：'+spec.ability+' / CD '+p.cd),ptag('p','覚醒：'+spec.awakening),ptag('p','究極覚醒：'+spec.ultimate));
    else if(p.type==='A'){const pre=ptag('pre',p.art||'AA');pre.style.whiteSpace='pre-wrap';detail.append(pre);}
    else detail.append(ptag('p',p.type==='C'?'王城は移動も攻撃もできません。':'通常駒は特殊能力なし。'));
  }else detail.append(ptag('p','駒を選択してください。'));
  const log=$('battleLog');log.replaceChildren(...g.log.slice(-25).reverse().map(t=>ptag('div',t)));
  $('gameMessage').textContent=g.win?(g.win===2?'引き分け':(g.win===1?'先手':'後手')+'の勝利！ '+g.reason):!mine?'相手の番です。':p?'緑または赤の移動先を選んでください。':'動かす駒を選んでください。';
}
async function click(i){
  const g=gameState.game;if(!g||g.win||g.turn!==side()||gameState.busy)return;
  if(gameState.selected>=0&&i!==gameState.selected){
    const from=gameState.selected,p=g.board[from],options=gameState.kind==='move'?moves(g,from):skillTargets(g,from);
    if(options.includes(i)){
      const promote=gameState.kind==='move'&&canPromote(p,from,i)?window.confirm(labelOf(p)+'を成りますか？'):false;
      await perform({kind:gameState.kind,from,to:i,promote});return;
    }
  }
  if(g.board[i]?.owner===g.turn)gameState.selected=i;else gameState.selected=-1;
  renderBoard();
}
async function perform(action){
  if(!gameState.game)return;
  if(gameState.mode==='online'){
    try{
      const r=await api('/api/SHG/rooms/'+gameState.room.code+'/action',{revision:gameState.revision,action});
      gameState.revision=r.revision;gameState.game=r.game;gameState.selected=-1;renderBoard();
    }catch(e){toast(e.message);await syncRoom();}
  }else{
    try{
      if(gameState.mode==='local')gameState.history.push(structuredClone(gameState.game));
      gameState.game=play(gameState.game,action);gameState.selected=-1;renderBoard();
      if(gameState.mode==='cpu'&&!gameState.game.win){
        gameState.busy=true;renderBoard();
        setTimeout(()=>{try{gameState.game=play(gameState.game,cpuMove(gameState.game));}catch(e){toast(e.message);}gameState.busy=false;renderBoard();},350);
      }
    }catch(e){toast(e.message);if(gameState.mode==='local')gameState.history.pop();}
  }
}
function roomDisplay(r){
  gameState.room={code:r.code,side:r.side};gameState.revision=r.revision;
  $('currentRoomCode').textContent=r.code;
  $('roomStatus').textContent=r.guest?'対局：'+r.host+' vs '+r.guest:'相手の参加待ち';
  $('roomBanner').hidden=false;
  if(r.game){
    if(gameState.mode!=='online'||!gameState.game)enterGame(r.game,'online',gameState.room);
    else{gameState.game=r.game;renderBoard();}
  }else{showTab('match');$('emptyMatch').hidden=false;$('gamePanel').hidden=true;}
  if(!r.game?.win)pollRoom();else stopPoll();
}
async function syncRoom(){if(!gameState.room)return;try{roomDisplay(await api('/api/SHG/rooms/'+gameState.room.code));}catch(e){stopPoll();toast(e.message);}}
function pollRoom(){if(!gameState.poll)gameState.poll=setInterval(syncRoom,2500);}
async function createRoom(){
  try{const c=config(),r=await api('/api/SHG/rooms',{loadout:c.loadout,aa:c.aa});stopPoll();gameState.game=null;roomDisplay(r);toast('ルームコードを友達に共有してください。');}catch(e){toast(e.message);}
}
async function joinRoom(){
  const code=$('roomCode').value.trim().toUpperCase();
  if(!/^[A-Z2-9]{6}$/.test(code)){toast('6桁のルームコードを入力してください。');return;}
  try{const c=config(),r=await api('/api/SHG/rooms/'+code+'/join',{loadout:c.loadout,aa:c.aa});stopPoll();gameState.game=null;roomDisplay(r);}catch(e){toast(e.message);}
}
async function quick(){
  try{
    const c=config(),r=await api('/api/SHG/quick/join',{loadout:c.loadout,aa:c.aa});gameState.quick=true;
    if(r.status==='matched'){gameState.game=null;roomDisplay(r.room);toast('マッチングしました！');return;}
    $('quickStatus').hidden=false;$('quickCancel').hidden=false;$('quickMatch').disabled=true;
    $('quickStatus').textContent='対戦相手を検索中…';
    stopPoll();gameState.poll=setInterval(quickStatus,2500);
  }catch(e){toast(e.message);}
}
async function quickStatus(){
  try{
    const r=await api('/api/SHG/quick/status');
    if(r.status==='matched'){stopPoll();$('quickStatus').hidden=true;$('quickCancel').hidden=true;gameState.game=null;roomDisplay(r.room);toast('マッチングしました！');}
    else if(r.status==='waiting')$('quickStatus').textContent='検索中… 待機プレイヤー '+r.waitingCount+'人';
    else cancelQuick(false);
  }catch(e){$('quickStatus').textContent='通信：'+e.message;}
}
async function cancelQuick(post=true){
  if(post)try{await api('/api/SHG/quick/cancel',{});}catch(e){toast(e.message);}
  stopPoll();gameState.quick=false;$('quickStatus').hidden=true;$('quickCancel').hidden=true;$('quickMatch').disabled=!gameState.logged;
}
function init(){
  try{const list=JSON.parse(localStorage.getItem('shg-loadout')||'[]');if(validateLoadout(list))gameState.loadout=list;}catch(_){}
  try{const aa=JSON.parse(localStorage.getItem('shg-aa')||'[]');$('aa1').value=aa[0]||'';$('aa2').value=aa[1]||'';}catch(_){}
  for(const cat of CATEGORIES){const el=document.createElement('option');el.value=cat;el.textContent=cat;$('category').append(el);}
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  $('openCollection').onclick=()=>showTab('collection');
  $('clearLoadout').onclick=()=>{gameState.loadout=[];saved();renderLoadout();renderCatalog();};
  $('pieceSearch').oninput=renderCatalog;$('category').onchange=renderCatalog;$('ownership').onchange=renderCatalog;
  $('cpu').onclick=()=>startTraining(true);$('local').onclick=()=>startTraining(false);
  $('gacha').onclick=()=>pull(1);$('gachaTen').onclick=()=>pull(10);
  $('daily').onclick=async()=>{try{const r=await api('/api/SHG/collection/daily',{});setProfile(r.profile);toast('300コインを獲得しました。');}catch(e){toast(e.message);}};
  $('createRoom').onclick=createRoom;$('joinRoom').onclick=joinRoom;
  $('quickMatch').onclick=quick;$('quickCancel').onclick=()=>cancelQuick();
  $('copyCode').onclick=async()=>{if(!gameState.room)return;try{await navigator.clipboard.writeText(gameState.room.code);toast('コピーしました。');}catch(e){toast('ルームコード：'+gameState.room.code);}};
  $('goHome').onclick=()=>showTab('home');
  $('moveMode').onclick=()=>{gameState.kind='move';renderBoard();};
  $('skillMode').onclick=()=>{gameState.kind='skill';renderBoard();};
  $('passTurn').onclick=()=>perform({kind:'pass'});
  $('undo').onclick=()=>{if(gameState.mode==='local'&&gameState.history.length){gameState.game=gameState.history.pop();gameState.selected=-1;renderBoard();}};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(gameState.room)syncRoom();else if(gameState.quick)quickStatus();}});
  showTab('home');void collection();
}
init();