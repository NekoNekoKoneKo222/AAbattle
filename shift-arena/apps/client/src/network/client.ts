import { Client, type Room } from '@colyseus/sdk';
import type { GameState, Input, Mode } from '@shift/shared';
export interface Lobby {code:string;host:string|null;mode:Mode;map:string;players:{sessionId:string;name:string;character:string;team:number;ready:boolean;connected:boolean;accountId?:number}[]}
type Callbacks={lobby:(lobby:Lobby)=>void;game:(game:GameState)=>void;result:(game:GameState)=>void;disconnect:(message:string)=>void;connected:(id:string)=>void};
export class ArenaConnection {
  private client:Client;room:Room|null=null;private reconnecting=false;
  constructor(private callbacks:Callbacks){const scheme=location.protocol==='https:'?'wss':'ws';this.client=new Client(`${scheme}://${location.host}/sam/colyseus`);}
  async connect(kind:'quick'|'create'|'join',options:Record<string,unknown>){
    const room=kind==='join'?await this.client.joinById(String(options.code||''),options):kind==='create'?await this.client.create('shift',options):await this.client.joinOrCreate('shift',options);
    this.bind(room);room.send('sync');return room;
  }
  private bind(room:Room){this.room=room;this.callbacks.connected(room.sessionId);room.onMessage('lobby',(value:Lobby)=>this.callbacks.lobby(value));room.onMessage('started',(value:GameState)=>this.callbacks.game(value));room.onMessage('state',(value:GameState)=>this.callbacks.game(value));room.onMessage('result',(value:GameState)=>this.callbacks.result(value));room.onLeave(async(code)=>{if(code===1000||this.reconnecting)return;this.reconnecting=true;this.callbacks.disconnect('接続が切れました。再接続中…');const token=room.reconnectionToken;for(let attempt=0;attempt<5;attempt++){try{const next=await this.client.reconnect(token);this.reconnecting=false;this.bind(next);next.send('sync');return;}catch{await new Promise(resolve=>setTimeout(resolve,2000));}}this.reconnecting=false;this.callbacks.disconnect('再接続できませんでした。ホームに戻ってください。');});}
  send(type:string,message:unknown={}){this.room?.send(type,message);}
  input(value:Input){this.send('input',value);}
  leave(){this.room?.leave();this.room=null;}
}

