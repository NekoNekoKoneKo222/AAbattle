import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.js';
import { TournamentManager } from '../src/tournaments.js';
import { TitleManager } from '../src/titles.js';
import { createBattle, stepBattle } from '../src/battle.js';
import { generateFighter, normalizeDefinition } from '../src/generator.js';
import { applyStatus, tickStatuses, clearStatuses, status } from '../src/status-effects.js';
import { hideAwakening } from '../src/awakening.js';

const plain = name => ({ id:name, name, art:'<o>', definition:normalizeDefinition({
  stats:{hp:150,atk:27,def:18,speed:50}, skills:[
    {name:'一撃',kind:'damage',power:60,cooldown:2}, {name:'守る',kind:'shield',power:45,cooldown:3},
    {name:'治す',kind:'heal',power:45,cooldown:4} ] },name) });
test('bounded statuses expire, clear, resist repeated freeze and never stack forever', () => {
  const fighter={statuses:{},freezeResist:0};
  for(let i=0;i<9;i++) applyStatus(fighter,{type:'corrosion',power:99,chance:100,duration:99},()=>0);
  assert.equal(status(fighter,'corrosion').stacks,3);
  assert.equal(status(fighter,'corrosion').remaining,3);
  assert.equal(status(fighter,'corrosion').power,10);
  tickStatuses(fighter);tickStatuses(fighter);tickStatuses(fighter);
  assert.equal(status(fighter,'corrosion'),null);
  fighter.freezeResist=2;
  assert.equal(applyStatus(fighter,{type:'freeze',chance:100},()=>0),false);
  fighter.freezeResist=0; assert.equal(applyStatus(fighter,{type:'freeze',chance:100},()=>0),true);
  clearStatuses(fighter); assert.equal(status(fighter,'freeze'),null);
});
test('awakening stays hidden until combat, changes AA once and unlocks the fourth skill', async () => {
  const art=' /\\\n<!!>';
  const generated=await generateFighter(' <o>','HERO',[],'local',art);
  const a={id:'a',username:'A'}, b={id:'b',username:'B'};
  assert.equal(hideAwakening(generated.definition).awakening,undefined);
  const battle=createBattle(a,{...plain('HERO'),definition:generated.definition},b,plain('ENEMY'),()=>.5);
  battle.fighters[0].hp=1;
  const turn=stepBattle(battle);
  assert.equal(turn.fighters[0].art,art);
  assert.equal(turn.fighters[0].awakened,true);
  assert.equal(battle.fighters[0].definition.skills.length,4);
  const before=battle.log.filter(t=>t.lines.some(line=>line.includes('AWAKENING DETECTED'))).length;
  while(!battle.ended) stepBattle(battle);
  assert.equal(battle.log.filter(t=>t.lines.some(line=>line.includes('AWAKENING DETECTED'))).length,before);
});
test('tournaments handle 8, 16 and 32 unique accounts, resume and settle once', async () => {
  for(const size of [8,16,32]) {
    const store=new MemoryStore(), manager=new TournamentManager(store), titles=new TitleManager(store);
    const users=[];
    for(let i=0;i<size;i++) { const user=await store.createUser(`u${i}`,`u${i}`,'hash'); const fighter=await store.saveFighter(user.id,`F${i}`,'<o>',plain(`F${i}`).definition,'local'); users.push({user,fighter}); }
    const created=await manager.create(users[0].user,`大会${size}`,size);
    await manager.join(created.id,users[0].user,users[0].fighter.id);
    await assert.rejects(manager.join(created.id,users[0].user,users[0].fighter.id));
    await assert.rejects(manager.start(created.id,users[0].user.id),{status:409});
    const second=new TournamentManager(store);
    for(const {user,fighter} of users.slice(1)) await second.join(created.id,user,fighter.id);
    assert.equal((await second.get(created.id)).status,'open');
    await assert.rejects(second.start(created.id,users[1].user.id),{status:403});
    await second.start(created.id,users[0].user.id);
    const result=await second.resume(created.id);
    assert.equal(result.status,'complete');
    assert.equal(result.matches.length,size-1);
    assert.equal((await second.resume(created.id)).matches.length,size-1);
    assert.equal(await titles.awardTournament(created.id,result.championId),true);
    assert.equal(await titles.awardTournament(created.id,result.championId),false);
    assert.ok((await titles.get(result.championId)).earned.includes('champion'));
  }
});
test('host can start with two players or an odd number, with byes and no duplicate rounds', async () => {
  for (const count of [2,3,5]) {
    const store=new MemoryStore(), manager=new TournamentManager(store), users=[];
    for (let i=0;i<count;i++) { const user=await store.createUser(`p${i}`,`p${i}`,'hash'); const fighter=await store.saveFighter(user.id,`P${i}`,'<o>',plain(`P${i}`).definition,'local'); users.push({user,fighter}); }
    const tournament=await manager.create(users[0].user,`早期開始${count}`,8);
    for (const {user,fighter} of users) await manager.join(tournament.id,user,fighter.id);
    assert.equal((await manager.get(tournament.id)).status,'open');
    await manager.start(tournament.id,users[0].user.id);
    const restarted=new TournamentManager(store);
    const finished=await restarted.resume(tournament.id);
    assert.equal(finished.status,'complete');
    assert.equal(finished.matches.filter(match=>match.b !== null).length,count-1);
    assert.equal((await restarted.resume(tournament.id)).matches.length,finished.matches.length);
    if (count%2) assert.ok(finished.matches.some(match=>match.b===null));
  }
});
test('titles cannot be equipped before server award and can be removed', async () => {
  const titles=new TitleManager(new MemoryStore());
  await assert.rejects(titles.equip('u','first_win'),{status:403});
  await titles.add('u',{pvpWins:1});
  assert.equal((await titles.equip('u','first_win')).equipped_title,'first_win');
  assert.equal((await titles.equip('u',null)).equipped_title,null);
});
test('tactics choose defensive and counter moves with fixed randomness', () => {
  const a=plain('A'), b=plain('B');
  a.definition.personality='defensive'; a.definition.tactics={aggression:0,defensePriority:100,healPriority:0,debuffPriority:0,counterPriority:0,finisherPriority:0,riskTolerance:0};
  const battle=createBattle({id:'a',username:'A'},a,{id:'b',username:'B'},b,()=>.5);
  const turn=stepBattle(battle);
  assert.ok(turn.lines.some(line=>line.includes('守る')));
  assert.ok(turn.lines.some(line=>line.includes('[AI DECISION]')));
});
test('reaction damage does not cause an infinite counter or reflect loop', () => {
  const a=plain('A'), b=plain('B');
  const battle=createBattle({id:'a',username:'A'},a,{id:'b',username:'B'},b,()=>0);
  for(const fighter of battle.fighters) {
    applyStatus(fighter,{type:'parry',power:20,chance:100,duration:3},()=>0);
    applyStatus(fighter,{type:'reflect',power:25,chance:100,duration:3},()=>0);
  }
  const turn=stepBattle(battle);
  assert.ok(turn.lines.length<100);
  assert.ok(battle.fighters[1].counterCount<=3);
  assert.equal(battle.log.length,1);
});
test('generated tactics and character titles are bounded before storage', () => {
  const safe=normalizeDefinition({personality:'counter',characterTitle:'反撃の王',tactics:{aggression:999,healPriority:-50}},'A');
  assert.equal(safe.characterTitle,'反撃の王'); assert.equal(safe.tactics.aggression,100); assert.equal(safe.tactics.healPriority,0);
  const unsafe=normalizeDefinition({characterTitle:'<script>',tactics:{aggression:'invalid'}},'A');
  assert.equal(unsafe.characterTitle,''); assert.ok(unsafe.tactics.aggression<=100);
});
test('existing PvP wins continue to unlock titles', async () => {
  const store=new MemoryStore(), user=await store.createUser('old','old','hash'); user.wins=100;
  const titles=new TitleManager(store); const state=await titles.get(user.id);
  assert.ok(state.earned.includes('first_win')); assert.ok(state.earned.includes('veteran'));
  assert.equal((await titles.equip(user.id,'veteran')).equipped_title,'veteran');
});
