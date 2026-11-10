import { describe, it, expect } from 'vitest';
import { bedrockAnimationNames, defaultPlayerModel, exportBedrockAnimation, exportBedrockGeometry, importBedrockAnimation, importBedrockGeometry, validatePlayerModel } from './model.js';

describe('player model files',()=>{
  it('imports and exports Bedrock geometry and numeric attack animation',()=>{
    const original=defaultPlayerModel(),geometry=exportBedrockGeometry(original);
    const imported=importBedrockGeometry(geometry);
    expect(imported.bones.map(b=>b.name)).toEqual(original.bones.map(b=>b.name));
    expect(imported.bones[0].cubes[0].size).toEqual([8,12,4]);
    const animated=importBedrockAnimation(imported,exportBedrockAnimation(original));
    expect(animated.attack.bones.right_arm).toHaveLength(4);
    expect(animated.attack.bones.right_arm[1].rotation[0]).toBe(-100);
  });
  it('rejects invalid or oversized geometry and cyclic bones',()=>{
    const model=defaultPlayerModel();
    expect(()=>validatePlayerModel({...model,bones:[...model.bones,...Array.from({length:25},(_,i)=>({...model.bones[0],name:`extra${i}`}))]})).toThrow(/1～24/);
    const cyclic=structuredClone(model);cyclic.bones[0].parent='head';
    expect(()=>validatePlayerModel(cyclic)).toThrow(/循環/);
    const invalid=structuredClone(model);invalid.bones[0].cubes[0].size=[Infinity,1,1];
    expect(()=>validatePlayerModel(invalid)).toThrow(/範囲外/);
  });
  it('maps separate Blockbench attack and skill clips with transform channels',()=>{
    const file={animations:{'animation.hero.attack':{animation_length:.4,bones:{right_arm:{rotation:{'0':[0,0,0],'.2':[-90,0,0]}}}},'animation.hero.skill':{animation_length:1.2,bones:{head:{rotation:{'0':[0,0,0],'1':[30,0,0]},position:{'0':[0,0,0],'1':[0,4,0]},scale:{'0':[1,1,1],'1':[1.5,1.5,1.5]}}}}}};
    expect(bedrockAnimationNames(file)).toEqual(['animation.hero.attack','animation.hero.skill']);
    const attack=importBedrockAnimation(defaultPlayerModel(),file,'attack','animation.hero.attack');
    const both=importBedrockAnimation(attack,file,'skill','animation.hero.skill');
    expect(both.attack.bones.right_arm[1].rotation).toEqual([-90,0,0]);
    expect(both.skill.bones.head[1].position).toEqual([0,4,0]);
    expect(both.skill.bones.head[1].scale).toEqual([1.5,1.5,1.5]);
    const reloaded=importBedrockAnimation(both,exportBedrockAnimation(both),'skill','animation.shift.skill');
    expect(reloaded.skill.bones.head[1].position).toEqual([0,4,0]);
    expect(validatePlayerModel({...both,skill:undefined}).skill.bones).toEqual({});
  });
});
