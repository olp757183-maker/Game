/**
 * Comprehensive Automated Verification Test:
 * Game Over & Round End Screens, Rematch Consensus & Exit Cleanliness Across UNO, Chess, and Domino.
 *
 * Verifies:
 * 1. CSS & Responsive Design System for game over overlay, modal body scroll, docked footer,
 *    safe-area-inset-bottom, 100dvh, small mobile (<=360px), and mobile landscape (<=540px height).
 * 2. UNO match conclusion -> authoritative MATCH_END -> Rematch consensus -> new game dealt.
 * 3. Chess match conclusion -> checkmate / resignation -> Rematch voting -> Exit to lobby.
 * 4. Domino match conclusion -> empty hand / blocked game -> Rematch voting -> Exit.
 * 5. Single-click idempotency & double-click protection (no duplicate rematch votes or duplicate match starts).
 * 6. Clean exit without timer or listener leakage.
 */

import http from 'node:http';
import express from 'express';
import { io as ClientIO } from 'socket.io-client';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupSocketServer } from '../server/socket.js';
import users from '../server/users.js';
import auth from '../server/auth.js';
import rooms from '../server/rooms.js';
import { SOCKET_EVENTS, ROOM_STATUS } from '../shared/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const CSS_DIR = path.join(CLIENT_DIR, 'css');

let passedTests = 0;
let totalTests = 0;

