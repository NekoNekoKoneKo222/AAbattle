import { useEffect, useState } from 'react';
import { characterById, characterRoad, characters, loadoutOptions, masteryLevel, masteryRewards, masteryThreshold, missionDefs, type CharacterId } from '@shift/shared';
import { CharacterPreview } from './character-preview';

export interface ShiftProfile {
  user_id:string; display_name:string; selected_character:string; owned_characters:string[]; credits:number;prestige:number;road_target:string;
  road_tier:string[]; loadouts:Record<string,{skill:string;passive:string}>;
  mastery:Record<string,{xp:number;stats:Record<string,number>;claimed:string[]}>;
  missions:Record<string,{count:number;claimed:boolean}>;server_day:string;
}
export type Request = <T=unknown>(path:string,body?:Record<string,unknown>)=>Promise<T>;
const errorText=(error:unknown)=>error instanceof Error?error.message:'通信に失敗しました。';

export function RoadPage({profile,request,refresh,onBack,onTry}:{profile:ShiftProfile;request:Request;refresh:()=>Promise<void>;onBack:()=>void;onTry:(id:string)=>void}){
  const [selected,setSelected]=useState(profile.road_target||profile.road_tier[0]||'rei');
  const [message,setMessage]=useState('');const [unlocked,setUnlocked]=useState<string|null>(null);
  useEffect(()=>{if(!profile.road_tier.includes(selected))setSelected(profile.road_target||profile.road_tier[0]||'rei');},[profile.road_target,profile.road_tier.join(',')]);
  const c=characterById(selected),road=characterRoad[selected as CharacterId],complete=profile.road_tier.length===0;
  async function choose(id:string){try{await request('/road/target',{character:id});setSelected(id);await refresh();setMessage('獲得目標を変更しました。');}catch(error){setMessage(errorText(error));}}
  async function unlock(){try{const result=await request<{character:string}>('/road/unlock',{});setUnlocked(result.character);await refresh();setMessage('');}catch(error){setMessage(errorText(error));}}
  return <main className="feature-page"><div className="feature-heading"><button onClick={onBack}>← 戻る</button><div><small>CHARACTER ROAD</small><h1>キャラロード</h1></div><strong>クレジット {profile.credits} · 名声 {profile.prestige}</strong></div>
    {complete?<section className="feature-card"><h2>全キャラクター獲得！</h2><p>これから獲得したクレジットは名声ポイントに変わります。</p></section>:<><p>同じレア度の中から次に獲得するキャラクターを選べます。目標を変更してもクレジットは減りません。</p><div className="road-grid">{profile.road_tier.map(id=>{const item=characterById(id);return <button key={id} className={`road-tile ${selected===id?'selected':''}`} onClick={()=>choose(id)}><span className="preview-token" style={{background:`#${item.color.toString(16)}`}}>◆</span><b>{item.name}</b><small>{characterRoad[id as CharacterId].rarity}</small></button>})}</div><section className="feature-card detail-card"><div className="preview-stage"><CharacterPreview id={selected}/></div><div><small>{road.rarity}</small><h2>{c.name}</h2><p>HP {c.maxHp} · 通常攻撃 {c.attack.damage} · 必殺技 {c.ultimate.label}</p><p>特殊スキル {loadoutOptions[c.id as CharacterId].skills[0].label} · パッシブ {loadoutOptions[c.id as CharacterId].passives[0].label}</p><div className="meter road-progress"><i style={{width:`${Math.min(100,profile.credits/road.cost*100)}%`}}/></div><p>{profile.credits} / {road.cost} クレジット</p><div className="feature-actions"><button onClick={()=>onTry(selected)}>トレーニングで試す</button><button className="primary" disabled={profile.credits<road.cost||selected!==profile.road_target} onClick={unlock}>アンロック</button></div></div></section></>}
    {message&&<p role="status">{message}</p>}{unlocked&&<div className="unlock-overlay"><div className="unlock-gate"><div className="gate-ring"/><span className="preview-token large" style={{background:`#${characterById(unlocked).color.toString(16)}`}}>◆</span><small>{characterRoad[unlocked as CharacterId].rarity}</small><h2>{characterById(unlocked).name}</h2><strong>新キャラクター獲得！</strong><button onClick={()=>setUnlocked(null)}>閉じる / スキップ</button></div></div>}
  </main>;
}

