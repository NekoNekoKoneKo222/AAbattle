import test from 'node:test';
import assert from 'node:assert/strict';
import {SPRA_WEAPONS} from '../public/spra/weapons.js';
import {SPRA_FURNITURE,FACILITY_LABELS} from '../public/spra/facilities.js';
import {SPRA_MAX_LEVEL,totalXpForLevel,levelFromXp,battleXpReward} from '../public/spra/progression.js';

test('All weapons have purchase levels; Aster Gum is Lv10 and 500 coins',()=>{
 const weapons=Object.values(SPRA_WEAPONS);
 assert.ok(weapons.length>=45);
 assert.ok(weapons.every(w=>Number.isInteger(w.requiredLevel)&&w.requiredLevel>=1&&
   w.requiredLevel<=SPRA_MAX_LEVEL), 'all weapons require an explicit player level');
 assert.ok(weapons.every(w=>Number.isFinite(w.price)&&w.price>=0));
 assert.equal(SPRA_WEAPONS.star_gum.price,500);
 assert.equal(SPRA_WEAPONS.star_gum.requiredLevel,10);
 assert.equal(SPRA_WEAPONS.shooter.requiredLevel,1);
 assert.equal(SPRA_WEAPONS.roller.requiredLevel,1);
 assert.equal(SPRA_WEAPONS.blaster.requiredLevel,1);
});
test('Winning battles earns XP, levels up and unlocks Aster Gum at level ten',()=>{
 assert.equal(totalXpForLevel(1),0);
 assert.equal(totalXpForLevel(2),100);
 assert.equal(levelFromXp(0),1);
 assert.equal(levelFromXp(99),1);
 assert.equal(levelFromXp(100),2);
 const unlockXp=totalXpForLevel(10);
 assert.equal(levelFromXp(unlockXp-1),9);
 assert.equal(levelFromXp(unlockXp),10);
 assert.ok(battleXpReward({winner:0,team:0,kos:5})>
   battleXpReward({winner:0,team:1,kos:0}));
 assert.equal(battleXpReward({winner:0,team:0,mode:'training'}),0);
});
test('Arcade is replaced by furniture shop with 16 selectable personal-room items',()=>{
 assert.equal(FACILITY_LABELS.arcade,undefined);
 assert.equal(FACILITY_LABELS.furniture,'家具ショップ');
 assert.ok(SPRA_FURNITURE.length>=16);
 assert.ok(SPRA_FURNITURE.some(f=>f.id==='lamp'&&f.price===0));
 assert.ok(SPRA_FURNITURE.every(f=>f.id&&f.name&&Number.isFinite(f.price)&&f.price>=0));
});
