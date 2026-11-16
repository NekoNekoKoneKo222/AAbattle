import {useState} from 'react';
import {characterById,dropInfo,levelUnlocks,powerLevel,powerMultiplier,skinPrice,upgradeCost,rarityInfo,type HeroRarity} from '@shift/shared';
import type {ShiftProfile,Request} from './pages';
import {CharacterPreview} from './character-preview';
import {GameIcon,type GameIconName} from './game-icon';

const rewardIcons:Record<string,GameIconName>={coins:'coins',sun_power:'sun',diamonds:'diamond',credits:'ticket',sun:'sun',bonus_drop:'sun'};
const words:Record<string,string>={coins:'コイン',sun_power:'サンパワー',diamonds:'ダイヤモンド',credits:'クレジット',sun:'サンドロップ'};
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'通信エラー';

export const itemDetails={
  coins:{name:'コイン',icon:'coins',description:'キャラのレベルアップに使用する通貨。サンパワーと一緒に消費します。'},
  sun_power:{name:'サンパワー',icon:'sun',description:'パワーレベルの強化に使う太陽のエネルギー。コインと組み合わせてレベル11まで育てられます。'},
  diamonds:{name:'ダイヤモンド',icon:'diamond',description:'低確率で獲得できる貴重な通貨。特別なスキンを解放できます。'},
  credits:{name:'クレジット',icon:'ticket',description:'キャラロードで新しいキャラクターを解放するためのポイント。バトルやミッションから入手します。'},
  sun:{name:'サンドロップ',icon:'sun',description:'無料の太陽型報酬。コインやサンパワーなどを獲得できます。'},
  glitch:{name:'グリッチサンキューブ',icon:'cube',description:'3回連続で報酬抽選ができる特別なキューブ。対戦を続けると入手できます。'}
} as const;
type ItemKey=keyof typeof itemDetails;
export function ItemHelp({item,onClose}:{item:ItemKey;onClose:()=>void}){
 const data=itemDetails[item];
 return <div className="item-info-overlay" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}>
   <section className="item-info-card" role="dialog" aria-modal="true" aria-label={data.name}>
    <GameIcon name={data.icon} size={74}/><h2>{data.name}</h2><p>{data.description}</p>
    <button className="sun-primary" type="button" onClick={onClose}>閉じる</button>
   </section>
 </div>;
}
export function SolarWallet({profile}:{profile:ShiftProfile|null}){
 const [active,setActive]=useState<ItemKey|null>(null);
 const items:[ItemKey,string|number][]=[
  ['coins',profile?.economy?.coins??'—'],['sun_power',profile?.economy?.sun_power??'—'],
  ['diamonds',profile?.economy?.diamonds??'—'],['credits',profile?.credits??'—']
 ];
 return <div className="sun-wallet" aria-label="所持通貨">
  {items.map(([id,value])=><button key={id} className="wallet-item" type="button" title={itemDetails[id].name+'の説明'} aria-label={itemDetails[id].name+'について'} onClick={()=>setActive(id)}>
   <GameIcon name={itemDetails[id].icon} className={id==='coins'?'icon-coin':id==='diamonds'?'icon-diamond':id==='credits'?'icon-ticket':'icon-sun'}/><b>{value}</b></button>)}
  {active&&<ItemHelp item={active} onClose={()=>setActive(null)}/>}
 </div>;
}