export function LoadoutPage({profile,character,request,refresh,onBack}:{profile:ShiftProfile;character:string;request:Request;refresh:()=>Promise<void>;onBack:()=>void}){
  const options=loadoutOptions[character as CharacterId]||loadoutOptions.rei;
  const saved=profile.loadouts[character]||{skill:options.skills[0].id,passive:options.passives[0].id};
  const [skill,setSkill]=useState(saved.skill),[passive,setPassive]=useState(saved.passive),[message,setMessage]=useState('');
  useEffect(()=>{setSkill(saved.skill);setPassive(saved.passive);},[character,saved.skill,saved.passive]);
  async function save(){try{await request('/loadout',{character,skill,passive});await refresh();setMessage('ロードアウトを保存しました。次の試合から適用されます。');}catch(error){setMessage(errorText(error));}}
  return <main className="feature-page"><div className="feature-heading"><button onClick={onBack}>← 戻る</button><div><small>LOADOUT</small><h1>{characterById(character).name}のロードアウト</h1></div></div><p>通常攻撃と必殺技は固定です。試合前に特殊スキルとパッシブを選べます。</p><div className="feature-columns"><section className="feature-card"><h2>特殊スキル</h2>{options.skills.map(item=><button key={item.id} className={`choice-row ${skill===item.id?'selected':''}`} onClick={()=>setSkill(item.id)}><b>{item.label}</b><span>{item.description}</span><small>効果 {item.duration}秒 · 再使用 {item.cooldown}秒</small></button>)}</section><section className="feature-card"><h2>パッシブ</h2>{options.passives.map(item=><button key={item.id} className={`choice-row ${passive===item.id?'selected':''}`} onClick={()=>setPassive(item.id)}><b>{item.label}</b><span>{item.description}</span></button>)}</section></div><button className="primary" onClick={save}>保存する</button>{message&&<p role="status">{message}</p>}</main>;
}

export function MasteryPage({profile,character,request,refresh,onBack}:{profile:ShiftProfile;character:string;request:Request;refresh:()=>Promise<void>;onBack:()=>void}){
  const [message,setMessage]=useState('');const info=profile.mastery[character]||{xp:0,stats:{},claimed:[]};const level=masteryLevel(info.xp),start=masteryThreshold(level),end=masteryThreshold(Math.min(30,level+1));
  async function claim(id:string){try{await request('/mastery/claim',{character,reward:id});await refresh();setMessage('報酬を受け取りました。');}catch(error){setMessage(errorText(error));}}
  return <main className="feature-page"><div className="feature-heading"><button onClick={onBack}>← 戻る</button><div><small>MASTERY</small><h1>{characterById(character).name}のマスタリー</h1></div><strong>Lv.{level} / 30</strong></div><section className="feature-card"><CharacterPreview id={character}/><p>経験値 {info.xp}{level<30?` / 次のレベル ${end}`:''}</p><div className="meter road-progress"><i style={{width:`${level===30?100:Math.max(0,(info.xp-start)/(end-start)*100)}%`}}/></div><p>試合 {info.stats.matches||0} · 勝利 {info.stats.wins||0} · KO {info.stats.ko||0} · 必殺技 {info.stats.ultimates||0}</p></section><div className="reward-grid">{masteryRewards.map(reward=><section key={reward.id} className="feature-card"><small>Lv.{reward.level}</small><h3>{reward.label}</h3><p>{info.claimed.includes(reward.id)?'獲得済み':level>=reward.level?'受け取り可能':'未解放'}</p><button disabled={level<reward.level||info.claimed.includes(reward.id)} onClick={()=>claim(reward.id)}>受け取る</button></section>)}</div>{message&&<p role="status">{message}</p>}</main>;
}

