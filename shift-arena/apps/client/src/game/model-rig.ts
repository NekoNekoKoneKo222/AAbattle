import * as THREE from 'three';
import type { PlayerModel, ModelKeyframe } from '@shift/shared';

export interface ModelRig { group:THREE.Group; bones:Map<string,{group:THREE.Group;base:[number,number,number];position:[number,number,number]}>; model:PlayerModel; }
const radians=(degrees:number)=>THREE.MathUtils.degToRad(degrees);

export function createModelRig(model:PlayerModel):ModelRig{
  const group=new THREE.Group(),bones=new Map<string,{group:THREE.Group;base:[number,number,number];position:[number,number,number]}>();
  for(const bone of model.bones){const pivot=new THREE.Group();pivot.name=bone.name;pivot.userData.boneName=bone.name;bones.set(bone.name,{group:pivot,base:bone.rotation,position:[0,0,0]});}
  for(const bone of model.bones){const pivot=bones.get(bone.name)!.group,parent=model.bones.find(b=>b.name===bone.parent);const position:[number,number,number]=[(bone.pivot[0]-(parent?.pivot[0]||0))/16,(bone.pivot[1]-(parent?.pivot[1]||0))/16,(bone.pivot[2]-(parent?.pivot[2]||0))/16];pivot.position.set(...position);bones.get(bone.name)!.position=position;pivot.rotation.set(...bone.rotation.map(radians) as [number,number,number]);(parent?bones.get(parent.name)!.group:group).add(pivot);
    bone.cubes.forEach((cube,index)=>{const geometry=new THREE.BoxGeometry(cube.size[0]/16,cube.size[1]/16,cube.size[2]/16),material=new THREE.MeshStandardMaterial({color:cube.color,roughness:.7,metalness:.08});const mesh=new THREE.Mesh(geometry,material);mesh.position.set((cube.origin[0]+cube.size[0]/2-bone.pivot[0])/16,(cube.origin[1]+cube.size[1]/2-bone.pivot[1])/16,(cube.origin[2]+cube.size[2]/2-bone.pivot[2])/16);mesh.castShadow=true;mesh.userData={boneName:bone.name,cubeIndex:index};pivot.add(mesh);});
  }
  return {group,bones,model};
}
function channelAt(frames:ModelKeyframe[],time:number,channel:'rotation'|'position'|'scale',fallback:[number,number,number]):[number,number,number]{const usable=frames.filter(f=>f[channel]);if(!usable.length)return fallback;if(time<=usable[0].time)return usable[0][channel]!;for(let i=1;i<usable.length;i++)if(time<=usable[i].time){const a=usable[i-1],b=usable[i],f=(time-a.time)/Math.max(.0001,b.time-a.time);return a[channel]!.map((v,k)=>v+(b[channel]![k]-v)*f) as [number,number,number];}return usable[usable.length-1][channel]!;}
export function poseModelRig(rig:ModelRig,time:number|null,kind:'attack'|'skill'='attack'){const clip=rig.model[kind];for(const [name,entry] of rig.bones){const frames=time===null?[]:clip.bones[name]||[],at=Math.min(time??0,clip.length),rotation=channelAt(frames,at,'rotation',[0,0,0]),position=channelAt(frames,at,'position',[0,0,0]),scale=channelAt(frames,at,'scale',[1,1,1]);entry.group.rotation.set(radians(entry.base[0]+rotation[0]),radians(entry.base[1]+rotation[1]),radians(entry.base[2]+rotation[2]));entry.group.position.set(entry.position[0]+position[0]/16,entry.position[1]+position[1]/16,entry.position[2]+position[2]/16);entry.group.scale.set(...scale);}}
export function disposeModelRig(rig:ModelRig){rig.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(object.material as THREE.Material).dispose();}});}
