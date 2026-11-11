export const ROOM_TYPES = [
  { id:'lab', name:'研究室', icon:'⌬', cost:70, power:2, benefit:'研究速度' },
  { id:'cell', name:'収容室', icon:'▣', cost:90, power:2, benefit:'アノマリー収容' },
  { id:'power', name:'発電室', icon:'ϟ', cost:100, power:-8, benefit:'電力供給' },
  { id:'artifact', name:'Artifact開発室', icon:'◇', cost:260, power:3, benefit:'制作効率' },
  { id:'medical', name:'医療室', icon:'✚', cost:180, power:2, benefit:'回復' },
  { id:'rest', name:'休憩室', icon:'☾', cost:120, power:1, benefit:'疲労回復' },
  { id:'watch', name:'監視室', icon:'◉', cost:220, power:2, benefit:'安全性' },
  { id:'security', name:'警備室', icon:'⬡', cost:240, power:2, benefit:'事故対応' },
  { id:'explore', name:'探索センター', icon:'⌖', cost:300, power:3, benefit:'探索' },
  { id:'special', name:'特殊実験室', icon:'✦', cost:400, power:4, benefit:'高度研究' }
];
export const ANOMALIES = [
  { id:'a01', name:'逆さ時計', icon:'◴', risk:1, discover:0, rate:1.2, money:1.2, power:0, material:0, ability:'研究速度 +12%', incident:'研究進捗の巻き戻り', color:'#e6c887' },
  { id:'a02', name:'空席の放送局', icon:'◖', risk:1, discover:0, rate:1, money:1.45, power:0, material:0, ability:'資金 +45%', incident:'耳鳴りによる疲労', color:'#f59781' },
  { id:'a03', name:'増殖立方体', icon:'▧', risk:2, discover:1, rate:1, money:1, power:0, material:.15, ability:'素材を生成', incident:'設備への侵食', color:'#a6dfaa' },
  { id:'a04', name:'底なしの鞄', icon:'◢', risk:1, discover:2, rate:1.1, money:1, power:0, material:.12, ability:'未知素材を生成', incident:'備品の消失', color:'#b5a3e9' },
  { id:'a05', name:'眠らない花', icon:'✿', risk:1, discover:3, rate:1, money:1, power:0, material:0, ability:'研究員の回復 +30%', incident:'胞子の拡散', color:'#f3a3c8' },
  { id:'a06', name:'存在しない扉', icon:'▤', risk:2, discover:4, rate:1, money:1, power:0, material:0, ability:'探索報酬 +25%', incident:'通路の入れ替わり', color:'#8fb6ef' },
  { id:'a07', name:'泣く鏡', icon:'◈', risk:3, discover:5, rate:1.5, money:1, power:0, material:0, ability:'研究データ +50%', incident:'精神汚染', color:'#a9e5e0' },
  { id:'a08', name:'赤い結晶', icon:'◆', risk:3, discover:6, rate:1, money:1, power:8, material:0, ability:'電力 +8', incident:'結晶の暴走', color:'#f57578' },
  { id:'a09', name:'名前を失う本', icon:'▥', risk:3, discover:7, rate:1.8, money:1, power:0, material:0, ability:'研究データ +80%', incident:'記憶混濁', color:'#d7b98e' },
  { id:'a10', name:'停止した太陽', icon:'☀', risk:4, discover:8, rate:2, money:1.4, power:12, material:0, ability:'研究・資金・電力上昇', incident:'時間停止', color:'#f5dc75' }
];
export const ARTIFACTS = [
  { id:'clock', name:'逆行懐中時計', icon:'◴', source:0, effect:'研究速度 +8%', kind:'research' },
  { id:'battery', name:'無限電池', icon:'ϟ', source:1, effect:'電力 +5', kind:'power' },
  { id:'glove', name:'複製グローブ', icon:'⧉', source:2, effect:'資金 +10%', kind:'money' },
  { id:'computer', name:'異常計算機', icon:'⌘', source:3, effect:'研究データ +10%', kind:'research' },
  { id:'blade', name:'深層短剣', icon:'⚔', source:4, effect:'警備力 +12%', kind:'safety' },
  { id:'lens', name:'境界レンズ', icon:'◉', source:5, effect:'探索報酬 +12%', kind:'explore' },
  { id:'seal', name:'封鎖印章', icon:'⬡', source:6, effect:'安全性 +12%', kind:'safety' },
  { id:'mask', name:'静寂マスク', icon:'◡', source:7, effect:'疲労軽減 +12%', kind:'rest' },
  { id:'map', name:'折り畳む地図', icon:'⌖', source:8, effect:'探索報酬 +12%', kind:'explore' },
  { id:'sun', name:'夜明けの核', icon:'✦', source:9, effect:'全収益 +15%', kind:'money' }
];
export const EXPEDITIONS = [
  { name:'廃研究所', duration:45, reward:90, research:35, material:3 },
  { name:'地下施設', duration:90, reward:240, research:80, material:7 },
  { name:'異常森林', duration:150, reward:550, research:160, material:13 },
  { name:'廃都市', duration:260, reward:1250, research:360, material:25 },
  { name:'次元断層', duration:450, reward:3000, research:800, material:50 }
];
export const UPGRADES = [
  { id:'revenue', name:'収益解析', base:70, rate:1.16, effect:'資金収益 +12% / Lv' },
  { id:'research', name:'研究手順', base:65, rate:1.16, effect:'研究速度 +12% / Lv' },
  { id:'work', name:'作業最適化', base:90, rate:1.17, effect:'作業速度 +8% / Lv' },
  { id:'capacity', name:'雇用枠', base:200, rate:1.22, effect:'最大雇用 +1 / Lv' },
  { id:'power', name:'送電強化', base:110, rate:1.18, effect:'電力 +2 / Lv' },
  { id:'safety', name:'封鎖技術', base:120, rate:1.18, effect:'安全性 +8% / Lv' },
  { id:'craft', name:'制作効率', base:150, rate:1.18, effect:'Artifact費用 -3% / Lv' },
  { id:'explore', name:'探索技術', base:180, rate:1.18, effect:'探索報酬 +10% / Lv' },
  { id:'offline', name:'無人研究', base:300, rate:1.25, effect:'放置効率・上限上昇' }
];
export const PERKS = [
  { id:'income', name:'永続収益', effect:'資金 +25% / Lv' },
  { id:'science', name:'永続研究', effect:'研究 +25% / Lv' },
  { id:'seed', name:'初期資金', effect:'開始資金 +200 / Lv' },
  { id:'staff', name:'初期研究員', effect:'開始研究員 +1 / Lv' },
  { id:'automation', name:'自動建築', effect:'不足設備を自動建築' },
  { id:'exploration', name:'永続探索', effect:'探索報酬 +20% / Lv' },
  { id:'catalog', name:'深層図鑑', effect:'高度アノマリー解放を促進' }
];
const NAMES=['アオイ','ミナト','スズ','レイ','カナメ','トワ','ナギ','ユウ','ツバメ','イオ','サラ','キリ'];
const PERSONALITIES=['慎重','大胆','勤勉','臆病','天才'];
export const RESEARCH_MODES=[{id:'observe',name:'観察研究',research:1,money:1,risk:0},{id:'physical',name:'物理研究',research:1.15,money:1.2,risk:1},{id:'mental',name:'精神研究',research:1.35,money:.8,risk:2},{id:'special',name:'特殊研究',research:1.7,money:1.5,risk:3}];
const limit=n=>Number.isNaN(n)?0:Math.min(1e300,Math.max(0,n));
const level=n=>Math.min(100000,Math.max(0,Math.floor(Number(n)||0)));
export function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
export function fresh(meta={}){
  const perks={...Object.fromEntries(PERKS.map(p=>[p.id,0])),...(meta.perks||{})};
  const s={version:1,seed:meta.seed||123456789,lastSaved:Date.now(),money:200+perks.seed*200,research:0,materials:0,knowledge:meta.knowledge||0,lifetimeResearch:0,runResearch:0,resets:meta.resets||0,perks,upgrades:Object.fromEntries(UPGRADES.map(u=>[u.id,0])),rooms:[{id:1,type:'power',x:0,y:0,level:1},{id:2,type:'lab',x:1,y:0,level:1},{id:3,type:'cell',x:2,y:0,level:1},{id:4,type:'rest',x:0,y:-1,level:1}],staff:[],found:[0,1],contained:[0],progress:{},artifacts:{},equipped:[],expedition:null,autoExplore:false,autoBuildClock:0,researchMode:'observe',alert:null,paused:false,logs:[],nextId:5,settings:{animation:true},catalog:meta.catalog||[0,1],achievements:meta.achievements||[]};
  for(let i=0;i<2+perks.staff;i++) hireFree(s);
  log(s,'研究施設が稼働を開始しました。');return s;
}
function hireFree(s){let id=s.nextId++;s.staff.push({id,name:NAMES[Math.floor(random(s)*NAMES.length)],personality:PERSONALITIES[Math.floor(random(s)*5)],power:1+Math.floor(random(s)*3),mind:75,health:100,fatigue:0,x:0,y:0,target:0,action:'待機',xp:0,level:1});}
export function log(s,message){s.logs.unshift({at:Date.now(),message});s.logs.length=Math.min(s.logs.length,60);}
export function roomCost(type,count=0,lv=0){const def=ROOM_TYPES.find(r=>r.id===type);return limit(Math.ceil(def.cost*1.34**count*1.28**lv));}
export function upgradeCost(def,lv){return limit(Math.ceil(def.base*def.rate**lv));}
export function bulkCost(def,lv,n){if(!n)return 0;const first=upgradeCost(def,lv);return limit(Math.ceil(first*(def.rate**n-1)/(def.rate-1)));}
export function buyUpgrade(s,id,quantity=1){const def=UPGRADES.find(x=>x.id===id);if(!def)return false;const lv=level(s.upgrades[id]);let n=quantity==='max'?Math.max(0,Math.floor(Math.log(1+s.money*(def.rate-1)/upgradeCost(def,lv))/Math.log(def.rate))):Math.max(1,Math.min(100,Number(quantity)||1));n=Math.min(n,100000-lv);while(n>0&&bulkCost(def,lv,n)>s.money)n--;if(!n)return false;s.money=limit(s.money-bulkCost(def,lv,n));s.upgrades[id]=lv+n;log(s,`${def.name}を Lv.${lv+n} に強化`);return true;}
export function build(s,type,x,y){if(!ROOM_TYPES.some(r=>r.id===type)||!Number.isInteger(x)||!Number.isInteger(y)||Math.abs(x)>20||Math.abs(y)>20||s.rooms.some(r=>r.x===x&&r.y===y))return false;const cost=roomCost(type,s.rooms.filter(r=>r.type===type).length);if(s.money<cost)return false;s.money=limit(s.money-cost);s.rooms.push({id:s.nextId++,type,x,y,level:1});log(s,`${ROOM_TYPES.find(r=>r.id===type).name}を建設`);return true;}
export function improveRoom(s,id){const r=s.rooms.find(r=>r.id===id);if(!r)return false;const cost=roomCost(r.type,0,r.level+1);if(s.money<cost)return false;s.money=limit(s.money-cost);r.level=level(r.level+1);log(s,`設備を Lv.${r.level} に強化`);return true;}
export function moveRoom(s,id,x,y){const r=s.rooms.find(r=>r.id===id);if(!r||s.rooms.some(q=>q.x===x&&q.y===y)||Math.abs(x)>20||Math.abs(y)>20)return false;r.x=x;r.y=y;log(s,'設備を移動');return true;}
export function removeRoom(s,id){const r=s.rooms.find(r=>r.id===id);if(!r||s.rooms.filter(q=>q.type===r.type).length<=1&&['power','lab','cell'].includes(r.type))return false;s.rooms=s.rooms.filter(q=>q.id!==id);s.money=limit(s.money+roomCost(r.type,0,r.level-1)*.3);log(s,'設備を撤去（30%返金）');return true;}
export function metrics(s){
  const lv=t=>s.rooms.filter(r=>r.type===t).reduce((n,r)=>n+r.level,0);
  const mode=RESEARCH_MODES.find(x=>x.id===s.researchMode)||RESEARCH_MODES[0];
  const power=10+lv('power')*8+s.upgrades.power*2+s.contained.reduce((n,i)=>n+(ANOMALIES[i]?.power||0),0)+s.equipped.reduce((n,id)=>n+(id==='battery'?5*(s.artifacts[id]||1):0),0);
  const used=s.rooms.reduce((n,r)=>n+Math.max(0,ROOM_TYPES.find(t=>t.id===r.type)?.power||0),0);
  const staffed=Math.min(1,s.staff.length/Math.max(1,lv('lab')+lv('cell')));
  const fatigue=s.staff.length?s.staff.reduce((n,p)=>n+(1-p.fatigue/160),0)/s.staff.length:0;
  const staffSkill=s.staff.length?s.staff.reduce((n,p)=>n+Math.max(.5,p.power/2)*(p.personality==='勤勉'?1.12:p.personality==='天才'?1.08:1),0)/s.staff.length:0;
  const supply=used>power?Math.max(.2,power/used):1;
  const adjacent=s.rooms.filter(r=>r.type==='lab'&&s.rooms.some(q=>q.type==='special'&&Math.abs(q.x-r.x)+Math.abs(q.y-r.y)===1)).length;
  const research=(1+lv('lab')*.32+adjacent*.18)*(1+s.upgrades.research*.12)*(1+s.upgrades.work*.08)*(1+s.perks.science*.25)*(1+s.contained.reduce((n,i)=>n+(ANOMALIES[i]?.rate-1||0),0))*(1+s.equipped.reduce((n,id)=>n+(ARTIFACTS.find(a=>a.id===id)?.kind==='research'?.08*(s.artifacts[id]||1):0),0))*staffed*fatigue*staffSkill*supply*mode.research;
  const money=research*(1+s.upgrades.revenue*.12)*(1+s.perks.income*.25)*(1+s.contained.reduce((n,i)=>n+(ANOMALIES[i]?.money-1||0),0))*(1+s.equipped.reduce((n,id)=>n+(ARTIFACTS.find(a=>a.id===id)?.kind==='money'?.1*(s.artifacts[id]||1):0),0))*mode.money;
  const risk=s.contained.reduce((n,i)=>n+ANOMALIES[i].risk,0)+mode.risk;
  const safety=2+lv('watch')*1.5+lv('security')*2+s.upgrades.safety*.8+s.equipped.filter(id=>ARTIFACTS.find(a=>a.id===id)?.kind==='safety').length*1.2;
  return{power,used,research:limit(research),money:limit(money),risk,safety,staffed,supply};
}
export function hire(s){const cap=2+s.upgrades.capacity+s.perks.staff;if(s.staff.length>=cap||s.money<100*(s.staff.length+1))return false;s.money-=100*(s.staff.length+1);hireFree(s);log(s,'新しい研究員を雇用');return true;}
export function fire(s,id){if(s.staff.length<=1)return false;s.staff=s.staff.filter(p=>p.id!==id);log(s,'研究員との契約を終了');return true;}
export function train(s,id){const p=s.staff.find(x=>x.id===id);if(!p||s.research<30*p.level)return false;s.research-=30*p.level;p.power++;p.level++;log(s,`${p.name}を育成`);return true;}
export function contain(s,index){if(!s.found.includes(index)||s.contained.includes(index)||s.contained.length>=s.rooms.filter(r=>r.type==='cell').length||s.money<100*(index+1))return false;s.money-=100*(index+1);s.contained.push(index);log(s,`${ANOMALIES[index].name}を収容`);return true;}
export function craft(s,id){const a=ARTIFACTS.find(x=>x.id===id);if(!a||!s.found.includes(a.source)||!s.rooms.some(r=>r.type==='artifact'))return false;const lv=s.artifacts[id]||0,cost=Math.max(1,Math.ceil((5+lv*4)*(1-Math.min(.75,s.upgrades.craft*.03))));if(s.materials<cost||s.research<50*(lv+1))return false;s.materials-=cost;s.research-=50*(lv+1);s.artifacts[id]=lv+1;log(s,`${a.name}を制作・強化`);return true;}
export function equip(s,id){if(!s.artifacts[id])return false;if(s.equipped.includes(id))s.equipped=s.equipped.filter(x=>x!==id);else if(s.equipped.length<3)s.equipped.push(id);else return false;return true;}
export function startExplore(s,index){if(s.expedition||!s.rooms.some(r=>r.type==='explore')||!EXPEDITIONS[index])return false;const e=EXPEDITIONS[index];s.expedition={index,remaining:e.duration};log(s,`${e.name}へ探索隊を派遣`);return true;}
function finishExplore(s){const e=EXPEDITIONS[s.expedition.index],artifactBonus=s.equipped.filter(id=>ARTIFACTS.find(a=>a.id===id)?.kind==='explore').reduce((n,id)=>n+.12*s.artifacts[id],0),bonus=(1+s.upgrades.explore*.1+s.perks.exploration*.2+artifactBonus)*(s.contained.includes(5)?1.25:1);s.money=limit(s.money+e.reward*bonus);s.research=limit(s.research+e.research*bonus);s.materials=limit(s.materials+e.material*bonus);let found=ANOMALIES.findIndex((a,i)=>!s.found.includes(i)&&s.runResearch>=a.discover*90&&(i<=s.expedition.index+2+s.perks.catalog));if(found>=0){s.found.push(found);s.catalog=[...new Set([...s.catalog,found])];log(s,`新発見：${ANOMALIES[found].name}`);}log(s,`${e.name}から帰還：資金 +${Math.round(e.reward*bonus)}、素材 +${Math.round(e.material*bonus)}`);const index=s.expedition.index;s.expedition=null;if(s.autoExplore)startExplore(s,index);}
export function resolveAlert(s,action){if(!s.alert)return false;const cost=action==='seal'?30:action==='dispatch'?15:action==='isolate'?10:0;if(s.money<cost)return false;s.money-=cost;s.alert=null;log(s,`緊急対応：${action==='seal'?'封鎖':action==='dispatch'?'警備員派遣':'隔離'}に成功`);return true;}
function staffStep(s,dt){const restBonus=(s.contained.includes(4)?.3:0)+(s.equipped.includes('mask')?.12*(s.artifacts.mask||1):0);for(const p of s.staff){if(s.alert&&p.personality==='臆病'){p.action='避難';p.target=0;}else if(p.health<45&&s.rooms.some(r=>r.type==='medical')){p.action='治療';p.target=s.rooms.find(r=>r.type==='medical').x;}else if(p.fatigue>75){p.action='休憩';p.target=s.rooms.find(r=>r.type==='rest')?.x||0;}else{p.action=s.alert?'修理':'研究';p.target=s.rooms.find(r=>r.type==='lab')?.x||1;}p.x+=(p.target-p.x)*Math.min(1,dt*.9);p.fatigue=Math.max(0,Math.min(100,p.fatigue+(p.action==='研究'?dt*.8*(1-restBonus):-dt*2*(1+restBonus))));if(p.action==='研究'){p.xp+=dt*.5;if(p.xp>=40*p.level){p.xp=0;p.level++;p.power++;log(s,`${p.name}が Lv.${p.level} に昇進`);}}if(p.action==='治療')p.health=Math.min(100,p.health+dt*2*(1+restBonus));}}
export function advance(s,seconds,{offline=false}={}){
  seconds=Math.max(0,Math.min(seconds,offline?604800:300));if(!seconds||s.paused&&!offline)return {money:0,research:0,materials:0};
  const before={money:s.money,research:s.research,materials:s.materials};const m=metrics(s),eff=offline?Math.min(1,.75+s.upgrades.offline*.025):1;
  const penalty=s.alert?.remaining?0.55:1;
  s.money=limit(s.money+m.money*seconds*eff*penalty);s.research=limit(s.research+m.research*seconds*eff*penalty);s.materials=limit(s.materials+s.contained.reduce((n,i)=>n+ANOMALIES[i].material,0)*seconds*eff);
  s.runResearch=limit(s.runResearch+m.research*seconds*eff*penalty);s.lifetimeResearch=limit(s.lifetimeResearch+m.research*seconds*eff*penalty);
  for(const i of s.contained)s.progress[i]=Math.min(100,(s.progress[i]||0)+m.research*seconds*eff/(12+ANOMALIES[i].risk*8));
  if(s.expedition){let remaining=seconds;let completions=0;while(s.expedition&&remaining>=s.expedition.remaining&&completions<100){remaining-=s.expedition.remaining;finishExplore(s);completions++;}if(s.expedition)s.expedition.remaining=Math.max(0,s.expedition.remaining-remaining);}
  if(offline){const incidentCount=Math.min(12,Math.floor(seconds/1800*m.risk/Math.max(2,m.safety)));if(incidentCount){const repairs=Math.min(s.money,incidentCount*20);s.money-=repairs;log(s,`放置中の異常現象 ${incidentCount} 件を自動復旧（修理費 ${Math.round(repairs)}）`);}for(const p of s.staff){p.fatigue=Math.max(0,p.fatigue-25);p.health=Math.min(100,p.health+10);} }
  else{staffStep(s,seconds);if(s.perks.automation){s.autoBuildClock=(s.autoBuildClock||0)+seconds;if(s.autoBuildClock>=15){s.autoBuildClock=0;const labs=s.rooms.filter(r=>r.type==='lab').length;if(labs<s.staff.length){const occupied=new Set(s.rooms.map(r=>`${r.x},${r.y}`));for(let x=0;x<20;x++)if(!occupied.has(`${x},0`)&&s.money>=roomCost('lab',labs)*2){build(s,'lab',x,0);break;}}}}if(s.alert){s.alert.remaining-=seconds;if(s.alert.remaining<=0){log(s,'警備班が収容違反を復旧');s.alert=null;}}else if(m.risk>m.safety&&random(s)<seconds*.003*(m.risk-m.safety)){const i=s.contained[Math.floor(random(s)*s.contained.length)];s.alert={name:ANOMALIES[i].incident,remaining:30};log(s,`警報：${ANOMALIES[i].name} / ${s.alert.name}`);}}
  return {money:s.money-before.money,research:s.research-before.research,materials:s.materials-before.materials};
}
export function offlineAdvance(s,now=Date.now()){const elapsed=Math.max(0,Math.min((now-s.lastSaved)/1000,Math.min(604800,43200+s.upgrades.offline*21600)));if(elapsed<2){s.lastSaved=now;return null;}const report=advance(s,elapsed,{offline:true});s.lastSaved=now;return {seconds:elapsed,...report};}
export function prestigeGain(s){return Math.max(0,Math.floor(Math.sqrt(s.runResearch/1000))-(s.resets?0:0));}
export function prestige(s){const gain=prestigeGain(s);if(gain<1)return false;const next=fresh({knowledge:s.knowledge+gain,resets:s.resets+1,perks:s.perks,catalog:s.catalog,achievements:s.achievements,seed:s.seed});Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,next);log(s,`管理社を再構築：異常知識 +${gain}`);return true;}
export function buyPerk(s,id){const p=PERKS.find(x=>x.id===id);if(!p)return false;const lv=s.perks[id]||0,cost=1+lv*lv;if(s.knowledge<cost)return false;s.knowledge-=cost;s.perks[id]=lv+1;log(s,`${p.name}を永続強化`);return true;}
export function validateSave(input){if(!input||typeof input!=='object'||input.version!==1||!Array.isArray(input.rooms)||!Array.isArray(input.staff)||!Array.isArray(input.found)||!input.upgrades||!input.perks)return null;const base=fresh();const s={...base,...input,perks:{...base.perks,...input.perks},upgrades:{...base.upgrades,...input.upgrades},settings:{...base.settings,...input.settings}};for(const key of ['money','research','materials','knowledge','runResearch','lifetimeResearch'])s[key]=limit(s[key]);for(const key of Object.keys(s.perks))s.perks[key]=level(s.perks[key]);for(const key of Object.keys(s.upgrades))s.upgrades[key]=level(s.upgrades[key]);s.rooms=s.rooms.filter(r=>ROOM_TYPES.some(t=>t.id===r.type)&&Number.isInteger(r.x)&&Number.isInteger(r.y)).slice(0,200);s.staff=s.staff.filter(p=>Number.isInteger(p.id)).slice(0,100);s.found=[...new Set(s.found.filter(i=>Number.isInteger(i)&&ANOMALIES[i]))];s.contained=[...new Set((s.contained||[]).filter(i=>s.found.includes(i)))];s.researchMode=RESEARCH_MODES.some(m=>m.id===s.researchMode)?s.researchMode:'observe';s.logs=(s.logs||[]).slice(0,60);s.lastSaved=Number.isFinite(s.lastSaved)?s.lastSaved:Date.now();s.seed=(Number(s.seed)||123456789)>>>0;return s;}
