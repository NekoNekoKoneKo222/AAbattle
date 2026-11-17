// Client-only SPRA town facilities; the battle outcome remains authoritative on server.
export const FASHION_COLORS = [
 '#a5ff59','#ff6eae','#68d9f8','#ffb057','#aa85f5','#e9f0f6',
 '#426f9d','#7bcf9b','#d14f69','#b99e7e','#313959','#a7e9cd',
 '#ff9e5c','#5cbbd3','#eeb7f7','#e2cf58'
];
export const FACILITY_LABELS = {
 shop:'武器ショップ',fashion:'ファッションショップ',battle:'バトル受付',
 training:'トレーニング場',arcade:'ゲームセンター',workshop:'カスタマイズ工房',
 ranking:'ランキング広場',room:'自分の部屋'
};
const fashionOptions={
 shirt:['スポーツシャツ','ネオンTシャツ','ブルージャケット','サンセットパーカー',
  'バイオレットパーカー','アイボリーシャツ','クラシックコート','ミントTシャツ'],
 hat:['スターキャップ','ピンクベレー','スカイハット','ゴールドバイザー',
  'コズミック帽子','ホワイトキャップ','オールドキャップ','タウンハット'],
 shoes:['ベーシックシューズ','ピンクスニーカー','サイバーブーツ','サンセットブーツ',
  'バイオレットソール','ホワイトランナー','ダークシューズ','グリーンスニーカー']
};
const furniture=[
 {id:'lamp',name:'ネオンランプ',icon:'✦',price:0,color:'#d9ff63'},
 {id:'chair',name:'ラウンジチェア',icon:'▟',price:75,color:'#49b0c4'},
 {id:'plant',name:'観葉植物',icon:'♣',price:115,color:'#87df86'},
 {id:'table',name:'ドットテーブル',icon:'▤',price:145,color:'#c78c51'},
 {id:'arcade',name:'ミニゲーム筐体',icon:'▣',price:280,color:'#dd83ef'},
 {id:'star',name:'星型オブジェ',icon:'★',price:320,color:'#e5d776'},
 {id:'trophy',name:'トロフィー',icon:'♛',price:490,color:'#eea749'},
 {id:'frame',name:'武器展示台',icon:'⚑',price:370,color:'#88dbf0'}
];
const read=(key,fallback)=>{
 try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}
 catch{return fallback;}
};
const safeSlot=id=>['shirt','hat','shoes'].includes(id);
function el(tag,className,text){
 const e=document.createElement(tag);e.className=className||'';
 if(text!==undefined)e.textContent=String(text);
 return e;
}
export function createSpraFacilities({
 getCoins,spendCoins,addCoins,getWeapon,getNickname,onTraining,onWeaponTrial,
 onAppearance,onBattle,notify
}){
 const saveKey='spra_facilities_v1';
 let raw=read(saveKey,{});
 let gear=raw.gear&&typeof raw.gear==='object'?raw.gear:{shirt:0,hat:0,shoes:0};
 let owned=new Set(Array.isArray(raw.owned)?raw.owned:['shirt:0','hat:0','shoes:0','skin:0','lamp']);
 let weaponSkin=Number.isInteger(raw.weaponSkin)?raw.weaponSkin:0;
 let grid=Array.isArray(raw.grid)&&raw.grid.length===48?raw.grid:Array.from({length:48},()=>null);
 let chosenFurniture='lamp';
 let arcadeTimer=null,arcadeEnd=0,arcadeScore=0,arcadeSpot=-1,arcadeDone=false;
 const root=el('div','facility-overlay hidden');
 root.id='facilityOverlay';
 root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
 const panel=el('section','facility-panel');
 const header=el('div','facility-header');
 const titleWrap=el('div','facility-heading');
 const kicker=el('span','pixel-kicker','SPRA / CITY FACILITIES');
 const title=el('h2','','施設');
 title.id='facilityTitle';title.setAttribute('tabindex','-1');
 titleWrap.append(kicker,title);
 const exit=el('button','facility-close','✕ 閉じる');
 exit.addEventListener('click',close);
 header.append(titleWrap,exit);
 const status=el('div','facility-status');
 const body=el('div','facility-body');
 panel.append(header,status,body);root.append(panel);document.body.append(root);
 root.addEventListener('pointerdown',e=>{if(e.target===root)close();});
 const save=()=>{
  localStorage.setItem(saveKey,JSON.stringify({gear,owned:[...owned],weaponSkin,grid}));
  onAppearance?.(getAppearance());
 };
 const money=amount=>{
  const ok=spendCoins(amount);
  if(!ok)notify?.('コインが足りません。');
  return ok;
 };
 const coinText=()=>{status.textContent='所持コイン: '+getCoins()+' ◎　｜　'+(getNickname()||'PLAYER');};
 function close(){
  root.classList.add('hidden');
  if(arcadeTimer){clearInterval(arcadeTimer);arcadeTimer=null;}
 }
 const open=id=>{
  if(!FACILITY_LABELS[id])return;
  if(arcadeTimer){clearInterval(arcadeTimer);arcadeTimer=null;}
  root.classList.remove('hidden');
  title.textContent=FACILITY_LABELS[id];
  coinText();body.replaceChildren();
  if(id==='fashion')renderFashion();
  if(id==='workshop')renderWorkshop();
  if(id==='arcade')renderArcade();
  if(id==='room')renderRoom();
  if(id==='ranking')void renderRanking();
  if(id==='training')renderTraining();
  if(id==='shop')renderWeaponTrial();
  if(id==='battle')renderBattle();
  title.focus({preventScroll:true});
 };
 const button=(label,func,className='facility-action')=>{
  const b=el('button',className,label);
  b.addEventListener('click',func);return b;
 };
 const section=(heading,description)=>{
  const p=el('div','facility-section');
  p.append(el('h3','',heading),el('p','facility-description',description));
  body.append(p);return p;
 };
 function renderFashion(){
  const preview=el('div','fashion-preview');
  const pixel=el('div','fashion-pixel-preview');
  const update=()=>{
   pixel.style.setProperty('--shirt',FASHION_COLORS[gear.shirt]||FASHION_COLORS[0]);
   pixel.style.setProperty('--hat',FASHION_COLORS[gear.hat]||FASHION_COLORS[0]);
   pixel.style.setProperty('--shoes',FASHION_COLORS[gear.shoes]||FASHION_COLORS[0]);
   pixel.replaceChildren();
   for(const cls of ['hat','face','torso','left-shoe','right-shoe'])pixel.append(el('span','avatar-'+cls));
  };
  update();
  preview.append(pixel,el('span','', '購入した服は街とPvPのドットキャラに反映されます'));
  body.append(preview);
  for(const slot of ['shirt','hat','shoes']){
   const group=section({shirt:'服・トップス',hat:'帽子',shoes:'靴'}[slot],'好みの色を選び、購入すると装備できます。');
   const list=el('div','facility-item-grid');
   fashionOptions[slot].forEach((name,i)=>{
    const key=slot+':'+i,available=owned.has(key),equipped=gear[slot]===i,price=i===0?0:125+i*45;
    const card=el('button','facility-item'+(equipped?' equipped':''));
    const swatch=el('span','facility-swatch');swatch.style.background=FASHION_COLORS[i];
    card.append(swatch,el('strong','',name),el('small','',equipped?'装備中':available?'装備する':'◎ '+price));
    card.addEventListener('click',()=>{
      if(!available){if(!money(price))return;owned.add(key);}
      gear[slot]=i;save();coinText();renderFashionRefresh();
    });
    list.append(card);
   });
   group.append(list);
  }
 }
 const renderFashionRefresh=()=>{body.replaceChildren();renderFashion();};
 function renderWorkshop(){
  const group=section('カラーギア工房','購入済みの武器スキンは、装備中の武器のドット絵に反映されます。');
  group.append(el('p','facility-description','装備中：'+(getWeapon()?.label||'ブキ')));
  const list=el('div','facility-item-grid');
  FASHION_COLORS.forEach((color,i)=>{
   const key='skin:'+i,unlocked=owned.has(key),picked=weaponSkin===i;
   const item=el('button','facility-item'+(picked?' equipped':''));
   const swatch=el('span','facility-swatch');swatch.style.background=color;
   item.append(swatch,el('strong','','ギアカラー '+(i+1)),el('small','',picked?'設定中':unlocked?'変更':'◎ '+(85+i*25)));
   item.addEventListener('click',()=>{
    if(!unlocked){if(!money(85+i*25))return;owned.add(key);}
    weaponSkin=i;save();coinText();body.replaceChildren();renderWorkshop();
   });
   list.append(item);
  });
  group.append(list);
 }
 function renderTraining(){
  const group=section('CPU練習アリーナ','現在装備中の武器でCPUとの専用練習マッチに入れます。ランキングには反映されません。');
  const label=el('p','facility-feature','現在の武器：'+(getWeapon()?.label||'シューター'));
  group.append(label,button('▶ CPU練習を始める',()=>{close();onTraining?.();}));
 }
 function renderWeaponTrial(){
  const group=section('武器の試し撃ち','ガラクの武器屋で購入した武器を、CPUがいる練習場で試せます。');
  group.append(el('p','facility-feature','試射武器：'+(getWeapon()?.label||'シューター')),
   button('▶ 試し撃ちに移動',()=>{close();onWeaponTrial?.();}));
 }
 function renderBattle(){
  const group=section('PvPマッチ受付','ナワバリ・KOバトルからルールを選んで、最大4対4で対戦します。人数不足分はCPUが参加します。');
  group.append(button('▶ ルールを選んでマッチを作る',()=>{close();onBattle?.();}));
 }
 async function renderRanking(){
  const group=section('トッププレイヤー展示','PvPサーバーの結果から順位を表示します。名前別集計のため、同名ユーザーがいる場合は合算されます。');
  group.append(el('p','facility-description','ランキングを取得中...'));
  try{
   const response=await fetch('/api/spra/leaderboard',{cache:'no-store'});
   const result=await response.json();
   if(root.classList.contains('hidden')||title.textContent!=='ランキング広場')return;
   group.replaceChildren(el('h3','','トッププレイヤー展示'));
   group.append(el('p','facility-description',result.scope==='global'?'Neonに保存された対戦ランキング':result.scope==='session'?'今回のサーバー起動中のランキング':'ランキングを取得できませんでした'));
   const list=el('div','ranking-list');
   const entries=Array.isArray(result.players)?result.players.slice(0,15):[];
   if(!entries.length)list.append(el('p','facility-description','まだPvPの対戦記録がありません。'));
   entries.forEach((p,index)=>{
    const row=el('div','ranking-row');
    row.append(el('strong','',String(index+1).padStart(2,'0')+'  '+String(p.name||'PLAYER').slice(0,20)),
      el('span','',String(p.points||0)+' PT · '+String(p.wins||0)+' WIN · '+String(p.kos||0)+' KO'));
    list.append(row);
   });
   group.append(list);
  }catch{
   group.append(el('p','facility-description','サーバーランキングに接続できませんでした。'));
  }
 }
 function renderRoom(){
  const group=section('自分の部屋','家具を選択して、床の好きなマスに配置・移動できます。保存はこのブラウザ内です。');
  const inventory=el('div','furniture-list');
  for(const f of furniture){
   const has=owned.has(f.id),b=el('button','furniture-item'+(chosenFurniture===f.id?' equipped':''));
   b.append(el('span','furniture-icon',f.icon),el('strong','',f.name),el('small','',has?'配置する':'◎ '+f.price));
   b.addEventListener('click',()=>{
    if(!has){if(!money(f.price))return;owned.add(f.id);}
    chosenFurniture=f.id;save();coinText();renderRoomRefresh();
   });
   inventory.append(b);
  }
  group.append(inventory);
  const board=el('div','room-grid');
  grid.forEach((id,i)=>{
   const tile=el('button','room-cell'+(id?' filled':''));
   const f=furniture.find(item=>item.id===id);
   tile.textContent=f?.icon||'';
   tile.title=id?('置いている家具: '+f?.name):'家具を配置';
   tile.addEventListener('click',()=>{
     grid[i]=grid[i]===chosenFurniture?null:chosenFurniture;
     save();renderRoomRefresh();
   });
   board.append(tile);
  });
  group.append(board,button('✕ 選択したマスの家具を外す',()=>{
    chosenFurniture='lamp';notify?.('配置マスをもう一度押すと家具を外せます。');
  }));
 }
 const renderRoomRefresh=()=>{body.replaceChildren();renderRoom();};
 function renderArcade(){
  arcadeDone=false;arcadeScore=0;arcadeSpot=-1;
  const group=section('MINI GAME / インクキャッチ','20秒間で光る星をタップ！ 得点に応じてコインをもらえます。');
  const score=el('div','arcade-score','SCORE 0  /  TIME 20s');
  const board=el('div','arcade-board');
  const tiles=Array.from({length:25},(_,i)=>{
   const b=el('button','arcade-cell','·');
   b.addEventListener('click',()=>{
    if(arcadeDone||!arcadeTimer||i!==arcadeSpot)return;
    arcadeScore++;nextSpot();update();
   });
   board.append(b);return b;
  });
  group.append(score,board);
  const start=button('▶ スタート',()=>{
    if(arcadeTimer)clearInterval(arcadeTimer);
    arcadeDone=false;arcadeScore=0;arcadeEnd=performance.now()+20000;
    nextSpot();update();
    arcadeTimer=setInterval(()=>{
      const remain=Math.max(0,Math.ceil((arcadeEnd-performance.now())/1000));
      if(remain===0){
        clearInterval(arcadeTimer);arcadeTimer=null;arcadeDone=true;
        arcadeSpot=-1;nextSpot();update();
        const prize=Math.min(200,arcadeScore*8);
        addCoins(prize);coinText();
        notify?.('ゲーム終了！ '+arcadeScore+'点 / +'+prize+'コイン');
      }else update();
    },100);
   });
  group.append(start);
  function nextSpot(){
    arcadeSpot=arcadeDone?-1:(arcadeSpot+1+Math.floor(Math.random()*24))%25;
    for(let i=0;i<tiles.length;i++){
      tiles[i].textContent=i===arcadeSpot?'★':'·';
      tiles[i].classList.toggle('active',i===arcadeSpot);
    }
  }
  function update(){
    const remain=arcadeDone?0:Math.max(0,Math.ceil((arcadeEnd-performance.now())/1000));
    score.textContent='SCORE '+arcadeScore+'  /  TIME '+remain+'s';
  }
 }
 function getAppearance(){return {
  hat:Number(gear.hat)||0,shirt:Number(gear.shirt)||0,
  shoes:Number(gear.shoes)||0,skin:weaponSkin
 };}
 return {open,close,getAppearance,render:()=>open('room'),destroy(){
  if(arcadeTimer)clearInterval(arcadeTimer);root.remove();
 }};
}
