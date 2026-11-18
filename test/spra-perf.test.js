import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createInkSurface} from '../src/spra-ink.js';

test('SPRA server ink painting stays responsive during 400 mixed weapon trails',()=>{
 const ink=createInkSurface(160,100,[
  {x:26,y:14,w:9,h:17},{x:125,y:69,w:9,h:17},{x:75,y:43,w:10,h:14}
 ]);
 const start=performance.now();
 for(let i=0;i<400;i++){
  const x=12+(i*17%120),y=12+(i*13%70);
  const r=i%3===0?.65:i%3===1?.24:.36;
  ink.trail(x,y,Math.min(154,x+9),y+((i%7)-3)*.37,r,i%2,i*17,i%3===0);
  if(i%9===0)ink.impact(x+3,y,1.8,i%2,i*.14,i*31,'shooter');
 }
 const ms=performance.now()-start;
 assert.ok(ink.counts[0]>200&&ink.counts[1]>200,'mixed shots still paint');
 assert.ok(ms<4000,'400 mixed shots should not block the server for '+ms.toFixed(0)+'ms');
 console.log('[SPRA PERF] 400 mixed paint trails '+ms.toFixed(1)+'ms; '+ink.counts.join('/')+' samples');
});
test('SPRA incremental paint packets preserve every distinct colour after chunking',()=>{
 const ink=createInkSurface(160,100);
 const x=12,y=12;
 for(let i=0;i<120;i++){
   ink.trail(x+(i%20)*3,y+Math.floor(i/20)*6,x+(i%20)*3+3,y+Math.floor(i/20)*6+.6,.6,i%2,i,true);
 }
 const copy=new Uint8Array(ink.paint.length);
 let passes=0;
 while(true){
   const packet=ink.flush(4000);
   if(!packet.length)break;
   assert.equal(packet.length%3,0);
   for(let i=0;i<packet.length;i+=3){
     const [start,length,color]=packet.slice(i,i+3);
     copy.fill(color,start,start+length);
   }
   assert.ok(++passes<300,'finite incremental paint queue');
 }
 assert.deepEqual(copy,ink.paint,'no paint may be lost while throttling packets');
});