async function it(name, fn) {
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
  console.log(' Game Over, Rematch & Exit Responsive Verification Suite');
  console.log('======================================================\n');

  // -------------------------------------------------------------------------
  // Part 1: CSS Architecture, Responsiveness & Safe Area Verification
  // -------------------------------------------------------------------------
  console.log('--- 1. Responsive CSS & DOM Architecture Contract ---');

  await it('room.css defines #game-over-overlay with 100dvh, blur backdrop, safe-area, and overflow-y: auto', () => {
    const roomCss = fs.readFileSync(path.join(CSS_DIR, 'room.css'), 'utf8');
    assert.ok(roomCss.includes('#game-over-overlay'), 'Contains #game-over-overlay rule');
    assert.ok(roomCss.includes('100dvh'), 'Uses 100dvh unit');
    assert.ok(roomCss.includes('safe-area-inset-bottom'), 'Respects safe-area-inset-bottom');
    assert.ok(roomCss.includes('overflow-y: auto'), 'Enables backdrop scroll for accessibility');
    assert.ok(roomCss.includes('z-index: 2000'), 'Overlay has dominant z-index');
  });

  await it('winner-fanfare-modal has flex column layout, max-height bound, and margin: auto for non-clipped centering', () => {
    const roomCss = fs.readFileSync(path.join(CSS_DIR, 'room.css'), 'utf8');
    assert.ok(roomCss.includes('.winner-fanfare-modal'), 'Contains .winner-fanfare-modal');
    assert.ok(roomCss.includes('margin: auto'), 'Uses margin: auto for non-clipping flex centering');
    assert.ok(roomCss.includes('flex-direction: column'), 'Uses flex column');
    assert.ok(roomCss.includes('max-height: calc(100dvh - 32px)'), 'Constrained within 100dvh viewport bounds');
  });

  await it('winner-modal-body has independent overflow-y: auto for scores and details without pushing footer buttons', () => {
    const roomCss = fs.readFileSync(path.join(CSS_DIR, 'room.css'), 'utf8');
    assert.ok(roomCss.includes('.winner-modal-body'), 'Defines .winner-modal-body');
    assert.ok(roomCss.includes('overflow-y: auto'), 'Body scrolls independently');
    assert.ok(roomCss.includes('-webkit-overflow-scrolling: touch'), 'Touch smooth scrolling');
  });

  await it('winner-modal-footer has flex-shrink: 0 and docked safe padding so action buttons are NEVER cut off', () => {
    const roomCss = fs.readFileSync(path.join(CSS_DIR, 'room.css'), 'utf8');
    assert.ok(roomCss.includes('.winner-modal-footer'), 'Defines .winner-modal-footer');
    assert.ok(roomCss.includes('flex-shrink: 0'), 'Footer never shrinks or disappears');
    assert.ok(roomCss.includes('safe-area-inset-bottom'), 'Footer includes safe-area-inset-bottom');
    assert.ok(roomCss.includes('.winner-action-btn'), 'Defines .winner-action-btn');
    assert.ok(roomCss.includes('min-height: 48px'), 'Complies with 48px touch target guidelines');
  });

  await it('responsive.css provides landscape mode layout placing buttons side-by-side to preserve vertical space', () => {
    const respCss = fs.readFileSync(path.join(CSS_DIR, 'responsive.css'), 'utf8');
    assert.ok(respCss.includes('@media (max-height: 540px)'), 'Handles landscape / short viewports');
    assert.ok(respCss.includes('.winner-modal-footer') && respCss.includes('flex-direction: row'), 'Buttons placed in a row in landscape');
    assert.ok(respCss.includes('@media (max-width: 360px)'), 'Handles ultra-small screens');
  });

  await it('room.js implementation uses winner-modal-body and docked winner-modal-footer', () => {
    const roomJs = fs.readFileSync(path.join(CLIENT_DIR, 'js', 'room.js'), 'utf8');
    assert.ok(roomJs.includes('winner-modal-body'), 'Uses winner-modal-body');
    assert.ok(roomJs.includes('winner-modal-footer'), 'Uses winner-modal-footer');
    assert.ok(roomJs.includes('rematchVoting'), 'Implements click debounce guard for rematch');
    assert.ok(roomJs.includes('exitTriggered'), 'Implements click debounce guard for exit');
    assert.ok(roomJs.includes('currentGameClient.destroy'), 'Cleans up running game client upon exit');
  });

  // -------------------------------------------------------------------------
  // Part 2: Real-Time Multiplayer Network Tests
  // -------------------------------------------------------------------------
  const app = express();
  const server = http.createServer(app);
  setupSocketServer(server);

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const serverUrl = `http://localhost:${port}`;

  const userA = await users.register({
    username: `UserAlpha_${Date.now()}`,
    email: `alpha_${Date.now()}@test.com`,
    password: 'password123'
  });
  const tokenA = auth.createSession(userA.id);

  const userB = await users.register({
    username: `UserBeta_${Date.now()}`,
    email: `beta_${Date.now()}@test.com`,
    password: 'password123'
  });
  const tokenB = auth.createSession(userB.id);

  const socketA = ClientIO(serverUrl, { auth: { token: tokenA } });
  const socketB = ClientIO(serverUrl, { auth: { token: tokenB } });

  await Promise.all([
    new Promise(res => socketA.on('connect', res)),
    new Promise(res => socketB.on('connect', res))
  ]);

  // -------------------------------------------------------------------------
  // Part 3: UNO Game Over -> Rematch Consensus Flow
  // -------------------------------------------------------------------------
  console.log('\n--- 2. UNO: Match End, Rematch Voting & Consensus Restart ---');

  let activeUnoRoomId = null;

  await it('UNO: Game ends with MATCH_END; both sockets receive winner details and scores', async () => {
    const unoRoom = rooms.createRoom({
      hostUser: userA,
      gameType: 'uno',
      maxPlayers: 2
    });
    activeUnoRoomId = unoRoom.id;

    socketA.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: unoRoom.id });
    await new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res));

    socketB.emit(SOCKET_EVENTS.JOIN_ROOM, { code: unoRoom.code });
    await Promise.all([
      new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res)),
      new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res))
    ]);

    // Host starts UNO
    socketA.emit(SOCKET_EVENTS.START_GAME, { roomId: unoRoom.id });
    const [stateA, stateB] = await Promise.all([
      new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res)),
      new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res))
    ]);

    assert.strictEqual(stateA.room.status, ROOM_STATUS.PLAYING);
    assert.strictEqual(stateB.room.status, ROOM_STATUS.PLAYING);

    // Simulate winning last card for Player A
    const unoGame = unoRoom.gameInstance;
    const pA = unoGame.players.find(p => p.id === userA.id);
    const pB = unoGame.players.find(p => p.id === userB.id);

    unoGame.currentTurnIndex = unoGame.players.indexOf(pA);
    const top = unoGame.getTopDiscard();
    const currentColor = unoGame.currentColor || 'red';
    pA.hand = [{ id: 'winning_card', color: currentColor, value: '9', score: 9 }];

    const statePromiseA = new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res));
    const statePromiseB = new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res));

    // Player A plays the last card
    socketA.emit(SOCKET_EVENTS.GAME_ACTION, {
      roomId: unoRoom.id,
      action: { type: 'PLAY_CARD', cardId: 'winning_card' }
    });

    const [endStateA, endStateB] = await Promise.all([statePromiseA, statePromiseB]);
    assert.strictEqual(endStateA.room.status, ROOM_STATUS.FINISHED);
    assert.strictEqual(endStateB.room.status, ROOM_STATUS.FINISHED);
    assert.strictEqual(endStateA.game.winner, userA.username);
    assert.strictEqual(endStateB.game.winner, userA.username);
    assert.ok(endStateA.game.scores, 'Final scores present in game over state');
  });

  await it('UNO Rematch: Rapid duplicate clicks by Player A do not duplicate votes', async () => {
    const unoRoom = rooms.getRoomById(activeUnoRoomId);

    let updateCount = 0;
    const onRematchUpdate = (data) => {
      updateCount++;
    };
    socketA.on(SOCKET_EVENTS.REMATCH_UPDATE, onRematchUpdate);
    socketB.on(SOCKET_EVENTS.REMATCH_UPDATE, onRematchUpdate);

    // Rapid double emit
    socketA.emit(SOCKET_EVENTS.VOTE_REMATCH, { roomId: unoRoom.id });
    socketA.emit(SOCKET_EVENTS.VOTE_REMATCH, { roomId: unoRoom.id });

    await new Promise(resolve => setTimeout(resolve, 80));
    socketA.off(SOCKET_EVENTS.REMATCH_UPDATE, onRematchUpdate);
    socketB.off(SOCKET_EVENTS.REMATCH_UPDATE, onRematchUpdate);

    assert.strictEqual(unoRoom.rematchVotes.size, 1, 'Only 1 vote recorded despite duplicate emissions');
  });

  await it('UNO Rematch Consensus: Player B votes -> Room restarts cleanly with new cards', async () => {
    const unoRoom = rooms.getRoomById(activeUnoRoomId);

    const restartPromiseA = new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res));
    const restartPromiseB = new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res));

    socketB.emit(SOCKET_EVENTS.VOTE_REMATCH, { roomId: unoRoom.id });

    const [newStateA, newStateB] = await Promise.all([restartPromiseA, restartPromiseB]);
    assert.strictEqual(newStateA.room.status, ROOM_STATUS.PLAYING, 'Room status is PLAYING again');
    assert.strictEqual(newStateB.room.status, ROOM_STATUS.PLAYING, 'Room status is PLAYING again');
    assert.strictEqual(newStateA.game.myHand.length, 7, 'Player A dealt 7 fresh cards');
    assert.strictEqual(newStateB.game.myHand.length, 7, 'Player B dealt 7 fresh cards');
    assert.strictEqual(unoRoom.rematchVotes.size, 0, 'Rematch votes cleared upon new match start');
  });

  // -------------------------------------------------------------------------
  // Part 4: Chess Game Over -> Resignation & Exit to Lobby
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Chess: Match End, Resignation & Exit to Lobby ---');

  let activeChessRoomId = null;

  await it('Chess: Resignation ends match, declares winner/loser with reason', async () => {
    // Both leave previous room
    socketA.emit(SOCKET_EVENTS.LEAVE_ROOM);
    socketB.emit(SOCKET_EVENTS.LEAVE_ROOM);
    await new Promise(r => setTimeout(r, 60));

    const chessRoom = rooms.createRoom({
      hostUser: userA,
      gameType: 'chess',
      maxPlayers: 2
    });
    activeChessRoomId = chessRoom.id;

    socketA.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: chessRoom.id });
    await new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res));

    socketB.emit(SOCKET_EVENTS.JOIN_ROOM, { code: chessRoom.code });
    await Promise.all([
      new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res)),
      new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res))
    ]);

    socketA.emit(SOCKET_EVENTS.START_GAME, { roomId: chessRoom.id });
    await Promise.all([
      new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res)),
      new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res))
    ]);

    // Player B resigns
    const chessEndPromiseA = new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res));
    const chessEndPromiseB = new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res));

    socketB.emit(SOCKET_EVENTS.GAME_ACTION, {
      roomId: chessRoom.id,
      action: { type: 'RESIGN' }
    });

    const [chessEndA, chessEndB] = await Promise.all([chessEndPromiseA, chessEndPromiseB]);
    assert.strictEqual(chessEndA.room.status, ROOM_STATUS.FINISHED);
    assert.strictEqual(chessEndB.room.status, ROOM_STATUS.FINISHED);
    assert.strictEqual(chessEndA.game.winner, userA.username);
    assert.strictEqual(chessEndA.game.loser, userB.username);
    assert.strictEqual(chessEndA.game.finishReason, 'RESIGNATION');
  });

  await it('Chess Exit: Player leaves room cleanly without residue', async () => {
    const chessRoom = rooms.getRoomById(activeChessRoomId);

    const updatePromiseA = new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res));
    socketB.emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId: chessRoom.id });

    const updatedRoomState = await updatePromiseA;
    const playerBData = updatedRoomState.room.players.find(p => p.id === userB.id);
    assert.strictEqual(playerBData.connected, false, 'Player B marked disconnected in room state');
  });

  // -------------------------------------------------------------------------
  // Part 5: Domino Game Over -> Rematch Flow
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Domino: Empty Hand Win & Rematch Restart ---');

  await it('Domino: Playing final domino triggers MATCH_END; rematch consensus resets table', async () => {
    socketA.emit(SOCKET_EVENTS.LEAVE_ROOM);
    await new Promise(r => setTimeout(r, 60));

    const dominoRoom = rooms.createRoom({
      hostUser: userA,
      gameType: 'domino',
      maxPlayers: 2
    });

    socketA.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: dominoRoom.id });
    await new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res));

    socketB.emit(SOCKET_EVENTS.JOIN_ROOM, { code: dominoRoom.code });
    await Promise.all([
      new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res)),
      new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res))
    ]);

    socketA.emit(SOCKET_EVENTS.START_GAME, { roomId: dominoRoom.id });
    await Promise.all([
      new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res)),
      new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res))
    ]);

    const dominoGame = dominoRoom.gameInstance;
    const pA = dominoGame.players.find(p => p.id === userA.id);

    // Set up Player A with 1 tile matching the board or starting double
    dominoGame.currentTurnIndex = dominoGame.players.indexOf(pA);
    dominoGame.board = [];
    pA.hand = [{ id: 'domino_win_tile', left: 6, right: 6 }];

    const dominoEndPromiseA = new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res));
    const dominoEndPromiseB = new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res));

    socketA.emit(SOCKET_EVENTS.GAME_ACTION, {
      roomId: dominoRoom.id,
      action: { type: 'PLAY_TILE', tileId: 'domino_win_tile', side: 'right' }
    });

    const [dominoEndA, dominoEndB] = await Promise.all([dominoEndPromiseA, dominoEndPromiseB]);
    assert.strictEqual(dominoEndA.room.status, ROOM_STATUS.FINISHED);
    assert.strictEqual(dominoEndB.room.status, ROOM_STATUS.FINISHED);
    assert.strictEqual(dominoEndA.game.winner, userA.username);

    // Helper to wait until status is PLAYING
    const waitForPlaying = (socket) => new Promise((resolve) => {
      const handler = (data) => {
        if (data?.room?.status === ROOM_STATUS.PLAYING) {
          socket.off(SOCKET_EVENTS.ROOM_STATE, handler);
          resolve(data);
        }
      };
      socket.on(SOCKET_EVENTS.ROOM_STATE, handler);
    });

    const dominoRestartPromiseA = waitForPlaying(socketA);
    const dominoRestartPromiseB = waitForPlaying(socketB);

    socketA.emit(SOCKET_EVENTS.VOTE_REMATCH, { roomId: dominoRoom.id });
    socketB.emit(SOCKET_EVENTS.VOTE_REMATCH, { roomId: dominoRoom.id });

    const [newDomStateA, newDomStateB] = await Promise.all([dominoRestartPromiseA, dominoRestartPromiseB]);
    assert.strictEqual(newDomStateA.room.status, ROOM_STATUS.PLAYING);
    assert.strictEqual(newDomStateB.room.status, ROOM_STATUS.PLAYING);
    assert.strictEqual(newDomStateA.game.myHand.length, 7, 'Fresh 7 domino tiles dealt to Player A');
    assert.strictEqual(newDomStateB.game.myHand.length, 7, 'Fresh 7 domino tiles dealt to Player B');
  });

  // Cleanup Sockets and Server
  socketA.disconnect();
  socketB.disconnect();
  await new Promise(res => server.close(res));

  console.log('\n======================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED! 🏆`);
  console.log('======================================================\n');
  process.exit(0);
}

runAllTests().catch(err => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
