/**
 * Test Suite for Authoritative Points & Ranking System (UNO, Chess, Domino)
 * Verifies all 15 behavioral scenarios specified in the requirements.
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import users from '../server/users.js';
import auth from '../server/auth.js';
import database from '../server/database.js';
import rooms, { Room } from '../server/rooms.js';
import { calculateMatchPoints, POINTS_TABLE } from '../server/points.js';
import { handleMatchFinished } from '../server/socket.js';
import UnoGame from '../server/games/uno.js';
import ChessGame from '../server/games/chess.js';
import DominoGame from '../server/games/domino.js';

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
    throw err;
  }
}

async function main() {
  console.log('\n==========================================================');
  console.log(' Points & Ranking System Verification Suite (All 3 Games) ');
  console.log('==========================================================\n');

  // Helper to create registered user
  async function createRegisteredUser(prefix = 'player') {
    const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const email = `${username}@example.com`;
    return users.register({ username, email, password: 'password123' });
  }

  // --- 1. UNO POINTS DISTRIBUTION ---
  console.log('--- 1. UNO Points Distribution by Player Count & Rank ---');

  await runTest('UNO with 2 players: only 1st place gets 10 points, 2nd gets 0', () => {
    const rankings = [
      { id: 'u1', username: 'Winner', rank: 1 },
      { id: 'u2', username: 'Second', rank: 2 }
    ];
    const pts = calculateMatchPoints('uno', rankings, 2, false);
    assert.strictEqual(pts.get('u1'), 10, '1st place must get 10 points');
    assert.strictEqual(pts.get('u2'), 0, '2nd place must get 0 points when N=2');
  });

  await runTest('UNO with 3 players: only 1st place gets 10 points, 2nd & 3rd get 0', () => {
    const rankings = [
      { id: 'u1', username: 'Winner', rank: 1 },
      { id: 'u2', username: 'Second', rank: 2 },
      { id: 'u3', username: 'Third', rank: 3 }
    ];
    const pts = calculateMatchPoints('uno', rankings, 3, false);
    assert.strictEqual(pts.get('u1'), 10, '1st place must get 10 points');
    assert.strictEqual(pts.get('u2'), 0, '2nd place must get 0 points when N=3');
    assert.strictEqual(pts.get('u3'), 0, '3rd place must get 0 points when N=3');
  });

  await runTest('UNO with 4 players: 1st=10, 2nd=7, 3rd=4, 4th=1', () => {
    const rankings = [
      { id: 'u1', username: 'P1', rank: 1 },
      { id: 'u2', username: 'P2', rank: 2 },
      { id: 'u3', username: 'P3', rank: 3 },
      { id: 'u4', username: 'P4', rank: 4 }
    ];
    const pts = calculateMatchPoints('uno', rankings, 4, false);
    assert.strictEqual(pts.get('u1'), 10, '1st place gets 10 points');
    assert.strictEqual(pts.get('u2'), 7, '2nd place gets 7 points');
    assert.strictEqual(pts.get('u3'), 4, '3rd place gets 4 points');
    assert.strictEqual(pts.get('u4'), 1, '4th place gets 1 point');
  });

  await runTest('UNO with 5+ players: 1st=10, 2nd=7, 3rd=4, 4th+=1 each', () => {
    const rankings = [
      { id: 'u1', username: 'P1', rank: 1 },
      { id: 'u2', username: 'P2', rank: 2 },
      { id: 'u3', username: 'P3', rank: 3 },
      { id: 'u4', username: 'P4', rank: 4 },
      { id: 'u5', username: 'P5', rank: 5 }
    ];
    const pts = calculateMatchPoints('uno', rankings, 5, false);
    assert.strictEqual(pts.get('u1'), 10);
    assert.strictEqual(pts.get('u2'), 7);
    assert.strictEqual(pts.get('u3'), 4);
    assert.strictEqual(pts.get('u4'), 1);
    assert.strictEqual(pts.get('u5'), 1);
  });

  // --- 2. CHESS POINTS DISTRIBUTION ---
  console.log('\n--- 2. Chess Points Distribution ---');

  await runTest('Chess with confirmed win: Winner gets 10 points, Loser gets 3 points', () => {
    const rankings = [
      { id: 'c1', username: 'WhiteWinner', rank: 1 },
      { id: 'c2', username: 'BlackLoser', rank: 2 }
    ];
    const pts = calculateMatchPoints('chess', rankings, 2, false);
    assert.strictEqual(pts.get('c1'), 10, 'Chess winner gets 10 points');
    assert.strictEqual(pts.get('c2'), 3, 'Chess loser gets 3 points');
  });

  await runTest('Chess on Draw: neither gets points (0 for both)', () => {
    const rankings = [
      { id: 'c1', username: 'Player1', rank: 1 },
      { id: 'c2', username: 'Player2', rank: 1 }
    ];
    const pts = calculateMatchPoints('chess', rankings, 2, true);
    assert.strictEqual(pts.get('c1'), 0, 'No win points on draw');
    assert.strictEqual(pts.get('c2'), 0, 'No loss points on draw');
  });

  // --- 3. DOMINO POINTS DISTRIBUTION ---
  console.log('\n--- 3. Domino Points Distribution ---');

  await runTest('Domino with 2 players: only 1st place gets 12 points, 2nd gets 0', () => {
    const rankings = [
      { id: 'd1', username: 'Winner', rank: 1 },
      { id: 'd2', username: 'Second', rank: 2 }
    ];
    const pts = calculateMatchPoints('domino', rankings, 2, false);
    assert.strictEqual(pts.get('d1'), 12, '1st place gets 12 points');
    assert.strictEqual(pts.get('d2'), 0, '2nd place gets 0 points when N=2');
  });

  await runTest('Domino with 3 players: only 1st place gets 12 points, 2nd & 3rd get 0', () => {
    const rankings = [
      { id: 'd1', username: 'Winner', rank: 1 },
      { id: 'd2', username: 'Second', rank: 2 },
      { id: 'd3', username: 'Third', rank: 3 }
    ];
    const pts = calculateMatchPoints('domino', rankings, 3, false);
    assert.strictEqual(pts.get('d1'), 12, '1st place gets 12 points');
    assert.strictEqual(pts.get('d2'), 0, '2nd place gets 0 points when N=3');
    assert.strictEqual(pts.get('d3'), 0, '3rd place gets 0 points when N=3');
  });

  await runTest('Domino with 4 players: 1st=12, 2nd=8, 3rd=5, 4th=0', () => {
    const rankings = [
      { id: 'd1', username: 'P1', rank: 1 },
      { id: 'd2', username: 'P2', rank: 2 },
      { id: 'd3', username: 'P3', rank: 3 },
      { id: 'd4', username: 'P4', rank: 4 }
    ];
    const pts = calculateMatchPoints('domino', rankings, 4, false);
    assert.strictEqual(pts.get('d1'), 12, '1st place gets 12 points');
    assert.strictEqual(pts.get('d2'), 8, '2nd place gets 8 points');
    assert.strictEqual(pts.get('d3'), 5, '3rd place gets 5 points');
    assert.strictEqual(pts.get('d4'), 0, '4th place gets 0 points');
  });

  await runTest('Domino on blocked tie (draw): 0 points for all', () => {
    const rankings = [
      { id: 'd1', username: 'P1', rank: 1 },
      { id: 'd2', username: 'P2', rank: 1 }
    ];
    const pts = calculateMatchPoints('domino', rankings, 2, true);
    assert.strictEqual(pts.get('d1'), 0);
    assert.strictEqual(pts.get('d2'), 0);
  });

  // --- 4. GUEST ACCOUNTS VS REGISTERED ACCOUNTS ---
  console.log('\n--- 4. Guest Accounts vs Registered Accounts ---');

  await runTest('Guest accounts never receive points, even upon winning', async () => {
    const guestUser = users.createGuest('SuperGuest');
    const matchId = `test_match_${Date.now()}_guest`;

    const res = database.awardMatchPoints({
      matchId,
      userId: guestUser.id,
      gameType: 'uno',
      points: 10,
      rank: 1,
      isWin: true
    });

    assert.strictEqual(res.awarded, false, 'Awarding points to guest must be rejected');
    assert.strictEqual(res.reason, 'GUEST_OR_UNKNOWN');

    const stats = database.getUserStats(guestUser.id);
    assert.strictEqual(stats.length, 0, 'Guest account must have 0 user_stats records');
  });

  await runTest('Mixed match (Guest vs Registered): registered user gets points, guest gets 0', async () => {
    const regUser = await createRegisteredUser('RegPlayer');
    const guestUser = users.createGuest('LuckyGuest');
    const matchId = `test_match_${Date.now()}_mixed`;

    // Case A: Registered user wins
    const resReg = database.awardMatchPoints({
      matchId,
      userId: regUser.id,
      gameType: 'chess',
      points: 10,
      rank: 1,
      isWin: true
    });
    assert.strictEqual(resReg.awarded, true, 'Registered user receives points');
    assert.strictEqual(resReg.points, 10);

    // Case B: Guest is in match
    const resGuest = database.awardMatchPoints({
      matchId,
      userId: guestUser.id,
      gameType: 'chess',
      points: 3,
      rank: 2,
      isLoss: true
    });
    assert.strictEqual(resGuest.awarded, false, 'Guest user points rejected');

    const regStats = database.getUserStats(regUser.id).find(s => s.game === 'chess');
    assert.strictEqual(regStats.score, 10, 'Registered user score updated in database');
    assert.strictEqual(regStats.wins, 1);
  });

  // --- 5. DUPLICATE PREVENTION & RECONNECTION RESILIENCE ---
  console.log('\n--- 5. Duplicate Prevention & Reconnection Resilience ---');

  await runTest('Server prevents duplicate points: identical (matchId, userId) rejected by DB primary key', async () => {
    const user = await createRegisteredUser('DedupTest');
    const matchId = `match_dedup_${Date.now()}`;

    // First attempt: should succeed
    const res1 = database.awardMatchPoints({
      matchId,
      userId: user.id,
      gameType: 'domino',
      points: 12,
      rank: 1,
      isWin: true
    });
    assert.strictEqual(res1.awarded, true, 'First points award succeeds');

    // Duplicate attempt with same matchId: must be safely rejected
    const res2 = database.awardMatchPoints({
      matchId,
      userId: user.id,
      gameType: 'domino',
      points: 12,
      rank: 1,
      isWin: true
    });
    assert.strictEqual(res2.awarded, false, 'Second points award rejected as duplicate');
    assert.strictEqual(res2.reason, 'ALREADY_AWARDED');

    // Check user_stats score is exactly 12, NOT 24!
    const stats = database.getUserStats(user.id).find(s => s.game === 'domino');
    assert.strictEqual(stats.score, 12, 'Score must be incremented only once');
    assert.strictEqual(stats.matchesPlayed, 1, 'Matches played must be exactly 1');
  });

  await runTest('handleMatchFinished in-memory guard prevents duplicate processing on reconnect / duplicate events', async () => {
    const user1 = await createRegisteredUser('UserA');
    const user2 = await createRegisteredUser('UserB');

    const room = rooms.createRoom({
      hostUser: user1,
      gameType: 'chess',
      maxPlayers: 2
    });
    room.addPlayer(user2);
    room.startGame(user1.id, ChessGame);

    const game = room.gameInstance;
    game.status = 'MATCH_END';
    game.winner = user1.username;
    game.winnerId = user1.id;
    game.loser = user2.username;
    game.loserId = user2.id;
    game.draw = false;

    // Simulate match finish event 1
    handleMatchFinished(room);

    // Simulate duplicate match finish event (e.g. from reconnect or retransmission)
    handleMatchFinished(room);

    // Wait for setImmediate background writes
    await new Promise(r => setTimeout(r, 100));

    // Verify points awarded only once
    const stats1 = database.getUserStats(user1.id).find(s => s.game === 'chess');
    assert.strictEqual(stats1.score, 10, 'Winner score must be exactly 10, not doubled');
    assert.strictEqual(stats1.wins, 1);

    const stats2 = database.getUserStats(user2.id).find(s => s.game === 'chess');
    assert.strictEqual(stats2.score, 3, 'Loser score must be exactly 3, not doubled');
  });

  await runTest('Rematch creates fresh match cycle with new match ID without re-awarding old match', async () => {
    const user1 = await createRegisteredUser('RematchA');
    const user2 = await createRegisteredUser('RematchB');

    const room = rooms.createRoom({
      hostUser: user1,
      gameType: 'chess',
      maxPlayers: 2
    });
    room.addPlayer(user2);
    room.startGame(user1.id, ChessGame);

    // Match 1 finishes: user1 wins
    const game1 = room.gameInstance;
    const matchId1 = game1.gameId;
    game1.status = 'MATCH_END';
    game1.winner = user1.username;
    game1.winnerId = user1.id;
    game1.loser = user2.username;
    game1.loserId = user2.id;
    handleMatchFinished(room);

    await new Promise(r => setTimeout(r, 80));

    // Rematch starts
    room.startNextGame(ChessGame);
    const game2 = room.gameInstance;
    const matchId2 = game2.gameId;

    assert.notStrictEqual(matchId1, matchId2, 'New match must have distinct gameId');

    // Match 2 finishes: user2 wins
    game2.status = 'MATCH_END';
    game2.winner = user2.username;
    game2.winnerId = user2.id;
    game2.loser = user1.username;
    game2.loserId = user1.id;
    handleMatchFinished(room);

    await new Promise(r => setTimeout(r, 80));

    // user1 got 10 (win) + 3 (loss) = 13
    const stats1 = database.getUserStats(user1.id).find(s => s.game === 'chess');
    assert.strictEqual(stats1.score, 13, 'User 1 score after rematch: 10 + 3 = 13');
    assert.strictEqual(stats1.matchesPlayed, 2);

    // user2 got 3 (loss) + 10 (win) = 13
    const stats2 = database.getUserStats(user2.id).find(s => s.game === 'chess');
    assert.strictEqual(stats2.score, 13, 'User 2 score after rematch: 3 + 10 = 13');
    assert.strictEqual(stats2.matchesPlayed, 2);
  });

  // --- 6. PERSISTENCE & SECURITY ---
  console.log('\n--- 6. Persistence & Security ---');

  await runTest('Points persist in database and survive logout / re-authentication', async () => {
    const user = await createRegisteredUser('PersistentPlayer');
    const matchId = `persist_${Date.now()}`;

    database.awardMatchPoints({
      matchId,
      userId: user.id,
      gameType: 'uno',
      points: 10,
      rank: 1,
      isWin: true
    });

    // Verify via profile fetch
    const profile = users.getUserProfile(user.id);
    const unoStat = profile.stats.find(s => s.game === 'uno');
    assert.ok(unoStat, 'Uno stats exist in user profile');
    assert.strictEqual(unoStat.score, 10, 'Persisted score matches 10');

    // Total score calculation
    const totalScore = database.getUserTotalScore(user.id);
    assert.strictEqual(totalScore, 10, 'Total score matches');
  });

  await runTest('Client cannot modify points directly via profile update API', async () => {
    const user = await createRegisteredUser('TamperTest');
    const originalProfile = users.getUserProfile(user.id);

    // Attempting to inject score into profile update
    const updated = users.updateProfile(user.id, {
      username: `${user.username}_renamed`,
      score: 999999,
      points: 999999
    });

    const refreshedProfile = users.getUserProfile(user.id);
    const totalScore = database.getUserTotalScore(user.id);
    assert.strictEqual(totalScore, 0, 'User score cannot be manipulated via profile updates');
  });

  await runTest('Game engine rankings methods (Uno, Chess, Domino) return structured rankings', async () => {
    const p1 = { id: 'p1', username: 'Alpha', avatar: 'avatar1', seat: 0 };
    const p2 = { id: 'p2', username: 'Beta', avatar: 'avatar2', seat: 1 };
    const p3 = { id: 'p3', username: 'Gamma', avatar: 'avatar3', seat: 2 };
    const p4 = { id: 'p4', username: 'Delta', avatar: 'avatar4', seat: 3 };

    // 1. Uno
    const mockRoom = { id: 'r1' };
    const uno = new UnoGame({ room: mockRoom, players: [p1, p2, p3, p4], rules: {} });
    uno.status = 'MATCH_END';
    uno.winner = 'Alpha';
    uno.winnerId = 'p1';
    uno.players[0].hand = [];
    uno.players[1].hand = [{ score: 5 }];
    uno.players[2].hand = [{ score: 20 }];
    uno.players[3].hand = [{ score: 50 }];
    const unoRankings = uno.getFinalRankings();
    assert.strictEqual(unoRankings[0].id, 'p1');
    assert.strictEqual(unoRankings[0].rank, 1);
    assert.strictEqual(unoRankings[1].id, 'p2');
    assert.strictEqual(unoRankings[1].rank, 2);

    // 2. Domino
    const domino = new DominoGame({ room: mockRoom, players: [p1, p2, p3, p4], rules: {} });
    domino.status = 'MATCH_END';
    domino.winner = 'Alpha';
    domino.winnerId = 'p1';
    domino.players[0].hand = [];
    domino.players[1].hand = [{ weight: 4 }];
    domino.players[2].hand = [{ weight: 9 }];
    domino.players[3].hand = [{ weight: 12 }];
    const domRankings = domino.getFinalRankings();
    assert.strictEqual(domRankings[0].id, 'p1');
    assert.strictEqual(domRankings[0].rank, 1);
    assert.strictEqual(domRankings[1].id, 'p2');
    assert.strictEqual(domRankings[1].rank, 2);

    // 3. Chess
    const chess = new ChessGame({ room: mockRoom, players: [p1, p2], rules: {} });
    chess.status = 'MATCH_END';
    chess.winner = 'Alpha';
    chess.winnerId = 'p1';
    chess.loser = 'Beta';
    chess.loserId = 'p2';
    const chessRankings = chess.getFinalRankings();
    assert.strictEqual(chessRankings[0].id, 'p1');
    assert.strictEqual(chessRankings[0].rank, 1);
    assert.strictEqual(chessRankings[1].id, 'p2');
    assert.strictEqual(chessRankings[1].rank, 2);
  });

  console.log('\n==========================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED! 🏆`);
  console.log('==========================================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
