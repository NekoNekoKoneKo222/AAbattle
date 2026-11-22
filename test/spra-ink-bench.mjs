// Reproducible same-run comparison with the exact main-branch ink engine.
// Usage: node test/spra-ink-bench.mjs /tmp/spra-ink-before.mjs
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { createInkSurface as current } from '../src/spra-ink.js';

const baselinePath = process.argv[2];
if (!baselinePath) throw Error('Provide a main-branch baseline module path');
const { createInkSurface: before } = await import(pathToFileURL(baselinePath).href);
const walls=[{x:26,y:14,w:9,h:17},{x:125,y:69,w:9,h:17},{x:75,y:43,w:10,h:14}];

function workload(factory){
  const ink=factory(160,100,walls);
  let paintMs=0,flushMs=0,packets=0,bytes=0,maxPacket=0;
  for(let shot=0;shot<1400;shot++){
    // Eight players, including seven simultaneously firing CPU players.
    const actor=shot%8, x=6+(shot*13+actor*9)%146, y=6+(shot*17+actor*5)%88;
    let t=performance.now();
    ink.trail(x,y,Math.min(155,x+5+(shot%8)),y+((shot%7)-3)*.4,
      shot%3===0?.62:shot%3===1?.25:.38,actor%2,shot*11,shot%3===0);
    if(shot%7===0)ink.impact(x+2,y,1.7,actor%2,shot*.08,shot*17,'shooter');
    paintMs+=performance.now()-t;
    if(shot%8===7){
      t=performance.now();
      const packet=ink.flush(4000);
      flushMs+=performance.now()-t;
      bytes+=JSON.stringify(packet).length;maxPacket=Math.max(maxPacket,packet.length);
      packets++;
    }
  }
  let drainPasses=0;
  while(true){
    const t=performance.now(),packet=ink.flush(4000);
    flushMs+=performance.now()-t;
    if(!packet.length)break;
    bytes+=JSON.stringify(packet).length;maxPacket=Math.max(maxPacket,packet.length);
    if(++drainPasses>1000)throw Error('Paint delta queue failed to drain');
  }
  return {ink,paintMs,flushMs,bytes,packets,maxPacket,drainPasses};
}

// Warm both engines to avoid JIT warm-up skew.
workload(before);workload(current);
const a=workload(before),b=workload(current);
assert.deepEqual(b.ink.paint,a.ink.paint,'all 256,000 visual/collision cells remain pixel-identical');
assert.deepEqual(b.ink.counts,a.ink.counts,'both team scores must remain identical');
const result={
  baseline:{paintMs:+a.paintMs.toFixed(2),flushMs:+a.flushMs.toFixed(2),bytes:a.bytes,maxPacket:a.maxPacket,drainPasses:a.drainPasses},
  candidate:{paintMs:+b.paintMs.toFixed(2),flushMs:+b.flushMs.toFixed(2),bytes:b.bytes,maxPacket:b.maxPacket,drainPasses:b.drainPasses},
  samePaint:true,
  ratioTotal:+((b.paintMs+b.flushMs)/(a.paintMs+a.flushMs)).toFixed(3)
};
console.log('[SPRA 7-BOT 1400-SHOT BASELINE COMPARISON]',JSON.stringify(result));
