import test from 'node:test';
import assert from 'node:assert/strict';
import { createInkSurface } from '../src/spra-ink.js';

function copyDeltas(ink, maxCells, mirror) {
  let packets = 0;
  while (true) {
    const delta = ink.flush(maxCells);
    if (!delta.length) break;
    assert.equal(delta.length % 3, 0);
    for (let i=0; i<delta.length; i+=3) {
      const [start, count, color] = delta.slice(i, i+3);
      assert.ok(start>=0 && start+count<=mirror.length);
      mirror.fill(color, start, start+count);
    }
    assert.ok(++packets < 10000, 'all pending paint must eventually drain');
  }
  assert.deepEqual(mirror, ink.paint, 'receiver must reproduce every painted subpixel');
}

test('SPRA incremental queue sends latest ink color only and never skips cells', () => {
  const ink=createInkSurface(160,100);
  const receiver=new Uint8Array(ink.paint.length);
  for(let i=0;i<240;i++){
    const x=10+(i%30)*4, y=10+Math.floor(i/30)*9;
    ink.trail(x,y,x+4,y+1,.65,i%2,i*19,true);
    // Repaint an already-pending footprint; only the final color is relevant.
    if(i%3===0)ink.impact(x+1,y+1,1.7,1-i%2,.3,i+1,'shooter');
    if(i%35===0)copyDeltas(ink,19,receiver);
  }
  copyDeltas(ink,17,receiver);
  assert.deepEqual(ink.flush(5000), []);
});

test('SPRA long-lived dirty queue stays correct after repeated compaction and reset', () => {
  const ink=createInkSurface(80,55);
  const receiver=new Uint8Array(ink.paint.length);
  for(let cycle=0;cycle<7;cycle++){
    for(let row=2;row<51;row+=2)
      ink.trail(2,row,77,row,.57,(row+cycle)%2,row*17+cycle,true);
    copyDeltas(ink,47,receiver);
  }
  ink.clear();
  receiver.fill(0);
  assert.deepEqual(ink.flush(99999), []);
  for(let y=4;y<50;y+=3)ink.trail(2,y,77,y,.44,1,y,true);
  copyDeltas(ink,63,receiver);
});
