import { randomInt, randomUUID } from 'node:crypto';
import { CARD_CATALOG, DEFAULT_DECK, validateDeck } from './chaos-cards.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
export const STARTER_DECK=Object.freeze(DEFAULT_DECK.map(id=>id==='dobby'?'grant':id==='infinity'?'insight':id));
const starter=()=>Object.fromEntries([...new Set(STARTER_DECK)].map(id=>[id,2]));
export const STARTUP_COINS=5500;
const initial=id=>({user_id:id,coins:STARTUP_COINS,shards:0,cards:starter(),decks:[{id:'starter',name:'標準デッキ',cards:[...STARTER_DECK]}],pulls:[],matches:[],rating:1000,wins:0,losses:0,daily_day:null,battle_reward_day:null,battle_reward_count:0});
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const pools=Object.fromEntries(['common','rare','superRare','ultraRare'].map(rarity=>[rarity,Object.values(CARD_CATALOG).filter(card=>card.rarity===rarity).map(card=>card.id)]));
export const PACK_ODDS=Object.freeze({normal:{common:65,rare:25,superRare:8,ultraRare:2},guaranteed:{common:0,rare:72,superRare:22,ultraRare:6}});
export const packTargets=()=>({cards:['dobby','infinity'],normalSlotPercent:PACK_ODDS.normal.ultraRare/pools.ultraRare.length,guaranteedSlotPercent:PACK_ODDS.guaranteed.ultraRare/pools.ultraRare.length});
function rarity(guaranteed){const roll=randomInt(100);if(guaranteed)return roll<72?'rare':roll<94?'superRare':'ultraRare';return roll<65?'common':roll<90?'rare':roll<98?'superRare':'ultraRare';}
export function drawPack(){return Array.from({length:5},(_,i)=>{const pool=pools[rarity(i===4)];return pool[randomInt(pool.length)];});}
function owned(cards,deck){const count={};for(const id of validateDeck(deck)){count[id]=(count[id]||0)+1;if(count[id]>(cards[id]||0))throw fail(409,`${CARD_CATALOG[id].name}の所持枚数が足りません。`);}return [...deck];}
function publicProfile(profile){return {coins:profile.coins,shards:profile.shards,cards:profile.cards,decks:profile.decks,pulls:profile.pulls.slice(0,20),matches:profile.matches.map(({replay,...rest})=>rest).slice(0,30),rating:profile.rating,wins:profile.wins,losses:profile.losses,dailyClaimed:profile.daily_day===day(),dailyRewardsLeft:Math.max(0,10-(profile.battle_reward_day===day()?profile.battle_reward_count:0))};}

