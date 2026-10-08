/**
 * Real-Time Socket.IO Synchronization Automated Test
 * Verifies live room updates across multiple concurrent players:
 * - Join without refresh
 * - Instant state broadcast to all participants
 * - Live settings updates
 * - Leave & disconnect synchronization
 * - Live game start and actions
 */

import http from 'node:http';
import assert from 'node:assert';
import { io as ClientIO } from 'socket.io-client';
import express from 'express';
import { setupSocketServer } from '../server/socket.js';
import auth from '../server/auth.js';
import users from '../server/users.js';
import rooms from '../server/rooms.js';
import { SOCKET_EVENTS } from '../shared/constants.js';

async function runRealtimeTests() {
  console.log('\n========================================');
  console.log(' Real-Time Multi-Client Test Suite');
  console.log('========================================\n');

  // Setup ephemeral HTTP & Socket server
  const app = express();
  const server = http.createServer(app);
  const io = setupSocketServer(server);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const serverUrl = `http://127.0.0.1:${port}`;
  console.log(`Test Server running on ${serverUrl}`);

  // Create 3 test users
  const userA = users.createGuest('HostAlice');
  const tokenA = auth.createSession(userA.id);

  const userB = users.createGuest('BobJoined');
  const tokenB = auth.createSession(userB.id);

  const userC = users.createGuest('CharliePlayer');
  const tokenC = auth.createSession(userC.id);

  // Helper to connect client
  function createClient(token) {
    return ClientIO(serverUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true
    });
  }

  const clientA = createClient(tokenA);
  const clientB = createClient(tokenB);
  const clientC = createClient(tokenC);

  await Promise.all([
    new Promise(r => clientA.on('connect', r)),
    new Promise(r => clientB.on('connect', r)),
    new Promise(r => clientC.on('connect', r))
  ]);
  console.log('  ✓ PASS: All 3 client sockets connected');

  // Test 1: Host creates a room
  const testRoom = rooms.createRoom({
    hostUser: userA,
    gameType: 'uno',
    maxPlayers: 4,
    privacy: 'public'
  });
  console.log(`  ✓ PASS: Room created code=${testRoom.code} id=${testRoom.id}`);

  // Host joins room channel
  clientA.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: testRoom.id, code: testRoom.code });
  const hostInitialState = await new Promise(resolve => {
    clientA.once(SOCKET_EVENTS.ROOM_STATE, resolve);
  });
  assert.strictEqual(hostInitialState.room.players.length, 1);
  assert.strictEqual(hostInitialState.room.players[0].username, userA.username);
  console.log('  ✓ PASS: Host joined room channel and received initial room:state');

  // Test 2: Player B joins - Player A must see Player B instantly without refresh!
  const playerJoinedPromiseA = new Promise(resolve => {
    clientA.once(SOCKET_EVENTS.ROOM_PLAYER_JOINED, resolve);
  });
  const roomStatePromiseA = new Promise(resolve => {
    clientA.once(SOCKET_EVENTS.ROOM_STATE, resolve);
  });
  const roomStatePromiseB = new Promise(resolve => {
    clientB.once(SOCKET_EVENTS.ROOM_STATE, resolve);
  });

  clientB.emit(SOCKET_EVENTS.JOIN_ROOM, { code: testRoom.code });

  const [joinedEvtA, updatedStateA, stateB] = await Promise.all([
    playerJoinedPromiseA,
    roomStatePromiseA,
    roomStatePromiseB
  ]);

  assert.strictEqual(joinedEvtA.username, userB.username);
  assert.strictEqual(updatedStateA.room.players.length, 2);
  assert.strictEqual(stateB.room.players.length, 2);
  assert.ok(updatedStateA.room.players.some(p => p.id === userB.id));
  assert.ok(stateB.room.players.some(p => p.id === userA.id));
  console.log('  ✓ PASS: Player B joined -> Host A saw B instantly, and B saw A instantly (Zero Refresh)');

  // Test 3: Player C joins - A, B, and C all see 3 players in room:state instantly!
  const statePromiseA3 = new Promise(r => clientA.once(SOCKET_EVENTS.ROOM_STATE, r));
  const statePromiseB3 = new Promise(r => clientB.once(SOCKET_EVENTS.ROOM_STATE, r));
  const statePromiseC3 = new Promise(r => clientC.once(SOCKET_EVENTS.ROOM_STATE, r));

  clientC.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: testRoom.id });

  const [sA3, sB3, sC3] = await Promise.all([statePromiseA3, statePromiseB3, statePromiseC3]);
  assert.strictEqual(sA3.room.players.length, 3);
  assert.strictEqual(sB3.room.players.length, 3);
  assert.strictEqual(sC3.room.players.length, 3);
  console.log('  ✓ PASS: Player C joined -> A, B, and C all received updated state with 3 players instantly');

  // Test 4: Host updates settings - A, B, and C all receive room:settings-updated
  const settingsPromiseB = new Promise(r => clientB.once(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, r));
  clientA.emit(SOCKET_EVENTS.UPDATE_SETTINGS, {
    roomId: testRoom.id,
    settings: { allowSpectators: false },
    rules: { turnTimer: 45 }
  });
  const settingsReceived = await settingsPromiseB;
  assert.strictEqual(settingsReceived.rules.turnTimer, 45);
  console.log('  ✓ PASS: Host updated settings -> Player B received room:settings-updated instantly');

  // Test 5: Player B leaves - A and C receive room:player-left and state drops to 2 players
  const leavePromiseA = new Promise(r => clientA.once(SOCKET_EVENTS.ROOM_PLAYER_LEFT, r));
  const statePromiseA4 = new Promise(r => clientA.once(SOCKET_EVENTS.ROOM_STATE, r));
  clientB.emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId: testRoom.id });

  const [leftEvt, sA4] = await Promise.all([leavePromiseA, statePromiseA4]);
  assert.strictEqual(leftEvt.playerId, userB.id);
  assert.strictEqual(sA4.room.players.length, 2);
  console.log('  ✓ PASS: Player B left -> Host A received player-left and updated 2-player state instantly');

  // Test 6: Host starts game -> A and C both receive room:started and game:state
  const startPromiseA = new Promise(r => clientA.once(SOCKET_EVENTS.ROOM_STARTED, r));
  const startPromiseC = new Promise(r => clientC.once(SOCKET_EVENTS.ROOM_STARTED, r));
  const gameStatePromiseA = new Promise(r => clientA.once(SOCKET_EVENTS.GAME_STATE, r));
  const gameStatePromiseC = new Promise(r => clientC.once(SOCKET_EVENTS.GAME_STATE, r));

  clientA.emit(SOCKET_EVENTS.START_GAME, { roomId: testRoom.id });

  const [startA, startC, gA, gC] = await Promise.all([
    startPromiseA,
    startPromiseC,
    gameStatePromiseA,
    gameStatePromiseC
  ]);
  assert.ok(startA);
  assert.ok(startC);
  assert.ok(gA);
  assert.ok(gC);
  // Private card isolation: A's hand should have cards, C's hand should have cards
  assert.ok(gA.myHand.length > 0);
  assert.ok(gC.myHand.length > 0);
  console.log('  ✓ PASS: Host started game -> A and C instantly received room:started & private game:state');

  // Cleanup
  clientA.disconnect();
  clientB.disconnect();
  clientC.disconnect();
  server.close();

  console.log('\n========================================');
  console.log(' ALL 6 REAL-TIME MULTIPLAYER TESTS PASSED!');
  console.log('========================================\n');
}

runRealtimeTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
