export interface ModelCube { origin:[number,number,number]; size:[number,number,number]; color:string; }
export interface ModelBone { name:string; parent?:string; pivot:[number,number,number]; rotation:[number,number,number]; cubes:ModelCube[]; }
export interface ModelKeyframe { time:number; rotation:[number,number,number]; position?:[number,number,number]; scale?:[number,number,number]; }
export interface ModelClip { length:number; bones:Record<string,ModelKeyframe[]>; }
export interface PlayerModel { version:1; name:string; bones:ModelBone[]; attack:ModelClip; skill:ModelClip; }

const number=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:NaN;
function vector(value:unknown,min:number,max:number):[number,number,number]{if(!Array.isArray(value)||value.length!==3)throw Error('座標は数値3つで指定してください。');const result=value.map(v=>number(v,min,max));if(result.some(v=>!Number.isFinite(v)))throw Error('モデルの座標が範囲外です。');return result as [number,number,number];}
const nameOf=(value:unknown)=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,31}$/.test(value)?value:null;
export function validatePlayerModel(input:unknown):PlayerModel{
  if(!input||typeof input!=='object')throw Error('モデルデータがありません。');
  const raw=input as Record<string,unknown>,bonesRaw=raw.bones;
  if(!Array.isArray(bonesRaw)||bonesRaw.length<1||bonesRaw.length>24)throw Error('骨は1～24個までです。');
  const names=new Set<string>();let cubeCount=0;
  const bones:ModelBone[]=bonesRaw.map((value,index)=>{
    if(!value||typeof value!=='object')throw Error('骨の形式が正しくありません。');
    const b=value as Record<string,unknown>,name=nameOf(b.name);
    if(!name||names.has(name))throw Error('骨の名前が重複または無効です。');
    names.add(name);
    const parent=b.parent===undefined||b.parent===null||b.parent===''?undefined:nameOf(b.parent);
    if(b.parent&&!parent)throw Error('親の骨名が無効です。');
    if(!Array.isArray(b.cubes)||b.cubes.length>12)throw Error('1つの骨のブロックは12個までです。');
    cubeCount+=b.cubes.length;
    const cubes:ModelCube[]=b.cubes.map((cube:unknown)=>{
      if(!cube||typeof cube!=='object')throw Error('ブロックの形式が正しくありません。');
      const c=cube as Record<string,unknown>,origin=vector(c.origin,-32,32),size=vector(c.size,.1,32);
      if(origin.some((v,i)=>v+size[i]>48))throw Error('ブロックが範囲外です。');
      const color=typeof c.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.color)?c.color.toLowerCase():'#73d9ed';
      return {origin,size,color};
    });
    const pivot=vector(b.pivot??[0,0,0],-32,32),rotation=vector(b.rotation??[0,0,0],-180,180);
    return {name,...(parent?{parent}:{}),pivot,rotation,cubes};
  });
  if(cubeCount<1||cubeCount>64)throw Error('ブロックは1～64個までです。');
  for(const bone of bones)if(bone.parent&&(!names.has(bone.parent)||bone.parent===bone.name))throw Error('親の骨が見つかりません。');
  for(const bone of bones){const seen=new Set([bone.name]);let parent=bone.parent;while(parent){if(seen.has(parent))throw Error('骨の親子関係が循環しています。');seen.add(parent);parent=bones.find(b=>b.name===parent)?.parent;}}
  function clip(kind:'attack'|'skill'):ModelClip{
    const sourceRaw=raw[kind]&&typeof raw[kind]==='object'?raw[kind] as Record<string,unknown>:{};
    const length=number(sourceRaw.length??.5,.1,5);if(!Number.isFinite(length))throw Error(`${kind==='attack'?'攻撃':'スキル'}の長さは0.1～5秒です。`);
    const source=sourceRaw.bones&&typeof sourceRaw.bones==='object'?sourceRaw.bones as Record<string,unknown>:{};
    const result:ModelClip={length,bones:{}};
    for(const [bone,frames] of Object.entries(source)){
      if(!names.has(bone)||!Array.isArray(frames)||frames.length>24)throw Error('アニメーションのキーフレームが無効です。');
      result.bones[bone]=frames.map((frame:unknown)=>{if(!frame||typeof frame!=='object')throw Error('キーフレームが無効です。');const f=frame as Record<string,unknown>,time=number(f.time,0,length);if(!Number.isFinite(time))throw Error('キーフレーム時刻が無効です。');return {time,rotation:vector(f.rotation,-360,360),...(f.position===undefined?{}:{position:vector(f.position,-32,32)}),...(f.scale===undefined?{}:{scale:vector(f.scale,0,8)})};}).sort((a,b)=>a.time-b.time);
    }
    return result;
  }
  return {version:1,name:typeof raw.name==='string'?raw.name.trim().slice(0,32)||'My Fighter':'My Fighter',bones,attack:clip('attack'),skill:clip('skill')};
}

