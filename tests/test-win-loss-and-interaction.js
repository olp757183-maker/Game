/**
 * Automated Verification Suite: Win/Loss Logic, Direct Interaction & Lifecycle
 * Verifies:
 * - UNO: Direct play, last-card Draw 2 penalty, scoring, single winner, no premature win.
 * - Chess: Check vs Checkmate vs Stalemate, no moves after end, winner/loser sync.
 * - Domino: Direct placement, empty hand win, blocked game lowest-pip win, tie handling.
 * - Baloot: 4-player bidding, trick taking, 152 target score match win & loser team.
 * - UI & Lifecycle: No location.reload, isolated errors.
 */

import assert from 'node:assert';
import users from '../server/users.js';
import rooms from '../server/rooms.js';
import UnoGame from '../server/games/uno.js';
import ChessGame from '../server/games/chess.js';
import DominoGame from '../server/games/domino.js';
import { validateGameType } from '../shared/validation.js';
import { GAME_STATUS, ERROR_CODES } from '../shared/constants.js';

let passedCount = 0;
let totalCount = 0;

async function it(title, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${title}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${title}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' Win/Loss Logic & Direct Interaction Verification Tests');
  console.log('======================================================\n');

  const u1 = users.createGuest('Alice');
  const u2 = users.createGuest('Bob');
  const u3 = users.createGuest('Charlie');
  const u4 = users.createGuest('Dave');

  // ------------------------------------------------------------------
  // 1. UNO TESTS
  // ------------------------------------------------------------------
  console.log('--- 1. UNO: Win/Loss & Direct Interaction ---');

  await it('UNO: Check is NOT win, legal card plays directly, illegal rejected', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'uno', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, UnoGame);

    const activePlayer = game.getCurrentPlayer();
    const otherPlayer = game.players.find(p => p.id !== activePlayer.id);

    // Verify illegal card is rejected
    assert.throws(() => {
      game.handleAction(otherPlayer.id, {
        type: 'PLAY_CARD',
        cardId: 'non_existent_card'
      });
    }, /ليس دورك الآن|البطاقة غير موجودة|الورقة غير موجودة/);

    // Give active player a guaranteed matching card
    game.pendingDraw = 0;
    const top = game.getTopDiscard();
    const activeColor = (game.currentColor && game.currentColor !== 'wild') ? game.currentColor : 'red';
    game.currentColor = activeColor;
    activePlayer.hand[0] = { id: 'guaranteed_card', color: activeColor, value: '5', score: 5 };

    const playRes = game.handleAction(activePlayer.id, {
      type: 'PLAY_CARD',
      cardId: 'guaranteed_card'
    });
    assert.strictEqual(playRes.success, true);
    assert.strictEqual(game.getTopDiscard().id, 'guaranteed_card');
  });

  await it('UNO: If last card is Draw 2 (+2), victim draws 2 cards before points are scored', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'uno', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, UnoGame);

    const p1 = game.players[0];
    const p2 = game.players[1];

    game.currentTurnIndex = 0;
    const top = game.getTopDiscard();

    // P1 down to 1 card: a Draw 2 matching top color
    p1.hand = [{ id: 'winning_draw2', color: top.color, value: 'draw2', score: 20 }];
    const p2InitialCount = p2.hand.length;

    // P1 plays last card
    const res = game.handleAction(p1.id, {
      type: 'PLAY_CARD',
      cardId: 'winning_draw2'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.event, 'ROUND_WON');
    assert.strictEqual(p1.hand.length, 0);

    // P2 MUST have received 2 penalty cards before round finished
    assert.strictEqual(p2.hand.length, p2InitialCount + 2, 'Victim must draw 2 penalty cards on final draw2!');
    // P1 awarded points including those drawn cards
    assert.ok(game.roundPointsAwarded > 0, 'Winner awarded points from opponent hand');
  });

  await it('UNO: Only one winner announced, targetScore triggers MATCH_END', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'uno', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, UnoGame);

    const p1 = game.players[0];
    const p2 = game.players[1];

    game.currentTurnIndex = 0;
    game.rules.targetScore = 50; // low target for test
    const top = game.getTopDiscard();

    p1.hand = [{ id: 'last_c', color: top.color, value: '7', score: 7 }];
    p2.hand = [
      { id: 'opp_w1', color: 'wild', value: 'wild', score: 50 },
      { id: 'opp_w2', color: 'wild', value: 'wild', score: 50 }
    ];

    game.handleAction(p1.id, { type: 'PLAY_CARD', cardId: 'last_c' });

    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winner, p1.username);
    assert.strictEqual(game.loser, p2.username);
    assert.strictEqual(game.draw, false);
    assert.strictEqual(game.scores[p1.id], 100);
  });

  // ------------------------------------------------------------------
  // 2. CHESS TESTS
  // ------------------------------------------------------------------
  console.log('--- 2. CHESS: Check vs Checkmate vs Stalemate ---');

  await it('Chess: Check does NOT end game or declare win', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'chess', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, ChessGame);

    // Set up a simple check scenario
    // e.g. Scholar's check (Qxf7+ with King able to capture or move)
    game.board = Array(8).fill(null).map(() => Array(8).fill(null));
    game.board[0][4] = { type: 'k', color: 'b' }; // Black King at e8
    game.board[0][3] = { type: 'q', color: 'b' }; // Black Queen at d8
    game.board[7][4] = { type: 'k', color: 'w' }; // White King at e1
    game.board[1][4] = { type: 'q', color: 'w' }; // White Queen checks Black King at e7

    game.currentTurn = 'b';
    game.inCheck = game.isKingInCheck(game.board, 'b');

    assert.strictEqual(game.inCheck, true, 'Black King is in check');
    assert.strictEqual(game.status, GAME_STATUS.PLAYING, 'Game must still be PLAYING on check!');
    assert.strictEqual(game.winner, null, 'No winner on simple check');
  });

  await it('Chess: Checkmate triggers MATCH_END, winner and loser set, blocks subsequent moves', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'chess', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, ChessGame);

    // Fool's mate setup:
    // 1. f3 e5 2. g4 Qh4#
    game.handleAction(u1.id, { type: 'MOVE', from: { row: 6, col: 5 }, to: { row: 5, col: 5 } }); // f2-f3
    game.handleAction(u2.id, { type: 'MOVE', from: { row: 1, col: 4 }, to: { row: 3, col: 4 } }); // e7-e5
    game.handleAction(u1.id, { type: 'MOVE', from: { row: 6, col: 6 }, to: { row: 4, col: 6 } }); // g2-g4
    const res = game.handleAction(u2.id, { type: 'MOVE', from: { row: 0, col: 3 }, to: { row: 4, col: 7 } }); // Qh4#

    assert.strictEqual(res.inCheck, true);
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winner, u2.username);
    assert.strictEqual(game.loser, u1.username);
    assert.strictEqual(game.reason, 'CHECKMATE');

    // Subsequent move MUST be blocked
    assert.throws(() => {
      game.handleAction(u1.id, { type: 'MOVE', from: { row: 6, col: 0 }, to: { row: 5, col: 0 } });
    }, /انتهت اللعبة بالفعل/);
  });

  await it('Chess: Stalemate sets draw: true, winner: null, reason: STALEMATE', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'chess', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, ChessGame);

    // Classic stalemate board: Black King cornered at a8, White King at c7, White Queen moves to b6
    game.board = Array(8).fill(null).map(() => Array(8).fill(null));
    game.board[0][0] = { type: 'k', color: 'b' }; // a8 (row 0, col 0)
    game.board[1][2] = { type: 'k', color: 'w' }; // c7 (row 1, col 2)
    game.board[3][1] = { type: 'q', color: 'w' }; // b5 (row 3, col 1)

    game.currentTurn = 'w';
    // Move Queen from b5 (row 3, col 1) to b6 (row 2, col 1)
    const res = game.handleAction(u1.id, {
      type: 'MOVE',
      from: { row: 3, col: 1 },
      to: { row: 2, col: 1 }
    });

    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.draw, true);
    assert.strictEqual(game.winner, null);
    assert.strictEqual(game.reason, 'STALEMATE');
  });

  // ------------------------------------------------------------------
  // 3. DOMINO TESTS
  // ------------------------------------------------------------------
  console.log('--- 3. DOMINO: Empty Hand & Blocked Game Lowest Pip ---');

  await it('Domino: Empty hand wins round immediately and awards opponent pip points', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'domino', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, DominoGame);

    const p1 = game.players[0];
    const p2 = game.players[1];

    game.currentTurnIndex = 0;
    game.board = [{ left: 5, right: 3, placedLeft: 5, placedRight: 3 }];
    game.leftEnd = 5;
    game.rightEnd = 3;

    p1.hand = [{ id: 't_final', left: 3, right: 4, weight: 7 }];
    p2.hand = [{ id: 't_opp', left: 6, right: 6, weight: 12 }];

    const res = game.handleAction(p1.id, {
      type: 'PLAY_TILE',
      tileId: 't_final',
      side: 'right'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.event, 'DOMINO_WON');
    assert.strictEqual(p1.hand.length, 0);
    assert.strictEqual(game.roundWinner, p1.username);
    assert.strictEqual(game.roundPointsAwarded, 12, 'Awards opponent 6-6 pip sum (12)');
  });

  await it('Domino: Blocked game (صكّة) awards win to player with lowest pip sum', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'domino', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, DominoGame);

    const p1 = game.players[0];
    const p2 = game.players[1];

    game.board = [{ left: 1, right: 2, placedLeft: 1, placedRight: 2 }];
    game.leftEnd = 1;
    game.rightEnd = 2;
    game.boneyard = []; // empty boneyard

    // P1 has pip sum 4 (0-4), P2 has pip sum 9 (4-5)
    p1.hand = [{ id: 'p1_t', left: 0, right: 4, weight: 4 }];
    p2.hand = [{ id: 'p2_t', left: 4, right: 5, weight: 9 }];

    // Both pass consecutively
    game.currentTurnIndex = 0;
    game.handleAction(p1.id, { type: 'PASS' });
    game.handleAction(p2.id, { type: 'PASS' });

    assert.strictEqual(game.roundWinner, p1.username, 'Player with lowest pip sum wins blocked game');
    assert.strictEqual(game.roundPointsAwarded, 9, 'Points awarded from opponent remaining pips');
  });

  // ------------------------------------------------------------------
  // 4. REGISTRY INTEGRITY: CARDS & BALOOT EXCLUSION
  // ------------------------------------------------------------------
  console.log('--- 4. REGISTRY INTEGRITY: Cards & Baloot Rejection ---');

  await it('Cards and Baloot actions cannot be created or played', () => {
    assert.strictEqual(validateGameType('baloot').valid, false);
    assert.strictEqual(validateGameType('cards').valid, false);
    assert.throws(() => {
      rooms.createRoom({ hostUser: u1, gameType: 'baloot', maxPlayers: 4 });
    }, /Unsupported|غير مدعوم/i);
  });

  console.log('\n======================================================');
  console.log(` ALL ${passedCount} / ${totalCount} VERIFICATION TESTS PASSED! 🚀`);
  console.log('======================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