export function MissionsPage({profile,request,refresh,onBack}:{profile:ShiftProfile;request:Request;refresh:()=>Promise<void>;onBack:()=>void}){
  const [message,setMessage]=useState('');async function claim(id:string){try{await request('/mission/claim',{id});await refresh();setMessage('クレジットを受け取りました。');}catch(error){setMessage(errorText(error));}}
  return <main className="feature-page"><div className="feature-heading"><button onClick={onBack}>← 戻る</button><div><small>DAILY MISSIONS</small><h1>デイリーミッション</h1></div><strong>UTC {profile.server_day} 更新</strong></div><p>進捗は試合終了時にサーバーが記録します。</p><div className="reward-grid">{missionDefs.map(m=>{const current=profile.missions[m.id]||{count:0,claimed:false};return <section className="feature-card" key={m.id}><h3>{m.label}</h3><p>{Math.min(current.count,m.goal)} / {m.goal} · 報酬 {m.credits} クレジット</p><div className="meter road-progress"><i style={{width:`${Math.min(100,current.count/m.goal*100)}%`}}/></div><button disabled={current.count<m.goal||current.claimed} onClick={()=>claim(m.id)}>{current.claimed?'受け取り済み':'受け取る'}</button></section>})}</div>{message&&<p role="status">{message}</p>}</main>;
}

interface Friend { id:string;name:string;online?:boolean;playing?:boolean }
interface FriendRequest { id:string;sender_id:string;name:string }
export function FriendsPage({request,onBack,onInvite}:{request:Request;onBack:()=>void;onInvite:(id:string)=>Promise<void>}){
  const [state,setState]=useState<{friends:Friend[];requests:FriendRequest[];blocked:string[]}>({friends:[],requests:[],blocked:[]});const [results,setResults]=useState<Friend[]>([]),[query,setQuery]=useState(''),[message,setMessage]=useState('');
  async function refresh(){try{setState(await request('/friends'));}catch(error){setMessage(errorText(error));}}
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),10000);return()=>clearInterval(timer);},[]);
  async function run(path:string,body:Record<string,unknown>){try{await request(path,body);await refresh();setMessage('更新しました。');}catch(error){setMessage(errorText(error));}}
  async function search(){try{setResults(await request(`/players?q=${encodeURIComponent(query)}`));}catch(error){setMessage(errorText(error));}}
  return <main className="feature-page"><div className="feature-heading"><button onClick={onBack}>← 戻る</button><div><small>FRIENDS</small><h1>フレンド</h1></div></div><section className="feature-card"><h2>プレイヤー検索</h2><div className="feature-actions"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="名前またはプレイヤーID"/><button onClick={search}>検索</button></div>{results.map(p=><div className="friend-row" key={p.id}><span>{p.name}<small> ID {p.id}</small></span><button onClick={()=>run('/friends/request',{targetId:p.id})}>申請</button><button onClick={()=>run('/friends/block',{targetId:p.id})}>ブロック</button></div>)}</section><div className="feature-columns"><section className="feature-card"><h2>フレンド一覧</h2>{state.friends.length===0&&<p>まだフレンドはいません。</p>}{state.friends.map(p=><div className="friend-row" key={p.id}><span>{p.online?'●':'○'} {p.name} <small>{p.playing?'対戦中':p.online?'オンライン':'オフライン'}</small></span><button onClick={()=>onInvite(p.id).catch(e=>setMessage(errorText(e)))}>招待</button><button onClick={()=>run('/friends/remove',{targetId:p.id})}>解除</button></div>)}</section><section className="feature-card"><h2>申請一覧</h2>{state.requests.length===0&&<p>新しい申請はありません。</p>}{state.requests.map(r=><div className="friend-row" key={r.id}><span>{r.name}</span><button onClick={()=>run('/friends/decide',{requestId:r.id,accept:true})}>承認</button><button onClick={()=>run('/friends/decide',{requestId:r.id,accept:false})}>拒否</button></div>)}</section></div>{message&&<p role="status">{message}</p>}</main>;
}

