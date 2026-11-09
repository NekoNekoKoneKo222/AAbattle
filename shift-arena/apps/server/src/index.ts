import { randomBytes } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { Server, Room, type Client, type AuthContext } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createGame, sanitizeInput, stepGame, type GameState, type Input, type Slot, type Mode, type Difficulty } from '@shift/shared';

interface Guest { sessionId:string; name:string; character:string; team:number; ready:boolean; connected:boolean; accountId?:number; }
type Account={id:number;username:string}|null;
let resolveAccount:(cookie:string)=>Promise<Account>=async()=>null;
let activeRooms=0;
const modes:Mode[]=['core','deathmatch','duel','survival','payload'];
const difficulties:Difficulty[]=['easy','normal','hard','expert'];
const id=()=>randomBytes(3).toString('hex').toUpperCase();
const safeName=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,20):'GUEST';
const safeCharacter=(value:unknown)=>typeof value==='string'&&['rei','gald','jin','mina','bom','chrono','noise','frost'].includes(value)?value:'rei';
const safeMode=(value:unknown):Mode=>modes.includes(value as Mode)?value as Mode:'core';
const safeMap=(value:unknown)=>typeof value==='string'&&['park','factory','canyon'].includes(value)?value:'park';

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
  private resultSent=false;
  async onAuth(_client:Client,_options:unknown,context:AuthContext){const account=await resolveAccount(context.headers.get('cookie')||'');return {account};}
  onCreate(options:Record<string,unknown>){
    if(activeRooms>=24)throw new Error('現在ルームが満員です。');
    activeRooms++;
    this.roomId=id();
    this.mode=safeMode(options.mode);this.map=safeMap(options.map);
    this.difficulty=difficulties.includes(options.difficulty as Difficulty)?options.difficulty as Difficulty:'normal';
    this.shiftEnabled=options.shift!==false;
    this.maxClients=this.mode==='duel'?2:this.mode==='survival'||options.size===5?10:6;
    this.onMessage('select',(client,message:unknown)=>{const guest=this.guests.get(client.sessionId);if(!guest||!message||typeof message!=='object')return;guest.character=safeCharacter((message as Record<string,unknown>).character);this.lobby();});
    this.onMessage('ready',(client)=>{const guest=this.guests.get(client.sessionId);if(!guest)return;guest.ready=!guest.ready;this.lobby();});
    this.onMessage('start',(client)=>{if(this.clients[0]?.sessionId!==client.sessionId||this.guests.size<1)return;this.startGame();});
    this.onMessage('rematch',(client)=>{if(this.clients[0]?.sessionId===client.sessionId&&this.game?.winner!==null)this.startGame();});
    this.onMessage('sync',(client)=>{client.send('lobby',this.lobbyData());if(this.game)client.send('state',this.game);});
    this.onMessage('input',(client,message:unknown)=>{if(!this.game||this.game.winner!==null)return;const second=Math.floor(Date.now()/1000),rate=this.inputRate.get(client.sessionId)||{second,count:0};if(rate.second!==second){rate.second=second;rate.count=0;}if(++rate.count>40)return;this.inputRate.set(client.sessionId,rate);this.playerInputs[client.sessionId]=sanitizeInput(message);});
    this.setSimulationInterval(()=>{if(!this.game||this.game.winner!==null)return;stepGame(this.game,this.playerInputs);if(this.game.tick%2===0)this.broadcast('state',this.game);if(this.game.winner!==null&&!this.resultSent){this.resultSent=true;this.broadcast('result',this.game);}},1000/30);
    if(options.quick===true)this.clock.setTimeout(()=>{if(!this.game&&this.clients.length>0)this.startGame();},6000);
  }
  onJoin(client:Client,options:Record<string,unknown>,auth?:{account:Account}){
    let guest=this.guests.get(client.sessionId);
    if(!guest){const members=[...this.guests.values()];const team=this.mode==='survival'?2:members.filter(g=>g.team===0).length<=members.filter(g=>g.team===1).length?0:1;guest={sessionId:client.sessionId,name:auth?.account?.username||safeName(options.name),character:safeCharacter(options.character),team,ready:false,connected:true,accountId:auth?.account?.id};this.guests.set(client.sessionId,guest);}else guest.connected=true;
    this.lobby();if(this.game){const player=this.game.players.find(p=>p.id===client.sessionId);if(player)player.bot=false;client.send('state',this.game);}
  }
  async onLeave(client:Client,code?:number){const guest=this.guests.get(client.sessionId);if(guest)guest.connected=false;const player=this.game?.players.find(p=>p.id===client.sessionId);if(player)player.bot=true;this.lobby();if(code!==1000){try{await this.allowReconnection(client,20);if(guest){guest.connected=true;if(player)player.bot=false;this.lobby();}return;}catch{}}
    this.guests.delete(client.sessionId);delete this.playerInputs[client.sessionId];if(this.game){const player=this.game.players.find(p=>p.id===client.sessionId);if(player)player.bot=true;}this.lobby();}
  private lobbyData(){return {code:this.roomId,host:this.clients[0]?.sessionId||null,mode:this.mode,map:this.map,players:[...this.guests.values()]};}
  private lobby(){this.broadcast('lobby',this.lobbyData());}
  onDispose(){activeRooms=Math.max(0,activeRooms-1);}
  private startGame(){const slots:Slot[]=[...this.guests.values()].map(g=>({id:g.sessionId,name:g.name,character:g.character,team:g.team,bot:!g.connected}));this.game=createGame({mode:this.mode,map:this.map,difficulty:this.difficulty,shift:this.shiftEnabled,size:this.maxClients===10&&this.mode==='deathmatch'?5:3,slots});this.playerInputs={};this.resultSent=false;this.lock();this.broadcast('started',this.game);}
}

class RoutedTransport extends WebSocketTransport {
  constructor(server:HttpServer){super({noServer:true,pingInterval:0,maxPayload:2048,perMessageDeflate:false});this.server=server;}
  upgrade(req:IncomingMessage,socket:Duplex,head:Buffer){this.wss.handleUpgrade(req,socket,head,ws=>this.wss.emit('connection',ws,req));}
}
export function attachShiftArena(httpServer:HttpServer,accountResolver:(cookie:string)=>Promise<Account>=async()=>null){
  resolveAccount=accountResolver;
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

