export type PartKind = 'trigger' | 'shape' | 'element' | 'effect' | 'condition' | 'modifier';
export type Part = { id: string; name: string; cost: number; description: string };
export const PARTS: Record<PartKind, readonly Part[]> = {
  trigger: [
    {id:'cast',name:'通常発動',cost:4,description:'すぐに発動'},
    {id:'melee',name:'近接',cost:7,description:'近くの敵へ発動'},
    {id:'shoot',name:'射撃',cost:9,description:'文字弾を撃つ'},
    {id:'counter',name:'カウンター',cost:11,description:'パリィ中だけ発動'}
  ],
  shape: [
    {id:'line',name:'直線',cost:7,description:'前方へ飛ぶ'},
    {id:'cone',name:'扇形',cost:9,description:'前方の複数の敵'},
    {id:'circle',name:'円形',cost:12,description:'周囲の敵'},
    {id:'self',name:'自分の周囲',cost:5,description:'自分を中心に発動'},
    {id:'homing',name:'追尾',cost:18,description:'近くの敵へ向かう弾'},
    {id:'laser',name:'レーザー',cost:20,description:'前方へ貫く光線'},
    {id:'point',name:'指定地点',cost:15,description:'照準の先で発動'}
  ],
  element: [
    {id:'neutral',name:'無属性',cost:0,description:'基本ダメージ'},
    {id:'fire',name:'火',cost:8,description:'短時間の燃焼'},
    {id:'ice',name:'氷',cost:8,description:'敵を減速'},
    {id:'lightning',name:'雷',cost:11,description:'近くの敵へ連鎖'},
    {id:'poison',name:'毒',cost:8,description:'継続ダメージ'},
    {id:'light',name:'光',cost:9,description:'少量の自己回復'},
    {id:'dark',name:'闇',cost:9,description:'ダメージを吸収'}
  ],
  effect: [
    {id:'explosion',name:'爆発',cost:18,description:'着弾地点の周囲にもダメージ'},
    {id:'pierce',name:'貫通',cost:13,description:'弾が次の敵へ進む'},
    {id:'heal',name:'回復',cost:16,description:'HPを回復'},
    {id:'knockback',name:'ノックバック',cost:9,description:'敵を押し戻す'},
    {id:'dot',name:'継続ダメージ',cost:12,description:'数秒間ダメージ'},
    {id:'absorb',name:'吸収',cost:15,description:'与えたダメージで回復'}
  ],
  condition: [
    {id:'on_hit',name:'敵に命中したら',cost:5,description:'命中したときだけ次を実行'},
    {id:'low_hp',name:'HP半分以下',cost:6,description:'HPが半分以下なら次を実行'},
    {id:'on_parry',name:'パリィ成功時',cost:8,description:'パリィ中だけ次を実行'}
  ],
  modifier: [
    {id:'multishot',name:'3方向弾',cost:20,description:'弾を3方向に発射'},
    {id:'speed',name:'弾速上昇',cost:8,description:'弾が速くなる'},
    {id:'power',name:'威力上昇',cost:13,description:'ダメージが増える'},
    {id:'range',name:'射程延長',cost:10,description:'攻撃範囲が広がる'}
  ]
};
export const PART_KINDS: PartKind[] = ['trigger','shape','element','effect','condition','modifier'];
export type SkillNode = { id: string; kind: PartKind; part: string; x: number; y: number };
export type SkillEdge = { from: string; to: string };
export type SkillGraph = { id: string; name: string; glyph: string; nodes: SkillNode[]; edges: SkillEdge[] };
export type SkillStats = { budget: number; ep: number; cooldownMs: number; damage: number };
export type SkillEffect = { part: string; guards: string[] };
export type SkillProgram = { skill: SkillGraph; stats: SkillStats; trigger: string; shape: string; element: string; modifiers: string[]; effects: SkillEffect[] };

const safeName = (value: unknown, max = 30) => {
  const name = String(value ?? '').trim();
  if (!name || Array.from(name).length > max || /[<>\u0000-\u001f]/u.test(name)) throw new Error('名前は1～30文字で入力してください。');
  return name;
};
const safeGlyph = (value: unknown) => {
  const glyph = String(value ?? '').trim();
  if (Array.from(glyph).length !== 1 || /[<>\u0000-\u001f]/u.test(glyph)) throw new Error('表示文字は1文字にしてください。');
  return glyph;
};

