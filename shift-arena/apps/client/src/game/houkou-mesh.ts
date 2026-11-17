import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** The user's original Bedrock/Blockbench geometry and animation files. */
type Cube={origin:number[];size:number[];rotation?:number[];pivot?:number[];uv?:Record<string,{uv:number[];uv_size:number[]}>|number[]};
type Bone={name:string;parent?:string;pivot?:number[];rotation?:number[];cubes?:Cube[]};
type GeometryJSON={'minecraft:geometry':{description?:{texture_width:number;texture_height:number};bones:Bone[]}[]};
type AnimationNode={rotation?:Record<string,number[]>;position?:Record<string,number[]>};
type AnimationJSON={animations:Record<string,{animation_length:number;bones:Record<string,AnimationNode>}>};
type HoukouRig={bones:Map<string,THREE.Group>;positions:Map<string,THREE.Vector3>;rotations:Map<string,THREE.Euler>;normal:AnimationJSON;ultimate:AnimationJSON};
const PIXELS=12; // 24 Blockbench units = 2 game-world units
const base='/sam/houkou/';
const cachedJson=new Map<string,Promise<unknown>>();
const cachedTexture=new Map<string,Promise<THREE.Texture>>();
function getJson<T>(name:string):Promise<T>{
  if(!cachedJson.has(name))cachedJson.set(name,fetch(base+name).then(r=>{if(!r.ok)throw Error('Missing Houkou file '+name);return r.json();}));
  return cachedJson.get(name) as Promise<T>;
}
function texture(name:string):Promise<THREE.Texture>{
  if(!cachedTexture.has(name))cachedTexture.set(name,new THREE.TextureLoader().loadAsync(base+name).then(t=>{
    t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;
    t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=false;return t;
  }));
  return cachedTexture.get(name)!;
}
function setUvs(geo:THREE.BoxGeometry,uv:Cube['uv'],width:number,height:number){
  if(!uv||Array.isArray(uv))return;
  const attribute=geo.getAttribute('uv') as THREE.BufferAttribute;
  const sides=['east','west','up','down','south','north'];
  for(let side=0;side<6;side++){
    const face=uv[sides[side]];if(!face)continue;
    const [u,v]=face.uv,[sizeU,sizeV]=face.uv_size;
    const u0=u/width,u1=(u+sizeU)/width;
    const v0=1-v/height,v1=1-(v+sizeV)/height;
    const offset=side*4;
    attribute.setXY(offset,u1,v0);
    attribute.setXY(offset+1,u0,v0);
    attribute.setXY(offset+2,u1,v1);
    attribute.setXY(offset+3,u0,v1);
  }
  attribute.needsUpdate=true;
}
function makeGeometry(cube:Cube,pivot:number[],width:number,height:number){
  const [w,h,d]=cube.size.map(x=>Math.max(.008,x/PIXELS));
  const geo=new THREE.BoxGeometry(w,h,d);
  setUvs(geo,cube.uv,width,height);
  const center=cube.origin.map((x,i)=>(x+cube.size[i]*.5-pivot[i])/PIXELS);
  if(cube.rotation?.some(v=>v!==0)){
    const cp=cube.pivot||pivot;
    const rotationPivot=new THREE.Vector3(...cp.map((v,i)=>(v-pivot[i])/PIXELS));
    const transform=new THREE.Matrix4().makeTranslation(...center as [number,number,number]);
    const r=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(cube.rotation[0]),THREE.MathUtils.degToRad(-cube.rotation[1]),THREE.MathUtils.degToRad(-cube.rotation[2])
    ));
    const toPivot=new THREE.Matrix4().makeTranslation(-rotationPivot.x,-rotationPivot.y,-rotationPivot.z);
    const fromPivot=new THREE.Matrix4().makeTranslation(rotationPivot.x,rotationPivot.y,rotationPivot.z);
    geo.applyMatrix4(fromPivot.multiply(r).multiply(toPivot).multiply(transform));
  }else geo.translate(center[0],center[1],center[2]);
  return geo;
}
function makeGroup(json:GeometryJSON,atlas:THREE.Texture){
  const root=new THREE.Group();
  const g=json['minecraft:geometry']?.[0];
  if(!g?.bones?.length)throw Error('Invalid Houkou Bedrock model');
  const bones=new Map<string,THREE.Group>();
  const pivotMap=new Map<string,number[]>();
  const positions=new Map<string,THREE.Vector3>();
  const rotations=new Map<string,THREE.Euler>();
  const width=g.description?.texture_width||32,height=g.description?.texture_height||32;
  for(const data of g.bones){
    const node=new THREE.Group();node.name=data.name;
    const pivot=data.pivot||[0,0,0];
    const parentPivot=pivotMap.get(data.parent||'')||[0,0,0];
    node.position.set((pivot[0]-parentPivot[0])/PIXELS,(pivot[1]-parentPivot[1])/PIXELS,(pivot[2]-parentPivot[2])/PIXELS);
    if(data.rotation)node.rotation.set(...data.rotation.map(v=>THREE.MathUtils.degToRad(v)) as [number,number,number]);
    const geometries=data.cubes?.map(c=>makeGeometry(c,pivot,width,height))||[];
    if(geometries.length){
      const geometry=geometries.length===1?geometries[0]:mergeGeometries(geometries,false);
      if(geometry){
        if(geometries.length!==1)geometries.forEach(geo=>geo.dispose());
        const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({map:atlas,transparent:true,alphaTest:.02,side:THREE.DoubleSide}));
        mesh.castShadow=false;mesh.receiveShadow=false;node.add(mesh);
      }
    }
    (bones.get(data.parent||'')||root).add(node);
    bones.set(data.name,node);pivotMap.set(data.name,pivot);
    positions.set(data.name,node.position.clone());rotations.set(data.name,node.rotation.clone());
  }
  return {root,bones,positions,rotations};
}
type ModelPayload={json:GeometryJSON;atlas:THREE.Texture;normal:AnimationJSON;ultimate:AnimationJSON};
let payload:Promise<ModelPayload>|null=null;
function loadPayload():Promise<ModelPayload>{
  return payload??=Promise.all([
    getJson<GeometryJSON>('houkou.json'),texture('bladetexture2.png'),
    getJson<AnimationJSON>('normal_attack.json'),getJson<AnimationJSON>('ultimate_animation.json')
  ]).then(([json,atlas,normal,ultimate])=>({json,atlas,normal,ultimate}));
}
function disposeParts(target:THREE.Object3D){
  target.traverse(o=>{if(o instanceof THREE.Mesh){
    o.geometry.dispose();
    const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());
  }});
}
/** Hot-swaps a generic model with the original uploaded model when loaded. */
export function attachHoukouModel(target:THREE.Group){
  void loadPayload().then(({json,atlas,normal,ultimate})=>{
    if(target.userData.disposed)return;
    const model=makeGroup(json,atlas);
    for(const child of [...target.children]){disposeParts(child);target.remove(child);}
    target.add(model.root);
    delete target.userData.voxelParts;
    target.userData.houkouRig={...model,normal,ultimate} satisfies HoukouRig;
  }).catch(error=>console.warn('Houkou assets unavailable:',error));
}
function sample(node:Record<string,number[]>|undefined,t:number):number[]|null{
  if(!node)return null;
  const values=Object.entries(node).map(([time,v])=>[Number(time),v] as const).sort((a,b)=>a[0]-b[0]);
  if(!values.length)return null;
  const a=values.findLast(([when])=>when<=t)||values[0];
  const b=values.find(([when])=>when>=t)||values[values.length-1];
  const fraction=a[0]===b[0]?0:Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
  return a[1].map((n,i)=>n+(b[1][i]-n)*fraction);
}
export function poseHoukouModel(group:THREE.Group,p:{attackAnimAt:number;attackAnimLength:number;ultimateAnimAt:number},tick:number){
  const rig=group.userData.houkouRig as HoukouRig|undefined;if(!rig)return;
  const ultTime=(tick-p.ultimateAnimAt)/30,attackTime=(tick-p.attackAnimAt)/30;
  const which=ultTime>=0&&ultTime<=.75?rig.ultimate:
    attackTime>=0&&attackTime<1?rig.normal:null;
  const clip=which&&Object.values(which.animations)[0];
  const time=which===rig.normal?Math.min(attackTime,p.attackAnimLength):ultTime;
  for(const [name,bone] of rig.bones){
    bone.position.copy(rig.positions.get(name)!);
    bone.rotation.copy(rig.rotations.get(name)!);
    const animated=clip?.bones[name];if(!animated)continue;
    const rotation=sample(animated.rotation,time),position=sample(animated.position,time);
    if(rotation)bone.rotation.set(...rotation.map(v=>THREE.MathUtils.degToRad(v)) as [number,number,number]);
    if(position)bone.position.add(new THREE.Vector3(...position.map(v=>v/PIXELS) as [number,number,number]));
  }
}
export function attachHoukouFx(target:THREE.Group,kind:'slash'|'warning_line'){
  void Promise.all([getJson<GeometryJSON>(kind+'.json'),texture('texture.png')]).then(([json,atlas])=>{
    if(target.userData.disposed)return;
    const model=makeGroup(json,atlas);
    target.add(model.root);
  }).catch(error=>console.warn('Houkou effect unavailable:',error));
}
