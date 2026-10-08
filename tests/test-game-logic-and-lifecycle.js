/**
 * Comprehensive Game Logic & Lifecycle Verification Test Suite
 * Tests all 5 games (UNO, Cards, Baloot, Chess, Domino) for:
 * - Full lifecycle: WAITING -> PLAYING -> ROUND_END -> MATCH_END -> REMATCH
 * - Server-authoritative win/lose/draw conditions
 * - Scoring calculations & Target score thresholds
 * - Move validation & illegal move rejection
 * - Clean state guarantee (zero legal move indicators, zero hints)
 * - Rematch consensus voting & new gameId generation in same room
 */

import assert from 'node:assert';
import users from '../server/users.js';
import rooms from '../server/rooms.js';
import UnoGame from '../server/games/uno.js';
import CardsGame from '../server/games/cards.js';
import BalootGame from '../server/games/baloot.js';
import ChessGame from '../server/games/chess.js';
import DominoGame from '../server/games/domino.js';
import { GAME_STATUS } from '../shared/constants.js';

let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log(' Full Game Logic & Lifecycle Comprehensive Tests');
  console.log('======================================================\n');

  // Prepare test users
  const user1 = users.createGuest('Player1');
  const user2 = users.createGuest('Player2');
  const user3 = users.createGuest('Player3');
  const user4 = users.createGuest('Player4');

  // ==========================================
  // 1. CHESS TEST SUITE
  // ==========================================
  console.log('--- 1. CHESS ENGINE ---');

  await test('Chess: Board initialized, starting player white, zero legalMoves sent in state', () => {
    const room = rooms.createRoom({ hostUser: user1, gameType: 'chess', maxPlayers: 2 });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, ChessGame);

    assert.strictEqual(game.status, GAME_STATUS.PLAYING);
    assert.strictEqual(game.currentTurn, 'w');

    // Check player state: legalMoves MUST be undefined/omitted
    const p1State = game.getStateForPlayer(user1.id);
    assert.strictEqual(p1State.legalMoves, undefined, 'legalMoves must NOT be sent to client!');
    assert.strictEqual(p1State.myColor, 'w');
  });

  await test('Chess: Legal move e2-e4 executes and illegal move throws "حركة غير قانونية"', () => {
    const room = rooms.createRoom({ hostUser: user1, gameType: 'chess', maxPlayers: 2 });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, ChessGame);

    // Illegal move: moving pawn backwards or sideways or knight move for pawn
    assert.throws(() => {
      game.handleAction(user1.id, {
        type: 'MOVE',
        from: { row: 6, col: 4 }, // e2
        to: { row: 3, col: 4 }     // e5 (illegal 3 squares leap)
      });
    }, /حركة غير قانونية/);

    // Not player turn
    assert.throws(() => {
      game.handleAction(user2.id, {
        type: 'MOVE',
        from: { row: 1, col: 4 },
        to: { row: 2, col: 4 }
      });
    }, /ليست هذه حركتك/);

    // Legal move: e2 -> e4
    const res = game.handleAction(user1.id, {
      type: 'MOVE',
      from: { row: 6, col: 4 },
      to: { row: 4, col: 4 }
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(game.currentTurn, 'b');
  });

  await test('Chess: Resignation triggers MATCH_END, assigns winner/loser, and blocks further moves', () => {
    const room = rooms.createRoom({ hostUser: user1, gameType: 'chess', maxPlayers: 2 });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, ChessGame);

    game.handleAction(user1.id, { type: 'RESIGN' });
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winner, user2.username);
    assert.strictEqual(game.loser, user1.username);
    assert.strictEqual(game.draw, false);
    assert.strictEqual(game.reason, 'RESIGNATION');

    // Further moves must be strictly rejected
    assert.throws(() => {
      game.handleAction(user2.id, {
        type: 'MOVE',
        from: { row: 1, col: 4 },
        to: { row: 2, col: 4 }
      });
    }, /Game has finished/);
  });

  await test('Chess: Draw offer and acceptance triggers MATCH_END with draw: true', () => {
    const room = rooms.createRoom({ hostUser: user1, gameType: 'chess', maxPlayers: 2, rules: { allowDraw: true } });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, ChessGame);

    game.handleAction(user1.id, { type: 'OFFER_DRAW' });
    game.handleAction(user2.id, { type: 'RESPOND_DRAW', accept: true });

    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.draw, true);
    assert.strictEqual(game.winner, null);
    assert.strictEqual(game.reason, 'DRAW_AGREEMENT');
  });

  // ==========================================
  // 2. UNO TEST SUITE
  // ==========================================
  console.log('\n--- 2. UNO ENGINE ---');

  await test('UNO: Starts with 7 cards, clean state without isPlayable, validates legal and illegal moves', () => {
    const room = rooms.createRoom({ hostUser: user1, gameType: 'uno', maxPlayers: 2 });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, UnoGame);

    assert.strictEqual(game.status, GAME_STATUS.PLAYING);
    assert.strictEqual(game.players[0].hand.length, 7);
    assert.strictEqual(game.players[1].hand.length, 7);

    // Clean state check
    const p1State = game.getStateForPlayer(user1.id);
    assert.strictEqual(p1State.myHand[0].isPlayable, undefined, 'isPlayable must not be sent in state!');

    // Out of turn check
    const nonTurnPlayer = game.players[(game.currentTurnIndex + 1) % 2];
    assert.throws(() => {
      game.handleAction(nonTurnPlayer.id, { type: 'DRAW_CARD' });
    }, /ليست هذه حركتك/);
  });

  await test('UNO: Empty hand triggers round win, calculates points from opponent, reaches MATCH_END on target score', () => {
    const room = rooms.createRoom({
      hostUser: user1,
      gameType: 'uno',
      maxPlayers: 2,
      rules: { targetScore: 50, startingCards: 1 }
    });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, UnoGame);

    const activePlayer = game.getCurrentPlayer();
    const otherPlayer = game.players.find(p => p.id !== activePlayer.id);

    // Set opponent's hand to high-value card (e.g. Draw 2 = 20 pts, Wild = 50 pts)
    otherPlayer.hand = [
      { id: 'u_w1', color: 'wild', value: 'wild' }, // 50 pts
      { id: 'u_d1', color: 'red', value: 'draw2' }   // 20 pts
    ];

    // Give active player a card that matches the active color or value
    const top = game.getTopDiscard();
    const winningCard = { id: 'u_win1', color: game.currentColor, value: top.value };
    activePlayer.hand = [winningCard];

    // Play last card
    game.handleAction(activePlayer.id, {
      type: 'PLAY_CARD',
      cardId: winningCard.id
    });

    assert.strictEqual(activePlayer.hand.length, 0);
    // Opponent had 50 + 20 = 70 points, target is 50 -> should reach MATCH_END!
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winner, activePlayer.username);
    assert.ok(game.scores[activePlayer.id] >= 50);
  });

  // ==========================================
  // 3. CARDS / BATTA TEST SUITE
  // ==========================================
  console.log('\n--- 3. CARDS / BATTA ENGINE ---');

  await test('Cards: Empty hand triggers round win, awards points, clean hand without isPlayable', () => {
    const room = rooms.createRoom({
      hostUser: user1,
      gameType: 'cards',
      maxPlayers: 2,
      rules: { targetScore: 20 }
    });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, CardsGame);

    assert.strictEqual(game.status, GAME_STATUS.PLAYING);
    const p1State = game.getStateForPlayer(user1.id);
    assert.strictEqual(p1State.myHand[0].isPlayable, undefined);

    const activePlayer = game.getCurrentPlayer();
    const otherPlayer = game.players.find(p => p.id !== activePlayer.id);

    // Opponent has 2 cards (worth points)
    otherPlayer.hand = [
      { id: 'c_k1', suit: 'hearts', rank: 'K' }, // 10 pts
      { id: 'c_q1', suit: 'hearts', rank: 'Q' }  // 10 pts
    ];

    // Active player plays matching last card
    const top = game.getTopDiscard();
    const winningCard = { id: 'c_win1', suit: game.activeSuit, rank: top.rank };
    activePlayer.hand = [winningCard];

    game.handleAction(activePlayer.id, {
      type: 'PLAY_CARD',
      cardId: winningCard.id
    });

    assert.strictEqual(activePlayer.hand.length, 0);
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winner, activePlayer.username);
  });

  // ==========================================
  // 4. BALOOT TEST SUITE
  // ==========================================
  console.log('\n--- 4. BALOOT ENGINE ---');

  await test('Baloot: 4 players dealt 5 cards, bidding establishes contract, deals to 8 cards, clean state without isPlayable', () => {
    const room = rooms.createRoom({ hostUser: user1, gameType: 'baloot', maxPlayers: 4 });
    room.addPlayer(user2);
    room.addPlayer(user3);
    room.addPlayer(user4);
    const game = room.startGame(user1.id, BalootGame);

    assert.strictEqual(game.status, 'BIDDING');
    const p1State = game.getStateForPlayer(user1.id);
    assert.strictEqual(p1State.myHand[0].isPlayable, undefined);
    assert.strictEqual(p1State.myHand.length, 5);

    // First bidder bids Sun
    const bidder = game.getCurrentPlayer();
    game.handleAction(bidder.id, { type: 'BID', bid: 'sun' });

    assert.strictEqual(game.status, 'PLAYING');
    assert.strictEqual(game.contract.type, 'sun');
    // All players now have 8 cards
    game.players.forEach(p => assert.strictEqual(p.hand.length, 8));
  });

  await test('Baloot: Target score (152) triggers MATCH_END and declares winning team', () => {
    const room = rooms.createRoom({
      hostUser: user1,
      gameType: 'baloot',
      maxPlayers: 4,
      rules: { targetScore: 10 }
    });
    room.addPlayer(user2);
    room.addPlayer(user3);
    room.addPlayer(user4);
    const game = room.startGame(user1.id, BalootGame);

    const bidder = game.getCurrentPlayer();
    game.handleAction(bidder.id, { type: 'BID', bid: 'sun' });

    // Simulate round finish with high points
    game.teamAbnat = [100, 20];
    game.finishRound();

    // Since target is 10, team 0 won!
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.ok(game.winner.includes('فريق 1'));
    assert.strictEqual(game.reason, 'وصل إلى نقاط الفوز المطلوبة (10)');
  });

  // ==========================================
  // 5. DOMINO TEST SUITE
  // ==========================================
  console.log('\n--- 5. DOMINO ENGINE ---');

  await test('Domino: Starts with tiles, clean state without canPlayLeft/canPlayRight hints, rejects illegal tile', () => {
    const room = rooms.createRoom({ hostUser: user1, gameType: 'domino', maxPlayers: 2 });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, DominoGame);

    assert.strictEqual(game.status, GAME_STATUS.PLAYING);
    const p1State = game.getStateForPlayer(user1.id);
    assert.strictEqual(p1State.myHand[0].canPlayLeft, undefined);
    assert.strictEqual(p1State.myHand[0].canPlayRight, undefined);

    const activePlayer = game.getCurrentPlayer();
    const otherPlayer = game.players.find(p => p.id !== activePlayer.id);

    // Place first tile legally
    const firstTile = activePlayer.hand[0];
    game.handleAction(activePlayer.id, {
      type: 'PLAY_TILE',
      tileId: firstTile.id,
      side: 'right'
    });
    assert.strictEqual(game.board.length, 1);

    // Second player tries to play completely unmatched tile
    const unmatchingTile = { id: 'fake_domino_99', left: 99, right: 99, weight: 198 };
    otherPlayer.hand.push(unmatchingTile);

    assert.throws(() => {
      game.handleAction(otherPlayer.id, {
        type: 'PLAY_TILE',
        tileId: unmatchingTile.id,
        side: 'right'
      });
    }, /حركة غير قانونية/);
  });

  await test('Domino: Empty hand immediately ends round/match and awards opponent pip sum', () => {
    const room = rooms.createRoom({
      hostUser: user1,
      gameType: 'domino',
      maxPlayers: 2,
      rules: { targetScore: 10 }
    });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, DominoGame);

    const activePlayer = game.getCurrentPlayer();
    const opponent = game.players.find(p => p.id !== activePlayer.id);

    // Set opponent hand to 2 heavy tiles [6|6] and [5|5] = 22 pips
    opponent.hand = [
      { id: 't_66', left: 6, right: 6, weight: 12 },
      { id: 't_55', left: 5, right: 5, weight: 10 }
    ];

    // Active player has only 1 tile
    const lastTile = { id: 't_last', left: 3, right: 3, weight: 6 };
    activePlayer.hand = [lastTile];

    // Play last tile
    game.handleAction(activePlayer.id, {
      type: 'PLAY_TILE',
      tileId: lastTile.id,
      side: 'right'
    });

    assert.strictEqual(activePlayer.hand.length, 0);
    // 22 pips awarded to active player, target is 10 -> MATCH_END
    assert.strictEqual(game.status, GAME_STATUS.MATCH_END);
    assert.strictEqual(game.winner, activePlayer.username);
    assert.strictEqual(game.scores[activePlayer.id], 22);
  });

  await test('Domino: Blocked game calculates lowest pip sum winner', () => {
    const room = rooms.createRoom({ hostUser: user1, gameType: 'domino', maxPlayers: 2 });
    room.addPlayer(user2);
    const game = room.startGame(user1.id, DominoGame);

    // Put board tile [0|0]
    game.board = [{ left: 0, right: 0, placedLeft: 0, placedRight: 0 }];
    game.leftEnd = 0;
    game.rightEnd = 0;
    game.boneyard = []; // empty boneyard

    // Player 1 has tile [1|1] (weight 2)
    game.players[0].hand = [{ id: 'p1_t', left: 1, right: 1, weight: 2 }];
    // Player 2 has tile [6|6] (weight 12)
    game.players[1].hand = [{ id: 'p2_t', left: 6, right: 6, weight: 12 }];

    // Player 1 passes, then Player 2 passes -> consecutive passes = 2 = players.length -> BLOCKED!
    game.currentTurnIndex = 0;
    game.handleAction(game.players[0].id, { type: 'PASS' });
    game.handleAction(game.players[1].id, { type: 'PASS' });

    // Player 1 has lowest pip sum (2 vs 12), so Player 1 wins round!
    assert.strictEqual(game.roundWinner, game.players[0].username);
    assert.strictEqual(game.roundPointsAwarded, 12);
  });

  // ==========================================
  // 6. REMATCH CONSENSUS TEST SUITE
  // ==========================================
  console.log('\n--- 6. REMATCH CONSENSUS & ROOM LIFECYCLE ---');

  await test('Rematch: Requires all players consensus, then starts new game instance with fresh gameId in same room', () => {
    const room = rooms.createRoom({ hostUser: user1, gameType: 'uno', maxPlayers: 2 });
    room.addPlayer(user2);
    const game1 = room.startGame(user1.id, UnoGame);
    const originalGameId = game1.gameId;

    // Simulate match end
    game1.status = GAME_STATUS.MATCH_END;
    game1.winner = user1.username;

    // Player 1 votes rematch (1 of 2)
    const vote1 = room.voteRematch(user1.id);
    assert.strictEqual(vote1.votedCount, 1);
    assert.strictEqual(vote1.totalNeeded, 2);
    assert.strictEqual(vote1.ready, false);

    // Player 2 votes rematch (2 of 2)
    const vote2 = room.voteRematch(user2.id);
    assert.strictEqual(vote2.votedCount, 2);
    assert.strictEqual(vote2.ready, true);

    // Start next game
    const game2 = room.startNextGame(UnoGame);
    assert.strictEqual(game2.roomId, room.id, 'Room ID must remain identical');
    assert.notStrictEqual(game2.gameId, originalGameId, 'New game instance must have fresh gameId');
    assert.strictEqual(room.rematchVotes.size, 0, 'Votes must be reset for new game');
    assert.strictEqual(game2.status, GAME_STATUS.PLAYING);
  });

  console.log('\n======================================================');
  console.log(` ALL ENGINE & LIFECYCLE TESTS PASSED! (${passedTests}/${totalTests}) 🚀`);
  console.log('======================================================\n');
  process.exit(0);
}

runAllTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
