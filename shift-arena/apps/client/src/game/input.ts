import { neutral, type Fighter, type Input } from '@shift/shared';

export class InputController {
  private keys=new Set<string>();
  private mouseAttack=false;private mouseAttackPulse=false;
  private mouseUltimate=false;
  private skillPulse=false;
  private ultimatePulse=false;
  private attackPulse=false;
  private autoAimPulse=false;
  private autoUltimatePulse=false;
  private moveX=0;
  private moveZ=0;
  private attackActive=false;
  private ultimateActive=false;
  private attackAim:[number,number,number]=[1,0,1];
  private ultimateAim:[number,number,number]=[1,0,1];
  private aimX=1;private aimZ=0;private lastAimDistance=1;
  private lastPointerAim=0;private overdrivePulse=false;
  private handlers:(()=>void)[]=[];

  constructor(private canvas:HTMLCanvasElement,
    private player:()=>Fighter|undefined,
    private aimAt:(x:number,y:number,p:Fighter)=>[number,number,number],
    private autoFire:()=>boolean){
    const listen=<K extends keyof WindowEventMap>(target:Window|HTMLCanvasElement,type:K,fn:(e:WindowEventMap[K])=>void)=>{
      target.addEventListener(type,fn as EventListener);
      this.handlers.push(()=>target.removeEventListener(type,fn as EventListener));
    };
    listen(window,'keydown',e=>{
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE','KeyF','Tab','Space'].includes(e.code))e.preventDefault();
      this.keys.add(e.code);
      if(e.code==='KeyE'&&!e.repeat)this.skillPulse=true;
      if(e.code==='KeyF'&&!e.repeat)this.overdrivePulse=true;
    });
    listen(window,'keyup',e=>this.keys.delete(e.code));
    listen(window,'blur',()=>this.stopAll());
    const hidden=()=>{if(document.hidden)this.stopAll();};
    document.addEventListener('visibilitychange',hidden);
    this.handlers.push(()=>document.removeEventListener('visibilitychange',hidden));
    listen(canvas,'mousemove',e=>{
      const p=this.player();if(!p)return;
      const [x,z,dist]=this.aimAt(e.clientX,e.clientY,p);
      this.aimX=x;this.aimZ=z;this.lastAimDistance=dist;
      this.lastPointerAim=performance.now();
    });
    listen(canvas,'mousedown',e=>{
      e.preventDefault();
      if(e.button===0){this.mouseAttack=true;if(this.player()?.character!=='houkou')this.mouseAttackPulse=true;}
      if(e.button===2)this.mouseUltimate=true;
    });
    listen(window,'mouseup',e=>{
      if(e.button===0){if(this.mouseAttack&&this.player()?.character==='houkou')this.attackPulse=true;this.mouseAttack=false;}
      if(e.button===2&&this.mouseUltimate){this.mouseUltimate=false;this.ultimatePulse=true;}
    });
    listen(canvas,'contextmenu',e=>e.preventDefault());
  }
  private stopAll(){
    this.keys.clear();this.moveX=0;this.moveZ=0;
    this.mouseAttack=false;this.mouseUltimate=false;this.mouseAttackPulse=false;
    this.attackActive=false;this.ultimateActive=false;
    this.attackPulse=false;this.ultimatePulse=false;
    this.autoAimPulse=false;this.autoUltimatePulse=false;
  }
  setMove(x:number,z:number){this.moveX=x;this.moveZ=z;}
  setAttackStick(x:number,z:number,active:boolean,strength=1,tap=false,cancelled=false){
    if(active){
      this.attackActive=true;
      if(Math.hypot(x,z)>.12){
        this.attackAim=[x,z,Math.max(.12,Math.min(1,strength))];
        this.aimX=x;this.aimZ=z;this.lastAimDistance=this.attackAim[2];
      }
    }else{
      if(this.attackActive&&!cancelled){
        this.attackPulse=true;this.autoAimPulse=tap;
        if(!tap){this.aimX=this.attackAim[0];this.aimZ=this.attackAim[1];this.lastAimDistance=this.attackAim[2];}
      }
      this.attackActive=false;
    }
  }
  setUltimateStick(x:number,z:number,active:boolean,strength=1,tap=false,cancelled=false){
    if(active){
      this.ultimateActive=true;
      if(Math.hypot(x,z)>.12){
        this.ultimateAim=[x,z,Math.max(.12,Math.min(1,strength))];
        this.aimX=x;this.aimZ=z;this.lastAimDistance=this.ultimateAim[2];
      }
    }else{
      if(this.ultimateActive&&!cancelled){
        this.ultimatePulse=true;this.autoUltimatePulse=tap;
        if(!tap){this.aimX=this.ultimateAim[0];this.aimZ=this.ultimateAim[1];this.lastAimDistance=this.ultimateAim[2];}
      }
      this.ultimateActive=false;
    }
  }
  setSkill(){this.skillPulse=true;}
  setUltimate(){this.ultimatePulse=true;}
  setOverdrive(){this.overdrivePulse=true;}
  peekAimDistance(){return this.lastAimDistance;}
  aiming(){return this.attackActive||this.ultimateActive||this.mouseAttack||this.mouseUltimate||performance.now()-this.lastPointerAim<1300;}
  peekAim():[number,number]{return [this.aimX,this.aimZ];}
  read():Input{
    const keyboardX=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
    const keyboardZ=Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))-Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'));
    const result:Input={...neutral,
      mx:Math.max(-1,Math.min(1,keyboardX+this.moveX)),
      mz:Math.max(-1,Math.min(1,keyboardZ+this.moveZ)),
      ax:this.aimX,az:this.aimZ,
      attack:this.attackPulse||this.mouseAttackPulse||(this.mouseAttack&&this.player()?.character!=='houkou'&&this.autoFire()),
      attackHeld:this.player()?.character==='houkou'&&(this.attackActive||this.mouseAttack),
      autoAim:this.autoAimPulse,
      ultimate:this.ultimatePulse,autoUltimate:this.autoUltimatePulse,
      skill:this.skillPulse,overdrive:this.overdrivePulse,
      aimDistance:this.lastAimDistance,
    };
    this.attackPulse=false;this.mouseAttackPulse=false;this.autoAimPulse=false;
    this.ultimatePulse=false;this.autoUltimatePulse=false;
    this.skillPulse=false;this.overdrivePulse=false;
    return result;
  }
  dispose(){this.stopAll();for(const fn of this.handlers)fn();this.handlers=[];}
}
