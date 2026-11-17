import { randomUUID, randomBytes } from 'node:crypto';
import { newGame, applyAction, cpuAction, legalActions, view } from './chaos-shogi.js';
import { cpuCardAction, DEFAULT_DECK, canActivate, validateDeck } from './chaos-cards.js';

export const BOSS_CATALOG=Object.freeze({
  rookie:{id:'rookie',name:'暴走する歩兵王',maxHp:36,difficulty:'easy',maxTurns:20,rewards:{coins:150,shards:20},description:'歩兵を集めて突撃する初心者向けボス'},
  guardian:{id:'guardian',name:'鉄壁の守護者',maxHp:60,difficulty:'normal',maxTurns:24,rewards:{coins:300,shards:60},description:'守りを固め、定期的に兵を補充するボス'},
  nightmare:{id:'nightmare',name:'深淵の王将',maxHp:90,difficulty:'hard',maxTurns:28,rewards:{coins:550,shards:120},description:'定期的に味方の駒を凍結する高難度ボス'}
});

const error=(status,message)=>Object.assign(new Error(message),{status});
const code=()=>randomBytes(4).toString('hex').toUpperCase();
const validAction=a=>a&&typeof a==='object'&&['move','drop','card','activate','resign'].includes(a.kind);
const countEnemy=s=>s.board.filter(p=>p?.side==='w').length;
const materialDamage=(before,after,action)=>{
  const difference=Math.max(0,countEnemy(before)-countEnemy(after));
  // Damage is awarded only when a boss piece is captured or removed by an actual board action.
  const captured=action.kind==='move'&&before.board[action.to]?.side==='w';
  return Math.min(30,difference*6+(captured?3:0));
};

