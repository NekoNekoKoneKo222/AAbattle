import test from 'node:test';
import assert from 'node:assert/strict';
import {ANOMALIES,ARTIFACTS,ROOM_TYPES,fresh,advance,offlineAdvance,metrics,build,improveRoom,roomCost,buyUpgrade,contain,craft,equip,startExplore,prestigeGain,prestige,validateSave} from '../public/abn/engine.js';

test('ANOMALY IDLE has ten distinct anomalies, artifacts and rooms',()=>{
  assert.equal(ANOMALIES.length,10);assert.equal(ARTIFACTS.length,10);assert.equal(ROOM_TYPES.length,10);
  assert.equal(new Set(ANOMALIES.map(a=>a.icon)).size,10);
});
test('research produces resources and building, upgrades and containment interact',()=>{
  const s=fresh();const initial=metrics(s);advance(s,10);assert.ok(s.money>200);assert.ok(s.research>0);
  s.money=10000;assert.ok(build(s,'lab',3,0));assert.ok(improveRoom(s,s.rooms.at(-1).id));assert.ok(buyUpgrade(s,'research',10));
  assert.ok(metrics(s).research>initial.research);assert.ok(build(s,'cell',4,0));assert.ok(contain(s,1));assert.ok(metrics(s).money>initial.money);
});
test('expedition discovers anomalies and artifact changes facility output',()=>{
  const s=fresh();s.money=10000;s.materials=100;s.research=1000;s.runResearch=1000;
  assert.ok(build(s,'explore',3,0));assert.ok(startExplore(s,1));advance(s,91);assert.ok(s.found.length>2);
  assert.ok(build(s,'artifact',4,0));assert.ok(craft(s,'battery'));const before=metrics(s).power;assert.ok(equip(s,'battery'));assert.ok(metrics(s).power>before);
});
test('offline reward has a cap, cannot be collected twice and preserves progress',()=>{
  const s=fresh();const now=Date.now();s.lastSaved=now-86400000;const report=offlineAdvance(s,now);assert.equal(report.seconds,43200);assert.ok(report.money>0);
  assert.equal(offlineAdvance(s,now),null);const restored=validateSave(JSON.parse(JSON.stringify(s)));assert.equal(restored.money,s.money);
});
test('prestige retains catalog and permanent upgrades',()=>{
  const s=fresh();s.runResearch=10000;s.catalog=[0,1,2];const gain=prestigeGain(s);assert.ok(gain>0);assert.ok(prestige(s));assert.equal(s.knowledge,gain);assert.deepEqual(s.catalog,[0,1,2]);assert.equal(s.runResearch,0);assert.equal(s.resets,1);
});
test('research modes alter reward and risk; automated construction adds a lab',()=>{
  const s=fresh();const before=metrics(s);s.researchMode='mental';assert.ok(metrics(s).research>before.research);assert.ok(metrics(s).risk>before.risk);
  s.perks.automation=1;s.money=10000;advance(s,16);assert.equal(s.rooms.filter(r=>r.type==='lab').length,2);
});
test('huge upgrade levels remain finite',()=>{
  const s=fresh();s.money=1e300;s.upgrades.revenue=5000;buyUpgrade(s,'revenue','max');assert.ok(Number.isFinite(s.money));assert.ok(Number.isFinite(s.upgrades.revenue));
  assert.equal(roomCost('lab',0,100000),1e300);
});
