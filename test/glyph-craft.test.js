import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { canStand, compileSkill, compileWeapon, starterCraft } from '../glyph-infinity/shared/dist/index.js';
import { attachGlyphInfinity } from '../glyph-infinity/server/dist/index.js';
import { GlyphStore } from '../src/glyph-store.js';

const skill=()=>({id:'',name:'氷の爆風',glyph:'❄',nodes:[
  {id:'a',kind:'trigger',part:'cast',x:10,y:10},
  {id:'b',kind:'shape',part:'circle',x:190,y:10},
  {id:'c',kind:'element',part:'ice',x:370,y:10},
  {id:'d',kind:'condition',part:'on_hit',x:550,y:10},
  {id:'e',kind:'effect',part:'explosion',x:730,y:10}
],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'d'},{from:'d',to:'e'}]});
const weapon=()=>({id:'',name:'試作ガンブレード',primary:'sword',secondary:'gun',material:'iron',element:'neutral',special:'none',glyph:'♜'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout=2000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('Timed out waiting for game state');await pause(20);}}

test('skill graph validates paths, cycles, budgets, and non-code parts',()=>{
  const program=compileSkill(skill());
  assert.equal(program.shape,'circle');assert.equal(program.element,'ice');
  assert.deepEqual(program.effects[0].guards,['on_hit']);
  assert.ok(program.stats.ep>0&&program.stats.cooldownMs>0&&program.stats.budget<=100);
  const cycle=skill();cycle.edges.push({from:'e',to:'b'});
  assert.throws(()=>compileSkill(cycle),/循環/);
  const injected=skill();injected.nodes[4].part='eval(process.env)';
  assert.throws(()=>compileSkill(injected),/未対応/);
  const expensive={...skill(),nodes:[{id:'a',kind:'trigger',part:'cast',x:10,y:10},{id:'b',kind:'shape',part:'laser',x:100,y:10},{id:'c',kind:'element',part:'lightning',x:190,y:10},...[0,1,2,3].map(i=>({id:`x${i}`,kind:'effect',part:'explosion',x:280+i*120,y:10}))],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'x0'},{from:'x0',to:'x1'},{from:'x1',to:'x2'},{from:'x2',to:'x3'}]};
  assert.throws(()=>compileSkill(expensive),/予算100/);
  const huge=skill();huge.nodes.push({id:'f',kind:'modifier',part:'multishot',x:40,y:200},{id:'g',kind:'modifier',part:'power',x:220,y:200},{id:'h',kind:'shape',part:'laser',x:400,y:200});
  huge.edges.push({from:'e',to:'f'},{from:'f',to:'g'},{from:'g',to:'h'});
  assert.throws(()=>compileSkill(huge));
});

test('hybrid weapon has bounded stats and material cost',()=>{
  const {stats}=compileWeapon(weapon());
  assert.equal(stats.mode,'melee');assert.equal(stats.rarity,'UNCOMMON');
  assert.ok(stats.cost.iron>=2&&stats.cost.wood>=2);
  assert.throws(()=>compileWeapon({...weapon(),glyph:'<script>'}),/表示文字/);
});

test('craft, equip, cast, parry, and test arena are authoritative and persistent',async()=>{
  const user={id:'crafter',username:'Crafter'},store=new GlyphStore(null);
  const httpServer=http.createServer();
  const game=attachGlyphInfinity(u=>store.load(u),(u,p)=>store.save(u,p),u=>store.loadCraft(u),(u,c)=>store.saveCraft(u,c));
  httpServer.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,user));
  httpServer.listen(0,'127.0.0.1');await once(httpServer,'listening');
  const url=`ws://127.0.0.1:${httpServer.address().port}`,messages=[];
  let ws=new WebSocket(url);
  const record=m=>messages.push(JSON.parse(m.toString()));
  ws.on('message',record);
  try{
    await once(ws,'open');await until(()=>messages.some(m=>m.type==='craft:state'));
    ws.send(JSON.stringify({type:'craft:save-skill',skill:skill()}));
    await until(()=>messages.some(m=>m.type==='craft:state'&&m.craft.skills.length===1));
    const saved=messages.findLast(m=>m.type==='craft:state').craft;
    assert.match(saved.skills[0].id,/^[0-9a-f-]{36}$/);
    await pause(220);
    ws.send(JSON.stringify({type:'craft:equip-skill',slot:0,id:saved.skills[0].id}));
    await until(()=>messages.some(m=>m.type==='craft:state'&&m.craft.equippedSkills[0]===saved.skills[0].id));
    ws.send(JSON.stringify({type:'cast',slot:0}));
    await until(()=>messages.some(m=>m.type==='state'&&m.ep<100));
    await pause(220);
    ws.send(JSON.stringify({type:'craft:make-weapon',weapon:weapon()}));
    await until(()=>messages.some(m=>m.type==='craft:state'&&m.craft.weapons.length===1));
    const crafted=messages.findLast(m=>m.type==='craft:state').craft;
    assert.ok(crafted.materials.iron<4);
    await pause(220);
    ws.send(JSON.stringify({type:'craft:equip-weapon',id:crafted.weapons[0].id}));
    await until(()=>messages.some(m=>m.type==='state'&&m.weaponGlyph==='♜'&&messages.some(v=>v.type==='craft:state'&&v.craft.equippedWeaponId===crafted.weapons[0].id)));
    ws.send(JSON.stringify({type:'parry'}));
    await until(()=>messages.some(m=>m.type==='state'&&m.parryUntil>m.time));
    ws.send(JSON.stringify({type:'arena',enter:true}));
    await until(()=>messages.some(m=>m.type==='state'&&m.players[0].x<-400&&m.players[0].y>300));
    assert.ok(messages.some(m=>m.type==='state'&&m.enemies.some(e=>e.kind==='dummy')));
    ws.close();await once(ws,'close');await pause(30);
    const stored=await store.loadCraft(user);assert.equal(stored.skills.length,1);assert.equal(stored.weapons.length,1);assert.equal(stored.equippedSkills[0],stored.skills[0].id);
  }finally{
    if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
    await game.shutdown();await new Promise(resolve=>httpServer.close(resolve));
  }
});

