import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { aimWallDistance, characterById, fighterMaxHp, validatePlayerModel, type Fighter, type GameState, type PlayerModel } from '@shift/shared';
import { createModelRig, poseModelRig, disposeModelRig, type ModelRig } from './model-rig';
import { createVoxelHero, poseVoxelHero, disposeVoxelHero } from './voxel-heroes';
export type Quality='auto'|'low'|'medium'|'high';
type Nameplate={root:HTMLDivElement;name:HTMLSpanElement;hp:HTMLSpanElement;fill:HTMLSpanElement;ammo:HTMLDivElement};
const mat=(color:number,roughness=.7)=>new THREE.MeshStandardMaterial({color,roughness,metalness:.15});
const floorMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9});
const projectileGeo=new THREE.SphereGeometry(.16,8,6);
const helper=new THREE.Object3D();
/** iPadOS may advertise Macintosh; touch count disambiguates it from desktop Macs. */
function isAppleTouchBrowser():boolean{
  if(typeof navigator==='undefined')return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)||
    (/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
}
export async function loadCharacterModel(url:string){return (await new GLTFLoader().loadAsync(url)).scene;}
function fighterMesh(p:Fighter,model:PlayerModel|null,lightweight=false){
  const c=characterById(p.character),group=new THREE.Group();
  group.userData.id=p.id;
  group.userData.character=p.character;
  group.userData.skin=p.skinChoice||null;
  group.userData.customModel=!!model;
  group.userData.lastAttackAt=p.attackAt;
  group.userData.lastSkillAt=p.skillAt;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.56,.06,5,28),new THREE.MeshBasicMaterial({color:p.team===0?0x37dff1:p.team===1?0xff728e:0xffc256}));
  ring.rotation.x=Math.PI/2;ring.position.y=.07;group.add(ring);
  const hpBack=new THREE.Mesh(new THREE.PlaneGeometry(1.18,.11),new THREE.MeshBasicMaterial({color:0x14202b,side:THREE.DoubleSide}));
  hpBack.position.set(0,2.42,0);hpBack.rotation.x=-.75;group.add(hpBack);
  const hpBar=new THREE.Mesh(new THREE.PlaneGeometry(1.12,.075),new THREE.MeshBasicMaterial({color:p.team===0?0x68e8fc:0xff7386,side:THREE.DoubleSide}));
  hpBar.position.set(0,2.43,.01);hpBar.rotation.x=-.75;hpBar.userData.hpBar=true;group.add(hpBar);
  if(model){
    const rig=createModelRig(model);group.add(rig.group);group.userData.modelRig=rig;
  }else{
    const voxel=createVoxelHero(c.id,p.skinChoice||null,lightweight);
    group.add(voxel);group.userData.voxelHero=voxel;
  }
  return group;
}
export class ArenaRenderer {
  isTouchDevice(){return this.appleTouch;}
  readonly canvas:HTMLCanvasElement; private renderer:THREE.WebGLRenderer; private scene=new THREE.Scene(); private camera=new THREE.OrthographicCamera(-8,8,5,-5,.1,100); private ground=new THREE.Group(); private signalGroup=new THREE.Group(); private signalMeshes=new Map<string,THREE.Group>(); private terminalRing:THREE.Mesh|null=null; private actors=new Map<string,THREE.Group>(); private modelDocs=new Map<string,PlayerModel|null>(); private modelLoading=new Set<string>(); private bullets=new Map<number,THREE.Mesh>(); private effects=new Map<number,THREE.Mesh>(); private ray=new THREE.Raycaster(); private plane=new THREE.Plane(new THREE.Vector3(0,1,0),0); private target=new THREE.Vector3(); private frame=0; private quality:Quality; private aimLine:THREE.Line; private aimTip:THREE.Mesh; private nameplateLayer:HTMLDivElement;private nameplates=new Map<string,Nameplate>();private projectPoint=new THREE.Vector3();
  private readonly appleTouch=isAppleTouchBrowser();private crowdMode=false;
  private readonly crowdDetail=new Map<string,boolean>();
  targetFrameMs(){return this.crowdMode?(this.appleTouch?33:26):(this.appleTouch?30:16);}
  private readonly projectileMaterials={
    blue:new THREE.MeshBasicMaterial({color:0x75f4ff,depthWrite:true,depthTest:true}),
    red:new THREE.MeshBasicMaterial({color:0xffa879,depthWrite:true,depthTest:true}),
  };
  private requestModel(owner:string){if(this.modelDocs.has(owner)||this.modelLoading.has(owner))return;this.modelLoading.add(owner);fetch(`/api/shift/model/${encodeURIComponent(owner)}`).then(r=>r.ok?r.json():{model:null}).then(data=>{this.modelDocs.set(owner,data.model?validatePlayerModel(data.model):null);}).catch(()=>this.modelDocs.set(owner,null)).finally(()=>this.modelLoading.delete(owner));}
  constructor(private host:HTMLElement,quality:Quality){this.quality=quality;this.renderer=new THREE.WebGLRenderer({
  antialias:quality==='high'&&!this.appleTouch,
  powerPreference:this.appleTouch?'default':'high-performance',
  alpha:false,stencil:false,preserveDrawingBuffer:false,
});
this.renderer.autoClear=false; // Exactly one explicit color/depth/stencil clear per frame.
this.renderer.setClearColor(0x14243b,1);this.canvas=this.renderer.domElement;this.canvas.className='arena-canvas';host.append(this.canvas);
 this.nameplateLayer=document.createElement('div');this.nameplateLayer.className='fighter-nameplate-layer';
 this.nameplateLayer.setAttribute('aria-hidden','true');host.appendChild(this.nameplateLayer);this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.desiredPixelRatio(quality)));
 this.renderer.shadowMap.enabled=quality==='high'&&!this.appleTouch&&!this.crowdMode;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.scene.background=new THREE.Color(0x14243b);this.scene.fog=new THREE.Fog(0x14243b,28,48);this.scene.add(new THREE.HemisphereLight(0xffffff,0x153e48,2.0));const sun=new THREE.DirectionalLight(0xffeed1,2.2);sun.position.set(8,18,11);sun.castShadow=this.renderer.shadowMap.enabled;this.scene.add(sun);this.scene.add(this.ground);this.scene.add(this.signalGroup);
  this.aimLine=new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(25*3),3)),new THREE.LineDashedMaterial({color:0xffedf2,dashSize:.31,gapSize:.15,transparent:true,opacity:.90,depthTest:false}));
  this.aimLine.computeLineDistances();this.aimLine.frustumCulled=false;this.aimLine.renderOrder=50;this.scene.add(this.aimLine);
  this.aimTip=new THREE.Mesh(new THREE.RingGeometry(.23,.34,28),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:.85}));
  this.aimTip.rotation.x=-Math.PI/2;this.aimTip.renderOrder=50;this.scene.add(this.aimTip);
  this.camera.position.set(18,22,29);this.camera.lookAt(18,0,13);this.resize();}
  private desiredPixelRatio(value:Quality){
    if(this.crowdMode)return this.appleTouch?.85:value==='high'?1.2:1;
    if(this.appleTouch)return value==='high'?1.25:value==='low'?.8:1;
    return value==='high'?1.5:value==='low'?.85:value==='medium'?1.1:1.2;
  }
  setQuality(value:Quality){
    this.quality=value;
    const dpr=Math.min(devicePixelRatio,this.desiredPixelRatio(value));
    if(Math.abs(this.renderer.getPixelRatio()-dpr)>.01){this.renderer.setPixelRatio(dpr);this.resize();}
    this.renderer.shadowMap.enabled=value==='high'&&!this.appleTouch&&!this.crowdMode;
  }
  resize(){const w=this.host.clientWidth||800,h=this.host.clientHeight||500,aspect=w/h,half=10.3;this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
  aim(clientX:number,clientY:number,origin:Fighter):[number,number,number]{const rect=this.canvas.getBoundingClientRect(),x=(clientX-rect.left)/rect.width*2-1,y=-(clientY-rect.top)/rect.height*2+1;this.ray.setFromCamera(new THREE.Vector2(x,y),this.camera);this.ray.ray.intersectPlane(this.plane,this.target);const dx=this.target.x-origin.x,dz=this.target.z-origin.z,d=Math.hypot(dx,dz)||1;return[dx/d,dz/d,Math.max(.12,Math.min(1,d/Math.max(.5,characterById(origin.character).attack.range)))];}
  /** Dispose stale map GPU resources. Group.clear() alone leaks WebGL memory. */
  private clearGround(){
    this.ground.traverse(object=>{
      if(!(object instanceof THREE.Mesh||object instanceof THREE.LineSegments))return;
      object.geometry.dispose();
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials)material.dispose();
    });
    this.ground.clear();
  }
  buildMap(g:GameState){
    const crowd=g.players.length>=8;
    if(crowd!==this.crowdMode){this.crowdMode=crowd;this.setQuality(this.quality);}
    this.clearGround();
    const map=g.map;
    this.renderer.setClearColor(map.theme,1);
    this.scene.background=new THREE.Color(map.theme);
    this.scene.fog=new THREE.Fog(map.theme,28,48);
    // Floor is only two draw calls, regardless of area.
    for(const [width,height,y,color] of [
      [map.width+3,map.height+3,-.47,map.theme],
      [map.width,map.height,-.17,map.ground]
    ]){
      const floor=new THREE.Mesh(new THREE.BoxGeometry(width,.3,height),
        new THREE.MeshLambertMaterial({color}));
      floor.position.set(map.width/2,y,map.height/2);this.ground.add(floor);
    }
    const grid=new THREE.GridHelper(Math.max(map.width,map.height),26,0xffffff,0xffffff);
    grid.position.set(map.width/2,.01,map.height/2);
    (grid.material as THREE.Material).transparent=true;
    (grid.material as THREE.Material).opacity=.10;this.ground.add(grid);

    // Hundreds of individual walls were hundreds of GPU draw calls AND leaked on
    // every destroyed wall. 3 batches draw all cover with only three draw calls.
    const wallColors:Record<string,number>={
      wall:map.id==='factory'?0x627493:0x8e9ea6,
      crate:0xc99365,ice:0x95dcff
    };
    for(const kind of ['wall','crate','ice'] as const){
      const items=map.walls.filter(w=>w.kind===kind);
      if(!items.length)continue;
      const batch=new THREE.InstancedMesh(
        new THREE.BoxGeometry(1,1,1),
        new THREE.MeshLambertMaterial({color:wallColors[kind]}),items.length);
      items.forEach((w,i)=>{
        const h=kind==='crate'?.9:1.35;
        helper.position.set(w.x,h/2,w.z);helper.rotation.set(0,0,0);
        helper.scale.set(w.w,h,w.h);helper.updateMatrix();batch.setMatrixAt(i,helper.matrix);
      });
      batch.instanceMatrix.needsUpdate=true;batch.frustumCulled=false;
      batch.castShadow=false;batch.receiveShadow=false;
      this.ground.add(batch);
    }
    // Each zone type is also one batch; bush tufts use a single batched mesh.
    const zoneColors:Record<string,number>={
      bush:0x59bc6c,speed:0x6adcf4,water:0x4ba0db,
      conveyor:0xf8ca64,slow:0x99dff9,heal:0x6bf5b8,
      danger:0xfa5c79,jump:0xffda7c
    };
    for(const kind of Object.keys(zoneColors)){
      const items=map.zones.filter(z=>z.kind===kind);
      if(!items.length)continue;
      const batch=new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1,1,.035,12),
        new THREE.MeshBasicMaterial({color:zoneColors[kind],transparent:true,opacity:kind==='bush'?.23:.44,depthWrite:false}),items.length);
      items.forEach((z,i)=>{
        helper.position.set(z.x,.03,z.z);helper.rotation.set(0,0,0);
        helper.scale.set(z.radius,1,z.radius);helper.updateMatrix();batch.setMatrixAt(i,helper.matrix);
      });
      batch.instanceMatrix.needsUpdate=true;batch.frustumCulled=false;
      this.ground.add(batch);
    }
    const bushes=map.zones.filter(z=>z.kind==='bush');
    const maxTufts=crowd?3:5;
    if(bushes.length){
      const leaves=new THREE.InstancedMesh(
        new THREE.ConeGeometry(.3,.9,4),
        new THREE.MeshLambertMaterial({color:0x59bc6c}),
        bushes.length*maxTufts);
      let index=0;
      for(const zone of bushes)for(let k=0;k<maxTufts;k++){
        const theta=k*2.399,r=zone.radius*(.27+(k%4)*.16);
        helper.position.set(zone.x+Math.cos(theta)*r,.4,zone.z+Math.sin(theta)*r);
        helper.rotation.set(0,theta,0);helper.scale.setScalar(1);helper.updateMatrix();
        leaves.setMatrixAt(index++,helper.matrix);
      }
      leaves.count=index;leaves.instanceMatrix.needsUpdate=true;
      leaves.frustumCulled=false;this.ground.add(leaves);
    }
    const foliageCount=crowd?100:map.width===50?170:220;
    const grass=new THREE.InstancedMesh(new THREE.ConeGeometry(.13,.3,3),
      new THREE.MeshLambertMaterial({color:map.id==='park'?0x8bc46e:map.id==='factory'?0x52a2a6:0x9776b1}),
      foliageCount);
    let count=0;
    for(let i=0;i<foliageCount*3&&count<foliageCount;i++){
      const x=.7+(i*9.73%(map.width-1.4)),z=.7+(i*5.39%(map.height-1.4));
      if(Math.hypot(x-map.goal[0],z-map.goal[1])<3||
        map.walls.some(w=>Math.abs(x-w.x)<w.w/2+.4&&Math.abs(z-w.z)<w.h/2+.4))continue;
      helper.position.set(x,.15,z);helper.rotation.set(0,i*2.1,0);
      helper.scale.setScalar(.5+(i%5)/6);helper.updateMatrix();grass.setMatrixAt(count++,helper.matrix);
    }
    grass.count=count;grass.instanceMatrix.needsUpdate=true;grass.frustumCulled=false;
    this.ground.add(grass);
    const plinth=new THREE.Mesh(new THREE.CylinderGeometry(1.45,1.65,.45,16),
      new THREE.MeshLambertMaterial({color:0x5c6a7c}));
    plinth.position.set(map.goal[0],.18,map.goal[1]);this.ground.add(plinth);
    const core=new THREE.Mesh(new THREE.CylinderGeometry(.73,.78,1.08,16),
      new THREE.MeshBasicMaterial({color:0x52dfff,transparent:true,opacity:.78}));
    core.position.set(map.goal[0],.92,map.goal[1]);this.ground.add(core);
    this.terminalRing=new THREE.Mesh(
      new THREE.RingGeometry(g.terminal.radius-.13,g.terminal.radius,32),
      new THREE.MeshBasicMaterial({color:0xf7dd83,side:THREE.DoubleSide,transparent:true,opacity:.8}));
    this.terminalRing.rotation.x=-Math.PI/2;
    this.terminalRing.position.set(g.terminal.x,.12,g.terminal.z);
    this.ground.add(this.terminalRing);
  }

  update(g:GameState,localId:string,signals:{kind:string;x:number;z:number;expiresAt:number}[]=[],aim?:[number,number],aiming=true,aimDistance=1){this.frame++;if(this.terminalRing){(this.terminalRing.material as THREE.MeshBasicMaterial).color.setHex(g.terminal.owner===0?0x4be5f4:g.terminal.owner===1?0xff637c:0xf7dd83);this.terminalRing.visible=g.shiftEnabled;this.terminalRing.rotation.z=this.frame*.002;}const activePins=new Set<string>();for(const s of signals)if(s.kind==='pin'&&s.expiresAt>Date.now()){const key=`${s.expiresAt}-${s.x}-${s.z}`;activePins.add(key);let marker=this.signalMeshes.get(key);if(!marker){marker=new THREE.Group();const cone=new THREE.Mesh(new THREE.ConeGeometry(.35,.8,6),new THREE.MeshBasicMaterial({color:0xf7ed6d}));cone.position.y=1.2;marker.add(cone);const ring=new THREE.Mesh(new THREE.RingGeometry(.5,.65,24),new THREE.MeshBasicMaterial({color:0xf7ed6d,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.12;marker.add(ring);marker.position.set(s.x,0,s.z);this.signalGroup.add(marker);this.signalMeshes.set(key,marker);}marker.children[0].position.y=1.2+Math.sin(this.frame*.1)*.2;}for(const[key,marker]of this.signalMeshes)if(!activePins.has(key)){this.signalGroup.remove(marker);marker.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.signalMeshes.delete(key);}const live=new Set<string>();for(const p of g.players){live.add(p.id);if(p.modelOwner)this.requestModel(p.modelOwner);const model=p.modelOwner?this.modelDocs.get(p.modelOwner)||null:null;let group=this.actors.get(p.id);if(group&&(group.userData.character!==p.character||group.userData.skin!==(p.skinChoice||null)||group.userData.customModel!==!!model)){this.scene.remove(group);const oldRig=group.userData.modelRig as ModelRig|undefined;if(oldRig)disposeModelRig(oldRig);if(group.userData.voxelHero)disposeVoxelHero(group.userData.voxelHero as THREE.Group);this.actors.delete(p.id);group=undefined;}if(!group){group=fighterMesh(p,model,this.appleTouch||this.crowdMode&&p.bot);this.scene.add(group);this.actors.set(p.id,group);}const rig=group.userData.modelRig as ModelRig|undefined;
      const now=performance.now();
      if(p.attackAt>group.userData.lastAttackAt)group.userData.attackStarted=now;
      if(p.skillAt>group.userData.lastSkillAt)group.userData.skillStarted=now;
      group.userData.lastAttackAt=p.attackAt;group.userData.lastSkillAt=p.skillAt;
      const skillElapsed=group.userData.skillStarted===undefined?null:(now-group.userData.skillStarted)/1000;
      const attackElapsed=group.userData.attackStarted===undefined?null:(now-group.userData.attackStarted)/1000;
      if(rig){
        if(skillElapsed!==null&&skillElapsed<=rig.model.skill.length)poseModelRig(rig,skillElapsed,'skill');
        else poseModelRig(rig,attackElapsed!==null&&attackElapsed<=rig.model.attack.length?attackElapsed:null,'attack');
      }
      const voxel=group.userData.voxelHero as THREE.Group|undefined;
      if(voxel)poseVoxelHero(voxel,now/1000,Math.hypot(p.vx,p.vz),attackElapsed!==null&&attackElapsed<.35,skillElapsed!==null&&skillElapsed<.5);
      const speed=Math.hypot(p.vx,p.vz),bob=p.hp>0?Math.sin(this.frame*.08+p.x)*Math.min(speed,5)*.013:0;group.visible=p.hp>0||g.mode!=='survival';// No visual slide after the movement stick is released.
      // Remotes retain brief network smoothing, but local position is exact.
      const renderY=p.hp>0?bob:-.35;
      if(p.id===localId)group.position.set(p.x,renderY,p.z);
      else group.position.lerp(new THREE.Vector3(p.x,renderY,p.z),.65);group.rotation.y=Math.atan2(p.ax,p.az);group.scale.setScalar(p.hp>0?1:.45);const opacity=p.invisible>0?.35:1;
      if(group.userData.lastOpacity!==opacity){
        group.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){o.material.transparent=opacity<1;o.material.opacity=opacity;}});
        group.userData.lastOpacity=opacity;
      }
      if(group.userData.lastHp!==p.hp){
        group.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.hpBar)o.scale.x=Math.max(.01,p.hp/fighterMaxHp(p));});
        group.userData.lastHp=p.hp;
      }}
    for(const [id,mesh] of this.actors)if(!live.has(id)){this.scene.remove(mesh);if(mesh.userData.modelRig)disposeModelRig(mesh.userData.modelRig as ModelRig);if(mesh.userData.voxelHero)disposeVoxelHero(mesh.userData.voxelHero as THREE.Group);this.actors.delete(id);}
    const bulletIds=new Set<number>();for(const b of g.bullets){bulletIds.add(b.id);let mesh=this.bullets.get(b.id);if(!mesh){mesh=new THREE.Mesh(projectileGeo,b.team===0?this.projectileMaterials.blue:this.projectileMaterials.red);mesh.castShadow=false;mesh.receiveShadow=false;this.scene.add(mesh);this.bullets.set(b.id,mesh);}const progress=b.lob&&b.flightTime?Math.max(0,Math.min(1,1-b.life/b.flightTime)):0;
    const distance=b.lob?Math.hypot((b.landX??0)-(b.launchX??0),(b.landZ??0)-(b.launchZ??0)):0;
    const maxDistance=b.lob?characterById(g.players.find(p=>p.id===b.owner)?.character||'bom').attack.range:1;
    const arcHeight=3.5-2.7*Math.max(0,Math.min(1,distance/maxDistance));
    mesh.position.set(b.x,.6+(b.lob?Math.sin(progress*Math.PI)*arcHeight:0),b.z);mesh.scale.setScalar(b.splash>0?1.7:1);}
    for(const[id,mesh]of this.bullets)if(!bulletIds.has(id)){this.scene.remove(mesh);this.bullets.delete(id);}
    const effectIds=new Set<number>();for(const e of g.effects){effectIds.add(e.id);let mesh=this.effects.get(e.id);if(!mesh){const color=e.kind==='slowfield'?0x9de1ff:e.kind==='drone'?0x7bffc3:e.kind==='bomb'||e.kind==='mine'?0xffbd6d:0xd8a6ff;mesh=new THREE.Mesh(new THREE.CylinderGeometry(e.radius,e.radius,.04,24),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.38,depthWrite:false}));this.scene.add(mesh);this.effects.set(e.id,mesh);}mesh.position.set(e.x,.1,e.z);}
    for(const[id,mesh]of this.effects)if(!effectIds.has(id)){
      this.scene.remove(mesh);mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();this.effects.delete(id);
    }
    const own=g.players.find(p=>p.id===localId)||g.players[0];if(own){const aspect=this.host.clientWidth/Math.max(1,this.host.clientHeight),visibleX=10.3*aspect,visibleZ=10.5;const x=THREE.MathUtils.clamp(own.x,Math.min(visibleX,g.map.width/2),Math.max(visibleX,g.map.width-visibleX)),z=THREE.MathUtils.clamp(own.z,Math.min(visibleZ,g.map.height/2),Math.max(visibleZ,g.map.height-visibleZ));const focus=new THREE.Vector3(x,0,z);this.camera.position.set(x,22,z+16);this.camera.lookAt(focus);}
    // Touch devices update DOM nameplates at half graphics framerate.
    // Combat and models still render at the normal framerate.
    if(!this.appleTouch||this.frame%2===0){
    // Screen-aligned player names, health text, and three/four ammo blocks.
    this.camera.updateMatrixWorld(true);
    const seen=new Set<string>(),canvasW=this.host.clientWidth,canvasH=this.host.clientHeight;
    for(const p of g.players){
      seen.add(p.id);
      let plate=this.nameplates.get(p.id);
      if(!plate){
        const root=document.createElement('div');root.className='fighter-nameplate';
        const name=document.createElement('span');name.className='fighter-nameplate-name';
        const hp=document.createElement('span');hp.className='fighter-nameplate-hp';
        const track=document.createElement('div');track.className='fighter-nameplate-track';
        const fill=document.createElement('span');fill.className='fighter-nameplate-fill';
        track.appendChild(fill);
        const ammo=document.createElement('div');ammo.className='fighter-nameplate-ammo';
        root.append(name,hp,track,ammo);root.style.left='0';root.style.top='0';this.nameplateLayer.appendChild(root);
        plate={root,name,hp,fill,ammo};this.nameplates.set(p.id,plate);
      }
      const point=this.projectPoint.set(p.x,2.75,p.z).project(this.camera);
      const onscreen=p.hp>0&&point.z>=-1&&point.z<=1&&Math.abs(point.x)<1.12&&Math.abs(point.y)<1.15;
      plate.root.style.display=onscreen?'flex':'none';
      if(!onscreen)continue;
      plate.root.style.transform='translate3d('+((point.x+1)*.5*canvasW).toFixed(1)+'px,'+((1-point.y)*.5*canvasH).toFixed(1)+'px,0) translate(-50%,-100%)';
      plate.root.classList.toggle('local',p.id===localId);
      plate.root.classList.toggle('allied',p.team===own?.team&&p.id!==localId);
      plate.name.textContent=p.name;
      plate.hp.textContent=String(Math.ceil(p.hp));
      plate.fill.style.width=(Math.max(0,p.hp/fighterMaxHp(p))*100).toFixed(1)+'%';
      const totalAmmo=characterById(p.character).ammo;
      if(plate.ammo.children.length!==totalAmmo){
        plate.ammo.replaceChildren(...Array.from({length:totalAmmo},()=>document.createElement('span')));
      }
      for(let i=0;i<totalAmmo;i++)plate.ammo.children[i].classList.toggle('loaded',i<p.ammo);
    }
    for(const [id,plate] of this.nameplates){
      if(!seen.has(id)){plate.root.remove();this.nameplates.delete(id);}
    }
    }
    // Visual-only shot direction preview; authoritative hits are still server-validated.
    if(own&&own.hp>0&&aiming){
      const config=characterById(own.character).attack;
      const dir=aim||[own.ax,own.az],length=Math.hypot(dir[0],dir[1])||1;
      const dx=dir[0]/length,dz=dir[1]/length;
      const selectedRange=config.kind==='lob'?config.range*Math.max(.12,Math.min(1,aimDistance)):config.range;
      let endX=THREE.MathUtils.clamp(own.x+dx*selectedRange,.6,g.map.width-.6),endZ=THREE.MathUtils.clamp(own.z+dz*selectedRange,.6,g.map.height-.6);
      if(config.kind!=='lob'){
        // Constant one-pass wall test instead of dozens of checks per frame.
        const clipped=aimWallDistance(g.map,own.x,own.z,dx,dz,selectedRange);
        endX=THREE.MathUtils.clamp(own.x+dx*clipped,.6,g.map.width-.6);
        endZ=THREE.MathUtils.clamp(own.z+dz*clipped,.6,g.map.height-.6);
      }
      const positions=this.aimLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      for(let i=0;i<25;i++){
        const t=i/24;
        const arcHeight=3.5-2.7*Math.max(.12,Math.min(1,aimDistance));
        positions.setXYZ(i,own.x+(endX-own.x)*t,.19+(config.kind==='lob'?Math.sin(Math.PI*t)*arcHeight:0),own.z+(endZ-own.z)*t);
      }
      positions.needsUpdate=true;
      // Preallocated preview vertices have a fixed length; no per-frame bounds recomputation.
      this.aimLine.computeLineDistances();this.aimLine.visible=true;
      this.aimTip.position.set(endX,.20,endZ);this.aimTip.scale.setScalar(config.kind==='lob'?Math.max(.45,config.splashRadius)/.34:1);this.aimTip.visible=true;
    }else{this.aimLine.visible=false;this.aimTip.visible=false;}
    // Safari/WebKit can display stale dark fragments when dynamic projectiles
    // are removed. Clear color and depth on EVERY rendered frame.
    this.renderer.setScissorTest(false);
    this.renderer.clear(true,true,true);
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.clearGround();for(const mesh of this.effects.values()){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}this.projectileMaterials.blue.dispose();this.projectileMaterials.red.dispose();this.aimLine.geometry.dispose();(this.aimLine.material as THREE.Material).dispose();this.aimTip.geometry.dispose();(this.aimTip.material as THREE.Material).dispose();this.renderer.dispose();this.canvas.remove();this.nameplateLayer.remove();this.nameplates.clear();for(const mesh of [...this.bullets.values(),...this.effects.values()])this.scene.remove(mesh);for(const mesh of this.actors.values()){if(mesh.userData.modelRig)disposeModelRig(mesh.userData.modelRig as ModelRig);if(mesh.userData.voxelHero)disposeVoxelHero(mesh.userData.voxelHero as THREE.Group);}this.actors.clear();}
}

