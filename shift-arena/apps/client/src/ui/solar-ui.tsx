import {useState} from 'react';
import {beginnerChoices,characterById,dropInfo,powerLevel,powerMultiplier,skinPrice,upgradeCost} from '@shift/shared';
import type {ShiftProfile,Request} from './pages';
import {CharacterPreview} from './character-preview';
import {GameIcon,type GameIconName} from './game-icon';

const rewardIcons:Record<string,GameIconName>={coins:'coins',sun_power:'sun',diamonds:'diamond',credits:'ticket',sun:'sun',bonus_drop:'sun'};
const words:Record<string,string>={coins:'コイン',sun_power:'サンパワー',diamonds:'ダイヤモンド',credits:'クレジット',sun:'サンドロップ'};
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'通信エラー';

export function SolarWallet({profile}:{profile:ShiftProfile|null}){
 return <div className="sun-wallet" aria-label="所持通貨"><span title="コイン"><GameIcon name="coins" className="icon-coin"/><b>{profile?.economy?.coins??'—'}</b></span><span title="サンパワー"><GameIcon name="sun" className="icon-sun"/><b>{profile?.economy?.sun_power??'—'}</b></span><span title="ダイヤモンド"><GameIcon name="diamond" className="icon-diamond"/><b>{profile?.economy?.diamonds??'—'}</b></span><span title="クレジット"><GameIcon name="ticket" className="icon-ticket"/><b>{profile?.credits??'—'}</b></span></div>;
}

