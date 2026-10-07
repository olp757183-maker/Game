/**
 * Live Multiplayer Network Simulation Test
 * Simulates two real independent clients (User A & User B) communicating with the server
 * over HTTP and Socket.IO.
 */

import http from 'node:http';
import express from 'express';
import { io as ClientIO } from 'socket.io-client';
import assert from 'node:assert';

import { setupSocketServer } from '../server/socket.js';
import users from '../server/users.js';
import auth from '../server/auth.js';
import rooms from '../server/rooms.js';
import { SOCKET_EVENTS } from '../shared/constants.js';

async function runMultiplayerSimulation() {
  console.log('\n======================================================');
  console.log(' Starting End-to-End Real-Time Multiplayer Simulation');
  console.log('======================================================\n');

  // 1. Spin up test server on random port
  const app = express();
  const server = http.createServer(app);
  setupSocketServer(server);

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const serverUrl = `http://localhost:${port}`;
  console.log(`[Test Server] Running on ${serverUrl}`);

  // 2. Create User A and User B
  const userA = await users.register({
    username: `PlayerA_${Date.now()}`,
    email: `playera_${Date.now()}@test.com`,
    password: 'password123'
  });
  const tokenA = auth.createSession(userA.id);

  const userB = users.createGuest('PlayerB');
  const tokenB = auth.createSession(userB.id);

  console.log(`✓ User A created: ${userA.username}`);
  console.log(`✓ User B created: ${userB.username}`);

  // 3. Connect Sockets for both clients
  const socketA = ClientIO(serverUrl, { auth: { token: tokenA } });
  const socketB = ClientIO(serverUrl, { auth: { token: tokenB } });

  await Promise.all([
    new Promise(res => socketA.on('connect', res)),
    new Promise(res => socketB.on('connect', res))
  ]);
  console.log('✓ Both Socket.IO clients connected and authenticated');

  // 4. User A creates a room
  const testRoom = rooms.createRoom({
    hostUser: userA,
    gameType: 'uno',
    maxPlayers: 2
  });
  console.log(`✓ Room created with code: ${testRoom.code}`);

  // Join Room for User A
  socketA.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: testRoom.id });

  // Wait for User A room state
  const stateA1 = await new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res));
  assert.strictEqual(stateA1.room.players.length, 1);
  console.log('✓ Client A joined room and received state');

  // 5. User B joins using room code
  socketB.emit(SOCKET_EVENTS.JOIN_ROOM, { code: testRoom.code });

  // Both should receive updated room state with 2 players
  const [stateA2, stateB1] = await Promise.all([
    new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res)),
    new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res))
  ]);
  assert.strictEqual(stateA2.room.players.length, 2);
  assert.strictEqual(stateB1.room.players.length, 2);
  console.log('✓ Client B successfully joined using code! Both clients synchronized.');

  // 6. User B sends chat message
  socketB.emit(SOCKET_EVENTS.CHAT_MESSAGE, { roomId: testRoom.id, message: 'Hello from Player B!' });
  const chatReceivedByA = await new Promise(res => socketA.once(SOCKET_EVENTS.CHAT_BROADCAST, res));
  assert.strictEqual(chatReceivedByA.message, 'Hello from Player B!');
  assert.strictEqual(chatReceivedByA.username, userB.username);
  console.log(`✓ Real-time chat delivered from Client B to Client A: "${chatReceivedByA.message}"`);

  // 7. User A (Host) starts UNO game
  socketA.emit(SOCKET_EVENTS.START_GAME, { roomId: testRoom.id });

  const [gameStateA, gameStateB] = await Promise.all([
    new Promise(res => socketA.once(SOCKET_EVENTS.ROOM_STATE, res)),
    new Promise(res => socketB.once(SOCKET_EVENTS.ROOM_STATE, res))
  ]);

  assert.strictEqual(gameStateA.room.status, 'PLAYING');
  assert.strictEqual(gameStateB.room.status, 'PLAYING');
  assert.strictEqual(gameStateA.game.myHand.length, 7);
  assert.strictEqual(gameStateB.game.myHand.length, 7);

  // CRITICAL SECURITY CHECK: Opponent hands are completely hidden!
  const bInViewOfA = gameStateA.game.players.find(p => p.id === userB.id);
  assert.strictEqual(bInViewOfA.cardCount, 7);
  assert.strictEqual(bInViewOfA.hand, undefined);

  const aInViewOfB = gameStateB.game.players.find(p => p.id === userA.id);
  assert.strictEqual(aInViewOfB.cardCount, 7);
  assert.strictEqual(aInViewOfB.hand, undefined);
  console.log('✓ Game started! Private card security verified: Hands are strictly confidential.');

  // 8. Turn validation over network:
  // Non-turn player tries to play a card -> must trigger error
  const currentTurnPlayerId = gameStateA.game.currentTurnPlayerId;
  const nonTurnSocket = (currentTurnPlayerId === userA.id) ? socketB : socketA;

  const errorPromise = new Promise(res => nonTurnSocket.once(SOCKET_EVENTS.ERROR, res));
  nonTurnSocket.emit(SOCKET_EVENTS.GAME_ACTION, {
    roomId: testRoom.id,
    action: { type: 'DRAW_CARD' }
  });
  const err = await errorPromise;
  assert.ok(err);
  console.log('✓ Anti-cheat verified: Out-of-turn socket action rejected with error message.');

  // Clean up
  socketA.disconnect();
  socketB.disconnect();
  server.close();

  console.log('\n======================================================');
  console.log(' ALL MULTIPLAYER REAL-TIME NETWORK TESTS PASSED! 🚀');
  console.log('======================================================\n');
  process.exit(0);
}

runMultiplayerSimulation().catch(err => {
  console.error('Multiplayer Simulation Failed:', err);
  process.exit(1);
});
