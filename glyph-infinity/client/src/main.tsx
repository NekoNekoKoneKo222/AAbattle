import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { setWorldMap, type CraftState, type Input, type Snapshot } from '@glyph/shared';
import { WorldMap } from './WorldMap';
import { Crafting } from './Crafting';
import { RpgPanel } from './RpgPanel';
import { startRenderer, type Frame } from './render';
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
  const [craft,setCraft]=useState<CraftState|null>(null),[craftOpen,setCraftOpen]=useState(false),[rpgOpen,setRpgOpen]=useState(false),[craftError,setCraftError]=useState('');
  const canvas=useRef<HTMLCanvasElement>(null),ws=useRef<WebSocket|null>(null),keys=useRef(new Set<string>()),pointer=useRef({x:1,y:0}),hasPointer=useRef(false),touch=useRef({x:0,y:0}),touching=useRef(false),attack=useRef(false),dash=useRef(false);
  const frames=useRef<Frame|null>(null),inputRef=useRef<Input>({x:0,y:0,aimX:0,aimY:0,attack:false,dash:false}),lastHud=useRef(0);
  const send=(message:Record<string,unknown>)=>{if(ws.current?.readyState===WebSocket.OPEN)ws.current.send(JSON.stringify(message));};
  useEffect(()=>{fetch('/api/me',{credentials:'include'}).then(r=>r.json()).then(v=>setUser(v.user??null)).catch(()=>setUser(null));},[]);
  useEffect(()=>{fetch('/GF/world.txt',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text();}).then(data=>{setWorldMap(data);setMapReady(true);}).catch(e=>setMapError(`ワールドマップを読み込めません: ${String(e)}`));},[]);
  useEffect(()=>{if(!user||!mapReady)return;let closed=false;let retry:ReturnType<typeof setTimeout>;
    const connect=()=>{if(closed)return;const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/GF/ws`);ws.current=socket;
      socket.onopen=()=>setStatus('オンライン');socket.onmessage=e=>{try{const data=JSON.parse(e.data);if(data.type==='state'){const snapshot=data as Snapshot,now=performance.now(),old=frames.current;frames.current={current:snapshot,previous:old?.current??null,receivedAt:now,interval:old?Math.max(40,Math.min(120,now-old.receivedAt)):60};if(now-lastHud.current>120){lastHud.current=now;setState(snapshot);}}else if(data.type==='craft:state'){setCraft(data.craft as CraftState);setCraftError('');}else if(data.type==='craft:error'){setCraftError(String(data.message??'保存に失敗しました。'));}}catch{}};
      socket.onclose=()=>{if(!closed){setStatus('再接続中…');retry=setTimeout(connect,1500);}};socket.onerror=()=>setStatus('通信エラー');};
    connect();return()=>{closed=true;clearTimeout(retry);ws.current?.close();};},[user,mapReady]);
  useEffect(()=>{const down=(e:KeyboardEvent)=>{const code=keyCode(e);if(code==='Escape'){setMapOpen(false);setCraftOpen(false);setRpgOpen(false);return;}if((e.target as HTMLElement)?.closest('input,select,textarea,[contenteditable="true"]'))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(code))e.preventDefault();if(code==='KeyM'&&!e.repeat){setCraftOpen(false);setRpgOpen(false);setMapOpen(v=>!v);return;}if(code==='KeyK'&&!e.repeat){setMapOpen(false);setRpgOpen(false);setCraftOpen(v=>!v);return;}if(code==='KeyI'&&!e.repeat){setMapOpen(false);setCraftOpen(false);setRpgOpen(v=>!v);return;}if(!mapOpen&&!craftOpen&&!rpgOpen&&!e.repeat){if(['Digit1','Digit2','Digit3','Digit4'].includes(code))send({type:'cast',slot:Number(code.slice(-1))-1});if(code==='KeyQ')send({type:'parry'});}if(!craftOpen&&!rpgOpen)keys.current.add(code);};const up=(e:KeyboardEvent)=>keys.current.delete(keyCode(e));const blur=()=>keys.current.clear();window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    const timer=setInterval(()=>{const k=keys.current;let x=Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft'));let y=Number(k.has('KeyS')||k.has('ArrowDown'))-Number(k.has('KeyW')||k.has('ArrowUp'));
      if(touching.current){x=touch.current.x;y=touch.current.y;}if(mapOpen||craftOpen||rpgOpen){x=0;y=0;}const len=Math.hypot(x,y)||1;const input:Input={x:x/len,y:y/len,aimX:hasPointer.current?pointer.current.x:0,aimY:hasPointer.current?pointer.current.y:0,attack:!mapOpen&&!craftOpen&&!rpgOpen&&(k.has('Space')||k.has('KeyJ')||k.has('Enter')||attack.current),dash:!mapOpen&&!craftOpen&&!rpgOpen&&(k.has('ShiftLeft')||k.has('ShiftRight')||k.has('Shift')||dash.current)};
      inputRef.current=input;
      if(ws.current?.readyState===WebSocket.OPEN)ws.current.send(JSON.stringify({type:'input',...input}));},50);
    return()=>{clearInterval(timer);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};},[mapOpen,craftOpen,rpgOpen]);
  useEffect(()=>{const el=canvas.current;if(!el)return;return startRenderer(el,frames,inputRef);},[user,mapReady]);
  const p=state?.players.find(a=>a.id===state.you);
  const dodgeReady=!state||state.rollReadyAt<=state.time;
  const aim=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!p||e.pointerType==='touch')return;const rect=e.currentTarget.getBoundingClientRect(),vX=e.clientX-rect.left-rect.width/2,vY=e.clientY-rect.top-rect.height/2,len=Math.hypot(vX,vY)||1;pointer.current={x:vX/len,y:vY/len};hasPointer.current=true;};
  const stick=(e:React.PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width/2),y=(e.clientY-r.top-r.height/2)/(r.height/2),len=Math.max(1,Math.hypot(x,y));touch.current={x:x/len,y:y/len};};
  return <main><header><div><strong>◈ GLYPH <em>INFINITY</em></strong><small>文字が世界を形作る</small></div><span className="status">● {status}</span>{user&&<><button className="header-map" onClick={()=>setCraftOpen(true)}>⚒ クラフト K</button><button className="header-map" onClick={()=>setRpgOpen(true)}>◇ 冒険 I</button><button className="header-map" onClick={()=>setMapOpen(true)}>◎ マップ M</button></>}<a href="/">AAbattle</a></header>
    {user===undefined?<section className="gate">ログイン確認中…</section>:!user?<section className="gate"><h1>GLYPH INFINITY</h1><p>AAbattleのアカウントで冒険を保存します。</p><a className="enter" href="/">AAbattleでログイン</a><p>ログイン後、このページに戻ってください。</p></section>:!mapReady?<section className="gate">{mapError||'ワールドマップを読み込み中…'}{mapError&&<p><button onClick={()=>location.reload()}>再読み込み</button></p>}</section>:<><div className="hud"><div className="user">@ {user.username}<span>LV {state?.level??1}</span></div><div className="bar"><i style={{width:`${p?100*p.hp/p.maxHp:100}%`}}/></div><small>HP {p?.hp??100}/{p?.maxHp??100}　XP {state?.xp??0}/{20*(state?.level??1)}　✧ {state?.coins??0}</small><div className="ep-bar"><i style={{width:`${state?.ep??100}%`}}/></div><small>EP {state?.ep??100}/100　武器 {state?.weaponGlyph??'⚔'}</small><div className="zone">⌖ {state?.zone??'始まりの街'}</div><small className="combat-meta">⚔ {state?.combo?`${state.combo} HIT`:'READY'}　◇ 回避 {dodgeReady?'READY':`${Math.ceil(((state?.rollReadyAt??0)-(state?.time??0))/1000)}s`}</small></div>
      <canvas className="game-canvas" ref={canvas} onPointerMove={aim} onPointerDown={e=>{aim(e);attack.current=true;}} onPointerUp={()=>attack.current=false} onPointerCancel={()=>attack.current=false} onPointerLeave={()=>attack.current=false} onContextMenu={e=>e.preventDefault()}/>
      <WorldMap player={p} open={mapOpen} onClose={()=>setMapOpen(false)} onOpen={()=>setMapOpen(true)}/>
      <div className="skill-bar">{[0,1,2,3].map(slot=>{const id=craft?.equippedSkills[slot],skill=craft?.skills.find(g=>g.id===id),cd=Math.max(0,Math.ceil(((state?.skillCooldowns[slot]??0)-(state?.time??0))/1000));return <button key={slot} disabled={!skill||!!cd} onPointerDown={()=>send({type:'cast',slot})} title={skill?.name??'クラフトでスキルを装備'}><b>{slot+1}</b>{skill?.glyph??'+'}<small>{cd?`${cd}s`:skill?.name??'空き'}</small></button>;})}<button onPointerDown={()=>send({type:'parry'})} disabled={!!state&&state.parryReadyAt>state.time}><b>Q</b>◇<small>パリィ</small></button></div>
      <aside className="guide">WASD：移動　J / Space：通常攻撃　1～4：スキル　Q：パリィ　Shift：回避　K：クラフト　I：冒険<br/>敵の攻撃予告に合わせてパリィ。装備・ダンジョン・クエストは冒険画面で操作できます。</aside>
      <div className="touch-ui"><div className="stick" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);touching.current=true;stick(e);}} onPointerMove={e=>{if(touching.current)stick(e);}} onPointerUp={()=>{touching.current=false;touch.current={x:0,y:0};}}><span style={{transform:`translate(${touch.current.x*34}px,${touch.current.y*34}px)`}}>●</span></div><div className="buttons"><button className={dodgeReady?'':'cooling'} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);dash.current=true;}} onPointerUp={()=>dash.current=false}>✧<small>回避</small></button><button className="hit" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);attack.current=true;}} onPointerUp={()=>attack.current=false}>⚔<small>攻撃</small></button></div></div>
      {craftOpen&&<Crafting craft={craft} send={send} onClose={()=>setCraftOpen(false)} onArena={enter=>send({type:'arena',enter})}/>}
      {rpgOpen&&<RpgPanel craft={craft} state={state} send={send} onClose={()=>setRpgOpen(false)}/>}
      {craftError&&<div className="craft-error" onClick={()=>setCraftError('')}>{craftError} ×</div>}
    </>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
