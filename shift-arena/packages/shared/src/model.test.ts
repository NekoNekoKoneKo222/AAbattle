import { describe, it, expect } from 'vitest';
import { defaultPlayerModel, exportBedrockAnimation, exportBedrockGeometry, importBedrockAnimation, importBedrockGeometry, validatePlayerModel } from './model.js';

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
});
