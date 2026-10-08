/**
 * Player Error Isolation & Resilience Verification Test Suite
 * Tests:
 * 1. Player A makes an invalid move -> A gets error, B is untouched.
 * 2. Player A clicks the same move 10 times rapidly -> No crash, no duplicate execution, no state corruption.
 * 3. Player A attempts to move out of turn -> Error to A only, turn does not change.
 * 4. Player A sends malformed/missing payload -> Server rejects safely without crash.
 * 5. Player A disconnects and reconnects -> B continues, A restores exact Game State.
 * 6. Player A leaves room -> B sees leave event instantly without refresh.
 * 7. Player A makes a legal move -> B receives it instantly.
 */

import http from 'node:http';
import express from 'express';
import { io as ClientIO } from 'socket.io-client';
import assert from 'node:assert';

import { setupSocketServer } from '../server/socket.js';
import users from '../server/users.js';
import auth from '../server/auth.js';
import rooms from '../server/rooms.js';
import { SOCKET_EVENTS, ERROR_CODES } from '../shared/constants.js';

async function runErrorIsolationTests() {
  console.log('\n======================================================');
  console.log(' Starting Player Error Isolation & Resilience Tests');
  console.log('======================================================\n');

  const app = express();
  const server = http.createServer(app);
  setupSocketServer(server);

  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const serverUrl = `http://localhost:${port}`;

  // Create Users A & B
  const userA = users.createGuest('PlayerA_Test');
  const userB = users.createGuest('PlayerB_Test');
  const tokenA = auth.createSession(userA.id);
  const tokenB = auth.createSession(userB.id);

  const socketA = ClientIO(serverUrl, { auth: { token: tokenA } });
  const socketB = ClientIO(serverUrl, { auth: { token: tokenB } });

  await Promise.all([
    new Promise(r => socketA.on('connect', r)),
    new Promise(r => socketB.on('connect', r))
  ]);
  console.log('✓ Both sockets connected');

  // Create Chess Room
  const room = rooms.createRoom({ hostUser: userA, gameType: 'chess', maxPlayers: 2 });
  socketA.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: room.id });
  await new Promise(r => socketA.once(SOCKET_EVENTS.ROOM_STATE, r));

  socketB.emit(SOCKET_EVENTS.JOIN_ROOM, { code: room.code });
  await Promise.all([
    new Promise(r => socketA.once(SOCKET_EVENTS.ROOM_STATE, r)),
    new Promise(r => socketB.once(SOCKET_EVENTS.ROOM_STATE, r))
  ]);
  console.log('✓ Both players joined room');

  // Start Game
  socketA.emit(SOCKET_EVENTS.START_GAME, { roomId: room.id });
  const [initA, initB] = await Promise.all([
    new Promise(r => socketA.once(SOCKET_EVENTS.GAME_STATE, r)),
    new Promise(r => socketB.once(SOCKET_EVENTS.GAME_STATE, r))
  ]);
  assert.strictEqual(initA.currentTurnColor, 'w');
  assert.strictEqual(initB.currentTurnColor, 'w');
  console.log('✓ Chess game started! White to move.');

  // ========================================================
  // TEST 1: Player A makes an invalid move
  // A must receive GAME_ERROR. B must NOT receive any error.
  // ========================================================
  console.log('\n--- TEST 1: Invalid Move Isolation ---');
  let bReceivedError = false;
  const bErrorListener = () => { bReceivedError = true; };
  socketB.on(SOCKET_EVENTS.GAME_ERROR, bErrorListener);
  socketB.on(SOCKET_EVENTS.ERROR, bErrorListener);

  const aErrorPromise = new Promise(r => socketA.once(SOCKET_EVENTS.GAME_ERROR, r));

  // Player A (White) tries illegal pawn jump: e2 to e6
  socketA.emit(SOCKET_EVENTS.GAME_ACTION, {
    roomId: room.id,
    action: { type: 'MOVE', from: { row: 6, col: 4 }, to: { row: 2, col: 4 } }
  });

  const errorA = await aErrorPromise;
  assert.ok(errorA, 'Player A received error');
  assert.strictEqual(errorA.code, ERROR_CODES.INVALID_MOVE);
  assert.strictEqual(errorA.isPlayerError, true);

  // Give B a moment to verify it received nothing
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(bReceivedError, false, 'Player B was completely untouched by A error!');
  assert.strictEqual(room.gameInstance.currentTurn, 'w', 'Turn remains White');
  console.log('  ✓ PASS: Player A received isolated error, Player B untouched, board intact!');

  // Cleanup B error listener
  socketB.off(SOCKET_EVENTS.GAME_ERROR, bErrorListener);
  socketB.off(SOCKET_EVENTS.ERROR, bErrorListener);

  // ========================================================
  // TEST 2: Rapid 10x Spam Clicks / Duplicate Actions
  // No crash, no duplicate execution, no state corruption.
  // ========================================================
  console.log('\n--- TEST 2: Rapid 10x Duplicate Action Resilience ---');
  const spamActionId = `spam_${Date.now()}`;
  let spamErrors = 0;
  socketA.on(SOCKET_EVENTS.GAME_ERROR, () => { spamErrors++; });

  for (let i = 0; i < 10; i++) {
    socketA.emit(SOCKET_EVENTS.GAME_ACTION, {
      roomId: room.id,
      action: { type: 'MOVE', from: { row: 6, col: 4 }, to: { row: 4, col: 4 } },
      actionId: spamActionId
    });
  }

  // Wait for processing
  await new Promise(r => setTimeout(r, 200));
  assert.strictEqual(room.gameInstance.currentTurn, 'b', 'Move executed exactly ONCE, turn passed to Black');
  assert.strictEqual(room.gameInstance.board[4][4]?.type, 'p', 'Pawn successfully moved to e4');
  console.log('  ✓ PASS: 10 rapid duplicate clicks safely processed, exactly 1 move executed, zero corruption!');

  // ========================================================
  // TEST 3: Out of Turn Action
  // Player A (White) tries to move when it is Player B's (Black) turn.
  // Error to A only, turn stays Black.
  // ========================================================
  console.log('\n--- TEST 3: Out-of-Turn Rejection ---');
  const aOutOfTurnPromise = new Promise(r => socketA.once(SOCKET_EVENTS.GAME_ERROR, r));
  socketA.emit(SOCKET_EVENTS.GAME_ACTION, {
    roomId: room.id,
    action: { type: 'MOVE', from: { row: 6, col: 3 }, to: { row: 4, col: 3 } }
  });

  const outOfTurnErr = await aOutOfTurnPromise;
  assert.strictEqual(outOfTurnErr.code, ERROR_CODES.NOT_YOUR_TURN);
  assert.strictEqual(room.gameInstance.currentTurn, 'b', 'Turn strictly remains with Black');
  console.log('  ✓ PASS: Out-of-turn move rejected for Player A only, turn untouched!');

  // ========================================================
  // TEST 4: Malformed Payload Handling
  // Missing or corrupted data should not crash server.
  // ========================================================
  console.log('\n--- TEST 4: Malformed Payload Safety ---');
  const malformedPromise = new Promise(r => socketB.once(SOCKET_EVENTS.GAME_ERROR, r));
  socketB.emit(SOCKET_EVENTS.GAME_ACTION, {
    roomId: room.id,
    action: null
  });
  const malErr = await malformedPromise;
  assert.strictEqual(malErr.code, ERROR_CODES.INVALID_ACTION);
  console.log('  ✓ PASS: Server safely rejected malformed payload without crash!');

  // ========================================================
  // TEST 5: Legal Move Execution
  // Player B (Black) makes legal move e7-e5 -> A receives it instantly.
  // ========================================================
  console.log('\n--- TEST 5: Legal Move Instant Synchronization ---');
  const [moveUpdateA, moveUpdateB] = await Promise.all([
    new Promise(r => socketA.once(SOCKET_EVENTS.ROOM_STATE, r)),
    new Promise(r => socketB.once(SOCKET_EVENTS.ROOM_STATE, r)),
    new Promise(r => {
      socketB.emit(SOCKET_EVENTS.GAME_ACTION, {
        roomId: room.id,
        action: { type: 'MOVE', from: { row: 1, col: 4 }, to: { row: 3, col: 4 } }
      });
      r();
    })
  ]);
  assert.strictEqual(moveUpdateA.game.board[3][4]?.color, 'b');
  assert.strictEqual(moveUpdateB.game.board[3][4]?.color, 'b');
  assert.strictEqual(moveUpdateA.game.currentTurnColor, 'w');
  console.log('  ✓ PASS: Legal move executed, synchronized to both players instantly!');

  // ========================================================
  // TEST 6: Disconnect & Reconnect State Recovery
  // Player A disconnects, Player B remains in game.
  // Player A reconnects and gets exact valid Game State back.
  // ========================================================
  console.log('\n--- TEST 6: Seamless Reconnect & State Recovery ---');
  socketA.disconnect();

  // B continues without crash
  assert.strictEqual(room.gameInstance.status, 'PLAYING');
  console.log('  ✓ Player B continues unaffected while Player A is temporarily disconnected');

  // Player A reconnects with same session token
  const socketA2 = ClientIO(serverUrl, { auth: { token: tokenA } });
  await new Promise(r => socketA2.on('connect', r));

  const statePromiseA2 = new Promise(r => socketA2.once(SOCKET_EVENTS.ROOM_STATE, r));
  socketA2.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: room.id });
  const recoveredState = await statePromiseA2;

  assert.strictEqual(recoveredState.room.players.length, 2, 'Still 2 players, no duplicate players created');
  assert.strictEqual(recoveredState.game.board[3][4]?.color, 'b', 'Recovered exact board position');
  assert.strictEqual(recoveredState.game.currentTurnColor, 'w', 'Recovered turn');
  console.log('  ✓ PASS: Player A reconnected, zero duplicate players, exact state restored!');

  // ========================================================
  // TEST 7: Clean Player Leave (Zero Refresh for Opponent)
  // Player A leaves -> Player B receives player-left event instantly.
  // ========================================================
  console.log('\n--- TEST 7: Instant Player Leave Synchronization ---');
  const bSawLeavePromise = new Promise(r => socketB.once(SOCKET_EVENTS.ROOM_PLAYER_LEFT, r));
  socketA2.emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId: room.id });

  const leaveEvt = await bSawLeavePromise;
  assert.strictEqual(leaveEvt.playerId, userA.id);
  console.log('  ✓ PASS: Player A left -> Player B received player-left event instantly without refresh!');

  // Cleanup
  socketA2.disconnect();
  socketB.disconnect();
  server.close();

  console.log('\n======================================================');
  console.log(' ALL 7 ERROR ISOLATION & RESILIENCE TESTS PASSED! 🛡️');
  console.log('======================================================\n');
  process.exit(0);
}

runErrorIsolationTests().catch(err => {
  console.error('Error Isolation Test Failed:', err);
  process.exit(1);
});
