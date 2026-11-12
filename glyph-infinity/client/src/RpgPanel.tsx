import React, {useState} from 'react';
import {QUESTS, type CraftState, type Snapshot} from '@glyph/shared';
import './rpg.css';

const slots={head:'頭',body:'胴',feet:'足',charm:'護符'};
const options={hp:'HP',damage:'攻撃',guard:'防御'};

export function RpgPanel({craft,state,send,onClose}:{craft:CraftState|null;state:Snapshot|null;send:(message:Record<string,unknown>)=>void;onClose:()=>void}){
  const [tab,setTab]=useState<'gear'|'dungeon'|'quests'|'growth'>('gear');
  const rpg=craft?.rpg;
  return <div className="craft-backdrop"><section className="craft-panel rpg-panel">
    <div className="craft-header"><div><strong>◇ 冒険の記録</strong><small>GLYPH INFINITY / PHASE 7</small></div><button onClick={onClose}>閉じる ×</button></div>
    <nav className="craft-tabs">{([['gear','装備'],['dungeon','ダンジョン'],['quests','クエスト'],['growth','成長']] as const).map(([id,name])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{name}</button>)}</nav>
    <div className="craft-content">
      {!rpg?<p>保存データを読み込み中…</p>:tab==='gear'?<>
        <h2>インベントリ {rpg.inventory.length}/60</h2>
        <p>敵を倒すと装備を獲得します。空きがあればボスは必ずドロップします。強化は鉄とコイン、オプション変更は結晶とコインを使います。</p>
        <div className="rpg-equipped">{Object.entries(slots).map(([slot,name])=><span key={slot}>{name}: {rpg.inventory.find(g=>g.id===rpg.equipped[slot as keyof typeof slots])?.name??'なし'}</span>)}</div>
        <div className="rpg-list">{rpg.inventory.length===0?<p>装備はまだありません。</p>:rpg.inventory.map(g=><article key={g.id}><strong>{g.favorite?'★ ':''}[{g.rarity}] {g.name} +{g.upgrade}</strong><small>{slots[g.slot]} / Lv.{g.level} / {options[g.option]} +{g.value+g.upgrade*2}</small><div><button onClick={()=>send({type:'rpg:equip',id:g.id})}>{rpg.equipped[g.slot]===g.id?'装備中':'装備'}</button><button onClick={()=>send({type:'rpg:upgrade',id:g.id})} disabled={g.upgrade>=10}>強化</button><button onClick={()=>send({type:'rpg:reroll',id:g.id})}>再抽選</button><button onClick={()=>send({type:'rpg:favorite',id:g.id})}>{g.favorite?'★':'☆'}</button><button onClick={()=>send({type:'rpg:salvage',id:g.id})} disabled={g.favorite}>解体</button></div></article>)}</div>
      </>:tab==='dungeon'?<>
        <h2>虚無の遺跡</h2><p>Lv.2から挑戦。敵を2波突破すると、予兆のある強打・薙ぎ払い・五連弾を使うTHE NULLと戦います。ボス撃破で近くの仲間全員が核を獲得します。</p>
        <p>現在：{state?.dungeon?`第${state.dungeon}波 / 敵 ${state.enemies.length}体`:'未挑戦'}</p>
        <button className="primary" disabled={!state||state.level<2||!!state.dungeon||!!state.pvp} onClick={()=>{send({type:'rpg:dungeon'});onClose();}}>挑戦する</button> <button disabled={!state?.dungeon} onClick={()=>{send({type:'rpg:leave'});onClose();}}>撤退する</button><p>踏破回数：{rpg.dungeonClears}</p>
        <h2>無限深淵</h2><p>Lv.10から挑戦。3波ごとに高難度ボスが出現し、層が進むほど強くなります。層のボスを倒すたびに報酬と記録を保存します。</p>
        <button className="primary" disabled={!state||state.level<10||!!state.dungeon||!!state.pvp} onClick={()=>{send({type:'rpg:abyss'});onClose();}}>深淵に挑戦</button><p>最高到達：{craft?.abyssDepth??0}層</p>
        <h2>覚醒</h2><p>ボス5体撃破と深淵3層到達で解放。覚醒後は戦闘中にEで12秒間攻撃+25%（再使用45秒）。</p>
        <button disabled={!!craft?.awakened||rpg.bossKills<5||(craft?.abyssDepth??0)<3} onClick={()=>send({type:'rpg:awaken'})}>{craft?.awakened?'覚醒済み':'覚醒する'}</button>
      </>:tab==='quests'?<>
        <h2>クエスト</h2><div className="rpg-list">{QUESTS.map(q=>{const value=rpg[q.kind],claimed=rpg.claimed.includes(q.id);return <article key={q.id}><strong>{q.name}</strong><small>{Math.min(value,q.target)}/{q.target}　報酬：{q.coins}コイン</small><button disabled={claimed||value<q.target} onClick={()=>send({type:'rpg:claim',id:q.id})}>{claimed?'受取済み':'受け取る'}</button></article>;})}</div>
      </>:<>
        <h2>成長と転生</h2><p>Lv.{state?.level??1}/100　経験値 {state?.xp??0}/{20*(state?.level??1)}</p>
        <p>転生 {rpg.rebirths}回 / 転生ポイント {rpg.rebirthPoints}。転生するとLv.1に戻り、装備とマスタリーは残ります。転生1回ごとに攻撃力が最大+10まで増えます。</p>
        <button className="primary" disabled={!state||state.level<100||!!state.dungeon} onClick={()=>send({type:'rpg:rebirth'})}>転生する</button>
        <h3>武器マスタリー</h3><div className="rpg-equipped">{Object.entries(rpg.mastery).map(([key,value])=><span key={key}>{key}: {value}体 / 攻撃 +{Math.min(10,Math.floor(value/20))}</span>)}</div><p>装備中の武器で敵を倒すと、その武器種のマスタリーが上がります。</p>
      </>}
    </div>
  </section></div>;
}