export function defaultPlayerModel():PlayerModel{return validatePlayerModel({version:1,name:'My Fighter',bones:[
  {name:'body',pivot:[0,12,0],rotation:[0,0,0],cubes:[{origin:[-4,10,-2],size:[8,12,4],color:'#38b9d4'}]},
  {name:'head',parent:'body',pivot:[0,22,0],rotation:[0,0,0],cubes:[{origin:[-4,22,-4],size:[8,8,8],color:'#e7ba91'}]},
  {name:'right_arm',parent:'body',pivot:[-5,21,0],rotation:[0,0,0],cubes:[{origin:[-7,10,-2],size:[4,12,4],color:'#286aaf'}]},
  {name:'left_arm',parent:'body',pivot:[5,21,0],rotation:[0,0,0],cubes:[{origin:[3,10,-2],size:[4,12,4],color:'#286aaf'}]},
  {name:'right_leg',pivot:[-2,10,0],rotation:[0,0,0],cubes:[{origin:[-4,0,-2],size:[4,10,4],color:'#273659'}]},
  {name:'left_leg',pivot:[2,10,0],rotation:[0,0,0],cubes:[{origin:[0,0,-2],size:[4,10,4],color:'#273659'}]},
],attack:{length:.5,bones:{right_arm:[{time:0,rotation:[0,0,0]},{time:.14,rotation:[-100,0,-15]},{time:.32,rotation:[-35,0,0]},{time:.5,rotation:[0,0,0]}]}}});}

