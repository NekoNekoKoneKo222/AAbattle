import {useState} from 'react';
import {characters} from '@shift/shared';
import type {Request} from './pages';

const grantItems=[
  {id:'coins',label:'コイン'},
  {id:'credits',label:'クレジット'},
  {id:'sun_power',label:'サンパワー'},
  {id:'diamonds',label:'ダイヤモンド'},
  {id:'prestige',label:'名声'},
  {id:'sun',label:'サンドロップ'},
  {id:'glitch',label:'グリッチサンキューブ'},
  {id:'hero',label:'キャラクター解放'},
  {id:'sun_skin',label:'サンスキン'}
] as const;

export function ShiftAdminPage({request,refreshProfile,myUsername,onBack}:{
 request:Request;refreshProfile:()=>Promise<void>;myUsername:string;onBack:()=>void;
}){
 const [username,setUsername]=useState(myUsername),[item,setItem]=useState<string>('coins');
 const [amount,setAmount]=useState('1000'),[character,setCharacter]=useState('rei');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
 const special=item==='hero'||item==='sun_skin';
 async function grant(){
   setBusy(true);setFailure('');setMessage('');
   try{
     const result=await request<{target:string;item:string;amount:number}>('/admin/grant',{
       targetUsername:username,item,amount:special?1:Number(amount),character:special?character:undefined
     });
     setMessage(result.target+' に '+(grantItems.find(a=>a.id===result.item)?.label||result.item)+
       ' を '+result.amount+' 配布しました。');
     if(username.trim().toLowerCase()===myUsername.toLowerCase())await refreshProfile();
   }catch(e){setFailure(e instanceof Error?e.message:'配布に失敗しました。');}
   finally{setBusy(false);}
 }
 return <main className="feature-page">
   <div className="feature-heading"><button onClick={onBack}>ホームに戻る</button>
     <div><small>SHIFT ARENA / ADMIN</small><h1>管理者アイテム配布</h1></div></div>
   <p>管理者 nekonekokoneko 専用。対象のユーザー名を指定すると、サーバーが認証して配布します。</p>
   <section className="feature-card shift-admin-form">
     <label>配布先のユーザー名<input value={username} onChange={e=>setUsername(e.target.value)} maxLength={20}/></label>
     <label>アイテム<select value={item} onChange={e=>setItem(e.target.value)}>
       {grantItems.map(entry=><option key={entry.id} value={entry.id}>{entry.label}</option>)}
     </select></label>
     {special?<label>対象キャラクター<select value={character} onChange={e=>setCharacter(e.target.value)}>
       {characters.map(hero=><option key={hero.id} value={hero.id}>{hero.name}</option>)}
     </select></label>:<label>配布数（1～1,000,000）
       <input type="number" min={1} max={1000000} step={1} value={amount} onChange={e=>setAmount(e.target.value)}/>
     </label>}
     <div className="feature-actions"><button className="primary" disabled={busy||!username.trim()||(!special&&(!Number.isSafeInteger(Number(amount))||Number(amount)<1||Number(amount)>1000000))} onClick={()=>void grant()}>{busy?'処理中…':'アイテムを配布する'}</button></div>
   </section>
   {message&&<p role="status" className="sun-ok">{message}</p>}
   {failure&&<p role="alert" className="sun-error">{failure}</p>}
 </main>;
}