export function compileSkill(raw: unknown): SkillProgram {
  if (!raw || typeof raw !== 'object') throw new Error('スキルデータが不正です。');
  const src = raw as Record<string, unknown>;
  if (!Array.isArray(src.nodes) || src.nodes.length < 2 || src.nodes.length > 12 || !Array.isArray(src.edges) || src.edges.length > 18) throw new Error('ノードは2～12個、接続は18本以内にしてください。');
  const nodes: SkillNode[] = src.nodes.map(item => {
    if (!item || typeof item !== 'object') throw new Error('ノードが不正です。');
    const a = item as Record<string, unknown>;
    const id = String(a.id ?? ''), kind = String(a.kind ?? '') as PartKind, part = String(a.part ?? '');
    if (!/^[a-zA-Z0-9_-]{1,24}$/.test(id) || !PART_KINDS.includes(kind) || !PARTS[kind].some(p => p.id === part)) throw new Error('未対応のスキルパーツです。');
    const x = Number(a.x), y = Number(a.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 900 || y < 0 || y > 900) throw new Error('ノード位置が不正です。');
    return {id,kind,part,x,y};
  });
  const byId = new Map(nodes.map(n => [n.id,n]));
  if (byId.size !== nodes.length) throw new Error('ノードIDが重複しています。');
  const edges: SkillEdge[] = src.edges.map(item => {
    if (!item || typeof item !== 'object') throw new Error('接続が不正です。');
    const a = item as Record<string, unknown>, from = String(a.from ?? ''), to = String(a.to ?? '');
    if (!byId.has(from) || !byId.has(to) || from === to) throw new Error('接続先が不正です。');
    return {from,to};
  });
  if (new Set(edges.map(e=>`${e.from}:${e.to}`)).size !== edges.length) throw new Error('接続が重複しています。');
  const triggers=nodes.filter(n=>n.kind==='trigger');
  if(triggers.length!==1)throw new Error('発動パーツを1個だけ置いてください。');
  if(nodes.filter(n=>n.kind==='shape').length>1 || nodes.filter(n=>n.kind==='element').length>1)throw new Error('形状と属性はそれぞれ1個までです。');
  const outgoing=new Map(nodes.map(n=>[n.id,edges.filter(e=>e.from===n.id).map(e=>e.to)]));
  const incoming=new Map(nodes.map(n=>[n.id,edges.filter(e=>e.to===n.id).length]));
  if(incoming.get(triggers[0].id)!==0 || nodes.some(n=>n.kind!=='trigger' && incoming.get(n.id)===0) || [...outgoing.values()].some(v=>v.length>2))throw new Error('発動から全パーツへ接続し、分岐は各ノード2本までにしてください。');
  const visited=new Set<string>(),active=new Set<string>();
  const walk=(id:string,depth:number)=>{
    if(depth>9)throw new Error('スキルの深さは9段階までです。');
    if(active.has(id))throw new Error('循環する接続は使用できません。');
    if(visited.has(id))return;
    active.add(id);for(const next of outgoing.get(id)??[])walk(next,depth+1);active.delete(id);visited.add(id);
  };
  walk(triggers[0].id,1);
  if(visited.size!==nodes.length)throw new Error('すべてのパーツを発動パーツからつないでください。');
  const budget=nodes.reduce((n,node)=>n+(PARTS[node.kind].find(p=>p.id===node.part)?.cost??0),0);
  if(budget>100)throw new Error('スキル予算100を超えています。');
  const graph:SkillGraph={id:String(src.id??'').slice(0,64),name:safeName(src.name),glyph:safeGlyph(src.glyph),nodes,edges};
  const modifiers=nodes.filter(n=>n.kind==='modifier').map(n=>n.part);
  if(modifiers.filter(x=>x==='multishot').length>1 || modifiers.length>3)throw new Error('特殊パーツが多すぎます。');
  const effects:SkillEffect[]=[];
  let steps=0;
  const gather=(id:string,guards:string[])=>{
    if(++steps>32)throw new Error('処理予算を超える分岐です。');
    const node=byId.get(id)!;
    const nextGuards=node.kind==='condition'?[...guards,node.part]:guards;
    if(node.kind==='effect')effects.push({part:node.part,guards:nextGuards});
    for(const next of outgoing.get(id)??[])gather(next,nextGuards);
  };
  gather(triggers[0].id,[]);
  const stats:SkillStats={budget,ep:8+Math.ceil(budget*.3),cooldownMs:Math.round(1200+budget*35),damage:Math.round(12+budget*.45+(modifiers.includes('power')?8:0))};
  return {skill:graph,stats,trigger:triggers[0].part,shape:nodes.find(n=>n.kind==='shape')?.part??'cone',element:nodes.find(n=>n.kind==='element')?.part??'neutral',modifiers,effects};
}