const lessons=[
 {title:'移動',text:'PCはWASD、iPadは左スティックで移動。壁の後ろに隠れると攻撃を避けられます。',icon:'move'},
 {title:'通常攻撃と照準',text:'PCはマウス＋左クリック、iPadは右スティック。白い点線は壁で止まる攻撃予測線です。',icon:'target'},
 {title:'必殺技とスキル',text:'攻撃を当ててゲージをため、右クリックで必殺技。Eキーで特殊スキル。iPadは右下ボタンを使います。',icon:'zap'},
 {title:'シフトと育成',text:'戦場の構造が変化します。コインとサンパワーでキャラを強化し、サンドロップで報酬を獲得。チュートリアル後は好きな未所持キャラを1体もらえます。',icon:'sun'}
];
export function TutorialPage({request,onFinished,onBack}:{request:Request;onFinished:()=>Promise<void>;onBack:()=>void}){
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function next(){if(step<3){setStep(v=>v+1);return;}setBusy(true);try{await request('/tutorial/complete',{});await onFinished();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <main className="solar-screen"><div className="solar-heading"><button onClick={onBack}>← ホーム</button><span className="solar-kicker">SHIFT ACADEMY</span><h1>初めてのSHIFT ARENA</h1></div>
 <div className="tutorial-card"><div className="tutorial-art"><div className="tutorial-symbol"><GameIcon name={lessons[step].icon as GameIconName} size={66}/></div><CharacterPreview id="rei"/></div><div className="tutorial-copy" aria-live="polite"><span className="solar-kicker">STEP {step+1} / 4</span><h2>{lessons[step].title}</h2><p>{lessons[step].text}</p><div className="tutorial-dots">{lessons.map((_,i)=><i key={i} className={i<=step?'active':''}/>)}</div><div className="solar-actions">{step>0&&<button type="button" onClick={()=>setStep(v=>v-1)}>戻る</button>}<button type="button" className="sun-primary" disabled={busy} onClick={()=>void next()}>{step===3?'クリアして初心者報酬へ':'理解した！ 次へ →'}</button></div>{error&&<p className="sun-error">{error}</p>}</div></div></main>;
}

export function BeginnerPage({profile,request,onFinished,onTry,onBack}:{profile:ShiftProfile;request:Request;onFinished:()=>Promise<void>;onTry:(id:string)=>void;onBack:()=>void}){
 const candidates=beginnerChoices.filter(id=>!profile.owned_characters.includes(id));
 const [chosen,setChosen]=useState<string>(candidates[0]||'gald'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function claim(){setBusy(true);try{await request('/beginner/claim',{character:chosen});await onFinished();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <main className="solar-screen"><div className="solar-heading"><button onClick={onBack}>← ホーム</button><span className="solar-kicker">WELCOME HERO GIFT</span><h1>初心者ボーナス <GameIcon name="sun" size={37} className="icon-sun"/></h1><p>好きな未所持キャラを1体無料で獲得できます。一度だけ選べます。</p></div>
 <div className="beginner-grid">{candidates.map(id=><button key={id} className={'beginner-hero '+(chosen===id?'chosen':'')} onClick={()=>setChosen(id)}><div className="beginner-preview"><CharacterPreview id={id}/></div><strong>{characterById(id).name}</strong><small>{characterById(id).role}</small></button>)}</div><div className="solar-actions"><button onClick={()=>onTry(chosen)}>試しに使う</button><button className="sun-primary" disabled={!candidates.length||busy} onClick={()=>void claim()}><GameIcon name="gift" size={21}/> {characterById(chosen).name}を獲得</button></div>{error&&<p className="sun-error">{error}</p>}</main>;
}

export function SunRewardsPage({profile,request,refresh,onBack}:{profile:ShiftProfile;request:Request;refresh:()=>Promise<void>;onBack:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reward,setReward]=useState<{kind:string;rewards:{type:string;amount:number}[]}|null>(null);
 async function open(kind:'sun'|'glitch'){setBusy(true);setError('');try{const result=await request<{kind:string;rewards:{type:string;amount:number}[]}>('/drop/open',{kind});setReward(result);await refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <main className="solar-screen"><div className="solar-heading"><button onClick={onBack}>← ホーム</button><span className="solar-kicker">SUN REWARDS</span><h1>太陽の報酬</h1><SolarWallet profile={profile}/><p>対戦でドロップを獲得しよう！ダイヤモンドはまれに出現。</p></div>
 <div className="sun-drop-grid"><section className="sun-drop-card normal"><GameIcon name="sun" size={146} className="drop-symbol"/><h2>サンドロップ</h2><p>{dropInfo.sun.description}</p><strong>所持 {profile.economy.drops.sun}</strong><button className="sun-primary" disabled={!profile.economy.drops.sun||busy} onClick={()=>void open('sun')}>開封</button></section>
 <section className="sun-drop-card glitch"><GameIcon name="cube" size={146} className="drop-symbol"/><h2>グリッチサンキューブ</h2><p>{dropInfo.glitch.description}</p><strong>所持 {profile.economy.drops.glitch}</strong><button className="sun-primary" disabled={!profile.economy.drops.glitch||busy} onClick={()=>void open('glitch')}>3回抽選</button></section></div>
 <p className="drop-odds">1抽選の割合：コイン47%、サンパワー38%、クレジット12%、ダイヤモンド2.5%、追加ドロップ0.5%。グリッチサンキューブは3回抽選。現金での購入はありません。</p>
 {reward&&<div className="sun-reveal" role="dialog" aria-modal="true"><section><GameIcon name={reward.kind==='sun'?'sun':'cube'} size={106} className="reveal-sun"/><h2>報酬ゲット！</h2><div className="reveal-items">{reward.rewards.map((a,i)=><div key={i}><GameIcon name={rewardIcons[a.type]||'sparkles'} size={28}/><b>{words[a.type]||a.type} +{a.amount}</b></div>)}</div><button className="sun-primary" onClick={()=>setReward(null)}>受け取る</button></section></div>}{error&&<p role="alert" className="sun-error">{error}</p>}</main>;
}

export function HeroPowerPage({profile,character,request,refresh,onBack}:{profile:ShiftProfile;character:string;request:Request;refresh:()=>Promise<void>;onBack:()=>void}){
 const c=characterById(character),level=powerLevel(profile.economy.levels,character),cost=upgradeCost(level),owned=profile.owned_characters.includes(character),sunSkin=profile.economy.skins[character]?.includes('sun_skin');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function act(path:string,data:Record<string,unknown>){setBusy(true);setError('');try{await request(path,data);await refresh();setMessage('更新しました！');}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <main className="solar-screen"><div className="solar-heading"><button onClick={onBack}>← ホーム</button><span className="solar-kicker">HERO POWER</span><h1>キャラクター強化</h1><SolarWallet profile={profile}/></div>
 <div className="power-layout"><section className="power-hero-card"><CharacterPreview id={character} skin={profile.mastery[character]?.equipped_skin}/><h2>{c.name}</h2><strong><GameIcon name="sun" size={23} className="icon-sun"/> パワーレベル {level} / 11</strong></section><section className="power-stats">
 <div><span>最大HP</span><strong>{Math.round(c.maxHp*powerMultiplier(level))}</strong></div><div><span>通常攻撃 1弾</span><strong>{Math.round(c.attack.damage*powerMultiplier(level))}</strong></div>
 {cost?<><p>次のレベル：{level+1} / 11</p><div className="price-pill"><span><GameIcon name="coins" className="icon-coin"/> {cost.coins} コイン</span><span><GameIcon name="sun" className="icon-sun"/> {cost.sunPower} サンパワー</span></div><button className="sun-primary" disabled={!owned||busy||profile.economy.coins<cost.coins||profile.economy.sun_power<cost.sunPower} onClick={()=>void act('/hero/upgrade',{character})}>レベルアップ</button></>:<p><GameIcon name="trophy" className="icon-gold"/> レベルMAX！</p>}
 <div className="solar-divider"/><h3>ダイヤモンド限定スキン</h3><p><GameIcon name="sun" className="icon-sun"/> サンライトスキン</p><div className="price-pill"><GameIcon name="diamond" className="icon-diamond"/> {skinPrice} ダイヤモンド</div>{!sunSkin?<button className="sun-primary" disabled={!owned||busy||profile.economy.diamonds<skinPrice} onClick={()=>void act('/skin/buy',{character})}>スキン解放</button>:<button disabled={busy} onClick={()=>void act('/mastery/equip',{character,skin:'sun_skin'})}>スキンを装備</button>}{message&&<p className="sun-ok">{message}</p>}{error&&<p role="alert" className="sun-error">{error}</p>}
 </section></div></main>;
}
