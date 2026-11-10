import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { Server, Room, type Client, type AuthContext } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createGame, registerShiftVote, sanitizeInput, stepGame, type GameState, type Input, type Slot, type Mode, type Difficulty, type ShiftKind } from '@shift/shared';

interface Guest { sessionId:string; name:string; character:string; team:number; ready:boolean; connected:boolean; accountId?:string; account?:NonNullable<Account>; owned:string[]; loadouts:Record<string,{skill:string;passive:string}>; skins:Record<string,'skin'|'master_skin'|null>; inputCount:number; }
type Account={id:string;username:string}|null;
type Profile={owned_characters:string[];selected_character:string;loadouts:Record<string,{skill:string;passive:string}>;mastery?:Record<string,{claimed:string[];equipped_skin?:'skin'|'master_skin'|null}>};
type Services={profile:(user:NonNullable<Account>)=>Promise<Profile>;award:(user:NonNullable<Account>,result:{matchId:string;character:string;won:boolean;source:string;seconds:number;kills:number;objective:number;ultimates:number;hits:number;terminal:number})=>Promise<unknown>;presence?:(id:string,event:'connect'|'disconnect'|'playing'|'idle')=>void;sameParty?:(a:string,b:string)=>boolean};
let resolveAccount:(cookie:string)=>Promise<Account>=async()=>null;
let services:Services|null=null;
let activeRooms=0;
const activeAccounts=new Map<string,string>();
const modes:Mode[]=['core','deathmatch','duel','survival','payload'];
const difficulties:Difficulty[]=['easy','normal','hard','expert'];
const id=()=>randomBytes(3).toString('hex').toUpperCase();
const safeName=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,20):'GUEST';
const safeCharacter=(value:unknown)=>typeof value==='string'&&['rei','gald','jin','mina','bom','chrono','noise','frost'].includes(value)?value:'rei';
const safeMode=(value:unknown):Mode=>modes.includes(value as Mode)?value as Mode:'core';
const safeMap=(value:unknown)=>typeof value==='string'&&['park','factory','canyon'].includes(value)?value:'park';
const pinLabels:Record<string,string>={enemy:'敵発見！',gather:'ここに集合！',attack:'攻撃しよう！',retreat:'撤退！',help:'助けて！',ultimate:'必殺技準備完了！'};
const chatLabels:Record<string,string>={nice:'ナイス！',thanks:'ありがとう！',sorry:'ごめん！',hello:'よろしく！',roger:'了解！'};
export function classifyRewardSource(source:string,participants:{accountId?:string;team:number;connected:boolean}[]){if(source!=='online')return source;const teams=new Set(participants.filter(p=>p.accountId&&p.connected).map(p=>p.team));return teams.has(0)&&teams.has(1)?'online':'solo';}

