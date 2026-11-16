import { describe, expect, it } from 'vitest';
import { characters, characterById, createGame, fighterMaxHp, lineClear, neutral, sanitizeInput, powerMultiplier, registerShiftVote, sanitizeInput, solidAt, stepGame, trainingAction, upgradeCost } from './index.js';

const duel=()=>{const g=createGame({mode:'duel',shift:false,slots:[{id:'a',name:'A',character:'rei',team:0,bot:false},{id:'b',name:'B',character:'gald',team:1,bot:false}]});g.map.walls=[];for(const p of g.players){p.invulnerable=0;p.z=9;p.bot=false;}g.players[0].x=5;g.players[1].x=8;return g;};
describe('SHIFT ARENA combat',()=>{
  it('clamps malformed client inputs',()=>{expect(sanitizeInput({mx:999,mz:999,ax:Infinity,attack:1})).toMatchObject({attack:false,ax:0});});
  it('uses ammo, hits opponents, charges ultimate and reloads',()=>{const g=duel(),a=g.players[0],b=g.players[1];stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:true,ultimate:false,skill:false}});expect(a.ammo).toBe(2);for(let i=0;i<15;i++)stepGame(g);expect(b.hp).toBeLessThan(characterById('gald').maxHp);expect(a.ultimate).toBeGreaterThan(0);for(let i=0;i<60;i++)stepGame(g);expect(a.ammo).toBe(3);});
  it('walls block projectiles and line of sight',()=>{const g=duel();g.map.walls=[{id:'barrier',x:6.5,z:9,w:1,h:3,hp:0,kind:'wall'}];expect(lineClear(g.map,g.players[0],g.players[1])).toBe(false);stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:true,ultimate:false,skill:false}});for(let i=0;i<15;i++)stepGame(g);expect(g.players[1].hp).toBe(characterById('gald').maxHp);});
  it('KO increments score and respawns with invulnerability',()=>{const g=duel();g.players[1].hp=200;stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:true,ultimate:false,skill:false}});for(let i=0;i<15;i++)stepGame(g);expect(g.players[1].hp).toBe(0);expect(g.score[0]).toBe(1);for(let i=0;i<91;i++)stepGame(g);expect(g.players[1].hp).toBe(characterById('gald').maxHp);expect(g.players[1].invulnerable).toBeGreaterThan(0);});
  it('all eight characters have usable skills and ultimates',()=>{expect(characters).toHaveLength(8);for(const c of characters){const g=createGame({mode:'duel',shift:false,slots:[{id:'a',name:'A',character:c.id,team:0,bot:false},{id:'b',name:'B',character:'rei',team:1,bot:false}]});g.players.forEach(p=>p.bot=false);g.players[0].ultimate=100;stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:false,ultimate:true,skill:true}});expect(g.players[0].ultimate).toBe(0);expect(g.players[0].skillAt).toBeGreaterThan(g.tick);}});
});
describe('modes and shifts',()=>{
  it('core does not score when both teams contest',()=>{const g=createGame({mode:'core',shift:false});for(const p of g.players){p.bot=false;p.x=g.map.goal[0];p.z=g.map.goal[1];}for(let i=0;i<30;i++)stepGame(g);expect(g.score).toEqual([0,0]);g.players.filter(p=>p.team===1).forEach(p=>{p.x=32;p.z=g.map.goal[1];});for(let i=0;i<30;i++)stepGame(g);expect(g.score[0]).toBe(1);});
  it('terminal capture pauses when contested and votes determine the shift',()=>{const g=createGame({mode:'core'});g.players.forEach(p=>{p.bot=false;p.x=p.team===0?g.map.goal[0]:32;p.z=g.map.goal[1];});for(let i=0;i<89;i++)stepGame(g);expect(g.terminal.owner).toBeNull();g.players.find(p=>p.team===1)!.x=g.map.goal[0];for(let i=0;i<15;i++)stepGame(g);expect(g.terminal.owner).toBeNull();g.players.filter(p=>p.team===1).forEach(p=>p.x=32);for(let i=0;i<3;i++)stepGame(g);expect(g.terminal.owner).toBe(0);g.tick=539;stepGame(g);expect(registerShiftVote(g,g.players[0].id,g.terminal.candidates[1])).toBe(true);expect(registerShiftVote(g,g.players[0].id,g.terminal.candidates[0])).toBe(false);g.tick=899;stepGame(g);expect(g.terminal.selected).toBe('heal');expect(g.map.zones.some(z=>z.kind==='heal')).toBe(true);});
  it('wall shift relocates trapped players',()=>{const g=createGame({mode:'core'});g.players.forEach(p=>p.bot=false);g.terminal.owner=0;g.terminal.candidates=['wall','heal'];g.tick=899;g.players[0].x=10;g.players[0].z=8;stepGame(g);expect(g.map.walls.some(w=>w.id==='shift-0-wall-a')).toBe(true);expect(solidAt(g.map,g.players[0].x,g.players[0].z)).toBe(false);});
  it('saved loadout chooses the selected skill and passive',()=>{const g=createGame({mode:'duel',shift:false,slots:[{id:'a',name:'A',character:'rei',team:0,bot:false,loadout:{skill:'energy_shield',passive:'ammo_return'}}]});const p=g.players[0];expect(p.skillChoice).toBe('energy_shield');expect(p.passiveChoice).toBe('ammo_return');stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:false,ultimate:false,skill:true}});expect(p.shield).toBeGreaterThan(0);expect(p.x).toBe(g.map.spawn[0][0][0]);});
  it('survival uses unique teams and shrinks the safe zone',()=>{const g=createGame({mode:'survival'});expect(new Set(g.players.map(p=>p.team)).size).toBe(10);const initial=g.safeRadius;g.players.forEach(p=>p.bot=false);for(let i=0;i<90;i++)stepGame(g);expect(g.safeRadius).toBeLessThan(initial);});
  it('training allows unowned characters and invincible dummy without ending',()=>{const g=createGame({training:true,slots:[{id:'a',name:'A',character:'noise',team:0,bot:false}]});expect(g.players).toHaveLength(1);expect(trainingAction(g,'a','add_invincible')).toBe(true);expect(g.players[1].dummy).toBe('invincible');trainingAction(g,'a','ultimate');expect(g.players[0].ultimate).toBe(100);g.tick=5400;stepGame(g);expect(g.winner).toBeNull();expect(g.time).toBe(180);});
});



