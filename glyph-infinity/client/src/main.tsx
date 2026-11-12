import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TILE, tileAt, setWorldMap, type Input, type Snapshot } from '@glyph/shared';
import { WorldMap } from './WorldMap';
import './style.css';

type User={id:string;username:string};
function keyCode(e:KeyboardEvent):string {
  const key=e.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (key===' ') return 'Space';
  if (key.startsWith('arrow')) return `Arrow${key.slice(5,6).toUpperCase()}${key.slice(6)}`;
  return e.code || e.key;
}
function App(){
  const [user,setUser]=useState<User|null|undefined>(undefined),[state,setState]=useState<Snapshot|null>(null),[status,setStatus]=useState('接続中…');
  const [mapReady,setMapReady]=useState(false),[mapError,setMapError]=useState(''),[mapOpen,setMapOpen]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null),ws=useRef<WebSocket|null>(null),keys=useRef(new Set<string>()),pointer=useRef({x:1,y:0}),hasPointer=useRef(false),touch=useRef({x:0,y:0}),touching=useRef(false),attack=useRef(false),dash=useRef(false),latest=useRef<Snapshot|null>(null);
  useEffect(()=>{fetch('/api/me',{credentials:'include'}).then(r=>r.json()).then(v=>setUser(v.user??null)).catch(()=>setUser(null));},[]);
  useEffect(()=>{fetch('/GF/world.txt',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text();}).then(data=>{setWorldMap(data);setMapReady(true);}).catch(e=>setMapError(`ワールドマップを読み込めません: ${String(e)}`));},[]);
  useEffect(()=>{if(!user||!mapReady)return;let closed=false;let retry:ReturnType<typeof setTimeout>;
    const connect=()=>{if(closed)return;const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/GF/ws`);ws.current=socket;
      socket.onopen=()=>setStatus('オンライン');socket.onmessage=e=>{try{const data=JSON.parse(e.data);if(data.type==='state'){latest.current=data;setState(data);}}catch{}};
      socket.onclose=()=>{if(!closed){setStatus('再接続中…');retry=setTimeout(connect,1500);}};socket.onerror=()=>setStatus('通信エラー');};
    connect();return()=>{closed=true;clearTimeout(retry);ws.current?.close();};},[user,mapReady]);
  useEffect(()=>{const down=(e:KeyboardEvent)=>{const code=keyCode(e);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(code))e.preventDefault();if(code==='KeyM'&&!e.repeat){setMapOpen(v=>!v);return;}if(code==='Escape'){setMapOpen(false);return;}keys.current.add(code);};const up=(e:KeyboardEvent)=>keys.current.delete(keyCode(e));const blur=()=>keys.current.clear();window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    const timer=setInterval(()=>{const k=keys.current;let x=Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft'));let y=Number(k.has('KeyS')||k.has('ArrowDown'))-Number(k.has('KeyW')||k.has('ArrowUp'));
      if(touching.current){x=touch.current.x;y=touch.current.y;}if(mapOpen){x=0;y=0;}const len=Math.hypot(x,y)||1;const input:Input={x:x/len,y:y/len,aimX:hasPointer.current?pointer.current.x:x/len,aimY:hasPointer.current?pointer.current.y:y/len,attack:!mapOpen&&(k.has('Space')||k.has('KeyJ')||k.has('Enter')||attack.current),dash:!mapOpen&&(k.has('ShiftLeft')||k.has('ShiftRight')||k.has('Shift')||dash.current)};
      if(ws.current?.readyState===WebSocket.OPEN)ws.current.send(JSON.stringify({type:'input',...input}));},50);
    return()=>{clearInterval(timer);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};},[mapOpen]);
  useEffect(()=>{const el=canvas.current;if(!el)return;let frame=0;const draw=()=>{const s=latest.current,ctx=el.getContext('2d');if(!ctx){frame=requestAnimationFrame(draw);return;}const ratio=Math.min(devicePixelRatio||1,2),w=el.clientWidth,h=el.clientHeight;if(el.width!==Math.round(w*ratio)||el.height!==Math.round(h*ratio)){el.width=Math.round(w*ratio);el.height=Math.round(h*ratio);}ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#0b1019';ctx.fillRect(0,0,w,h);
      if(s){const p=s.players.find(a=>a.id===s.you),cx=p?.x??0,cy=p?.y??0,scale=Math.max(.75,Math.min(1.2,w/900)),unit=TILE*scale,tx0=Math.floor((cx-w/2/scale)/TILE)-1,tx1=Math.ceil((cx+w/2/scale)/TILE)+1,ty0=Math.floor((cy-h/2/scale)/TILE)-1,ty1=Math.ceil((cy+h/2/scale)/TILE)+1;
        ctx.font=`${Math.round(22*scale)}px 'Cascadia Mono',Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
        for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){const glyph=tileAt(tx,ty),sx=w/2+(tx*TILE+TILE/2-cx)*scale,sy=h/2+(ty*TILE+TILE/2-cy)*scale;
          if(Math.abs(tx)<9&&Math.abs(ty)<8){ctx.fillStyle='#131f2b';ctx.fillRect(sx-unit/2,sy-unit/2,unit,unit);}else if(ty>15&&Math.abs(tx)<18){ctx.fillStyle='#171522';ctx.fillRect(sx-unit/2,sy-unit/2,unit,unit);}ctx.fillStyle=glyph==='#'?'#547087':glyph==='♣'||glyph==='♠'?'#3a9070':glyph==='◈'?'#d4ab69':glyph==='▓'?'#936eaa':'#355069';ctx.fillText(glyph,sx,sy);}
        const drawActor=(a:Snapshot['players'][number],enemy=false)=>{const sx=w/2+(a.x-cx)*scale,sy=h/2+(a.y-cy)*scale;if(sx<-30||sx>w+30||sy<-30||sy>h+30)return;ctx.fillStyle=enemy?'#ff747f':'#60e9ff';ctx.font=`bold ${Math.round((enemy?27:32)*scale)}px Consolas,monospace`;ctx.shadowBlur=enemy?8:16;ctx.shadowColor=ctx.fillStyle;ctx.fillText(a.glyph,sx,sy);ctx.shadowBlur=0;ctx.font='11px system-ui';ctx.fillStyle='#ccd9e4';ctx.fillText(a.name,sx,sy-27*scale);ctx.fillStyle='#492b39';ctx.fillRect(sx-19,sy-19*scale,38,3);ctx.fillStyle=enemy?'#ef6071':'#49d9d3';ctx.fillRect(sx-19,sy-19*scale,38*Math.max(0,a.hp/a.maxHp),3);};
        s.enemies.forEach(a=>drawActor(a,true));s.players.forEach(a=>drawActor(a));
        for(const fx of s.effects){const age=Math.max(0,Date.now()-fx.born),sx=w/2+(fx.x-cx)*scale,sy=h/2+(fx.y-cy)*scale-age*.035;ctx.globalAlpha=Math.max(0,1-age/800);ctx.fillStyle=fx.color;ctx.font='bold 17px Consolas,monospace';ctx.fillText(fx.text,sx,sy);ctx.globalAlpha=1;}
      }else{ctx.fillStyle='#87a7bb';ctx.font='18px Consolas,monospace';ctx.textAlign='center';ctx.fillText('GLYPH INFINITY',w/2,h/2);}
      frame=requestAnimationFrame(draw);};draw();return()=>cancelAnimationFrame(frame);},[user,mapReady]);
  const p=state?.players.find(a=>a.id===state.you);
  const aim=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!p||e.pointerType==='touch')return;const rect=e.currentTarget.getBoundingClientRect(),vX=e.clientX-rect.left-rect.width/2,vY=e.clientY-rect.top-rect.height/2,len=Math.hypot(vX,vY)||1;pointer.current={x:vX/len,y:vY/len};hasPointer.current=true;};
  const stick=(e:React.PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width/2),y=(e.clientY-r.top-r.height/2)/(r.height/2),len=Math.max(1,Math.hypot(x,y));touch.current={x:x/len,y:y/len};};
  return <main><header><div><strong>◈ GLYPH <em>INFINITY</em></strong><small>文字が世界を形作る</small></div><span className="status">● {status}</span>{user&&<button className="header-map" onClick={()=>setMapOpen(true)}>◎ マップ M</button>}<a href="/">AAbattle</a></header>
    {user===undefined?<section className="gate">ログイン確認中…</section>:!user?<section className="gate"><h1>GLYPH INFINITY</h1><p>AAbattleのアカウントで冒険を保存します。</p><a className="enter" href="/">AAbattleでログイン</a><p>ログイン後、このページに戻ってください。</p></section>:!mapReady?<section className="gate">{mapError||'ワールドマップを読み込み中…'}{mapError&&<p><button onClick={()=>location.reload()}>再読み込み</button></p>}</section>:<><div className="hud"><div className="user">@ {user.username}<span>LV {state?.level??1}</span></div><div className="bar"><i style={{width:`${p?100*p.hp/p.maxHp:100}%`}}/></div><small>HP {p?.hp??100}/{p?.maxHp??100}　XP {state?.xp??0}/{20*(state?.level??1)}　✧ {state?.coins??0}</small><div className="zone">⌖ {state?.zone??'始まりの街'}</div></div>
      <canvas className="game-canvas" ref={canvas} onPointerMove={aim} onPointerDown={e=>{aim(e);attack.current=true;}} onPointerUp={()=>attack.current=false} onPointerCancel={()=>attack.current=false} onPointerLeave={()=>attack.current=false} onContextMenu={e=>e.preventDefault()}/>
      <WorldMap player={p} open={mapOpen} onClose={()=>setMapOpen(false)} onOpen={()=>setMapOpen(true)}/>
      <aside className="guide">WASD / 矢印：移動　J / Enter / Space：攻撃　Shift：回避　M：地図<br/>iPadの外付けキーボードにも対応。移動方向へ攻撃します。</aside>
      <div className="touch-ui"><div className="stick" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);touching.current=true;stick(e);}} onPointerMove={e=>{if(touching.current)stick(e);}} onPointerUp={()=>{touching.current=false;touch.current={x:0,y:0};}}><span style={{transform:`translate(${touch.current.x*34}px,${touch.current.y*34}px)`}}>●</span></div><div className="buttons"><button onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);dash.current=true;}} onPointerUp={()=>dash.current=false}>✧<small>回避</small></button><button className="hit" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);attack.current=true;}} onPointerUp={()=>attack.current=false}>⚔<small>攻撃</small></button></div></div>
    </>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