export class ShiftRoom extends Room {
  maxClients=6;
  private guests=new Map<string,Guest>();
  private playerInputs:Record<string,Input>={};
  private game:GameState|null=null;
  private mode:Mode='core';
  private map='park';
  private difficulty:Difficulty='normal';
  private shiftEnabled=true;
  private inputRate=new Map<string,{second:number;count:number}>();
  private signalRate=new Map<string,number[]>();
  private resultSent=false;
  private matchId='';
  private source='private';
  private rewardSource='private';
  private metrics=new Map<string,{hits:number;ultimates:number;terminal:number}>();
  async onAuth(_client:Client,_options:unknown,context:AuthContext){const account=await resolveAccount(context.headers.get('cookie')||'');return {account};}
  onCreate(options:Record<string,unknown>){
    if(activeRooms>=24)throw new Error('現在ルームが満員です。');
    activeRooms++;
    this.roomId=id();
    this.mode=safeMode(options.mode);this.map=safeMap(options.map);
    this.difficulty=difficulties.includes(options.difficulty as Difficulty)?options.difficulty as Difficulty:'normal';
    this.shiftEnabled=options.shift!==false;
    this.source=options.solo===true?'solo':options.quick===true?'online':'private';
    if(this.source!=='online')this.setPrivate();
    this.maxClients=this.source==='solo'?1:this.mode==='duel'?2:this.mode==='survival'||options.size===5?10:6;
    this.onMessage('select',(client,message:unknown)=>{const guest=this.guests.get(client.sessionId);if(!guest||this.game||!message||typeof message!=='object')return;const character=safeCharacter((message as Record<string,unknown>).character);if(!guest.owned.includes(character))return;guest.character=character;this.lobby();});
    this.onMessage('ready',(client)=>{const guest=this.guests.get(client.sessionId);if(!guest)return;guest.ready=!guest.ready;this.lobby();});
    this.onMessage('start',(client)=>{if(this.clients[0]?.sessionId!==client.sessionId||this.guests.size<1)return;this.startGame();});
    this.onMessage('rematch',(client)=>{if(this.clients[0]?.sessionId===client.sessionId&&this.game?.winner!==null)this.startGame();});
    this.onMessage('sync',(client)=>{client.send('lobby',this.lobbyData());if(this.game)client.send('state',this.game);});
    this.onMessage('vote',(client,message:unknown)=>{if(!this.game||typeof message!=='string')return;if(registerShiftVote(this.game,client.sessionId,message as ShiftKind))this.broadcast('state',this.game);});
    this.onMessage('signal',(client,message:unknown)=>{if(!this.game||!message||typeof message!=='object')return;const guest=this.guests.get(client.sessionId);if(!guest)return;const value=message as Record<string,unknown>,id=typeof value.id==='string'?value.id:'',kind=value.kind==='chat'?'chat':'pin',label=(kind==='chat'?chatLabels:pinLabels)[id];if(!label)return;const now=Date.now(),recent=(this.signalRate.get(client.sessionId)||[]).filter(t=>t>now-10000);if(recent.length>=3)return;recent.push(now);this.signalRate.set(client.sessionId,recent);const x=typeof value.x==='number'&&Number.isFinite(value.x)?Math.max(0,Math.min(this.game.map.width,value.x)):this.game.terminal.x,z=typeof value.z==='number'&&Number.isFinite(value.z)?Math.max(0,Math.min(this.game.map.height,value.z)):this.game.terminal.z;const signal={kind,id,label,x,z,from:guest.name,team:guest.team,expiresAt:now+4500};for(const peer of this.clients)if(this.guests.get(peer.sessionId)?.team===guest.team)peer.send('signal',signal);});
    this.onMessage('input',(client,message:unknown)=>{if(!this.game||this.game.winner!==null)return;const second=Math.floor(Date.now()/1000),rate=this.inputRate.get(client.sessionId)||{second,count:0};if(rate.second!==second){rate.second=second;rate.count=0;}if(++rate.count>40)return;this.inputRate.set(client.sessionId,rate);this.playerInputs[client.sessionId]=sanitizeInput(message);const guest=this.guests.get(client.sessionId);if(guest)guest.inputCount++;});
    this.setSimulationInterval(()=>{if(!this.game||this.game.winner!==null)return;stepGame(this.game,this.playerInputs);for(const e of this.game.events){if(!['hit','ultimate','terminal'].includes(e.kind))continue;const metric=e.owner?this.metrics.get(e.owner):null;if(metric)metric[e.kind==='hit'?'hits':e.kind==='terminal'?'terminal':'ultimates']++;}if(this.game.tick%2===0)this.broadcast('state',this.game);if(this.game.winner!==null&&!this.resultSent){this.resultSent=true;this.broadcast('result',this.game);for(const guest of this.guests.values())if(guest.accountId)services?.presence?.(guest.accountId,'idle');void this.awardResults();}},1000/30);
    if(options.quick===true)this.clock.setTimeout(()=>{if(!this.game&&this.clients.length>0)this.startGame();},6000);
  }
  async onJoin(client:Client,options:Record<string,unknown>,auth?:{account:Account}){
    let guest=this.guests.get(client.sessionId);
    if(!guest){const account=auth?.account||null;if(account&&activeAccounts.has(account.id)&&activeAccounts.get(account.id)!==this.roomId)throw new Error('別の試合に参加中です。');const profile=account&&services?await services.profile(account):null;const owned=profile?.owned_characters||['rei'];const requested=safeCharacter(options.character);const character=owned.includes(requested)?requested:profile?.selected_character||'rei';const skins:Guest['skins']=Object.fromEntries(Object.entries(profile?.mastery||{}).map(([id,m])=>[id,m.equipped_skin&&m.claimed.includes(m.equipped_skin)?m.equipped_skin:null]));const members=[...this.guests.values()];const partyTeam=account&&members.find(g=>g.accountId&&services?.sameParty?.(account.id,g.accountId));const team=this.mode==='survival'?2:partyTeam?partyTeam.team:members.filter(g=>g.team===0).length<=members.filter(g=>g.team===1).length?0:1;if(members.filter(g=>g.team===team).length>=(this.maxClients/2))throw new Error('このチームは満員です。');guest={sessionId:client.sessionId,name:account?.username||safeName(options.name),character,team,ready:false,connected:true,accountId:account?.id,account:account||undefined,owned,loadouts:profile?.loadouts||{},skins,inputCount:0};this.guests.set(client.sessionId,guest);if(account){activeAccounts.set(account.id,this.roomId);services?.presence?.(account.id,'connect');}}else guest.connected=true;
    this.lobby();if(this.game){const player=this.game.players.find(p=>p.id===client.sessionId);if(player)player.bot=false;client.send('state',this.game);}
  }
  async onLeave(client:Client,code?:number){const guest=this.guests.get(client.sessionId);if(guest)guest.connected=false;const player=this.game?.players.find(p=>p.id===client.sessionId);if(player)player.bot=true;this.lobby();if(code!==1000){try{await this.allowReconnection(client,20);if(guest){guest.connected=true;if(player)player.bot=false;this.lobby();}return;}catch{}}
    this.guests.delete(client.sessionId);if(guest?.accountId){activeAccounts.delete(guest.accountId);services?.presence?.(guest.accountId,'disconnect');}delete this.playerInputs[client.sessionId];if(this.game){const player=this.game.players.find(p=>p.id===client.sessionId);if(player)player.bot=true;}this.lobby();}
  private lobbyData(){return {code:this.roomId,host:this.clients[0]?.sessionId||null,mode:this.mode,map:this.map,players:[...this.guests.values()].map(({sessionId,name,character,team,ready,connected,accountId})=>({sessionId,name,character,team,ready,connected,accountId}))};}
  private lobby(){this.broadcast('lobby',this.lobbyData());}
  onDispose(){activeRooms=Math.max(0,activeRooms-1);for(const guest of this.guests.values())if(guest.accountId){activeAccounts.delete(guest.accountId);services?.presence?.(guest.accountId,'disconnect');}}
  private startGame(){const slots:Slot[]=[...this.guests.values()].map(g=>({id:g.sessionId,name:g.name,character:g.character,team:g.team,bot:!g.connected,loadout:g.loadouts[g.character],skinChoice:g.skins[g.character],modelOwner:g.accountId}));this.rewardSource=classifyRewardSource(this.source,[...this.guests.values()]);this.game=createGame({mode:this.mode,map:this.map,difficulty:this.difficulty,shift:this.shiftEnabled,size:this.maxClients===10&&this.mode==='deathmatch'?5:3,slots});this.matchId=randomUUID();this.metrics=new Map(slots.map(s=>[s.id,{hits:0,ultimates:0,terminal:0}]));for(const g of this.guests.values()){g.inputCount=0;if(g.accountId)services?.presence?.(g.accountId,'playing');}this.playerInputs={};this.resultSent=false;this.lock();this.broadcast('started',this.game);}
  private async awardResults(){if(!this.game||!services)return;const game=this.game;for(const guest of this.guests.values()){if(!guest.account||guest.inputCount<30)continue;const p=game.players.find(v=>v.id===guest.sessionId);if(!p)continue;const metric=this.metrics.get(p.id)||{hits:0,ultimates:0,terminal:0};try{const reward=await services.award(guest.account,{matchId:this.matchId,character:p.character,won:game.winner===p.team,source:this.rewardSource,seconds:game.tick/30,kills:p.kills,objective:p.objective,ultimates:metric.ultimates,hits:metric.hits,terminal:metric.terminal});this.clients.find(c=>c.sessionId===guest.sessionId)?.send('reward',reward);}catch(error){console.error('SHIFT ARENA reward failed',error);}}}
}