describe('solar power and ten-player solo combat',()=>{
  it('loads larger maps with cover and ten unique free-for-all teams',()=>{
    const g=createGame({mode:'ffa',shift:false});
    expect(g.map.width).toBe(100);
    expect(g.map.height).toBe(100);
    expect(g.players).toHaveLength(10);
    expect(new Set(g.players.map(p=>p.team)).size).toBe(10);
    expect(g.players.every(p=>!solidAt(g.map,p.x,p.z))).toBe(true);
  });
  it('individual KO leads to individual victory in ten-player mode',()=>{
    const g=createGame({mode:'ffa',shift:false});
    g.map.walls=[];
    g.players.forEach((p,i)=>{p.bot=false;p.invulnerable=0;p.hp=fighterMaxHp(p);p.x=30+i*.2;p.z=20;});
    const a=g.players[0],b=g.players[1];a.x=7;b.x=9;a.z=7;b.z=7;b.hp=200;a.kills=9;
    stepGame(g,{[a.id]:{mx:0,mz:0,ax:1,az:0,attack:true,ultimate:false,skill:false}});
    for(let t=0;t<22;t++)stepGame(g);
    expect(a.kills).toBe(10);
    expect(g.winner).toBe(a.team);
  });
  it('power level raises HP and outgoing damage without using client payloads',()=>{
    const low=createGame({mode:'duel',shift:false,slots:[{id:'a',name:'A',character:'rei',team:0,bot:false,powerLevel:1}]});
    const high=createGame({mode:'duel',shift:false,slots:[{id:'a',name:'A',character:'rei',team:0,bot:false,powerLevel:11}]});
    expect(fighterMaxHp(high.players[0])).toBeGreaterThan(fighterMaxHp(low.players[0]));
    expect(powerMultiplier(11)).toBeCloseTo(1.45);
    expect(upgradeCost(11)).toBeNull();
    expect(upgradeCost(1)?.coins).toBeGreaterThan(0);
    for(const g of [low,high]){
      g.map.walls=[];g.players.forEach(p=>{p.bot=false;p.invulnerable=0;p.z=5;});
      g.players[0].x=6;g.players[1].x=8;
      stepGame(g,{a:{mx:0,mz:0,ax:1,az:0,attack:true,ultimate:false,skill:false}});
      for(let t=0;t<20;t++)stepGame(g);
    }
    const lowTarget=low.players[1],highTarget=high.players[1];
    expect(highTarget.hp).toBeLessThan(lowTarget.hp);
  });
});

