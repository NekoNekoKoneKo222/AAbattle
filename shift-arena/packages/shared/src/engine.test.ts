import { describe, expect, it } from 'vitest';
import { characters, createGame, lineClear, sanitizeInput, solidAt, stepGame } from './index.js';

const duel=()=>{const g=createGame({mode:'duel',shift:false,slots:[{id:'a',name:'A',character:'rei',team:0,bot:false},{id:'b',name:'B',character:'gald',team:1,bot:false}]});g.map.walls=[];for(const p of g.players){p.invulnerable=0;p.z=9;p.bot=false;}g.players[0].x=5;g.players[1].x=8;return g;};
describe('SHIFT ARENA combat',()=>{
  it('clamps malformed client inputs',()=>{expect(sanitizeInput({mx:999,mz:999,ax:Infinity,attack:1})).toMatchObject({attack:false,ax:0});});
  it('uses ammo, hits opponents, charges ultimate and reloads',()=>{const g=duel(),a=g.players[0],b=g.players[1];stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:true,ultimate:false,skill:false}});expect(a.ammo).toBe(2);for(let i=0;i<15;i++)stepGame(g);expect(b.hp).toBeLessThan(7000);expect(a.ultimate).toBeGreaterThan(0);for(let i=0;i<60;i++)stepGame(g);expect(a.ammo).toBe(3);});
  it('walls block projectiles and line of sight',()=>{const g=duel();g.map.walls=[{id:'barrier',x:6.5,z:9,w:1,h:3,hp:0,kind:'wall'}];expect(lineClear(g.map,g.players[0],g.players[1])).toBe(false);stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:true,ultimate:false,skill:false}});for(let i=0;i<15;i++)stepGame(g);expect(g.players[1].hp).toBe(7000);});
  it('KO increments score and respawns with invulnerability',()=>{const g=duel();g.players[1].hp=200;stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:true,ultimate:false,skill:false}});for(let i=0;i<15;i++)stepGame(g);expect(g.players[1].hp).toBe(0);expect(g.score[0]).toBe(1);for(let i=0;i<91;i++)stepGame(g);expect(g.players[1].hp).toBe(7000);expect(g.players[1].invulnerable).toBeGreaterThan(0);});
  it('all eight characters have usable skills and ultimates',()=>{expect(characters).toHaveLength(8);for(const c of characters){const g=createGame({mode:'duel',shift:false,slots:[{id:'a',name:'A',character:c.id,team:0,bot:false},{id:'b',name:'B',character:'rei',team:1,bot:false}]});g.players.forEach(p=>p.bot=false);g.players[0].ultimate=100;stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:false,ultimate:true,skill:true}});expect(g.players[0].ultimate).toBe(0);expect(g.players[0].skillAt).toBeGreaterThan(g.tick);}});
});
describe('modes and shifts',()=>{
  it('core does not score when both teams contest',()=>{const g=createGame({mode:'core',shift:false});for(const p of g.players){p.bot=false;p.x=13;p.z=9;}for(let i=0;i<30;i++)stepGame(g);expect(g.score).toEqual([0,0]);g.players.filter(p=>p.team===1).forEach(p=>{p.x=23;p.z=9;});for(let i=0;i<30;i++)stepGame(g);expect(g.score[0]).toBe(1);});
  it('shift adds mirrored walls and moves trapped players to free ground',()=>{const g=createGame({mode:'core'});g.tick=899;g.players[0].x=10;g.players[0].z=9;g.players.forEach(p=>p.bot=false);stepGame(g);expect(g.shiftCount).toBe(1);expect(g.map.walls.some(w=>w.id==='shift-0-a')).toBe(true);expect(solidAt(g.map,g.players[0].x,g.players[0].z)).toBe(false);});
  it('survival uses unique teams and shrinks the safe zone',()=>{const g=createGame({mode:'survival'});expect(new Set(g.players.map(p=>p.team)).size).toBe(10);g.players.forEach(p=>p.bot=false);for(let i=0;i<90;i++)stepGame(g);expect(g.safeRadius).toBeLessThan(12);});
});

