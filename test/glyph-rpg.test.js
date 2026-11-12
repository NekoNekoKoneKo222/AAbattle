import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import WebSocket from 'ws';
import {rollGear,normalizeRpg,starterCraft,gearBonus} from '../glyph-infinity/shared/dist/index.js';
import {attachGlyphInfinity} from '../glyph-infinity/server/dist/index.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout=3000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw new Error('RPG state timeout');await pause(20);}}

test('loot has bounded rarity, options, and equipped bonuses survive normalization',()=>{
  const gear=rollGear(500,true,()=>.01,'item-1');
  assert.equal(gear.rarity,'ANOMALY');assert.equal(gear.level,100);
  const state=normalizeRpg({inventory:[gear],equipped:{[gear.slot]:gear.id},kills:5,mastery:{sword:3}});
  assert.equal(gearBonus(state,gear.option),gear.value);
  assert.equal(state.kills,5);assert.equal(state.mastery.sword,3);
  assert.equal(normalizeRpg({inventory:[{id:'x',slot:'invalid'}]}).inventory.length,0);
});

test('server controls inventory, quests, dungeon access, and rebirth',async()=>{
  const user={id:'rpg-test',username:'Adventurer'};
  let profile={x:16,y:16,hp:100,xp:0,level:100,coins:100};
  const craft=starterCraft();craft.rpg.kills=3;
  const gear=rollGear(5,false,()=>.3,'gear-1');craft.rpg.inventory.push(gear);
  let savedCraft;
  const server=http.createServer();
  const game=attachGlyphInfinity(async()=>({...profile}),async(_u,p)=>{profile={...p};},async()=>savedCraft??craft,async(_u,c)=>{savedCraft=structuredClone(c);});
  server.on('upgrade',(req,socket,head)=>void game.upgrade(req,socket,head,user));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}`),messages=[];
  ws.on('message',m=>messages.push(JSON.parse(m.toString())));
  try{
    await once(ws,'open');await until(()=>messages.some(m=>m.type==='craft:state'));
    ws.send(JSON.stringify({type:'rpg:equip',id:gear.id}));
    await until(()=>messages.some(m=>m.type==='craft:state'&&m.craft.rpg.equipped[gear.slot]===gear.id));
    await pause(220);ws.send(JSON.stringify({type:'rpg:claim',id:'first'}));
    await until(()=>messages.some(m=>m.type==='craft:state'&&m.craft.rpg.claimed.includes('first')));
    assert.equal(profile.coins,130);
    ws.send(JSON.stringify({type:'rpg:dungeon'}));
    await until(()=>messages.some(m=>m.type==='state'&&m.dungeon===1));
    assert.equal(messages.findLast(m=>m.type==='state').enemies.length,2);
    ws.send(JSON.stringify({type:'rpg:leave'}));
    await until(()=>messages.some(m=>m.type==='state'&&m.dungeon===0));
    await pause(220);ws.send(JSON.stringify({type:'rpg:rebirth'}));
    await until(()=>messages.some(m=>m.type==='state'&&m.level===1));
    assert.equal(savedCraft.rpg.rebirths,1);assert.equal(savedCraft.rpg.inventory[0].id,gear.id);
    await pause(220);ws.send(JSON.stringify({type:'rpg:dungeon'}));
    await pause(80);assert.equal(messages.findLast(m=>m.type==='state').dungeon,0,'Lv.1 cannot enter');
    ws.send(JSON.stringify({type:'rpg:claim',id:'first'}));
    await until(()=>messages.some(m=>m.type==='craft:error'&&/受取済み/.test(m.message)));
  }finally{ws.terminate();await game.shutdown();await new Promise(resolve=>server.close(resolve));}
});
