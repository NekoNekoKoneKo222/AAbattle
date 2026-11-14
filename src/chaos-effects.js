const handlers=new Map();
const contexts=new WeakMap();

export function registerEffectHandler(type,id,run,priority=0){
  const entries=handlers.get(type)||[];
  if(entries.some(entry=>entry.id===id))throw new Error(`Duplicate effect handler: ${id}`);
  entries.push({id,run,priority});
  entries.sort((a,b)=>b.priority-a.priority);
  handlers.set(type,entries);
}

export function createEffectEngine(state,registry=handlers,maxEvents=32){
  const queue=[],handled=new Set();
  let sequence=0,processed=0,active=null,draining=false,guardLogged=false;
  state.effectEvents=[];
  const guard=message=>{if(!guardLogged){state.log.push(message);guardLogged=true;}};
  function emit(type,payload={}){
    if(typeof type!=='string'||!type.startsWith('ON_'))throw new Error('Invalid effect event');
    if(active?.path.includes(type)){guard(`効果の循環を防止: ${type}`);return null;}
    if(processed+queue.length>=maxEvents){guard('効果の連鎖上限に達したため、後続の効果を停止');return null;}
    const event={id:++sequence,type,payload,path:[...(active?.path||[]),type]};
    queue.push(event);
    if(draining)return event.id;
    draining=true;
    try{
      while(queue.length){
        const current=queue.shift();
        if(processed>=maxEvents){guard('効果の連鎖上限に達したため、後続の効果を停止');break;}
        processed++;
        state.effectEvents.push({id:current.id,type:current.type});
        active=current;
        for(const handler of registry.get(current.type)||[]){
          const key=`${current.id}:${handler.id}`;
          if(handled.has(key))continue;
          handled.add(key);
          handler.run(state,current.payload,emit);
        }
      }
    }finally{active=null;draining=false;}
    return event.id;
  }
  return {emit};
}

export function beginEffectAction(state){const engine=createEffectEngine(state);contexts.set(state,engine);return engine;}
export function emitEffect(state,type,payload){let engine=contexts.get(state);if(!engine)engine=beginEffectAction(state);return engine.emit(type,payload);}
