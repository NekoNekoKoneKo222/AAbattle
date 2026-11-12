import { useEffect, useRef, useState } from 'react';
import { TILE, WORLD, WORLD_SITES, BIOMES, biomeAt, chunkKey, currentWorldEvent, tileAt, type Actor, type RpgState } from '@glyph/shared';
import './world.css';

const COUNT=WORLD*2+1,CELL=2,SIZE=COUNT*CELL;
export type WorldPresence={players:{id:string;name:string;x:number;y:number;hp:number;maxHp:number;party:boolean}[];enemies:{id:string;name:string;x:number;y:number;hp:number;maxHp:number;kind:string}[]};
function terrainColor(glyph:string,tx:number,ty:number):string{
  if(glyph==='#'||glyph==='▓'||glyph==='▲')return '#68788a';
  if(glyph==='♣'||glyph==='♠')return '#438a6e';
  if(glyph==='≋')return '#3887a9';
  if(glyph==='◈'||glyph==='◎'||glyph==='◇'||glyph==='✧')return '#e2bd72';
  if(glyph===':')return '#817c83';
  return BIOMES[biomeAt(tx,ty)].color;
}
function drawTiles(ctx:CanvasRenderingContext2D,left:number,top:number,count:number,cell:number,explored?:Set<string>){
  ctx.fillStyle='#0b1925';ctx.fillRect(0,0,count*cell,count*cell);
  for(let row=0;row<count;row++)for(let col=0;col<count;col++){
    const tx=left+col,ty=top+row;
    if(explored&&!explored.has(chunkKey(tx,ty))&&Math.hypot(tx,ty)>9)continue;
    ctx.fillStyle=terrainColor(tileAt(tx,ty),tx,ty);
    ctx.fillRect(col*cell,row*cell,cell,cell);
  }
}
export function WorldMap({player,rpg,presence,open,onClose,onOpen,send}:{player?:Actor;rpg?:RpgState;presence?:WorldPresence;open:boolean;onClose:()=>void;onOpen:()=>void;send:(message:Record<string,unknown>)=>void}){
  const mini=useRef<HTMLCanvasElement>(null),full=useRef<HTMLCanvasElement>(null),base=useRef<HTMLCanvasElement|null>(null),baseKey=useRef('pending');
  const [marker,setMarker]=useState<{x:number;y:number}|null>(null);
  const px=Math.floor((player?.x??16)/TILE),py=Math.floor((player?.y??16)/TILE);
  const exploredKey=(rpg?.explored??[]).join('|'),discovered=rpg?.discovered??['city'];
  const here=BIOMES[biomeAt(px,py)],event=currentWorldEvent(Date.now());
  const nearMerchant=Math.hypot(px+3,py-1)<3;
  useEffect(()=>{
    const ctx=mini.current?.getContext('2d');if(!ctx)return;
    drawTiles(ctx,px-16,py-16,33,4);
    for(const enemy of presence?.enemies??[]){const x=(enemy.x/TILE-(px-16))*4,y=(enemy.y/TILE-(py-16))*4;if(x>=0&&x<132&&y>=0&&y<132){ctx.fillStyle=enemy.kind==='boss'?'#e88bff':'#f2848d';ctx.fillRect(x-2,y-2,4,4);}}
    for(const other of presence?.players??[]){if(other.id===player?.id)continue;const x=(other.x/TILE-(px-16))*4,y=(other.y/TILE-(py-16))*4;if(x>=0&&x<132&&y>=0&&y<132){ctx.fillStyle=other.party?'#a5ffa0':'#d4b6ff';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();}}
    ctx.fillStyle='#41e9ff';ctx.fillRect(62,62,8,8);
  },[px,py,presence,player?.id]);
  useEffect(()=>{
    if(!open)return;const ctx=full.current?.getContext('2d');if(!ctx)return;
    if(!base.current){base.current=document.createElement('canvas');base.current.width=SIZE;base.current.height=SIZE;}
    if(baseKey.current!==exploredKey){
      const bg=base.current.getContext('2d');if(bg)drawTiles(bg,-WORLD,-WORLD,COUNT,CELL,new Set(rpg?.explored??[]));
      baseKey.current=exploredKey;
    }
    ctx.drawImage(base.current,0,0);
    const dot=(tx:number,ty:number,color:string,radius:number)=>{
      const sx=(tx+WORLD+.5)*CELL,sy=(ty+WORLD+.5)*CELL;
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);ctx.fill();
    };
    for(const site of WORLD_SITES)if(discovered.includes(site.id)){dot(site.tx,site.ty,site.kind==='secret'?'#fae399':site.kind==='merchant'?'#ffcb77':'#a8f6e7',site.kind==='waypoint'?5:3);}
    if((rpg?.explored??[]).includes(chunkKey(event.tx,event.ty)))dot(event.tx,event.ty,'#fa9bdb',5);
    if(marker)dot(marker.x,marker.y,'#f6d880',5);
    for(const enemy of presence?.enemies??[]){const tx=enemy.x/TILE,ty=enemy.y/TILE;dot(tx,ty,enemy.kind==='boss'?'#e88bff':'#f2848d',enemy.kind==='boss'?5:3);const x=(tx+WORLD+.5)*CELL,y=(ty+WORLD+.5)*CELL;ctx.strokeStyle='#8cffa6';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,enemy.kind==='boss'?6:4,-Math.PI/2,-Math.PI/2+Math.PI*2*enemy.hp/enemy.maxHp);ctx.stroke();}
    for(const other of presence?.players??[])if(other.id!==player?.id)dot(other.x/TILE,other.y/TILE,other.party?'#a5ffa0':'#d4b6ff',4);
    dot(px,py,'#72f4ff',7);
  },[open,px,py,exploredKey,discovered.join('|'),marker,event.id,presence,player?.id]);
  return <>
    <button className="minimap" onClick={onOpen} aria-label="ワールドマップを開く" title="ワールドマップ (M)"><canvas ref={mini} width="132" height="132"/><span>◎ MAP　M</span></button>
    {open&&<div className="map-backdrop" role="dialog" aria-modal="true" aria-label="ワールドマップ"><section className="world-map">
      <div className="map-title"><div><strong>◈ WORLD MAP</strong><small>現在地：{px}, {py} / {here.name} / 危険度 {here.danger}</small></div><button onClick={onClose} aria-label="マップを閉じる">閉じる ×</button></div>
      <canvas ref={full} width={SIZE} height={SIZE} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();setMarker({x:Math.max(-WORLD,Math.min(WORLD,Math.floor((e.clientX-rect.left)/rect.width*COUNT)-WORLD)),y:Math.max(-WORLD,Math.min(WORLD,Math.floor((e.clientY-rect.top)/rect.height*COUNT)-WORLD))});}} aria-label="クリックして目的地マーカーを置く"/>
      <div className="map-legend"><span><i style={{background:'#72f4ff'}}/>現在地</span><span><i style={{background:'#d4b6ff'}}/>他プレイヤー</span><span><i style={{background:'#a5ffa0'}}/>仲間</span><span><i style={{background:'#f2848d'}}/>敵</span><span><i style={{background:'#e88bff'}}/>ボス</span><span><i style={{background:'#f6d880'}}/>目的地</span><span><i style={{background:'#0b1925'}}/>未探索</span></div>
      <div className="world-progress">オンライン：{(presence?.players.length??1)}人　{presence?.players.filter(other=>other.id!==player?.id).map(other=>`${other.name} (${Math.ceil(other.x/TILE)}, ${Math.ceil(other.y/TILE)})`).join(' / ')||'近くに他プレイヤーはいません'}</div>
      <div className="world-progress">近くの敵：{presence?.enemies.filter(enemy=>Math.hypot(enemy.x-(player?.x??0),enemy.y-(player?.y??0))<20*TILE).slice(0,12).map(enemy=>`${enemy.name} HP ${enemy.hp}/${enemy.maxHp}`).join(' / ')||'なし'}</div>
      <div className="world-progress">探索済みチャンク：{rpg?.explored.length??0} / 25　発見した地点：{discovered.length} / {WORLD_SITES.length}</div>
      <div className="world-travel">{WORLD_SITES.filter(site=>site.kind==='waypoint'&&discovered.includes(site.id)).map(site=><button key={site.id} onClick={()=>{send({type:'world:travel',id:site.id});onClose();}}>{site.name}へ移動</button>)}</div>
      <p>道標の近くから、発見済みの道標へ移動できます。地図をタップすると目的地マーカーを置けます。</p>
      <div className="world-events"><span>本日のイベント：{event.name}（{(rpg?.explored??[]).includes(chunkKey(event.tx,event.ty))?`${event.tx}, ${event.ty}`:'未探索地域'}）</span><button onClick={()=>send({type:'world:interact'})}>近くを調べる F</button></div>
      {nearMerchant&&<div className="world-travel">商人ノア：{(['iron','wood','crystal'] as const).map(item=><button key={item} onClick={()=>send({type:'world:buy',item})}>{item==='iron'?'鉄':item==='wood'?'木':'結晶'}を購入（{item==='crystal'?25:10}コイン）</button>)}</div>}
    </section></div>}
  </>;
}
