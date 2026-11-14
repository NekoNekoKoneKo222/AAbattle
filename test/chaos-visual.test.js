import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, applyAction, legalActions } from '../src/chaos-shogi.js';
import { visualEvent } from '../src/chaos-visual.js';
import { cardArtSvg } from '../src/chaos-art.js';
import { CARD_CATALOG } from '../src/chaos-cards.js';

test('visual events identify moves and drops without exposing either deck',()=>{
  const start=newGame(),move=legalActions(start).find(action=>action.kind==='move');
  const moved=applyAction(start,move),event=visualEvent(start,moved,move);
  assert.equal(event.kind,'move');assert.equal(event.from,move.from);assert.equal(event.to,move.to);
  assert.equal(event.side,'b');assert.equal(event.revision,moved.revision);
  assert.equal(event.deck,undefined);assert.equal(event.hand,undefined);
  const withHand=newGame();withHand.hands.b.G=1;const drop=legalActions(withHand).find(action=>action.kind==='drop'&&action.type==='G');
  const dropped=applyAction(withHand,drop),dropEvent=visualEvent(withHand,dropped,drop);
  assert.equal(dropEvent.kind,'drop');assert.equal(dropEvent.pieceType,'G');assert.equal(dropEvent.to,drop.to);
});

test('card visuals classify rule changes and theft without revealing hidden cards',()=>{
  const before=newGame(),after={...before,revision:before.revision+1};
  const rule=visualEvent(before,after,{kind:'card',cardId:'double'});
  assert.equal(rule.fx,'rule');assert.equal(rule.cardId,'double');assert.equal(rule.hand,undefined);
  const steal=visualEvent(before,after,{kind:'card',cardId:'dobby',choice:'steal'});
  assert.equal(steal.fx,'steal');assert.equal(steal.deck,undefined);
  const svg=cardArtSvg(CARD_CATALOG.dobby);assert.match(svg,/viewBox="0 0 320 420"/);assert.match(svg,/CHAOS SHOGI/);
});