// A boss is an actual server-authoritative CHAOS SHOGI opponent.
// A duo controls the same player side and deck, alternating after each completed turn.
export function createChaosBoss({collection}={}){
  const rooms=new Map();
  const oneRoom=id=>[...rooms.values()].find(room=>room.players.some(p=>p.id===id)&&Date.now()-room.createdAt<24*60*60*1000);
  const getRoom=(code,userId)=>{const room=rooms.get(String(code||'').toUpperCase());if(!room||!room.players.some(p=>p.id===userId))throw error(404,'参加中のボス部屋がありません。');return room;};
  function active(room){return room.players[room.activeIndex%room.players.length];}
  function summary(room,userId){
    const s=room.game;
    const game=s?view(s):null;
    if(game){
      game.cards.currentHand=[...s.cards.b.hand];
      game.cards.activeSlots=s.cards.b.equipment.map((_,i)=>canActivate(s,'b',i));
      if(room.status!=='playing'||s.turn!=='b'||active(room)?.id!==userId)game.legal=[];
      game.boss={roomCode:room.code,bossId:room.bossId,name:BOSS_CATALOG[room.bossId].name,hp:room.hp,maxHp:room.maxHp,activeUserId:active(room)?.id,players:room.players,turns:room.turns,maxTurns:BOSS_CATALOG[room.bossId].maxTurns};
    }
    return {code:room.code,bossId:room.bossId,boss:BOSS_CATALOG[room.bossId],players:room.players,hostId:room.hostId,status:room.status,revision:s?.revision??0,hp:room.hp,maxHp:room.maxHp,turns:room.turns,activeUserId:room.status==='playing'?active(room)?.id:null,game,completed:room.completed,startedAt:room.startedAt};
  }
  function finish(room,won,reason){
    room.status=won?'cleared':'lost';
    const s=room.game;
    s.status='finished';s.winner=won?'b':'w';s.reason=reason;s.log.push(reason);
    if(won)room.hp=0;
    s.revision++;
    room.completed=true;
  }
  function bossSpecial(room){
    const s=room.game;
    if(room.bossId==='guardian'&&room.turns%3===0){
      s.hands.w.P=Math.min(18,s.hands.w.P+1);
      s.log.push('鉄壁の守護者：歩兵を1体補充');
    }
    if(room.bossId==='nightmare'&&room.turns%2===0){
      const pawn=s.board.find(p=>p?.side==='b'&&p.type==='P');
      if(pawn){pawn.frozenUntil=Math.max(pawn.frozenUntil||0,s.cards.b.turnSerial+2);s.log.push('深淵の王将：味方の歩が凍結した');}
      s.cards.w.cp=Math.min(10,s.cards.w.cp+2);
    }
  }
  function bossTurn(room){
    let state=room.game;
    if(state.turn!=='w'||state.status!=='playing')return;
    bossSpecial(room);
    for(let i=0;i<10&&state.turn==='w'&&state.status==='playing';i++){
      let action=null;
      if(!state.cards.w.cardPlayed&&(room.bossId!=='rookie'||Math.random()<.2))action=cpuCardAction(state);
      if(action)try{state=applyAction(state,action);continue;}catch{ /* card not legal: use normal legal move */ }
      action=cpuAction(state,BOSS_CATALOG[room.bossId].difficulty);
      if(!action){room.game=state;finish(room,true,'ボスが指せる手を失った');return;}
      state=applyAction(state,action);
    }
    room.game=state;
    if(state.turn==='w'&&state.status==='playing'){
      // A safety net for unusual multi-move effects. Never hand control to humans
      // while it is technically still the boss turn.
      for(let i=0;i<10&&state.turn==='w'&&state.status==='playing';i++){
        const action=legalActions(state)[0];
        if(!action){room.game=state;finish(room,true,'ボスが指せる手を失った');return;}
        state=applyAction(state,action);
      }
      room.game=state;
    }
  }
  async function rewards(room){
    if(room.status!=='cleared'||!collection)return;
    if(room.rewardPromise)return room.rewardPromise;
    room.rewardPromise=Promise.all(room.players.map(p=>collection.rewardBoss(p.id,{runId:room.id,bossId:room.bossId,players:room.players.length})))
      .then(result=>{room.rewarded=true;return result;})
      .catch(err=>{room.rewardPromise=null;throw err;});
    return room.rewardPromise;
  }
  function checkDeadline(room){
    if(room.status==='playing'&&(Date.now()-room.startedAt>12*60000||room.turns>=BOSS_CATALOG[room.bossId].maxTurns))finish(room,false,'ボス戦の制限時間・手数に到達');
  }
  return {
    catalog:BOSS_CATALOG,
    mine:id=>{const room=oneRoom(id);if(room)checkDeadline(room);return room?summary(room,id):null;},
    room:(roomCode,id)=>{const room=getRoom(roomCode,id);checkDeadline(room);return summary(room,id);},
    async create(user,bossId,deck){
      if(oneRoom(user.id))throw error(409,'すでにボス部屋に参加しています。');
      if(!Object.hasOwn(BOSS_CATALOG,bossId))throw error(400,'存在しないボスです。');
      const profile=await collection?.profile(user.id);
      const chosen=validateDeck(deck??profile?.decks?.[0]?.cards??DEFAULT_DECK);
      if(collection)await collection.checkOwned(user.id,chosen);
      let invite;do{invite=code();}while(rooms.has(invite));
      const room={id:'boss-'+randomUUID(),code:invite,hostId:user.id,bossId,players:[{id:user.id,username:user.username}],deck:chosen,status:'lobby',createdAt:Date.now(),startedAt:null,game:null,activeIndex:0,hp:BOSS_CATALOG[bossId].maxHp,maxHp:BOSS_CATALOG[bossId].maxHp,turns:0,completed:false,rewarded:false,rewardPromise:null};
      rooms.set(invite,room);return summary(room,user.id);
    },
    join(roomCode,user){
      const room=rooms.get(String(roomCode||'').toUpperCase());
      if(!room)throw error(404,'ボス部屋がありません。');
      if(room.status!=='lobby')throw error(409,'開始済みのボス部屋です。');
      if(oneRoom(user.id)&&oneRoom(user.id)!==room)throw error(409,'他のボス部屋に参加中です。');
      if(!room.players.some(p=>p.id===user.id)){
        if(room.players.length>=2)throw error(409,'ボス戦は最大2人まで参加できます。');
        room.players.push({id:user.id,username:user.username});
      }
      return summary(room,user.id);
    },
    async start(roomCode,user){
      const room=getRoom(roomCode,user.id);
      if(room.hostId!==user.id)throw error(403,'ホストのみ開始できます。');
      if(room.status!=='lobby')throw error(409,'すでに開始済みです。');
      const s=newGame({cpu:true,minutes:12,decks:{b:room.deck},cpuDifficulty:BOSS_CATALOG[room.bossId].difficulty});
      s.onlineMode='boss';s.bossId=room.bossId;
      // Owner of the shared deck provides its allowed card collection. Teammates
      // may play the shared cards but unlocks are looked up per acting account.
      s.awakened={b:[],w:[]};s.ultimate={b:[],w:[]};
      room.game=s;room.status='playing';room.startedAt=Date.now();
      return summary(room,user.id);
    },
    async act(roomCode,user,revision,action){
      const room=getRoom(roomCode,user.id);checkDeadline(room);
      if(room.status!=='playing')throw error(409,'ボス戦は対局中ではありません。');
      if(active(room)?.id!==user.id)throw error(403,'仲間の手番です。');
      if(room.game.revision!==revision)throw error(409,'盤面が更新されました。');
      if(room.game.turn!=='b')throw error(409,'ボスの行動中です。');
      if(!validAction(action))throw error(400,'未対応の行動です。');
      if(room.actionPending)throw error(409,'前の行動を処理しています。');
      room.actionPending=true;
      try{
      if(action.kind==='resign'){
        finish(room,false,'ボス戦を棄権した');
        return summary(room,user.id);
      }
      const profile=await collection?.profile(user.id);
      // Set per-player unlocks for the shared deck before resolving the action.
      const before=room.game;
      const unlocked=new Set(profile?.awakened||[]);
      const nextInput={...before,awakened:{...before.awakened,b:[...unlocked]},ultimate:{...before.ultimate,b:(profile?.ultimate||[]).filter(id=>unlocked.has(id))}};
      let next;
      try{next=applyAction(nextInput,action);}catch(err){throw error(400,err.message);}
      room.game=next;
      const damage=materialDamage(before,next,action);
      if(damage){
        room.hp=Math.max(0,room.hp-damage);
        next.log.push(BOSS_CATALOG[room.bossId].name+'に'+damage+'ダメージ！ 残りHP '+room.hp);
      }
      if(room.hp<=0&&next.status==='playing')finish(room,true,'ボスのHPを0にした');
      else if(next.status==='finished'){room.status=next.winner==='b'?'cleared':'lost';room.completed=true;if(room.status==='cleared')room.hp=0;}
      if(room.status==='playing'&&next.turn==='w'){
        room.turns++;
        bossTurn(room);
        if(room.game.status==='finished'){room.status=room.game.winner==='b'?'cleared':'lost';room.completed=true;if(room.status==='cleared')room.hp=0;}
        else {room.activeIndex=(room.activeIndex+1)%room.players.length;checkDeadline(room);}
      }
      if(room.status==='cleared')await rewards(room);
      return summary(room,user.id);
      }finally{room.actionPending=false;}
    },
    async get(roomCode,user){const room=getRoom(roomCode,user.id);checkDeadline(room);if(room.status==='cleared'&&!room.rewarded)await rewards(room);return summary(room,user.id);},
    leave(roomCode,user){
      const room=getRoom(roomCode,user.id);
      if(room.status==='playing')throw error(409,'対局中は退出できません。棄権するか終了までプレイしてください。');
      room.players=room.players.filter(p=>p.id!==user.id);
      if(!room.players.length)rooms.delete(room.code);
      else if(room.hostId===user.id)room.hostId=room.players[0].id;
      return {ok:true};
    },
    _test:{rooms}
  };
}

export function registerChaosBossRoutes(router,{collection}={}){
  const boss=createChaosBoss({collection});
  const send=fn=>async(req,res)=>{try{const result=await fn(req);res.set('Cache-Control','no-store').json(result);}catch(e){res.status(e.status||400).json({error:e.message});}};
  const actor=req=>req.chaosUser;
  router.get('/boss/catalog',send(()=>({bosses:Object.values(boss.catalog)})));
  router.get('/boss/me',send(req=>({room:boss.mine(actor(req).id)})));
  router.post('/boss/rooms',send(req=>boss.create(actor(req),req.body?.bossId,req.body?.deck)));
  router.post('/boss/rooms/:code/join',send(req=>boss.join(req.params.code,actor(req))));
  router.post('/boss/rooms/:code/start',send(req=>boss.start(req.params.code,actor(req))));
  router.get('/boss/rooms/:code',send(req=>boss.get(req.params.code,actor(req))));
  router.post('/boss/rooms/:code/actions',send(req=>boss.act(req.params.code,actor(req),req.body?.revision,req.body?.action)));
  router.post('/boss/rooms/:code/leave',send(req=>boss.leave(req.params.code,actor(req))));
  return boss;
}