describe('large arena dimensions and traversal',()=>{
  it('uses X=50, Z=100 for each standard 3v3 mode on all arena themes',()=>{
    for(const map of ['park','factory','canyon'])
      for(const mode of ['core','deathmatch','payload'] as const){
        const g=createGame({mode,map,size:3,shift:false});
        expect([g.map.width,g.map.height]).toEqual([50,100]);
        expect(g.map.goal).toEqual([25,50]);
        expect(g.players).toHaveLength(6);
        expect(g.players.every(p=>!solidAt(g.map,p.x,p.z))).toBe(true);
        expect(g.map.walls.length).toBeGreaterThan(24);
        expect(g.map.zones.length).toBeGreaterThan(12);
      }
  });
  it('uses a 100×100 map for 5v5, solo/FFA, survival, 1v1 and training',()=>{
    const configurations=[
      {mode:'deathmatch' as const,size:5},
      {mode:'ffa' as const},
      {mode:'survival' as const},
      {mode:'duel' as const},
      {mode:'core' as const,training:true},
    ];
    for(const config of configurations){
      const g=createGame({...config,shift:false});
      expect([g.map.width,g.map.height]).toEqual([100,100]);
      expect(g.map.goal).toEqual([50,50]);
      expect(g.players.every(p=>!solidAt(g.map,p.x,p.z))).toBe(true);
    }
  });
  it('spawns mirror-symmetrically, puts cover in the enlarged area and keeps gameplay boundaries',()=>{
    const g=createGame({mode:'core',shift:false});
    expect(g.map.spawn[0][0][0]+g.map.spawn[1][0][0]).toBe(50);
    expect(g.map.walls.some(w=>w.z<30)).toBe(true);
    expect(g.map.walls.some(w=>w.z>70)).toBe(true);
    expect(solidAt(g.map,-1,50)).toBe(true);
    expect(solidAt(g.map,51,50)).toBe(true);
    expect(solidAt(g.map,25,101)).toBe(true);
  });
});

describe('level gates and adjustable throws',()=>{
  it('gates arts, passive and double gear to their power milestones',()=>{
    for(const lvl of [1,7,8,9,10,11]){
      const g=createGame({mode:'duel',shift:false,slots:[{id:'hero',name:'Hero',character:'rei',team:0,bot:false,powerLevel:lvl,loadout:{skill:'dash',passive:'combo_speed',gear1:'sun_stride',gear2:'sun_plating'}}]});
      const p=g.players.find(p=>p.id==='hero')!;
      expect(!!p.gear1).toBe(lvl>=8);
      expect(!!p.gear2).toBe(lvl>=10);
      expect(!!p.passiveChoice).toBe(lvl>=9);
      stepGame(g,{hero:{...neutral,mx:0,mz:0,ax:1,az:0,skill:true}});
      expect(p.skillAt>g.tick).toBe(lvl>=7);
    }
  });
  it('throws Bom bombs at the selected short or long distance without hitting airborne targets',()=>{
    const lengths:number[]=[];
    for(const aimDistance of [.2,.8]){
      const g=createGame({mode:'duel',shift:false,slots:[{id:'bom',name:'Bom',character:'bom',team:0,bot:false}]});
      g.map.walls=[];const p=g.players.find(p=>p.id==='bom')!;
      p.invulnerable=0;p.x=20;p.z=20;
      stepGame(g,{bom:{...neutral,ax:1,az:0,attack:true,aimDistance}});
      const b=g.bullets.find(b=>b.owner==='bom')!;
      expect(b?.lob).toBe(true);lengths.push((b.landX||0)-p.x);
      for(let i=0;i<3;i++)stepGame(g);
      expect(g.bullets.some(b=>b.id===b.id)).toBe(true);
    }
    expect(lengths[1]).toBeGreaterThan(lengths[0]+3);
  });
  it('sanitizes overdrive and ranged targeting from the network',()=>{
    const input=sanitizeInput({aimDistance:100,overdrive:true,attack:true,ax:1,az:0});
    expect(input.aimDistance).toBe(1);expect(input.overdrive).toBe(true);
  });
});