export const WEAPON_BASES = {
  sword:{name:'剣',damage:15,interval:390,range:78,mode:'melee'},
  greatsword:{name:'大剣',damage:24,interval:620,range:92,mode:'melee'},
  dual:{name:'双剣',damage:11,interval:240,range:63,mode:'melee'},
  dagger:{name:'短剣',damage:10,interval:220,range:56,mode:'melee'},
  spear:{name:'槍',damage:18,interval:480,range:112,mode:'melee'},
  bow:{name:'弓',damage:14,interval:520,range:280,mode:'ranged'},
  gun:{name:'銃',damage:16,interval:480,range:310,mode:'ranged'},
  staff:{name:'杖',damage:13,interval:460,range:260,mode:'ranged'},
  shield:{name:'盾',damage:9,interval:550,range:60,mode:'melee'},
  chain:{name:'鎖',damage:17,interval:550,range:120,mode:'melee'},
  cannon:{name:'砲',damage:28,interval:850,range:310,mode:'ranged'},
  special:{name:'特殊武器',damage:17,interval:450,range:90,mode:'melee'}
} as const;
export type WeaponBase = keyof typeof WEAPON_BASES;
export const MATERIALS = {
  iron:{name:'鉄',damage:3,cost:{iron:2,wood:0,crystal:0}},
  wood:{name:'木',damage:0,cost:{iron:0,wood:2,crystal:0}},
  crystal:{name:'結晶',damage:5,cost:{iron:0,wood:0,crystal:2}}
} as const;
export type Material = keyof typeof MATERIALS;
export type MaterialBag = { iron: number; wood: number; crystal: number };
export type Weapon = { id: string; name: string; primary: WeaponBase; secondary: WeaponBase | null; material: Material; element: string; special: string; glyph: string };
export type WeaponStats = { damage: number; interval: number; range: number; mode: 'melee' | 'ranged'; cost: MaterialBag; rarity: string };
export type CraftState = { skills: SkillGraph[]; weapons: Weapon[]; equippedSkills: (string | null)[]; equippedWeaponId: string | null; materials: MaterialBag };
export const starterCraft = ():CraftState=>({skills:[],weapons:[],equippedSkills:[null,null,null,null],equippedWeaponId:null,materials:{iron:4,wood:4,crystal:2}});

export function compileWeapon(raw: unknown): { weapon: Weapon; stats: WeaponStats } {
  if(!raw||typeof raw!=='object')throw new Error('武器データが不正です。');
  const a=raw as Record<string,unknown>;
  const primary=String(a.primary??'') as WeaponBase,secondary=a.secondary?String(a.secondary) as WeaponBase:null,material=String(a.material??'') as Material;
  if(!(primary in WEAPON_BASES) || (secondary && (!(secondary in WEAPON_BASES)||secondary===primary)) || !(material in MATERIALS))throw new Error('武器の組み合わせが不正です。');
  const element=String(a.element??'neutral'),special=String(a.special??'none');
  if(!PARTS.element.some(p=>p.id===element) || !['none','leech','stun','burst'].includes(special))throw new Error('属性または特殊効果が不正です。');
  const weapon:Weapon={id:String(a.id??'').slice(0,64),name:safeName(a.name),primary,secondary,material,element,special,glyph:safeGlyph(a.glyph)};
  const base=WEAPON_BASES[primary],mix=secondary?WEAPON_BASES[secondary]:null;
  const stats:WeaponStats={
    damage:base.damage+MATERIALS[material].damage+(mix?Math.round(mix.damage*.3):0),
    interval:Math.round(base.interval*(mix?1.12:1)),
    range:Math.round(base.range+(mix?mix.range*.15:0)),
    mode:base.mode,
    cost:{iron:MATERIALS[material].cost.iron+(mix?2:0),wood:MATERIALS[material].cost.wood+(mix?2:0),crystal:MATERIALS[material].cost.crystal+(element!=='neutral'?1:0)+(special!=='none'?1:0)},
    rarity:secondary||special!=='none'?'UNCOMMON':'COMMON'
  };
  return {weapon,stats};
}