class RoutedTransport extends WebSocketTransport {
  constructor(server:HttpServer){super({noServer:true,pingInterval:0,maxPayload:2048,perMessageDeflate:false});this.server=server;}
  upgrade(req:IncomingMessage,socket:Duplex,head:Buffer){this.wss.handleUpgrade(req,socket,head,ws=>this.wss.emit('connection',ws,req));}
}
export function attachShiftArena(httpServer:HttpServer,accountResolver:(cookie:string)=>Promise<Account>=async()=>null,progression:Services|null=null){
  resolveAccount=accountResolver;
  services=progression;
  const originalRequests=httpServer.listeners('request') as ((req:IncomingMessage,res:import('node:http').ServerResponse)=>void)[];
  const transport=new RoutedTransport(httpServer);
  const server=new Server({transport,greet:false});
  server.define('shift',ShiftRoom);
  return {listen:async(port:number)=>{
    await server.listen(port,'0.0.0.0');
    const colyseusRequests=httpServer.listeners('request').filter(listener=>!originalRequests.includes(listener as typeof originalRequests[number])) as typeof originalRequests;
    httpServer.removeAllListeners('request');
    httpServer.on('request',(req,res)=>{
      if(req.url?.startsWith('/sam/colyseus/')){
        req.url=req.url.slice('/sam/colyseus'.length);
        for(const listener of colyseusRequests)listener.call(httpServer,req,res);
      }else for(const listener of originalRequests)listener.call(httpServer,req,res);
    });
  },upgrade:(req:IncomingMessage,socket:Duplex,head:Buffer)=>transport.upgrade(req,socket,head),shutdown:()=>server.gracefullyShutdown(false)};
}

