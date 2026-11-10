import * as THREE from 'three';
import type { PlayerModel, ModelKeyframe } from '@shift/shared';

export interface ModelRig { group:THREE.Group; bones:Map<string,{group:THREE.Group;base:[number,number,number]}>; model:PlayerModel; }
const radians=(degrees:number)=>THREE.MathUtils.degToRad(degrees);

export function createModelRig(model:PlayerModel):ModelRig{
  const group=new THREE.Group(),bones=new Map<string,{group:THREE.Group;base:[number,number,number]}>();
  for(const bone of model.bones){const pivot=new THREE.Group();pivot.name=bone.name;pivot.userData.boneName=bone.name;bones.set(bone.name,{group:pivot,base:bone.rotation});}
  for(const bone of model.bones){const pivot=bones.get(bone.name)!.group,parent=model.bones.find(b=>b.name===bone.parent);pivot.position.set((bone.pivot[0]-(parent?.pivot[0]||0))/16,(bone.pivot[1]-(parent?.pivot[1]||0))/16,(bone.pivot[2]-(parent?.pivot[2]||0))/16);pivot.rotation.set(...bone.rotation.map(radians) as [number,number,number]);(parent?bones.get(parent.name)!.group:group).add(pivot);
    bone.cubes.forEach((cube,index)=>{const geometry=new THREE.BoxGeometry(cube.size[0]/16,cube.size[1]/16,cube.size[2]/16),material=new THREE.MeshStandardMaterial({color:cube.color,roughness:.7,metalness:.08});const mesh=new THREE.Mesh(geometry,material);mesh.position.set((cube.origin[0]+cube.size[0]/2-bone.pivot[0])/16,(cube.origin[1]+cube.size[1]/2-bone.pivot[1])/16,(cube.origin[2]+cube.size[2]/2-bone.pivot[2])/16);mesh.castShadow=true;mesh.userData={boneName:bone.name,cubeIndex:index};pivot.add(mesh);});
  }
  return {group,bones,model};
}
function rotationAt(frames:ModelKeyframe[],time:number):[number,number,number]{if(!frames.length)return[0,0,0];if(time<=frames[0].time)return frames[0].rotation;for(let i=1;i<frames.length;i++)if(time<=frames[i].time){const a=frames[i-1],b=frames[i],f=(time-a.time)/Math.max(.0001,b.time-a.time);return a.rotation.map((v,k)=>v+(b.rotation[k]-v)*f) as [number,number,number];}return frames[frames.length-1].rotation;}
export function poseModelRig(rig:ModelRig,time:number|null){for(const [name,entry] of rig.bones){const frames=rig.model.attack.bones[name]||[],offset=time===null?[0,0,0]:rotationAt(frames,Math.min(time,rig.model.attack.length));entry.group.rotation.set(radians(entry.base[0]+offset[0]),radians(entry.base[1]+offset[1]),radians(entry.base[2]+offset[2]));}}
export function disposeModelRig(rig:ModelRig){rig.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(object.material as THREE.Material).dispose();}});}
