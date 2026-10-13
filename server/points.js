/**
 * Authoritative Points & Ranking System
 * Calculates match points based on final game rankings and player counts.
 * 
 * Rules:
 * 1. Registered Accounts Only:
 *    - Handled by database.awardMatchPoints() which verifies !user.isGuest.
 * 2. UNO:
 *    - 1st: 10, 2nd: 7, 3rd: 4, 4th+: 1
 *    - If 2 players: only 1st gets 10 points. 2nd gets 0.
 *    - If 3 players: only 1st gets 10 points. 2nd & 3rd get 0.
 *    - If 4+ players: 1st: 10, 2nd: 7, 3rd: 4, 4th+: 1.
 * 3. Chess:
 *    - Winner: 10 points
 *    - Loser: 3 points
 *    - Draw: 0 points for both
 * 4. Domino:
 *    - 1st: 12, 2nd: 8, 3rd: 5
 *    - If 2 players: only 1st gets 12 points. 2nd gets 0.
 *    - If 3 players: only 1st gets 12 points. 2nd & 3rd get 0.
 *    - If 4+ players: 1st: 12, 2nd: 8, 3rd: 5, 4th+: 0.
 */

export const POINTS_TABLE = {
  uno: {
    1: 10,
    2: 7,
    3: 4,
    default4Plus: 1
  },
  chess: {
    winner: 10,
    loser: 3,
    draw: 0
  },
  domino: {
    1: 12,
    2: 8,
    3: 5,
    default4Plus: 0
  }
};

/**
 * Calculate match points for each participant.
 * @param {string} gameType - 'uno' | 'chess' | 'domino'
 * @param {Array<{id: string, username: string, rank: number}>} rankings - Ordered final rankings
 * @param {number} playerCount - Total players in the match
 * @param {boolean} isDraw - Whether game ended in a draw
 * @returns {Map<string, number>} Map of playerId -> awarded points
 */
export function calculateMatchPoints(gameType, rankings = [], playerCount = 0, isDraw = false) {
  const pointsMap = new Map();
  const N = playerCount || rankings.length;

  // Initialize all to 0
  rankings.forEach(p => pointsMap.set(p.id, 0));

  if (isDraw) {
    return pointsMap;
  }

  if (gameType === 'chess') {
    rankings.forEach(p => {
      if (p.rank === 1) {
        pointsMap.set(p.id, POINTS_TABLE.chess.winner);
      } else if (p.rank === 2) {
        pointsMap.set(p.id, POINTS_TABLE.chess.loser);
      } else {
        pointsMap.set(p.id, 0);
      }
    });
    return pointsMap;
  }

  if (gameType === 'uno') {
    rankings.forEach(p => {
      let pts = 0;
      if (N <= 3) {
        // For 2 or 3 players: only 1st place gets points
        if (p.rank === 1) {
          pts = POINTS_TABLE.uno[1];
        } else {
          pts = 0;
        }
      } else {
        // For 4+ players: 1st: 10, 2nd: 7, 3rd: 4, 4th+: 1
        if (p.rank === 1) pts = POINTS_TABLE.uno[1];
        else if (p.rank === 2) pts = POINTS_TABLE.uno[2];
        else if (p.rank === 3) pts = POINTS_TABLE.uno[3];
        else if (p.rank >= 4) pts = POINTS_TABLE.uno.default4Plus;
      }
      pointsMap.set(p.id, pts);
    });
    return pointsMap;
  }

  if (gameType === 'domino') {
    rankings.forEach(p => {
      let pts = 0;
      if (N <= 3) {
        // For 2 or 3 players: only 1st place gets points
        if (p.rank === 1) {
          pts = POINTS_TABLE.domino[1];
        } else {
          pts = 0;
        }
      } else {
        // For 4+ players: 1st: 12, 2nd: 8, 3rd: 5
        if (p.rank === 1) pts = POINTS_TABLE.domino[1];
        else if (p.rank === 2) pts = POINTS_TABLE.domino[2];
        else if (p.rank === 3) pts = POINTS_TABLE.domino[3];
        else pts = 0;
      }
      pointsMap.set(p.id, pts);
    });
    return pointsMap;
  }

  return pointsMap;
}

/**
 * Fallback rankings extractor if gameInstance.getFinalRankings() is not available
 */
export function defaultExtractRankings(game, roomPlayers = []) {
  if (!game) return [];
  const players = game.players || roomPlayers;
  if (!players || players.length === 0) return [];

  if (game.draw) {
    return players.map(p => ({ id: p.id, username: p.username, rank: 1, isDraw: true }));
  }

  const winner = players.find(p => p.id === game.winnerId || p.username === game.winner);
  const others = players.filter(p => p.id !== (winner ? winner.id : null));

  const result = [];
  if (winner) {
    result.push({ id: winner.id, username: winner.username, rank: 1 });
  }
  others.forEach((p, idx) => {
    result.push({ id: p.id, username: p.username, rank: idx + 2 });
  });
  return result;
}

export default {
  POINTS_TABLE,
  calculateMatchPoints,
  defaultExtractRankings
};