const lessons=[
 {title:'移動',text:'PCはWASD、iPadは左スティックで移動。壁の後ろに隠れると攻撃を避けられます。',icon:'move'},
 {title:'通常攻撃と照準',text:'PCはマウス＋左クリック、iPadは右スティック。白い点線は壁で止まる攻撃予測線です。',icon:'target'},
 {title:'必殺技とスキル',text:'攻撃を当ててゲージをため、右クリックで必殺技。Eキーで特殊スキル。iPadは右下ボタンを使います。',icon:'zap'},
 {title:'シフトと育成',text:'戦場の構造が変化します。コインとサンパワーでキャラを強化し、サンドロップで報酬を獲得。チュートリアル後は10人サバイバルで初優勝すると、ランダムレア度のキャラを1体獲得できます。',icon:'sun'}
];
export function TutorialPage({request,onFinished,onBack}:{request:Request;onFinished:()=>Promise<void>;onBack:()=>void}){
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function next(){if(step<3){setStep(v=>v+1);return;}setBusy(true);try{await request('/tutorial/complete',{});await onFinished();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <main className="solar-screen"><div className="solar-heading"><button onClick={onBack}>← ホーム</button><span className="solar-kicker">SHIFT ACADEMY</span><h1>初めてのSHIFT ARENA</h1></div>
 <div className="tutorial-card"><div className="tutorial-art"><div className="tutorial-symbol"><GameIcon name={lessons[step].icon as GameIconName} size={66}/></div><CharacterPreview id="rei"/></div><div className="tutorial-copy" aria-live="polite"><span className="solar-kicker">STEP {step+1} / 4</span><h2>{lessons[step].title}</h2><p>{lessons[step].text}</p><div className="tutorial-dots">{lessons.map((_,i)=><i key={i} className={i<=step?'active':''}/>)}</div><div className="solar-actions">{step>0&&<button type="button" onClick={()=>setStep(v=>v-1)}>戻る</button>}<button type="button" className="sun-primary" disabled={busy} onClick={()=>void next()}>{step===3?'クリアして10人サバイバルへ':'理解した！ 次へ →'}</button></div>{error&&<p className="sun-error">{error}</p>}</div></div></main>;
}

export function BeginnerPage({profile,onBegin,onTry,onBack}:{profile:ShiftProfile;onBegin:()=>Promise<void>;onTry:()=>void;onBack:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function play(){setBusy(true);setError('');try{await onBegin();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 const reward=profile.economy.beginner_reward;
 return <main className="solar-screen">
  <div className="solar-heading"><button onClick={onBack}>← ホーム</button><span className="solar-kicker">FIRST SUN CHALLENGE</span><h1>初優勝チャレンジ</h1><p>チュートリアル後に10人サバイバルで最後まで生き残ると、ランダムなレア度の未所持キャラを1体獲得！ 負けても再挑戦できます。報酬はアカウントごとに一度だけです。</p></div>
  <section className="beginner-challenge"><div className="challenge-symbol"><GameIcon name="trophy" size={92}/></div>
   <div><h2>10人サバイバル</h2><p>あなた＋9人のCPUが参加。復活なしのバトルで優勝を目指そう。</p>
    <div className="rarity-odds">{(Object.entries(rarityInfo) as [HeroRarity,{name:string;color:string;weight:number}][]).filter(([id])=>id!=='STARTER').map(([id,info])=><span key={id} className="rarity-badge" style={{color:info.color,borderColor:info.color}}>{info.name} {info.weight}%</span>)}</div>
    {profile.economy.beginner_claimed?<p className="sun-ok">初心者特典は受取済み。{reward&&(characterById(reward.character).name+'（'+(rarityInfo[reward.rarity as HeroRarity]?.name||reward.rarity)+'）を獲得しました。')}</p>:
     <button className="sun-primary" disabled={busy||!profile.economy.tutorial_done} onClick={()=>void play()}><GameIcon name="play"/>10人サバイバルに挑戦</button>}
    <button type="button" onClick={onTry}>トレーニングで練習する</button>{error&&<p role="alert" className="sun-error">{error}</p>}
   </div>
  </section>
 </main>;
}

export function SunRewardsPage({profile,request,refresh,onBack}:{profile:ShiftProfile;request:Request;refresh:()=>Promise<void>;onBack:()=>void}){
 const [help,setHelp]=useState<ItemKey|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reward,setReward]=useState<{kind:string;rewards:{type:string;amount:number}[]}|null>(null);
 async function open(kind:'sun'|'glitch'){setBusy(true);setError('');try{const result=await request<{kind:string;rewards:{type:string;amount:number}[]}>('/drop/open',{kind});setReward(result);await refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <main className="solar-screen"><div className="solar-heading"><button onClick={onBack}>← ホーム</button><span className="solar-kicker">SUN REWARDS</span><h1>太陽の報酬</h1><SolarWallet profile={profile}/><p>対戦でドロップを獲得しよう！ダイヤモンドはまれに出現。</p></div>
 <div className="sun-drop-grid"><section className="sun-drop-card normal"><button className="drop-help" aria-label="サンドロップの説明" onClick={()=>setHelp("sun")}><GameIcon name="sun" size={146} className="drop-symbol"/></button><h2>サンドロップ</h2><p>{dropInfo.sun.description}</p><strong>所持 {profile.economy.drops.sun}</strong><button className="sun-primary" disabled={!profile.economy.drops.sun||busy} onClick={()=>void open('sun')}>開封</button></section>
 <section className="sun-drop-card glitch"><button className="drop-help" aria-label="グリッチサンキューブの説明" onClick={()=>setHelp("glitch")}><GameIcon name="cube" size={146} className="drop-symbol"/></button><h2>グリッチサンキューブ</h2><p>{dropInfo.glitch.description}</p><strong>所持 {profile.economy.drops.glitch}</strong><button className="sun-primary" disabled={!profile.economy.drops.glitch||busy} onClick={()=>void open('glitch')}>3回抽選</button></section></div>
 <p className="drop-odds">1抽選の割合：コイン47%、サンパワー38%、クレジット12%、ダイヤモンド2.5%、追加ドロップ0.5%。グリッチサンキューブは3回抽選。現金での購入はありません。</p>
 {help&&<ItemHelp item={help} onClose={()=>setHelp(null)}/>}{reward&&<div className="sun-reveal" role="dialog" aria-modal="true"><section><GameIcon name={reward.kind==='sun'?'sun':'cube'} size={106} className="reveal-sun"/><h2>報酬ゲット！</h2><div className="reveal-items">{reward.rewards.map((a,i)=><div key={i}><GameIcon name={rewardIcons[a.type]||'sparkles'} size={28}/><b>{words[a.type]||a.type} +{a.amount}</b></div>)}</div><button className="sun-primary" onClick={()=>setReward(null)}>受け取る</button></section></div>}{error&&<p role="alert" className="sun-error">{error}</p>}</main>;
}

export function HeroPowerPage({profile,character,request,refresh,onBack}:{profile:ShiftProfile;character:string;request:Request;refresh:()=>Promise<void>;onBack:()=>void}){
 const c=characterById(character),level=powerLevel(profile.economy.levels,character),cost=upgradeCost(level),owned=profile.owned_characters.includes(character),sunSkin=profile.economy.skins[character]?.includes('sun_skin');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function act(path:string,data:Record<string,unknown>){setBusy(true);setError('');try{await request(path,data);await refresh();setMessage('更新しました！');}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <main className="solar-screen"><div className="solar-heading"><button onClick={onBack}>← ホーム</button><span className="solar-kicker">HERO POWER</span><h1>キャラクター強化</h1><SolarWallet profile={profile}/></div>
 <div className="power-layout"><section className="power-hero-card"><CharacterPreview id={character} skin={profile.mastery[character]?.equipped_skin}/><h2>{c.name}</h2><strong><GameIcon name="sun" size={23} className="icon-sun"/> パワーレベル {level} / 11</strong></section><section className="power-stats">
 <div><span>最大HP</span><strong>{Math.round(c.maxHp*powerMultiplier(level))}</strong></div><div><span>通常攻撃 1弾</span><strong>{Math.round(c.attack.damage*powerMultiplier(level))}</strong></div>
 {cost?<><p>次のレベル：{level+1} / 11</p><div className="price-pill"><span><GameIcon name="coins" className="icon-coin"/> {cost.coins} コイン</span><span><GameIcon name="sun" className="icon-sun"/> {cost.sunPower} サンパワー</span></div><button className="sun-primary" disabled={!owned||busy||profile.economy.coins<cost.coins||profile.economy.sun_power<cost.sunPower} onClick={()=>void act('/hero/upgrade',{character})}>レベルアップ</button></>:<p><GameIcon name="trophy" className="icon-gold"/> レベルMAX！</p>}
 <div className="solar-divider"/><h3>レベルで解放される機能</h3><div className="power-unlocks">{levelUnlocks.map(item=><div key={item.level} className={level>=item.level?'unlocked':'locked'}><strong>Lv.{item.level} {item.name}</strong><small>{level>=item.level?'解放済み':'未解放'}</small><p>{item.description}</p></div>)}</div><h3>ダイヤモンド限定スキン</h3><p><GameIcon name="sun" className="icon-sun"/> サンライトスキン</p><div className="price-pill"><GameIcon name="diamond" className="icon-diamond"/> {skinPrice} ダイヤモンド</div>{!sunSkin?<button className="sun-primary" disabled={!owned||busy||profile.economy.diamonds<skinPrice} onClick={()=>void act('/skin/buy',{character})}>スキン解放</button>:<button disabled={busy} onClick={()=>void act('/mastery/equip',{character,skin:'sun_skin'})}>スキンを装備</button>}{message&&<p className="sun-ok">{message}</p>}{error&&<p role="alert" className="sun-error">{error}</p>}
 </section></div></main>;
}
