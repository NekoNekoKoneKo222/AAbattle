import { useEffect, useRef, useState } from 'react';
import './admin.css';

type AdminState={source:string;defaultSource:string;version:number;online:number};
const palette=[['.','地面'],[':','道'],['#','壁'],['T','木'],['~','水'],['^','岩'],['+','目印'],['S','開始点'],[' ','空地']];
function rowsOf(source:string){
  const lines=source.replace(/\r/g,'').split('\n');
  const index=lines.findIndex(line=>line.startsWith('@origin '));
  const match=/^@origin\s+(-?\d+)\s+(-?\d+)$/.exec(lines[index]??'');
  const rows=lines.slice(index+1).filter(Boolean).map(line=>Array.from(line));
  return {prefix:lines.slice(0,index+1).join('\n'),rows,origin:match?`${match[1]}, ${match[2]}`:'?'};
}
export function AdminPanel({onClose}:{onClose:()=>void}){
  const [data,setData]=useState<AdminState|null>(null),[source,setSource]=useState(''),[notice,setNotice]=useState(''),[brush,setBrush]=useState('.'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[amount,setAmount]=useState(10),[site,setSite]=useState('city');
  const canvas=useRef<HTMLCanvasElement>(null),painting=useRef(false);
  const load=async()=>{const response=await fetch('/api/GF/admin');const body=await response.json();if(!response.ok)throw Error(body.error);setData(body);setSource(body.source);};
  useEffect(()=>{load().catch(e=>setMessage(String(e)));},[]);
  const parsed=rowsOf(source);
  useEffect(()=>{const el=canvas.current,ctx=el?.getContext('2d');if(!el||!ctx)return;const {rows}=rowsOf(source);if(!rows.length)return;const cell=12;el.width=(rows[0]?.length??0)*cell;el.height=rows.length*cell;
    const colors:Record<string,string>={'.':'#4e8165',':':'#ac987c','#':'#63748a','T':'#235e45','~':'#328ba8','^':'#917da2','+':'#e8bc61','S':'#6ae0d3',' ':'#466d54'};
    rows.forEach((row,y)=>row.forEach((c,x)=>{ctx.fillStyle=colors[c]??'#b12d43';ctx.fillRect(x*cell,y*cell,cell-1,cell-1);if(['T','+','S'].includes(c)){ctx.fillStyle='#fff';ctx.font='10px monospace';ctx.fillText(c,x*cell+2,y*cell+10);}}));
  },[source]);
  const paint=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!painting.current)return;const el=e.currentTarget,rect=el.getBoundingClientRect(),x=Math.floor((e.clientX-rect.left)*el.width/rect.width/12),y=Math.floor((e.clientY-rect.top)*el.height/rect.height/12);const lines=source.replace(/\r/g,'').split('\n'),index=lines.findIndex(line=>line.startsWith('@origin ')),line=index+1+y;if(line<0||line>=lines.length||x<0||x>=lines[line].length)return;const chars=Array.from(lines[line]);if(chars[x]===brush)return;chars[x]=brush;lines[line]=chars.join('');setSource(lines.join('\n'));};
  const call=async(url:string,method:string,body:unknown)=>{setBusy(true);setMessage('');try{const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error??'操作に失敗しました。');return value;}catch(e){setMessage(e instanceof Error?e.message:String(e));return null;}finally{setBusy(false);}};
  const saveWorld=async()=>{if(!data)return;const result=await call('/api/GF/admin/world','PUT',{source,version:data.version});if(result){setData({...data,source,version:result.version});setMessage(`マップを公開しました（版 ${result.version}）。`);}};
  const sendNotice=async()=>{const result=await call('/api/GF/admin/notice','POST',{message:notice});if(result){setNotice('');setMessage('全体通知を送信しました。');}};
  const test=async(action:string,extra:Record<string,unknown>={})=>{const result=await call('/api/GF/admin/test','POST',{action,...extra});if(result)setMessage('テスト操作を反映しました。');};
  const download=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([source],{type:'text/plain;charset=utf-8'}));a.href=url;a.download='world.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <div className="admin-backdrop"><section className="admin-panel"><header><h2>GF 管理者パネル</h2><button onClick={onClose}>閉じる ×</button></header>{!data?<p>{message||'読み込み中…'}</p>:<>
    <div className="admin-columns"><section><h3>全体通知</h3><p>オンラインの全プレイヤーへ即時配信し、ログイン後も直近の通知を表示します。</p><textarea maxLength={500} value={notice} onChange={e=>setNotice(e.target.value)} placeholder="全員に知らせる内容"/><button disabled={busy||!notice.trim()} onClick={sendNotice}>全体に通知</button><small>接続中 {data.online} 人</small>
    <h3>開発テスト（自分のみ）</h3><div className="admin-actions"><button disabled={busy} onClick={()=>test('heal')}>HP全回復</button><select value={site} onChange={e=>setSite(e.target.value)}><option value="city">始まりの街</option><option value="forest">森林</option><option value="mine">鉱山</option><option value="desert">砂漠</option><option value="fallen">崩壊都市</option><option value="anomaly">異常領域</option><option value="abyss">深淵</option><option value="boundary">無限境界</option></select><button disabled={busy} onClick={()=>test('travel',{site})}>道標へ移動</button><input type="number" min={1} max={100} value={amount} onChange={e=>setAmount(Number(e.target.value))}/><button disabled={busy} onClick={()=>test('resources',{amount})}>素材・ボスパーツを補充</button></div></section>
    <section><h3>ワールドマップ編集 <small>版 {data.version} / 原点 {parsed.origin}</small></h3><p>パレットを選び、マップをドラッグして描画します。座標やサイズは下のテキストでも編集できます。</p><div className="admin-palette">{palette.map(([tile,label])=><button key={label} className={brush===tile?'chosen':''} onClick={()=>setBrush(tile)}>{tile===' '?'□':tile} {label}</button>)}</div><div className="admin-canvas-scroll"><canvas ref={canvas} onPointerDown={e=>{painting.current=true;e.currentTarget.setPointerCapture(e.pointerId);paint(e);}} onPointerMove={paint} onPointerUp={()=>painting.current=false} onPointerCancel={()=>painting.current=false}/></div><details><summary>world.txtを直接編集</summary><textarea className="admin-source" spellCheck={false} value={source} onChange={e=>setSource(e.target.value)}/></details><div className="admin-actions"><button disabled={busy} onClick={saveWorld}>マップを全員に公開</button><button onClick={download}>world.txtを保存</button><button onClick={()=>setSource(data.defaultSource)}>初期マップを読み込む</button><button onClick={()=>load().catch(e=>setMessage(String(e)))}>公開版を再読み込み</button></div></section></div>{message&&<p className="admin-message" role="status">{message}</p>}</>}</section></div>;
}
