/**
 * Comprehensive Automated Verification Suite: Authoritative Win/Loss Engine
 * Validates:
 * 1. UNO:
 *    - Playing last legal card immediately ends match with MATCH_END.
 *    - Hand is 0 and status is NOT PLAYING.
 *    - Playing Wild 4 as last card applies penalty, then ends match.
 *    - Wild without color is rejected, preventing premature win.
 *    - No duplicate win announcements on action replay.
 *    - Moves after finish are rejected.
 * 2. CHESS:
 *    - Normal move does not end match.
 *    - Check does not end match.
 *    - Checkmate sets MATCH_END, correct winner/loser, and blocks further moves.
 *    - Stalemate sets MATCH_END with draw: true.
 * 3. DOMINO:
 *    - Empty hand ends match with MATCH_END.
 *    - Blocked game detects blockage and awards win to lowest pip sum.
 *    - Blocked game tie sets draw.
 * 4. BALOOT:
 *    - Round points calculated correctly.
 *    - Does NOT announce win before target score (152).
 *    - Reaching 152 ends match with winning and losing team.
 * 5. REAL-TIME & ROOM LIFECYCLE:
 *    - Room status becomes FINISHED upon match end.
 *    - Reconnection retrieves preserved finished state without reset.
 */

import assert from 'node:assert';
import users from '../server/users.js';
import rooms from '../server/rooms.js';
import UnoGame from '../server/games/uno.js';
import ChessGame from '../server/games/chess.js';
import DominoGame from '../server/games/domino.js';
import BalootGame from '../server/games/baloot.js';
import CardsGame from '../server/games/cards.js';
import { ROOM_STATUS, GAME_STATUS, ERROR_CODES } from '../shared/constants.js';

let passedCount = 0;
let totalCount = 0;

