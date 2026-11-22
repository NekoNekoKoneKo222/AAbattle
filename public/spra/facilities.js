// Client-only SPRA town facilities; the battle outcome remains authoritative on server.
export const FASHION_COLORS = [
 '#a5ff59','#ff6eae','#68d9f8','#ffb057','#aa85f5','#e9f0f6',
 '#426f9d','#7bcf9b','#d14f69','#b99e7e','#313959','#a7e9cd',
 '#ff9e5c','#5cbbd3','#eeb7f7','#e2cf58'
];
export const FACILITY_LABELS = {
 shop:'武器ショップ',fashion:'ファッションショップ',battle:'バトル受付',
 training:'トレーニング場',furniture:'家具ショップ',workshop:'カスタマイズ工房',
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
export const SPRA_FURNITURE = Object.freeze([
 {id:'lamp',name:'ネオンランプ',icon:'✦',price:0,color:'#d9ff63'},
 {id:'chair',name:'ラウンジチェア',icon:'▟',price:75,color:'#49b0c4'},
 {id:'plant',name:'観葉植物',icon:'♣',price:115,color:'#87df86'},
 {id:'table',name:'ドットテーブル',icon:'▤',price:145,color:'#c78c51'},
 {id:'arcade',name:'ミニゲーム筐体',icon:'▣',price:280,color:'#dd83ef'},
 {id:'star',name:'星型オブジェ',icon:'★',price:320,color:'#e5d776'},
 {id:'trophy',name:'トロフィー',icon:'♛',price:490,color:'#eea749'},
 {id:'frame',name:'武器展示台',icon:'⚑',price:370,color:'#88dbf0'}
  ,{id:'rug',name:'カラフルラグ',icon:'▦',price:110,color:'#dc75d7'}
  ,{id:'books',name:'本棚',icon:'▥',price:210,color:'#c28b64'}
  ,{id:'bed',name:'ふかふかベッド',icon:'▱',price:350,color:'#6ca9df'}
  ,{id:'poster',name:'宇宙ポスター',icon:'☄',price:130,color:'#b8aaed'}
  ,{id:'sofa',name:'ツインソファ',icon:'▰',price:270,color:'#e0a3b6'}
  ,{id:'fish',name:'ミニ水槽',icon:'◈',price:430,color:'#78cae3'}
  ,{id:'clock',name:'ドット時計',icon:'◷',price:160,color:'#e3bb6d'}
  ,{id:'neoncat',name:'ネオンキャット',icon:'♠',price:550,color:'#d3ee90'}
]);
const furniture=SPRA_FURNITURE;
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
 }
 const open=id=>{
  if(!FACILITY_LABELS[id])return;
  root.classList.remove('hidden');
  title.textContent=FACILITY_LABELS[id];
  coinText();body.replaceChildren();
  if(id==='fashion')renderFashion();
  if(id==='workshop')renderWorkshop();
  if(id==='furniture')renderFurnitureShop();
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
 function renderFurnitureShop(){
  const group=section('家具のセレクトショップ',
    'コインで家具を購入すると、自分の部屋で飾れます。購入した家具は保存されます。');
  const items=el('div','facility-item-grid');
  for(const f of furniture){
    const has=owned.has(f.id);
    const tile=el('button','facility-item'+(has?' equipped':''));
    const preview=el('span','facility-swatch',f.icon);
    preview.style.background=f.color;preview.style.fontSize='22px';preview.style.textAlign='center';
    tile.append(preview,el('strong','',f.name),el('small','',has?'✓ 入手済み':'◎ '+f.price+' / 購入'));
    tile.addEventListener('click',()=>{
      if(owned.has(f.id))return notify?.('すでに持っています。自分の部屋で飾れます。');
      if(!money(f.price))return;
      owned.add(f.id);chosenFurniture=f.id;save();coinText();
      body.replaceChildren();renderFurnitureShop();notify?.(f.name+' を入手しました！');
    });
    items.append(tile);
  }
  group.append(items,button('⌂ 自分の部屋で家具を配置',()=>open('room')));
 }
 function renderRoom(){
  const group=section('自分の部屋','家具ショップで手に入れた家具を選び、床を押して配置。もう一度押すと外せます。');
  const inventory=el('div','furniture-list');
  for(const f of furniture.filter(item=>owned.has(item.id))){
    const tile=el('button','furniture-item'+(chosenFurniture===f.id?' equipped':''));
    tile.append(el('span','furniture-icon',f.icon),el('strong','',f.name),
      el('small','',chosenFurniture===f.id?'選択中':'選択する'));
    tile.addEventListener('click',()=>{chosenFurniture=f.id;renderRoomRefresh();});
    inventory.append(tile);
  }
  group.append(inventory);
  const board=el('div','room-grid');
  grid.forEach((id,i)=>{
    const tile=el('button','room-cell'+(id?' filled':''));
    const item=furniture.find(f=>f.id===id);
    tile.textContent=item?.icon||'';
    tile.title=id?item?.name:'家具を配置';
    tile.addEventListener('click',()=>{
      if(!owned.has(chosenFurniture))return notify?.('家具ショップで入手してください。');
      grid[i]=grid[i]===chosenFurniture?null:chosenFurniture;
      save();renderRoomRefresh();
    });
    board.append(tile);
  });
  group.append(board,button('▤ 家具ショップで新しい家具を見る',()=>open('furniture')));
 }
 const renderRoomRefresh=()=>{body.replaceChildren();renderRoom();};
 function getAppearance(){return {
  hat:Number(gear.hat)||0,shirt:Number(gear.shirt)||0,
  shoes:Number(gear.shoes)||0,skin:weaponSkin
 };}
 return {open,close,getAppearance,render:()=>open('room'),destroy(){root.remove();}};
}
