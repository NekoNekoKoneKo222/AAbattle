import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import WebSocket from 'ws';
import {TILE,biomeAt} from '../glyph-infinity/shared/dist/index.js';
import {attachGlyphInfinity} from '../glyph-infinity/server/dist/index.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout=4000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('state timeout');await pause(20);}}
async function fixture(profile){
  const user={id:'town-player',username:'Town'};
  const server=http.createServer();
  const game=attachGlyphInfinity(async()=>({...profile}),async(_user,value)=>{profile={...value};});
  server.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,user));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`ws://127.0.0.1:${server.address().port}`;
  return {url,game,close:async()=>{await game.shutdown();await new Promise(resolve=>server.close(resolve));}};
}

test('a newer tab takes over without closing its own connection',async()=>{
  const f=await fixture({x:16,y:16,hp:100,xp:0,level:1,coins:0});
  const first=new WebSocket(f.url),old=[],newMessages=[];
  first.on('message',v=>old.push(JSON.parse(v.toString())));
  let second;
  try{
    await once(first,'open');await until(()=>old.some(v=>v.type==='state'));
    const closed=once(first,'close');
    second=new WebSocket(f.url);second.on('message',v=>newMessages.push(JSON.parse(v.toString())));
    await once(second,'open');
    const [code]=await closed;
    assert.equal(code,4000);
    await until(()=>newMessages.some(v=>v.type==='state'));
    await pause(250);
    assert.equal(second.readyState,WebSocket.OPEN);
  }finally{first.terminate();second?.terminate();await f.close();}
});

test('a short disconnect resumes the same abyss wave and accepts movement',async()=>{
  const f=await fixture({x:16,y:16,hp:100,xp:0,level:10,coins:0});
  let ws=new WebSocket(f.url),messages=[];
  const observe=socket=>socket.on('message',data=>messages.push(JSON.parse(data.toString())));
  observe(ws);
  try{
    await once(ws,'open');await until(()=>messages.some(v=>v.type==='state'));
    ws.send(JSON.stringify({type:'rpg:abyss'}));
    await until(()=>messages.some(v=>v.type==='state'&&v.dungeon===1));
    const before=messages.filter(v=>v.type==='state'&&v.dungeon===1).at(-1);
    const enemies=before.enemies.map(e=>[e.id,e.hp]);
    ws.close();await once(ws,'close');await pause(250);
    messages=[];ws=new WebSocket(f.url);observe(ws);
    await once(ws,'open');await until(()=>messages.some(v=>v.type==='state'&&v.dungeon===1));
    const resumed=messages.find(v=>v.type==='state'&&v.dungeon===1);
    assert.deepEqual(resumed.enemies.map(e=>[e.id,e.hp]),enemies);
    assert.equal(resumed.zone.includes('無限深淵'),true);
    const x=resumed.players[0].x;
    const move=setInterval(()=>ws.send(JSON.stringify({type:'input',x:1,y:0,aimX:1,aimY:0,attack:false,dash:false})),40);
    try{await until(()=>messages.some(v=>v.type==='state'&&v.dungeon===1&&v.players[0].x>x+8));}finally{clearInterval(move);}
  }finally{ws.terminate();await f.close();}
});

test('missing input does not leave a PvE player exposed to enemies',async()=>{
  const f=await fixture({x:310,y:16,hp:100,xp:0,level:1,coins:0});
  const ws=new WebSocket(f.url),states=[];
  ws.on('message',data=>{const value=JSON.parse(data.toString());if(value.type==='state')states.push(value);});
  try{
    await once(ws,'open');await until(()=>states.length>0);
    ws.send(JSON.stringify({type:'input',x:0,y:0,aimX:1,aimY:0,attack:false,dash:false}));
    await pause(900);const hp=states.at(-1).players[0].hp;
    await pause(2000);
    assert.equal(states.at(-1).players[0].hp,hp);
  }finally{ws.terminate();await f.close();}
});

test('world chat history remains available while its sender is disconnected',async()=>{
  const f=await fixture({x:16,y:16,hp:100,xp:0,level:1,coins:0});
  const ws=new WebSocket(f.url);
  try{
    await once(ws,'open');
    ws.send(JSON.stringify({type:'chat:world',message:'再接続後に読む発言'}));
    await until(()=>f.game.chatHistory().length===1);
    ws.close();await once(ws,'close');
    assert.deepEqual(f.game.chatHistory().map(v=>v.message),['再接続後に読む発言']);
  }finally{ws.terminate();await f.close();}
});

test('world enemies spawn outside town and cannot enter or hurt a player inside',async()=>{
  const f=await fixture({x:250,y:50,hp:100,xp:0,level:1,coins:0});
  const ws=new WebSocket(f.url),states=[];
  ws.on('message',v=>{const message=JSON.parse(v.toString());if(message.type==='state')states.push(message);});
  try{
    await once(ws,'open');await until(()=>states.length>0);
    assert.ok(states[0].enemies.filter(e=>e.kind!=='dummy').every(e=>biomeAt(Math.floor(e.x/TILE),Math.floor(e.y/TILE))!=='city'));
    await pause(2200);
    const latest=states.at(-1),player=latest.players.find(p=>p.id==='town-player');
    assert.equal(player.hp,100);
    assert.ok(latest.enemies.filter(e=>e.kind!=='dummy').every(e=>biomeAt(Math.floor(e.x/TILE),Math.floor(e.y/TILE))!=='city'));
  }finally{ws.terminate();await f.close();}
});

test('a pursuer stops at the town border when the player retreats inside',async()=>{
  const f=await fixture({x:310,y:16,hp:100,xp:0,level:1,coins:0});
  const ws=new WebSocket(f.url),states=[];
  ws.on('message',v=>{const message=JSON.parse(v.toString());if(message.type==='state')states.push(message);});
  try{
    await once(ws,'open');await until(()=>states.length>0);
    const move=setInterval(()=>ws.send(JSON.stringify({type:'input',x:-1,y:0,aimX:-1,aimY:0,attack:false,dash:false})),40);
    try{await until(()=>states.some(state=>state.players[0].x<260),3000);}finally{clearInterval(move);}
    const safe=states.at(-1),hp=safe.players[0].hp;
    await pause(1800);
    assert.equal(states.at(-1).players[0].hp,hp);
    assert.ok(states.at(-1).enemies.filter(e=>e.kind!=='dummy').every(e=>biomeAt(Math.floor(e.x/TILE),Math.floor(e.y/TILE))!=='city'));
  }finally{ws.terminate();await f.close();}
});