export function createChaosCollection(pool=null){
  const memory=new Map();
  async function transaction(ids,operation){
    const unique=[...new Set(ids)].sort();
    if(!pool){const profiles=unique.map(id=>memory.get(id)||initial(id));const result=await operation(profiles);for(const p of profiles)memory.set(p.user_id,p);return result;}
    const client=await pool.connect();
    try{await client.query('BEGIN');const profiles=[];for(const id of unique){await client.query('INSERT INTO chaos_profiles(user_id,coins,cards,decks) VALUES ($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT DO NOTHING',[id,STARTUP_COINS,JSON.stringify(starter()),JSON.stringify(initial(id).decks)]);const result=await client.query('SELECT *,daily_day::text AS daily_day,battle_reward_day::text AS battle_reward_day FROM chaos_profiles WHERE user_id=$1 FOR UPDATE',[id]);profiles.push(result.rows[0]);}
      const result=await operation(profiles);for(const p of profiles)await client.query('UPDATE chaos_profiles SET coins=$2,shards=$3,cards=$4::jsonb,decks=$5::jsonb,pulls=$6::jsonb,matches=$7::jsonb,rating=$8,wins=$9,losses=$10,daily_day=$11,battle_reward_day=$12,battle_reward_count=$13,updated_at=NOW() WHERE user_id=$1',[p.user_id,p.coins,p.shards,JSON.stringify(p.cards),JSON.stringify(p.decks),JSON.stringify(p.pulls),JSON.stringify(p.matches),p.rating,p.wins,p.losses,p.daily_day,p.battle_reward_day,p.battle_reward_count]);await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  const one=(id,fn)=>transaction([id],profiles=>fn(profiles[0]));
  async function read(id,fn){if(!pool)return fn(memory.get(id)||initial(id));await pool.query('INSERT INTO chaos_profiles(user_id,coins,cards,decks) VALUES ($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT DO NOTHING',[id,STARTUP_COINS,JSON.stringify(starter()),JSON.stringify(initial(id).decks)]);const {rows}=await pool.query('SELECT *,daily_day::text AS daily_day,battle_reward_day::text AS battle_reward_day FROM chaos_profiles WHERE user_id=$1',[id]);return fn(rows[0]);}
  return {
    profile:id=>read(id,p=>publicProfile(p)),
    adminGrant:(id,{coins=0,cardId=null,count=0}={})=>one(id,p=>{if(!Number.isInteger(coins)||coins<0||coins>100000||!Number.isInteger(count)||count<0||count>20||(!coins&&!count)||Boolean(cardId)!==Boolean(count))throw fail(400,'付与内容が不正です。');if(count&&!CARD_CATALOG[cardId])throw fail(400,'カードが存在しません。');if(p.coins+coins>100000000)throw fail(400,'コインの上限を超えます。');p.coins+=coins;if(count)p.cards[cardId]=(p.cards[cardId]||0)+count;return publicProfile(p);}),
    checkOwned:(id,deck)=>read(id,p=>owned(p.cards,deck)),
    claimDaily:id=>one(id,p=>{if(p.daily_day===day())throw fail(409,'今日のログイン報酬は受け取り済みです。');p.daily_day=day();p.coins+=100;return publicProfile(p);}),
    openPacks:(id,count)=>one(id,p=>{if(![1,10].includes(count))throw fail(400,'1回または10連を選んでください。');if(p.coins<250*count)throw fail(409,'コインが足りません。');p.coins-=250*count;const packs=[];for(let i=0;i<count;i++){const cards=drawPack().map(cardId=>{const isNew=!p.cards[cardId];p.cards[cardId]=(p.cards[cardId]||0)+1;return {id:cardId,isNew};});const pack={id:randomUUID(),cards,at:new Date().toISOString()};packs.push(pack);}p.pulls=[...packs.reverse(),...p.pulls].slice(0,50);return {packs:packs.reverse(),profile:publicProfile(p)};}),
    convert:(id,cardId)=>one(id,p=>{if(!CARD_CATALOG[cardId])throw fail(400,'カードが存在しません。');if((p.cards[cardId]||0)<=2)throw fail(409,'3枚目以降のカードだけ欠片にできます。');p.cards[cardId]--;const amount={common:1,rare:3,superRare:10,ultraRare:30,mythic:100}[CARD_CATALOG[cardId].rarity];p.shards+=amount;return {amount,profile:publicProfile(p)};}),
    saveDeck:(id,input)=>one(id,p=>{const cards=owned(p.cards,input?.cards),name=String(input?.name||'').trim();if(!name||name.length>30)throw fail(400,'デッキ名は1～30文字にしてください。');const found=p.decks.find(d=>d.id===input?.id);if(input?.id&&!found)throw fail(404,'デッキが見つかりません。');if(found){found.name=name;found.cards=cards;}else{if(p.decks.length>=10)throw fail(409,'保存できるデッキは10個までです。');p.decks.push({id:randomUUID(),name,cards});}return publicProfile(p);}),
    deleteDeck:(id,deckId)=>one(id,p=>{if(p.decks.length<=1)throw fail(409,'最後のデッキは削除できません。');const old=p.decks.length;p.decks=p.decks.filter(d=>d.id!==deckId);if(old===p.decks.length)throw fail(404,'デッキが見つかりません。');return publicProfile(p);}),
    replay:(id,matchId)=>read(id,p=>{const match=p.matches.find(m=>m.id===matchId);if(!match)throw fail(404,'対局履歴が見つかりません。');return {gameId:matchId,events:match.replay};}),
    settle:match=>transaction([...match.teams.b,...match.teams.w].map(p=>p.id),profiles=>{const id=match.game.id;if(profiles.some(p=>p.matches.some(m=>m.id===id)))return Object.fromEntries(profiles.map(p=>[p.user_id,p.rating]));const winner=match.game.winner,record={id,mode:match.room.mode,roomCode:match.room.code,winner,reason:match.game.reason||'',at:new Date().toISOString(),players:[...match.teams.b,...match.teams.w].map(p=>({id:p.id,username:p.username})),replay:match.replay};for(const p of profiles){const side=match.teams.b.some(player=>player.id===p.user_id)?'b':'w';const won=side===winner;if(winner){if(won)p.wins++;else p.losses++;}if(match.room.mode==='ranked'&&winner)p.rating=Math.max(0,p.rating+(won?25:-25));if(p.battle_reward_day!==day()){p.battle_reward_day=day();p.battle_reward_count=0;}if(winner&&p.battle_reward_count<10){p.coins+=(won?60:30)+(p.battle_reward_count===0?50:0);p.battle_reward_count++;}p.matches=[record,...p.matches].slice(0,30);}return Object.fromEntries(profiles.map(p=>[p.user_id,p.rating]));})
  };
}
