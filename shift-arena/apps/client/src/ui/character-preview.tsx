import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { characterById } from '@shift/shared';
import { createVoxelHero, poseVoxelHero } from '../game/voxel-heroes';

export function CharacterPreview({id,skin}:{id:string;skin?:'skin'|'master_skin'|'sun_skin'|null}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const element=host.current;
    if(!element)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{return;}
    renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    element.append(renderer.domElement);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(35,1,.1,30);
    camera.position.set(2.6,2.5,5.3);
    camera.lookAt(0,1.1,0);
    scene.add(new THREE.HemisphereLight(0xffffff,0x405569,2.8));
    const light=new THREE.DirectionalLight(0xffffff,3);
    light.position.set(3,7,6);scene.add(light);
    const hero=createVoxelHero(characterById(id).id,skin);
    scene.add(hero);
    const ring=new THREE.Mesh(
      new THREE.TorusGeometry(.73,.055,6,36),
      new THREE.MeshBasicMaterial({color:characterById(id).color,transparent:true,opacity:.85})
    );
    ring.rotation.x=Math.PI/2;ring.position.y=.03;scene.add(ring);
    const resize=()=>{
      const w=Math.max(1,element.clientWidth||220),h=Math.max(1,element.clientHeight||220);
      camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
    };
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
    observer?.observe(element);resize();
    let frame=0;
    let alive=true;
    const draw=()=>{
      if(!alive)return;
      const now=performance.now()/1000;
      hero.rotation.y=Math.sin(now*.43)*.20;
      hero.position.y=Math.sin(now*2)*.025;
      poseVoxelHero(hero,now,.35,false,false);
      renderer.render(scene,camera);
      frame=requestAnimationFrame(draw);
    };
    draw();
    return()=>{
      alive=false;cancelAnimationFrame(frame);observer?.disconnect();
      scene.traverse(object=>{
        if(object instanceof THREE.Mesh){
          object.geometry.dispose();
          const materials=Array.isArray(object.material)?object.material:[object.material];
          materials.forEach(material=>material.dispose());
        }
      });
      renderer.dispose();renderer.domElement.remove();
    };
  },[id,skin]);
  return <div ref={host} className="character-preview" aria-label={characterById(id).name+'の3Dプレビュー'}/>;
}
