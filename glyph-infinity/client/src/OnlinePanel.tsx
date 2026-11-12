import {useEffect,useState} from 'react';
import type {Snapshot} from '@glyph/shared';
import './online.css';
export type PartyState={party:{id:string;leaderId:string;members:{id:string;name:string}[]}|null;invites:{id:string;fromName:string}[];onlineIds:string[]};
type Friend={id:string;name:string};
type Request={id:string;sender_id:string;name:string};
type FriendState={friends:Friend[];requests:Request[]};
export function OnlinePanel({userId,state,party,logs,send,onClose}:{userId:string;state:Snapshot|null;party:PartyState|null;logs:string[];send:(message:Record<string,unknown>)=>void;onClose:()=>void}){
  const [friends,setFriends]=useState<FriendState>({friends:[],requests:[]}),[search,setSearch]=useState(''),[results,setResults]=useState<Friend[]>([]),[chat,setChat]=useState(''),[error,setError]=useState('');
  const refresh=async()=>{const response=await fetch('/api/shift/friends',{credentials:'include'});if(!response.ok)throw new Error('フレンドを読み込めません。');setFriends(await response.json());};
  useEffect(()=>{void refresh().catch(e=>setError(String(e)));send({type:'party:state'});const timer=setInterval(()=>send({type:'party:state'}),5000);return()=>clearInterval(timer);},[]);
  const post=async(path:string,body:Record<string,unknown>)=>{try{setError('');const response=await fetch(path,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error??'操作に失敗しました。');await refresh();setResults([]);}catch(e){setError(e instanceof Error?e.message:String(e));}};
  const find=async()=>{try{setError('');if(search.trim().length<2){setResults([]);return;}const response=await fetch(`/api/shift/players?q=${encodeURIComponent(search.trim())}`,{credentials:'include'});if(!response.ok)throw new Error('検索できません。');setResults(await response.json());}catch(e){setError(String(e));}};
  const partyMembers=party?.party?.members??[];
  return <div className="craft-backdrop"><section className="craft-panel online-panel"><div className="craft-header"><div><strong>⊕ オンライン</strong><small>同じワールドで冒険・フレンドと協力</small></div><button onClick={onClose}>閉じる ×</button></div><div className="craft-content online-content">
    <section><h2>フレンド</h2><div className="online-search"><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void find();}} placeholder="プレイヤー名を検索" maxLength={24}/><button onClick={()=>void find()}>検索</button><button onClick={()=>void refresh().catch(e=>setError(String(e)))}>更新</button></div>
      {results.map(friend=><div className="online-row" key={friend.id}><span>{friend.name}</span><button onClick={()=>void post('/api/shift/friends/request',{targetId:friend.id})}>フレンド申請</button></div>)}
      {friends.requests.map(request=><div className="online-row" key={request.id}><span>{request.name} から申請</span><button onClick={()=>void post('/api/shift/friends/decide',{requestId:request.id,accept:true})}>承認</button><button onClick={()=>void post('/api/shift/friends/decide',{requestId:request.id,accept:false})}>拒否</button></div>)}
      {friends.friends.length===0?<p>フレンドを検索して申請できます。</p>:friends.friends.map(friend=><div className="online-row" key={friend.id}><span>● {friend.name} {party?.onlineIds.includes(friend.id)?'オンライン':'オフライン'}</span>{party?.party?.leaderId===userId&&party.onlineIds.includes(friend.id)&&<button onClick={()=>send({type:'party:invite',targetId:friend.id})}>招待</button>}</div>)}
    </section><section><h2>パーティー</h2>{party?.invites.map(invite=><div className="online-row" key={invite.id}><span>{invite.fromName} から招待</span><button onClick={()=>send({type:'party:join',id:invite.id})}>参加</button></div>)}
      {!party?.party?<button className="primary" onClick={()=>send({type:'party:create'})}>パーティーを作る</button>:<><p>リーダー：{partyMembers.find(member=>member.id===party.party?.leaderId)?.name}　{partyMembers.length}/4人</p><div className="online-members">{partyMembers.map(member=><span key={member.id}>{member.name}{member.id===party.party?.leaderId?' ★':''}</span>)}</div><div className="online-actions"><button onClick={()=>send({type:'party:leave'})}>退出</button>{party.party.leaderId===userId&&<button className="primary" disabled={(state?.level??1)<2} onClick={()=>{send({type:'rpg:dungeon'});onClose();}}>協力ダンジョン開始</button>}</div></>}
    </section><section><h2>パーティーチャット</h2><div className="online-log">{logs.slice(-20).map((line,index)=><div key={index}>{line}</div>)}</div><div className="online-search"><input value={chat} onChange={e=>setChat(e.target.value)} maxLength={160} placeholder="仲間へのメッセージ" onKeyDown={e=>{if(e.key==='Enter'&&chat.trim()){send({type:'party:chat',message:chat});setChat('');}}}/><button disabled={!party?.party||!chat.trim()} onClick={()=>{send({type:'party:chat',message:chat});setChat('');}}>送信</button></div></section>
    {error&&<p className="online-error">{error}</p>}
  </div></section></div>;
}
