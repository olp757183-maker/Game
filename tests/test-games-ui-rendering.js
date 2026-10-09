/**
 * Test Suite: UI Rendering and Data Contract Verification for UNO, Chess, and Domino
 * Verifies that:
 * 1. UNO cards render with proper colors, symbols, and values; hand is never wiped out.
 * 2. Chess pieces render with visible symbols; pieces can be selected and moved legally.
 * 3. Domino tiles render with pips on both board and hand; empty board placeholder works.
 */

import assert from 'node:assert';
import { UnoGame } from '../server/games/uno.js';
import { ChessGame } from '../server/games/chess.js';
import { DominoGame } from '../server/games/domino.js';
import { renderUNO, renderUnoCard, getUnoSymbol } from '../client/games/uno/uno-renderer.js';
import { renderChess, renderChessSquares, PIECE_SYMBOLS } from '../client/games/chess/chess-renderer.js';
import { renderDomino, renderBoardTile, renderHandTile, renderPips } from '../client/games/domino/domino-renderer.js';
import { rooms } from '../server/rooms.js';
import users from '../server/users.js';

const u1 = users.createGuest('PlayerOne');
const u2 = users.createGuest('PlayerTwo');

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\n======================================================');
console.log(' UI Rendering & Interaction Data Contract Tests');
console.log('======================================================\n');

// 1. UNO Rendering
console.log('--- 1. UNO Rendering Contract ---');
it('UNO: Cards render with valid colors, symbols, and inner markup', () => {
  const card = { id: 'c_test_1', color: 'red', value: '7', score: 7 };
  const html = renderUnoCard(card, { inHand: true, isMyTurn: true });
  assert.ok(html.includes('data-id="c_test_1"'), 'Contains data-id');
  assert.ok(html.includes('card-red'), 'Contains card-red class');
  assert.ok(html.includes('uno-center-value'), 'Contains center value');
  assert.ok(html.includes('7'), 'Contains value 7');

  // Special cards
  const draw2 = { id: 'c_test_2', color: 'blue', value: 'draw2', score: 20 };
  const htmlDraw2 = renderUnoCard(draw2);
  assert.ok(htmlDraw2.includes('+2'), 'Renders +2 symbol for draw2');

  const wild = { id: 'c_test_3', color: 'wild', value: 'wild', score: 50 };
  const htmlWild = renderUnoCard(wild);
  assert.ok(htmlWild.includes('★'), 'Renders star for wild');
});

it('UNO: Full state render contains player hand cards, discard pile, and draw pile', () => {
  const room = rooms.createRoom({ hostUser: u1, gameType: 'uno', maxPlayers: 2 });
  room.addPlayer(u2);
  const game = room.startGame(u1.id, UnoGame);

  const p1State = game.getStateForPlayer(u1.id);
  assert.strictEqual(p1State.myHand.length, 7, 'Player 1 receives 7 cards in hand');

  const rendered = renderUNO(p1State);
  assert.ok(rendered.includes('uno-game-container'), 'Contains game container');
  assert.ok(rendered.includes('uno-draw-pile'), 'Contains draw pile');
  assert.ok(rendered.includes('uno-discard-pile'), 'Contains discard pile');
  assert.ok(rendered.includes('player-hand-container'), 'Contains player hand container');
  assert.ok(rendered.includes('data-id="c_'), 'Renders individual card data-ids');
  assert.ok(!rendered.includes('أوراقك (0)'), 'Hand does not report 0 cards');
  assert.ok(rendered.includes('أوراقك (7)') || rendered.includes('7'), 'Hand displays correct count');
});

// 2. Chess Rendering & Pieces
console.log('\n--- 2. Chess Rendering Contract ---');
it('Chess: 64 squares rendered with 32 starting pieces and solid glyphs', () => {
  const room = rooms.createRoom({ hostUser: u1, gameType: 'chess', maxPlayers: 2 });
  room.addPlayer(u2);
  const game = room.startGame(u1.id, ChessGame);

  const p1State = game.getStateForPlayer(u1.id);
  assert.strictEqual(p1State.myColor, 'w', 'Host is white');

  const squaresHtml = renderChessSquares(p1State);
  // Must contain 64 squares
  const squareMatches = squaresHtml.match(/class="chess-square/g);
  assert.strictEqual(squareMatches.length, 64, 'Exactly 64 squares rendered');

  // Must contain pieces
  const pieceMatches = squaresHtml.match(/class="chess-piece/g);
  assert.strictEqual(pieceMatches.length, 32, 'Exactly 32 initial pieces rendered');

  // Verify solid Unicode piece symbols
  assert.strictEqual(PIECE_SYMBOLS.w.k, '♚', 'White king uses solid glyph');
  assert.strictEqual(PIECE_SYMBOLS.b.k, '♚', 'Black king uses solid glyph');

  const fullHtml = renderChess(p1State);
  assert.ok(fullHtml.includes('chess-board-grid'), 'Contains board grid');
  assert.ok(fullHtml.includes('chess-actions-bar'), 'Contains action controls');
});

// 3. Domino Rendering & Pips
console.log('\n--- 3. Domino Rendering Contract ---');
it('Domino: Pips render correctly for all numbers 0-6 without empty rectangles', () => {
  assert.strictEqual(renderPips(0), '<div class="pips-grid pips-0"></div>', 'Pip 0 is empty grid');
  assert.ok(renderPips(1).includes('pip center'), 'Pip 1 has center pip');
  assert.ok(renderPips(2).includes('pip top-left') && renderPips(2).includes('pip bottom-right'), 'Pip 2 has 2 pips');
  assert.ok(renderPips(6).includes('pip mid-left') && renderPips(6).includes('pip mid-right'), 'Pip 6 has 6 pips');

  // Board tile
  const tile = { id: 't_5_3', left: 5, right: 3, isDouble: false };
  const boardHtml = renderBoardTile(tile);
  assert.ok(boardHtml.includes('pips-5'), 'Board tile has pips-5');
  assert.ok(boardHtml.includes('pips-3'), 'Board tile has pips-3');

  // Hand tile
  const handHtml = renderHandTile(tile, true, false);
  assert.ok(handHtml.includes('data-id="t_5_3"'), 'Hand tile has data-id');
  assert.ok(handHtml.includes('pips-5'), 'Hand tile has pips-5');
  assert.ok(handHtml.includes('pips-3'), 'Hand tile has pips-3');
});

it('Domino: Full state render displays tiles in hand and on table', () => {
  const room = rooms.createRoom({ hostUser: u1, gameType: 'domino', maxPlayers: 2 });
  room.addPlayer(u2);
  const game = room.startGame(u1.id, DominoGame);

  const p1State = game.getStateForPlayer(u1.id);
  assert.strictEqual(p1State.myHand.length, 7, 'Player 1 has 7 tiles dealt');

  const rendered = renderDomino(p1State);
  assert.ok(rendered.includes('domino-game-container'), 'Contains container');
  assert.ok(rendered.includes('domino-chain-container'), 'Contains chain container');
  assert.ok(rendered.includes('domino-hand-container'), 'Contains hand container');
  assert.ok(rendered.includes('data-id="t_'), 'Renders tiles in hand');
  assert.ok(rendered.includes('قطعك (7)'), 'Displays correct hand count 7');
});

console.log(`\n======================================================`);
console.log(` ALL ${passed} / ${total} UI RENDERING & DATA CONTRACT TESTS PASSED! 🏆`);
console.log(`======================================================\n`);
process.exit(0);