test('a crafted skill really damages the training dummy',async()=>{
  let user={id:'skill-test',username:'SkillTest'};
  let profile={x:16,y:16,hp:100,xp:0,level:1,coins:0};
  const craft=starterCraft();craft.skills=[{...skill(),id:'test-skill'}];craft.equippedSkills[0]='test-skill';
  const httpServer=http.createServer();
  const game=attachGlyphInfinity(async()=>({...profile}),async(_user,value)=>{profile={...value};},async()=>craft,async()=>{});
  httpServer.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,user));
  httpServer.listen(0,'127.0.0.1');await once(httpServer,'listening');
  const url=`ws://127.0.0.1:${httpServer.address().port}`;
  let ws=new WebSocket(url);
  try{
    await once(ws,'open');
    const initial=await new Promise(resolve=>ws.on('message',m=>{const v=JSON.parse(m.toString());if(v.type==='state')resolve(v);}));
    const dummy=initial.enemies.find(e=>e.kind==='dummy');assert.ok(dummy);
    ws.close();await once(ws,'close');await pause(30);
    let near=null;
    for(const radius of [35,45,60,75])for(let a=0;a<16;a++){
      const x=dummy.x+Math.cos(a*Math.PI/8)*radius,y=dummy.y+Math.sin(a*Math.PI/8)*radius;
      if(!near&&canStand(x,y))near={x,y};
    }
    assert.ok(near);profile={...profile,...near,hp:100};
    user={...user,id:'skill-test-near'};
    ws=new WebSocket(url);const messages=[];ws.on('message',m=>messages.push(JSON.parse(m.toString())));
    await once(ws,'open');ws.send(JSON.stringify({type:'cast',slot:0}));
    await until(()=>messages.some(m=>m.type==='state'&&m.enemies.find(e=>e.kind==='dummy')?.hp<250));
    assert.ok(messages.some(m=>m.type==='state'&&m.ep<100));
    assert.equal(messages.findLast(m=>m.type==='state').xp,0,'training grants no XP');
  }finally{
    if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
    await game.shutdown();await new Promise(resolve=>httpServer.close(resolve));
  }
});

test('timed parry blocks a warned melee hit and staggers the enemy',async()=>{
  let user={id:'parry-test',username:'Parry'};
  let profile={x:16,y:16,hp:100,xp:0,level:1,coins:0};
  const httpServer=http.createServer();
  const game=attachGlyphInfinity(async()=>({...profile}),async(_user,value)=>{profile={...value};});
  httpServer.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,user));
  httpServer.listen(0,'127.0.0.1');await once(httpServer,'listening');
  const url=`ws://127.0.0.1:${httpServer.address().port}`;
  let ws=new WebSocket(url);
  try{
    await once(ws,'open');
    const initial=await new Promise(resolve=>ws.on('message',m=>{const v=JSON.parse(m.toString());if(v.type==='state')resolve(v);}));
    const target=initial.enemies.find(e=>e.id==='e0');assert.ok(target);
    ws.close();await once(ws,'close');await pause(30);
    let near=null;
    for(const radius of [24,28,32,38,45])for(let a=0;a<16;a++){
      const x=target.x+Math.cos(a*Math.PI/8)*radius,y=target.y+Math.sin(a*Math.PI/8)*radius;
      if(!near&&canStand(x,y))near={x,y};
    }
    assert.ok(near);profile={...profile,...near,hp:100};
    user={...user,id:'parry-test-near'};
    ws=new WebSocket(url);const states=[];ws.on('message',m=>{const v=JSON.parse(m.toString());if(v.type==='state')states.push(v);});
    await once(ws,'open');
    await until(()=>states.some(s=>{const e=s.enemies.find(e=>e.id==='e0');return e&&e.windupUntil-s.time>50&&e.windupUntil-s.time<180;}),3000);
    ws.send(JSON.stringify({type:'parry'}));
    await until(()=>states.some(s=>s.effects.some(e=>e.text==='PARRY!')),1500);
    const defended=states.find(s=>s.effects.some(e=>e.text==='PARRY!'));
    assert.equal(defended.players[0].hp,100);
    assert.ok(defended.enemies.find(e=>e.id==='e0')?.staggerUntil>defended.time);
  }finally{
    if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
    await game.shutdown();await new Promise(resolve=>httpServer.close(resolve));
  }
});
