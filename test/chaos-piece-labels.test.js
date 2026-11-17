import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, PROMOTED, pieceLabel } from '../public/CSH/pieces.js';

test('all eight shogi piece types are displayed with two Japanese characters',()=>{
  assert.deepEqual(Object.keys(PIECES).sort(),['B','G','K','L','N','P','R','S']);
  for(const [type,label] of Object.entries(PIECES)){
    assert.equal([...label].length,2,type);
    assert.equal(pieceLabel({type,side:'b',promoted:false}),label);
    assert.equal(pieceLabel({type,side:'w',promoted:false}),label);
  }
  assert.equal(pieceLabel({type:'K'}),'王将');
  assert.equal(pieceLabel({type:'R'}),'飛車');
  assert.equal(pieceLabel({type:'B'}),'角行');
  assert.equal(pieceLabel({type:'P'}),'歩兵');
});

test('promoted pieces also show two characters without changing game types',()=>{
  assert.deepEqual(Object.keys(PROMOTED).sort(),['B','L','N','P','R','S']);
  for(const [type,label] of Object.entries(PROMOTED)){
    assert.equal([...label].length,2,type);
    assert.equal(pieceLabel({type,promoted:true}),label);
  }
  assert.equal(pieceLabel({type:'K',promoted:true}),'王将');
  assert.equal(pieceLabel({type:'P',promoted:true}),'と金');
  assert.equal(pieceLabel(null),'');
});