interface PartyMember {id:string;name:string;character:string;ready:boolean}
interface Party {id:string;leaderId:string;mode:string;size:number;roomCode:string|null;members:PartyMember[]}
export function PartyPage({userId,request,onBack,onStart,onJoinRoom}:{userId:string;request:Request;onBack:()=>void;onStart:(mode:string,size:number)=>Promise<void>;onJoinRoom:(code:string)=>void}){
  const [state,setState]=useState<{party:Party|null;invites:{id:string;partyId:string;fromName:string}[]}>({party:null,invites:[]});const [friends,setFriends]=useState<Friend[]>([]),[message,setMessage]=useState('');
  async function refresh(){try{setState(await request('/party'));const f=await request<{friends:Friend[]}>('/friends');setFriends(f.friends);}catch(error){setMessage(errorText(error));}}
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[]);
  async function run(path:string,body:Record<string,unknown>={}){try{setState(await request('/party/'+path,body));setMessage('更新しました。');}catch(error){setMessage(errorText(error));}}
  const party=state.party,me=party?.members.find(m=>m.id===userId);const leader=party?.leaderId===userId;
  return <main className="feature-page"><div className="feature-heading"><button onClick={onBack}>← 戻る</button><div><small>PARTY</small><h1>パーティー</h1></div></div>
    {state.invites.length>0&&<section className="feature-card"><h2>招待通知</h2>{state.invites.map(invite=><div className="friend-row" key={invite.id}><span>{invite.fromName}から招待</span><button onClick={()=>run('join',{inviteId:invite.id})}>参加</button></div>)}</section>}
    {!party?<section className="feature-card"><p>フレンドと同じチームで遊べます。</p><button className="primary" onClick={()=>run('create')}>パーティーを作成</button></section>:<><section className="feature-card"><h2>メンバー {party.members.length} / {party.size}</h2>{party.members.map(m=><div className="friend-row" key={m.id}><span>{m.id===party.leaderId?'★ ':''}{m.name} · {characterById(m.character).name} · {m.ready?'準備OK':'待機中'}</span>{leader&&m.id!==me?.id&&<button onClick={()=>run('leader',{targetId:m.id})}>リーダーを譲る</button>}</div>)}<div className="feature-actions"><button onClick={()=>run('ready',{ready:!me?.ready})}>{me?.ready?'準備を取り消す':'準備完了'}</button><button onClick={()=>run('leave')}>退出</button></div></section>
    {leader&&<section className="feature-card"><h2>試合設定</h2><div className="feature-actions"><select value={party.mode} onChange={e=>run('configure',{mode:e.target.value,size:party.size})}>{['core','deathmatch','payload','duel','survival'].map(v=><option key={v} value={v}>{v}</option>)}</select><select value={party.size} onChange={e=>run('configure',{mode:party.mode,size:Number(e.target.value)})}><option value={3}>3対3</option><option value={5}>5対5</option></select></div><button className="primary" disabled={!party.members.every(m=>m.ready)} onClick={()=>onStart(party.mode,party.size).catch(error=>setMessage(errorText(error)))}>パーティーで試合を作成</button></section>}
    {party.roomCode&&<section className="feature-card"><h2>対戦ルーム {party.roomCode}</h2><button onClick={()=>onJoinRoom(party.roomCode!)}>同じチームで参加</button></section>}
    {leader&&<section className="feature-card"><h2>フレンドを招待</h2>{friends.filter(f=>!party.members.some(m=>m.id===f.id)).map(f=><div className="friend-row" key={f.id}><span>{f.name}</span><button onClick={()=>run('invite',{targetId:f.id})}>招待</button></div>)}</section>}</>}{message&&<p role="status">{message}</p>}
  </main>;
}
