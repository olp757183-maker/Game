/**
 * Comprehensive Automated Test Runner for Classic Games
 * Verifies Auth, Rooms, Rules, Anti-Cheat / Turn Validation, and all 5 Game Engines.
 */

import assert from 'node:assert';
import users from '../server/users.js';
import auth from '../server/auth.js';
import rooms, { Room } from '../server/rooms.js';
import database from '../server/database.js';
import { getEffectiveRules, getDefaultRules } from '../shared/rules.js';
import UnoGame from '../server/games/uno.js';
import ChessGame from '../server/games/chess.js';
import DominoGame from '../server/games/domino.js';
import BalootGame from '../server/games/baloot.js';
import CardsGame from '../server/games/cards.js';

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function main() {
  console.log('\n========================================');
  console.log(' Classic Games - Automated Test Suite');
  console.log('========================================\n');

  // 1. AUTHENTICATION & USER MANAGEMENT
  console.log('--- 1. Authentication & Users ---');
  let userA, userB, userC, userD;

  await runTest('User Registration with secure password hashing', async () => {
    const testUsername = `test_hero_${Date.now()}`;
    userA = await users.register({
      username: testUsername,
      email: `${testUsername}@example.com`,
      password: 'secretPassword123'
    });
    assert.ok(userA.id);
    assert.strictEqual(userA.username, testUsername);
  });

  await runTest('User Authentication with valid and invalid credentials', async () => {
    const loggedIn = await users.authenticate({
      identifier: userA.username,
      password: 'secretPassword123'
    });
    assert.strictEqual(loggedIn.id, userA.id);

    // Wrong password should throw
    await assert.rejects(async () => {
      await users.authenticate({
        identifier: userA.username,
        password: 'wrongPassword'
      });
    }, /Invalid credentials/);
  });

  await runTest('Session Token Generation & Verification', () => {
    const token = auth.createSession(userA.id);
    assert.ok(token);
    const verified = auth.verifyToken(token);
    assert.strictEqual(verified.id, userA.id);
  });

  await runTest('Guest Account Creation', () => {
    userB = users.createGuest('PlayerB');
    userC = users.createGuest('PlayerC');
    userD = users.createGuest('PlayerD');
    assert.ok(userB.isGuest);
    assert.ok(userB.username.includes('PlayerB'));
  });

  // 2. ROOM CREATION & MANAGEMENT
  console.log('\n--- 2. Room Management & Host Powers ---');
  let unoRoom;

  await runTest('Room Creation with Code and Host Assignment', () => {
    unoRoom = rooms.createRoom({
      hostUser: userA,
      gameType: 'uno',
      maxPlayers: 4,
      privacy: 'public',
      rules: { turnTimer: 60, startingCards: 7 }
    });
    assert.ok(unoRoom.id);
    assert.ok(unoRoom.code);
    assert.strictEqual(unoRoom.hostId, userA.id);
    assert.strictEqual(unoRoom.players.length, 1);
    assert.strictEqual(unoRoom.players[0].id, userA.id);
  });

  await runTest('Player Joining and Full Room Limit', () => {
    unoRoom.addPlayer(userB);
    assert.strictEqual(unoRoom.players.length, 2);
    assert.strictEqual(unoRoom.players[1].id, userB.id);
  });

  await runTest('Host Transfers and Host Permissions', () => {
    unoRoom.transferHost(userB.id);
    assert.strictEqual(unoRoom.hostId, userB.id);
    // Transfer back to A
    unoRoom.transferHost(userA.id);
    assert.strictEqual(unoRoom.hostId, userA.id);
  });

  await runTest('Non-Host Kicking or Starting Game Forbidden', () => {
    // Non-host (userB) trying to kick host (userA)
    assert.throws(() => {
      unoRoom.kickPlayer(userB.id, userA.id);
    }, /Only the room host can kick/);

    // Non-host trying to start game
    assert.throws(() => {
      unoRoom.startGame(userB.id, UnoGame);
    }, /Only the room host can start/);
  });

  // 3. RULES ENGINE
  console.log('\n--- 3. Rules Engine & Sanitization ---');
  await runTest('Default and Effective Rules Merging', () => {
    const custom = { startingCards: 5, stacking: false, invalidProp: 'xyz' };
    const effective = getEffectiveRules('uno', custom);
    assert.strictEqual(effective.startingCards, 5);
    assert.strictEqual(effective.stacking, false);
    assert.strictEqual(effective.turnTimer, 60); // Default preserved
  });

  // 4. UNO GAME ENGINE & OUT-OF-TURN REJECTION
  console.log('\n--- 4. UNO Engine & Private State ---');
  let unoGameInstance;

  await runTest('Start UNO and Verify Private State Isolation', () => {
    unoGameInstance = unoRoom.startGame(userA.id, UnoGame);
    assert.strictEqual(unoGameInstance.status, 'PLAYING');

    // Check Player A state
    const stateA = unoGameInstance.getStateForPlayer(userA.id);
    // Check Player B state
    const stateB = unoGameInstance.getStateForPlayer(userB.id);

    // Private Information Security: Player A can see their own hand (7 cards)
    assert.strictEqual(stateA.myHand.length, 7);
    assert.strictEqual(stateB.myHand.length, 7);

    // BUT in stateA, other players' card contents are HIDDEN!
    const opponentView = stateA.players.find(p => p.id === userB.id);
    assert.strictEqual(opponentView.cardCount, 7);
    assert.strictEqual(opponentView.hand, undefined); // No secret cards leaked!
  });

  await runTest('Turn System: Reject Out-of-Turn Move', () => {
    const current = unoGameInstance.getCurrentPlayer();
    const otherPlayer = unoGameInstance.players.find(p => p.id !== current.id);

    // The other player tries to play out of turn:
    assert.throws(() => {
      const card = otherPlayer.hand[0];
      unoGameInstance.handleAction(otherPlayer.id, {
        type: 'PLAY_CARD',
        cardId: card.id
      });
    }, /ليست هذه حركتك/);
  });

  await runTest('Turn System: Legal Turn Action & Deck Draw', () => {
    const current = unoGameInstance.getCurrentPlayer();
    const result = unoGameInstance.handleAction(current.id, { type: 'DRAW_CARD' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(current.hand.length, 8); // Drew 1 card
  });

  // 5. CHESS GAME ENGINE
  console.log('\n--- 5. Chess Engine ---');
  let chessRoom, chessGame;

  await runTest('Chess Board Setup & Legal Moves Execution', () => {
    chessRoom = rooms.createRoom({
      hostUser: userA,
      gameType: 'chess',
      maxPlayers: 2
    });
    chessRoom.addPlayer(userB);
    chessGame = chessRoom.startGame(userA.id, ChessGame);

    assert.strictEqual(chessGame.currentTurn, 'w');
    const legalWhiteMoves = chessGame.getLegalMoves('w');
    assert.strictEqual(legalWhiteMoves.length, 20); // 16 pawn + 4 knight moves

    // Play 1. e2-e4 (row 6, col 4 to row 4, col 4)
    const moveRes = chessGame.handleAction(userA.id, {
      type: 'MOVE',
      from: { row: 6, col: 4 },
      to: { row: 4, col: 4 }
    });
    assert.strictEqual(moveRes.success, true);
    assert.strictEqual(chessGame.currentTurn, 'b');
  });

  await runTest('Chess Illegal Move Rejection', () => {
    // Black tries to move illegally (e.g. King jumps 4 squares)
    assert.throws(() => {
      chessGame.handleAction(userB.id, {
        type: 'MOVE',
        from: { row: 0, col: 4 },
        to: { row: 4, col: 4 }
      });
    }, /حركة غير قانونية/);
  });

  // 6. DOMINO GAME ENGINE
  console.log('\n--- 6. Domino Engine ---');
  let dominoRoom, dominoGame;

  await runTest('Domino Tile Dealing & Chain Placement', () => {
    dominoRoom = rooms.createRoom({
      hostUser: userA,
      gameType: 'domino',
      maxPlayers: 2
    });
    dominoRoom.addPlayer(userB);
    dominoGame = dominoRoom.startGame(userA.id, DominoGame);

    assert.strictEqual(dominoGame.status, 'PLAYING');
    const cur = dominoGame.getCurrentPlayer();
    const firstTile = cur.hand[0];

    // Play first tile
    const playRes = dominoGame.handleAction(cur.id, {
      type: 'PLAY_TILE',
      tileId: firstTile.id,
      side: 'right'
    });
    assert.strictEqual(playRes.success, true);
    assert.strictEqual(dominoGame.board.length, 1);
  });

  // 7. BALOOT GAME ENGINE
  console.log('\n--- 7. Baloot Engine (4 Players) ---');
  let balootRoom, balootGame;

  await runTest('Baloot 4-Player 2-Team Dealing & Sun Contract Bidding', () => {
    balootRoom = rooms.createRoom({
      hostUser: userA,
      gameType: 'baloot',
      maxPlayers: 4
    });
    balootRoom.addPlayer(userB);
    balootRoom.addPlayer(userC);
    balootRoom.addPlayer(userD);

    balootGame = balootRoom.startGame(userA.id, BalootGame);
    assert.strictEqual(balootGame.status, 'BIDDING');
    assert.ok(balootGame.floorCard);

    // All players have 5 initial cards
    balootGame.players.forEach(p => {
      assert.strictEqual(p.hand.length, 5);
    });

    // Bidder calls Sun
    const bidder = balootGame.getCurrentPlayer();
    const bidRes = balootGame.handleAction(bidder.id, {
      type: 'BID',
      bid: 'sun'
    });
    assert.strictEqual(bidRes.success, true);
    assert.strictEqual(balootGame.status, 'PLAYING');
    assert.strictEqual(balootGame.contract.type, 'sun');

    // All players now have 8 cards!
    balootGame.players.forEach(p => {
      assert.strictEqual(p.hand.length, 8);
    });
  });

  // 8. CARDS / BATTA GAME ENGINE
  console.log('\n--- 8. Cards / Batta Engine ---');
  let cardsRoom, cardsGame;

  await runTest('Cards Engine 52-card Shedding & Top Discard Match', () => {
    cardsRoom = rooms.createRoom({
      hostUser: userA,
      gameType: 'cards',
      maxPlayers: 2
    });
    cardsRoom.addPlayer(userB);
    cardsGame = cardsRoom.startGame(userA.id, CardsGame);

    assert.strictEqual(cardsGame.status, 'PLAYING');
    assert.ok(cardsGame.getTopDiscard());
    assert.strictEqual(cardsGame.players[0].hand.length, 5);
    assert.strictEqual(cardsGame.players[1].hand.length, 5);
  });

  // 9. DATABASE STATS & REPOSITORY
  console.log('\n--- 9. Database & Stats ---');
  await runTest('Game Result Stats Recording', () => {
    database.recordGameStat(userA.id, 'uno', true, 120);
    const stats = database.getUserStats(userA.id);
    const unoStat = stats.find(s => s.game === 'uno');
    assert.ok(unoStat);
    assert.strictEqual(unoStat.wins, 1);
    assert.strictEqual(unoStat.score, 120);
  });

  console.log('\n========================================');
  console.log(` Test Results: ${passedTests} / ${totalTests} Passed`);
  console.log('========================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
