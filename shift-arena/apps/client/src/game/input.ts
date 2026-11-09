import { characterById, neutral, type Fighter, type Input } from '@shift/shared';
export class InputController {
  private keys=new Set<string>();private mouseAttack=false;private mouseUltimate=false;private skillPulse=false;private ultimatePulse=false;private attackPulse=false;private moveX=0;private moveZ=0;private touchAimX=0;private touchAimZ=0;private touchAttack=false;private aimX=1;private aimZ=0;private handlers:(()=>void)[]=[];
  constructor(private canvas:HTMLCanvasElement,private player:()=>Fighter|undefined,private aimAt:(x:number,y:number,p:Fighter)=>[number,number],private autoFire:()=>boolean){
    const listen=<K extends keyof WindowEventMap>(target:Window|HTMLCanvasElement,type:K,fn:(event:WindowEventMap[K])=>void)=>{target.addEventListener(type,fn as EventListener);this.handlers.push(()=>target.removeEventListener(type,fn as EventListener));};
    listen(window,'keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE','Tab','Space'].includes(e.code))e.preventDefault();this.keys.add(e.code);if(e.code==='KeyE'&&!e.repeat)this.skillPulse=true;});
    listen(window,'keyup',e=>this.keys.delete(e.code));
    listen(window,'blur',()=>{this.keys.clear();this.mouseAttack=false;this.mouseUltimate=false;});
    listen(canvas,'mousemove',e=>{const p=this.player();if(p){[this.aimX,this.aimZ]=this.aimAt(e.clientX,e.clientY,p);}});
    listen(canvas,'mousedown',e=>{e.preventDefault();if(e.button===0)this.mouseAttack=true;if(e.button===2){this.mouseUltimate=true;if(characterById(this.player()?.character||'rei').ultimate.instant)this.ultimatePulse=true;}});
    listen(window,'mouseup',e=>{if(e.button===0)this.mouseAttack=false;if(e.button===2&&this.mouseUltimate){this.mouseUltimate=false;if(!characterById(this.player()?.character||'rei').ultimate.instant)this.ultimatePulse=true;}});
    listen(canvas,'contextmenu',e=>e.preventDefault());
  }
  setMove(x:number,z:number){this.moveX=x;this.moveZ=z;}
  setAttackStick(x:number,z:number,active:boolean){if(active){this.touchAimX=x;this.touchAimZ=z;this.touchAttack=true;}else{if(this.touchAttack)this.attackPulse=true;this.touchAttack=false;}}
  setSkill(){this.skillPulse=true;}
  setUltimate(){this.ultimatePulse=true;}
  read():Input{const keyboardX=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));const keyboardZ=Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))-Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'));const aimLength=Math.hypot(this.touchAimX,this.touchAimZ);if(aimLength>.2){this.aimX=this.touchAimX/aimLength;this.aimZ=this.touchAimZ/aimLength;}const result={...neutral,mx:keyboardX||this.moveX,mz:keyboardZ||this.moveZ,ax:this.aimX,az:this.aimZ,attack:this.mouseAttack||this.attackPulse||(this.touchAttack&&this.autoFire()),ultimate:this.ultimatePulse,skill:this.skillPulse};this.attackPulse=false;this.ultimatePulse=false;this.skillPulse=false;return result;}
  dispose(){for(const fn of this.handlers)fn();}
}