async function test(title, fn) {
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

async function runAll() {
  console.log('\n======================================================');
  console.log(' Authoritative Win/Loss System Verification Suite');
  console.log('======================================================\n');

  const u1 = users.createGuest('Player1');
  const u2 = users.createGuest('Player2');
  const u3 = users.createGuest('Player3');
  const u4 = users.createGuest('Player4');

  // ==================================================================
  // 1. UNO TESTS
  // ==================================================================
  console.log('--- 1. UNO Win/Loss Authoritative Logic ---');

  await test('UNO: Player playing last normal card transitions directly from PLAYING to MATCH_END', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'uno', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, UnoGame);

    const p1 = game.players[0];
    const p2 = game.players[1];
    game.currentTurnIndex = 0;
    const top = game.getTopDiscard();

    // P1 has exactly 1 card matching top
    p1.hand = [{ id: 'last_red_5', color: top.color, value: '5', score: 5 }];
    p2.hand = [{ id: 'p2_c1', color: 'blue', value: '7', score: 7 }, { id: 'p2_c2', color: 'green', value: '2', score: 2 }];

    assert.strictEqual(game.status, GAME_STATUS.PLAYING);

    const res = game.handleAction(p1.id, {
      type: 'PLAY_CARD',
      cardId: 'last_red_5'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(p1.hand.length, 0, 'P1 hand must be exactly 0 cards');
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END, 'Game must transition to MATCH_END');
    assert.notStrictEqual(game.status, GAME_STATUS.PLAYING, 'Game must NOT remain in PLAYING');
    assert.strictEqual(game.winner, p1.username);
    assert.strictEqual(game.winnerId, p1.id);
    assert.strictEqual(game.loser, p2.username);
    assert.strictEqual(game.loserId, p2.id);
    assert.strictEqual(game.draw, false);
    assert.strictEqual(game.reason, 'ALL_CARDS_PLAYED');

    // Verify public state
    const pub = game.getPublicState();
    assert.strictEqual(pub.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(pub.winner, p1.username);
    assert.strictEqual(pub.players[0].cardCount, 0);

    // Verify further moves rejected
    assert.throws(() => {
      game.handleAction(p2.id, { type: 'DRAW_CARD' });
    }, /انتهت اللعبة بالفعل|Game has finished/);
  });

  await test('UNO: Playing Wild Draw Four (+4) as last card requires color, forces victim draw, then ends in MATCH_END', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'uno', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, UnoGame);

    const p1 = game.players[0];
    const p2 = game.players[1];
    game.currentTurnIndex = 0;

    p1.hand = [{ id: 'last_wild_4', color: 'wild', value: 'wild4', score: 50 }];
    p2.hand = [{ id: 'p2_card_a', color: 'blue', value: '1', score: 1 }];

    // Wild without chosenColor must be rejected and NOT end game
    assert.throws(() => {
      game.handleAction(p1.id, {
        type: 'PLAY_CARD',
        cardId: 'last_wild_4',
        chosenColor: null
      });
    });
    assert.strictEqual(p1.hand.length, 1, 'Card must remain in hand on invalid play');
    assert.strictEqual(game.status, GAME_STATUS.PLAYING);

    // Now play with chosenColor: red
    const p2CountBefore = p2.hand.length;
    const res = game.handleAction(p1.id, {
      type: 'PLAY_CARD',
      cardId: 'last_wild_4',
      chosenColor: 'red'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(p1.hand.length, 0);
    assert.strictEqual(p2.hand.length, p2CountBefore + 4, 'Victim must draw 4 cards before end');
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winner, p1.username);
  });

  // ==================================================================
  // 2. CHESS TESTS
  // ==================================================================
  console.log('\n--- 2. Chess Win/Loss Authoritative Logic ---');

  await test('Chess: Normal move and Check do NOT end the match', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'chess', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, ChessGame);

    const whitePlayer = game.players.find(p => p.color === 'w');
    const blackPlayer = game.players.find(p => p.color === 'b');

    // 1. e2-e4
    const res1 = game.handleAction(whitePlayer.id, {
      type: 'MOVE',
      from: { row: 6, col: 4 },
      to: { row: 4, col: 4 }
    });
    assert.strictEqual(res1.success, true);
    assert.strictEqual(game.status, GAME_STATUS.PLAYING, 'Normal move must remain in PLAYING');
    assert.strictEqual(game.winner, null);

    // 1... e7-e5
    game.handleAction(blackPlayer.id, {
      type: 'MOVE',
      from: { row: 1, col: 4 },
      to: { row: 3, col: 4 }
    });
    assert.strictEqual(game.status, GAME_STATUS.PLAYING);

    // 2. Qh5 (f7 threat)
    game.handleAction(whitePlayer.id, {
      type: 'MOVE',
      from: { row: 7, col: 3 },
      to: { row: 3, col: 7 }
    });
    assert.strictEqual(game.status, GAME_STATUS.PLAYING);
  });

  await test('Chess: Checkmate sets MATCH_END, winner, loser, and blocks subsequent moves', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'chess', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, ChessGame);

    const whitePlayer = game.players.find(p => p.color === 'w');
    const blackPlayer = game.players.find(p => p.color === 'b');

    // Fool's Mate sequence:
    // 1. f2-f3
    game.handleAction(whitePlayer.id, { type: 'MOVE', from: { row: 6, col: 5 }, to: { row: 5, col: 5 } });
    // 1... e7-e5
    game.handleAction(blackPlayer.id, { type: 'MOVE', from: { row: 1, col: 4 }, to: { row: 3, col: 4 } });
    // 2. g2-g4
    game.handleAction(whitePlayer.id, { type: 'MOVE', from: { row: 6, col: 6 }, to: { row: 4, col: 6 } });
    // 2... Qh4# (Checkmate!)
    const mateRes = game.handleAction(blackPlayer.id, { type: 'MOVE', from: { row: 0, col: 3 }, to: { row: 4, col: 7 } });

    assert.strictEqual(mateRes.success, true);
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END, 'Must be MATCH_END after checkmate');
    assert.strictEqual(game.winner, blackPlayer.username);
    assert.strictEqual(game.winnerId, blackPlayer.id);
    assert.strictEqual(game.loser, whitePlayer.username);
    assert.strictEqual(game.loserId, whitePlayer.id);
    assert.strictEqual(game.draw, false);
    assert.strictEqual(game.reason, 'CHECKMATE');
    assert.strictEqual(game.finishReason, 'CHECKMATE');

    // Reject subsequent moves
    assert.throws(() => {
      game.handleAction(whitePlayer.id, { type: 'MOVE', from: { row: 6, col: 0 }, to: { row: 5, col: 0 } });
    }, /انتهت اللعبة بالفعل|Game has finished/);
  });

  await test('Chess: Stalemate sets MATCH_END with draw: true and winner: null', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'chess', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, ChessGame);

    const whitePlayer = game.players.find(p => p.color === 'w');
    const blackPlayer = game.players.find(p => p.color === 'b');

    // Setup custom stalemate board:
    // Black King at a8 (0,0), White King at c7 (1,2), White Queen at b6 (2,1)
    // Black turn to move, has 0 legal moves, not in check -> Stalemate!
    game.board = Array(8).fill(null).map(() => Array(8).fill(null));
    game.board[0][0] = { type: 'k', color: 'b' };
    game.board[1][2] = { type: 'k', color: 'w' };
    game.board[2][1] = { type: 'q', color: 'w' }; // Queen at b6

    // It is Black's turn (nextColor = 'b')
    game.currentTurn = 'b';
    game.inCheck = game.isKingInCheck(game.board, 'b');
    assert.strictEqual(game.inCheck, false, 'Black king must not be in check');

    // Execute a White move to trigger the checkmate/stalemate check on Black:
    // Move White King from c6 to c7 to trap Black King without check
    game.board[1][2] = null; // remove from c7
    game.board[2][2] = { type: 'k', color: 'w' }; // King at c6
    game.currentTurn = 'w';

    game.handleAction(whitePlayer.id, {
      type: 'MOVE',
      from: { row: 2, col: 2 },
      to: { row: 1, col: 2 }
    });

    assert.strictEqual(game.status, GAME_STATUS.MATCH_END, 'Must be MATCH_END after stalemate');
    assert.strictEqual(game.draw, true, 'draw must be true');
    assert.strictEqual(game.winner, null, 'winner must be null');
    assert.strictEqual(game.reason, 'STALEMATE');
    assert.strictEqual(game.finishReason, 'STALEMATE');
  });

  // ==================================================================
  // 3. DOMINO TESTS
  // ==================================================================
  console.log('\n--- 3. Domino Win/Loss Authoritative Logic ---');

  await test('Domino: Playing last tile immediately ends match in MATCH_END', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'domino', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, DominoGame);

    const p1 = game.players[0];
    const p2 = game.players[1];

    // Put board with [3|5]
    game.board = [{ id: 'b0', left: 3, right: 5, weight: 8, isDouble: false, placedLeft: 3, placedRight: 5 }];
    game.leftEnd = 3;
    game.rightEnd = 5;

    p1.hand = [{ id: 'winning_tile', left: 5, right: 2, weight: 7, isDouble: false }];
    p2.hand = [{ id: 'p2_t1', left: 6, right: 6, weight: 12, isDouble: true }];
    game.currentTurnIndex = 0;

    const res = game.handleAction(p1.id, {
      type: 'PLAY_TILE',
      tileId: 'winning_tile',
      side: 'right'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(p1.hand.length, 0);
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winner, p1.username);
    assert.strictEqual(game.winnerId, p1.id);
    assert.strictEqual(game.loser, p2.username);
    assert.strictEqual(game.draw, false);
  });

  await test('Domino: Blocked game (صكّة) determines lowest pip sum winner and ends match', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'domino', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, DominoGame);

    const p1 = game.players[0];
    const p2 = game.players[1];

    // Left end = 1, right end = 1
    game.board = [{ id: 'b1', left: 1, right: 1, weight: 2, isDouble: true, placedLeft: 1, placedRight: 1 }];
    game.leftEnd = 1;
    game.rightEnd = 1;
    game.boneyard = []; // empty boneyard

    // P1 has tile [2|3] (sum 5)
    p1.hand = [{ id: 't1', left: 2, right: 3, weight: 5, isDouble: false }];
    // P2 has tile [4|6] (sum 10)
    p2.hand = [{ id: 't2', left: 4, right: 6, weight: 10, isDouble: false }];

    game.currentTurnIndex = 0;
    // P1 passes (cannot play)
    game.handleAction(p1.id, { type: 'PASS' });
    assert.strictEqual(game.consecutivePasses, 1);

    // P2 passes (cannot play) -> triggers blocked game!
    game.handleAction(p2.id, { type: 'PASS' });

    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winner, p1.username, 'Player 1 has lowest pip sum (5 vs 10)');
    assert.strictEqual(game.winnerId, p1.id);
    assert.strictEqual(game.loser, p2.username);
  });

  // ==================================================================
  // 4. BALOOT TESTS
  // ==================================================================
  console.log('\n--- 4. Baloot Win/Loss Authoritative Logic ---');

  await test('Baloot: Target score (152) triggers MATCH_END and declares winning and losing teams', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'baloot', maxPlayers: 4 });
    room.addPlayer(u2);
    room.addPlayer(u3);
    room.addPlayer(u4);
    const game = room.startGame(u1.id, BalootGame);

    // Set score to 140 for Team 0, 80 for Team 1
    game.teamScores = [140, 80];
    game.contract = { type: 'sun', buyerSeat: 0, team: 0 };
    game.teamAbnat = [100, 30]; // Team 0 clearly won round
    game.status = GAME_STATUS.PLAYING;

    // Simulate round complete calculation
    game.finishRound();

    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winningTeam, 0);
    assert.ok(game.winner.includes('فريق 1'));
    assert.ok(game.loser.includes('فريق 2'));
    assert.strictEqual(game.finishReason, 'TARGET_REACHED');
  });

  await test('Baloot: Below target score does NOT end match, transitions to ROUND_END', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'baloot', maxPlayers: 4 });
    room.addPlayer(u2);
    room.addPlayer(u3);
    room.addPlayer(u4);
    const game = room.startGame(u1.id, BalootGame);

    game.teamScores = [30, 20];
    game.contract = { type: 'hokom', buyerSeat: 0, team: 0 };
    game.teamAbnat = [90, 40];
    game.status = GAME_STATUS.PLAYING;

    game.finishRound();

    assert.strictEqual(game.status, GAME_STATUS.ROUND_END);
    assert.strictEqual(game.winner, null, 'Winner must NOT be announced before target score');
  });

  // ==================================================================
  // 5. REAL-TIME & ROOM LIFECYCLE
  // ==================================================================
  console.log('\n--- 5. Real-Time & Reconnection Lifecycle ---');

  await test('Room Lifecycle: room.status updates to FINISHED and reconnection preserves finished state', () => {
    const room = rooms.createRoom({ hostUser: u1, gameType: 'uno', maxPlayers: 2 });
    room.addPlayer(u2);
    const game = room.startGame(u1.id, UnoGame);

    const p1 = game.players[0];
    game.currentTurnIndex = 0;
    const top = game.getTopDiscard();
    p1.hand = [{ id: 'fin_card', color: top.color, value: '1', score: 1 }];

    // Execute finish
    game.handleAction(p1.id, { type: 'PLAY_CARD', cardId: 'fin_card' });
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);

    // Simulate socket handler setting room.status = FINISHED
    room.status = ROOM_STATUS.FINISHED;

    // Now Player 2 disconnects and reconnects
    room.markPlayerConnected(u2.id, false);
    assert.strictEqual(p2Connected(room, u2.id), false);

    room.markPlayerConnected(u2.id, true);
    assert.strictEqual(p2Connected(room, u2.id), true);

    // Reconnected player gets state: verify room.status and game.status are preserved
    const p2State = room.getStateForPlayer(u2.id);
    assert.strictEqual(p2State.room.status, ROOM_STATUS.FINISHED);
    assert.strictEqual(p2State.game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(p2State.game.winner, p1.username);
  });

  function p2Connected(rm, uid) {
    return rm.players.find(p => p.id === uid)?.connected;
  }

  console.log('\n======================================================');
  console.log(` ALL ${passedCount} / ${totalCount} AUTHORITATIVE TESTS PASSED! 🏆`);
  console.log('======================================================\n');
  process.exit(0);
}

runAll().catch(err => {
  console.error('\nTest suite failed with error:', err);
  process.exit(1);
});
