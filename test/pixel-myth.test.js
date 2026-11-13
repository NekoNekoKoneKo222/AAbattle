import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PixelStore, PixelError } from '../src/pixel-store.js';
import { validatePixelAnalysis, validatePixelJudgment, validatePixelProject, validatePixelImage, analyzePixel, judgePixel } from '../src/pixel-ai.js';

const analysis={title:'星屑の騎士',description:'星を編む騎士',appearance:'青い鎧',personality:'静か',element:'星',style:'遠距離',abilities:[{name:'星縫い',effect:'光を束ねる',condition:'夜'}],attacks:['流星'],defenses:['星の盾'],weaknesses:['暗闇'],resistances:['炎'],passives:['夜目'],ultimate:'流星群',evaluation:'夜に強い',commentary:'光る鎧が印象的'};
const judgment={winner:'a',reason:'星の盾が攻撃を防いだ',conclusion:'騎士が勝利',commentary:'夜の舞台が有利',events:[{actor:'a',action:'防御',text:'盾を構える',effect:'defense'},{actor:'b',action:'攻撃',text:'炎を放つ',effect:'attack'},{actor:'a',action:'流星',text:'撃破',effect:'finish'}]};
const png=()=>{const bytes=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(16,16);bytes.writeUInt32BE(16,20);return 'data:image/png;base64,'+bytes.toString('base64');};
const project=()=>({size:16,layers:[{id:'a',name:'下絵',visible:true,opacity:0,pixels:Buffer.alloc(16*16*4).toString('base64')}]});

test('analysis and judgment reject malformed AI data',()=>{
  assert.equal(validatePixelAnalysis(analysis).abilities[0].name,'星縫い');
  assert.equal(validatePixelJudgment(judgment).winner,'a');
  assert.throws(()=>validatePixelAnalysis({...analysis,abilities:[]}),/能力/);
  assert.throws(()=>validatePixelJudgment({...judgment,winner:'unknown'}),/勝敗/);
});
test('image and project validation preserves transparent layer',()=>{
  assert.equal(validatePixelProject(project()).layers[0].opacity,0);
  assert.equal(validatePixelImage(png(),16),png());
  assert.throws(()=>validatePixelImage(png(),32),/サイズ/);
});
test('Gemini vision generation uses actual image and validates response',async()=>{
  const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';
  const calls=[];const fake=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(calls.length===1?analysis:judgment)}]}}]})};};
  try{assert.equal((await analyzePixel({name:'騎士',png:png()},fake)).title,analysis.title);assert.equal((await judgePixel({name:'騎士',png:png(),analysis},{name:'敵',png:png(),analysis},'夜',fake)).winner,'a');assert.equal(calls.length,2);assert.equal(calls[0].body.contents[0].parts[1].inlineData.mimeType,'image/png');assert.equal(calls[1].body.contents[0].parts.length,3);}finally{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
test('library revisions, battle idempotency and room claim survive in store',async()=>{
  const s=new PixelStore(null),alice={id:randomUUID(),username:'alice'},bob={id:randomUUID(),username:'bob'};
  const a=await s.create(alice,{name:'星騎士',project:project(),png:png(),analysis});
  assert.equal(await s.get(a.id,bob.id),null);
  await s.metadata(alice,a.id,{name:a.name,visibility:'public',copyAllowed:true,favorite:true,tags:['星']});
  assert.ok(await s.get(a.id,bob.id));
  const b=await s.create(bob,{name:'炎使い',project:project(),png:png(),analysis});
  const revised=await s.revise(alice,a.id,{name:'新・星騎士',project:project(),png:png(),analysis});
  assert.equal(revised.version_number,2);assert.equal((await s.history(a.id,alice.id)).length,2);
  const requestId=randomUUID(),battle=await s.createBattle({requestId,creatorId:alice.id,aVersionId:revised.version_id,bVersionId:b.version_id,mode:'solo',stage:'夜'});
  assert.equal((await s.createBattle({requestId,creatorId:alice.id,aVersionId:a.version_id,bVersionId:b.version_id,mode:'solo',stage:'夜'})).id,battle.id);
  await s.completeBattle(battle.id,judgment);assert.equal((await s.getBattle(battle.id)).result.winner,'a');
  const room=await s.createRoom(alice);await s.joinRoom(room.code,bob.id);await s.readyRoom(room.code,alice.id,a.id);assert.equal(await s.claimRoom(room.code),null);await s.readyRoom(room.code,bob.id,b.id);assert.ok(await s.claimRoom(room.code));assert.equal(await s.claimRoom(room.code),null);
  const online=await s.createBattle({requestId:randomUUID(),creatorId:alice.id,aVersionId:revised.version_id,bVersionId:b.version_id,mode:'online',stage:'アリーナ'});await s.completeBattle(online.id,{...judgment,guestId:bob.id});await s.finishRoom(room.code,online.id,'complete');assert.equal((await s.listBattles(bob.id)).length,1);await s.rematchRoom(room.code,alice.id);await s.readyRoom(room.code,alice.id,a.id);await s.readyRoom(room.code,bob.id,b.id);assert.ok(await s.claimRoom(room.code));const rematch=await s.createBattle({requestId:randomUUID(),creatorId:alice.id,aVersionId:revised.version_id,bVersionId:b.version_id,mode:'online',stage:'アリーナ'});assert.notEqual(rematch.id,online.id);
  await s.remove(alice,a.id);assert.equal(await s.get(a.id,bob.id),null);await assert.rejects(s.own(a.id,alice.id),PixelError);
});