export function importBedrockGeometry(input:unknown):PlayerModel{
  if(!input||typeof input!=='object')throw Error('JSONファイルを確認してください。');
  const data=input as Record<string,unknown>;
  const geometry=Array.isArray(data['minecraft:geometry'])?data['minecraft:geometry'][0]:null;
  if(!geometry||typeof geometry!=='object')throw Error('minecraft:geometry が見つかりません。');
  const g=geometry as Record<string,unknown>,description=g.description as Record<string,unknown>|undefined;
  const bones=Array.isArray(g.bones)?g.bones.map((bone:Record<string,unknown>)=>({name:bone.name,parent:bone.parent,pivot:bone.pivot??[0,0,0],rotation:bone.rotation??[0,0,0],cubes:Array.isArray(bone.cubes)?bone.cubes.map((cube:Record<string,unknown>)=>({origin:cube.origin,size:cube.size,color:'#73d9ed'})):[]})):[];
  return validatePlayerModel({version:1,name:typeof description?.identifier==='string'?description.identifier.replace(/^geometry\./,''):'Imported Fighter',bones,attack:{length:.5,bones:{}}});
}
export function bedrockAnimationNames(input:unknown):string[]{
  if(!input||typeof input!=='object')throw Error('アニメーションJSONを確認してください。');
  const data=input as Record<string,unknown>,animations=data.animations;
  if(!animations||typeof animations!=='object')throw Error('animations が見つかりません。');
  const names=Object.keys(animations);if(!names.length)throw Error('アニメーションがありません。');return names;
}
function bedrockChannel(value:unknown,kind:'rotation'|'position'|'scale'):{time:number;value:[number,number,number]}[]{
  const bounds=kind==='rotation'?[-360,360]:kind==='position'?[-32,32]:[0,8];
  const parse=(v:unknown):[number,number,number]=>{const values=typeof v==='number'?[v,v,v]:Array.isArray(v)&&v.length===1?[v[0],v[0],v[0]]:v;return vector(values,bounds[0],bounds[1]);};
  if(Array.isArray(value)||typeof value==='number')return [{time:0,value:parse(value)}];
  if(!value||typeof value!=='object')return [];
  return Object.entries(value).map(([time,pose])=>({time:Number(time),value:parse(pose&&typeof pose==='object'&&!Array.isArray(pose)?(pose as Record<string,unknown>).post??(pose as Record<string,unknown>).pre:pose)})).sort((a,b)=>a.time-b.time);
}
function channelAt(frames:{time:number;value:[number,number,number]}[],time:number,fallback:[number,number,number]):[number,number,number]{
  if(!frames.length)return fallback;if(time<=frames[0].time)return frames[0].value;
  for(let i=1;i<frames.length;i++)if(time<=frames[i].time){const a=frames[i-1],b=frames[i],ratio=(time-a.time)/Math.max(.00001,b.time-a.time);return a.value.map((v,k)=>v+(b.value[k]-v)*ratio) as [number,number,number];}
  return frames[frames.length-1].value;
}
export function importBedrockAnimation(model:PlayerModel,input:unknown,kind:'attack'|'skill'='attack',animationName?:string):PlayerModel{
  const names=bedrockAnimationNames(input),selected=animationName??names.find(name=>name.toLowerCase().includes(kind))??names[0];
  const animation=(input as {animations:Record<string,unknown>}).animations[selected] as Record<string,unknown>|undefined;
  if(!animation||typeof animation!=='object')throw Error('指定されたアニメーションが見つかりません。');
  const length=animation.animation_length??.5,source=animation.bones as Record<string,unknown>|undefined;
  const bones:Record<string,ModelKeyframe[]>={};
  for(const [name,value] of Object.entries(source||{})){
    if(!model.bones.some(b=>b.name===name)||!value||typeof value!=='object')continue;
    const channels=value as Record<string,unknown>,rotation=bedrockChannel(channels.rotation,'rotation'),position=bedrockChannel(channels.position,'position'),scale=bedrockChannel(channels.scale,'scale');
    const times=[...new Set([...rotation,...position,...scale].map(frame=>frame.time))].sort((a,b)=>a-b);
    if(times.length)bones[name]=times.map(time=>({time,rotation:channelAt(rotation,time,[0,0,0]),...(position.length?{position:channelAt(position,time,[0,0,0])}:{}),...(scale.length?{scale:channelAt(scale,time,[1,1,1])}:{} )}));
  }
  return validatePlayerModel({...model,[kind]:{length,bones}});
}
export function exportBedrockGeometry(model:PlayerModel){return {format_version:'1.12.0','minecraft:geometry':[{description:{identifier:`geometry.shift_${model.name.toLowerCase().replace(/[^a-z0-9_]/g,'_')}`,texture_width:64,texture_height:64,visible_bounds_width:3,visible_bounds_height:4,visible_bounds_offset:[0,1,0]},bones:model.bones.map(b=>({name:b.name,...(b.parent?{parent:b.parent}:{}),pivot:b.pivot,rotation:b.rotation,cubes:b.cubes.map(c=>({origin:c.origin,size:c.size,uv:[0,0]}))}))}]};}
export function exportBedrockAnimation(model:PlayerModel){return {format_version:'1.8.0',animations:Object.fromEntries((['attack','skill'] as const).map(kind=>[`animation.shift.${kind}`,{animation_length:model[kind].length,loop:false,bones:Object.fromEntries(Object.entries(model[kind].bones).map(([name,frames])=>[name,{rotation:Object.fromEntries(frames.map(f=>[String(f.time),f.rotation])),...(frames.some(f=>f.position)?{position:Object.fromEntries(frames.filter(f=>f.position).map(f=>[String(f.time),f.position]))}:{}),...(frames.some(f=>f.scale)?{scale:Object.fromEntries(frames.filter(f=>f.scale).map(f=>[String(f.time),f.scale]))}:{})}]))}]))};}
