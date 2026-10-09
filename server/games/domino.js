import crypto from 'node:crypto';
import { GAME_STATUS, ERROR_CODES, GameActionError } from '../../shared/constants.js';

export class DominoGame {
  constructor({ room, players, rules }) {
    this.gameId = crypto.randomUUID();
    this.roomId = room.id;
    this.gameType = 'domino';
    this.room = room;
    this.players = players.map(p => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      seat: p.seat,
      hand: [],
      score: 0
    }));
    this.rules = rules;

    this.boneyard = [];
    this.board = []; // Array of { left, right, isDouble, orientation }
    this.leftEnd = null;
    this.rightEnd = null;
    this.currentTurnIndex = 0;
    this.status = GAME_STATUS.PLAYING;
    this.winner = null;
    this.winnerId = null;
    this.loser = null;
    this.loserId = null;
    this.draw = false;
    this.reason = null;
    this.finishReason = null;
    this.roundWinner = null;
    this.roundWinnerId = null;
    this.roundPointsAwarded = 0;
    this.roundNumber = 1;
    this.consecutivePasses = 0;
    this.scores = {};
    this.startedAt = Date.now();
    this.endedAt = null;
    this.finishedAt = null;
    this.version = 1;

    this.players.forEach(p => {
      this.scores[p.id] = 0;
    });
  }

  createSnapshot() {
    return {
      players: this.players.map(p => ({
        ...p,
        hand: p.hand ? p.hand.map(t => ({ ...t })) : []
      })),
      board: this.board.map(t => ({ ...t })),
      boneyard: this.boneyard.map(t => ({ ...t })),
      leftEnd: this.leftEnd,
      rightEnd: this.rightEnd,
      currentTurnIndex: this.currentTurnIndex,
      consecutivePasses: this.consecutivePasses,
      status: this.status,
      winner: this.winner,
      winnerId: this.winnerId,
      loser: this.loser,
      loserId: this.loserId,
      draw: this.draw,
      reason: this.reason,
      finishReason: this.finishReason,
      endedAt: this.endedAt,
      finishedAt: this.finishedAt,
      scores: { ...this.scores },
      version: this.version
    };
  }

  restoreSnapshot(snap) {
    if (!snap) return;
    this.players = snap.players.map(p => ({
      ...p,
      hand: p.hand ? p.hand.map(t => ({ ...t })) : []
    }));
    this.board = snap.board.map(t => ({ ...t }));
    this.boneyard = snap.boneyard.map(t => ({ ...t }));
    this.leftEnd = snap.leftEnd;
    this.rightEnd = snap.rightEnd;
    this.currentTurnIndex = snap.currentTurnIndex;
    this.consecutivePasses = snap.consecutivePasses;
    this.status = snap.status;
    this.winner = snap.winner;
    this.winnerId = snap.winnerId;
    this.loser = snap.loser;
    this.loserId = snap.loserId;
    this.draw = snap.draw;
    this.reason = snap.reason;
    this.finishReason = snap.finishReason;
    this.endedAt = snap.endedAt;
    this.finishedAt = snap.finishedAt;
    this.scores = { ...snap.scores };
    this.version = snap.version;
  }

  start() {
    this.startRound();
  }

  generateDominoSet() {
    const tiles = [];
    let id = 1;
    for (let i = 0; i <= 6; i++) {
      for (let j = i; j <= 6; j++) {
        tiles.push({
          id: `t_${id++}`,
          left: i,
          right: j,
          isDouble: (i === j),
          weight: i + j
        });
      }
    }
    return this.shuffle(tiles);
  }

  shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  startRound() {
    this.boneyard = this.generateDominoSet();
    this.board = [];
    this.leftEnd = null;
    this.rightEnd = null;
    this.consecutivePasses = 0;
    this.status = GAME_STATUS.PLAYING;
    this.roundWinner = null;
    this.roundPointsAwarded = 0;

    const countPerPlayer = (this.players.length === 2)
      ? (this.rules.startingTiles || 7)
      : (this.rules.startingTiles || 5);

    for (const player of this.players) {
      player.hand = [];
      for (let i = 0; i < countPerPlayer; i++) {
        player.hand.push(this.boneyard.pop());
      }
    }

    // Determine starting player: highest double or random
    let highestDouble = -1;
    let startIdx = 0;

    this.players.forEach((p, idx) => {
      p.hand.forEach(t => {
        if (t.isDouble && t.left > highestDouble) {
          highestDouble = t.left;
          startIdx = idx;
        }
      });
    });

    this.currentTurnIndex = startIdx;
  }

  startNextRound() {
    if (this.status !== GAME_STATUS.ROUND_END) return;
    this.roundNumber++;
    this.startRound();
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
  }

  advanceTurn() {
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
  }

  canPlayAnyTile(player) {
    if (this.board.length === 0) return player.hand.length > 0;
    return player.hand.some(t =>
      t.left === this.leftEnd || t.right === this.leftEnd ||
      t.left === this.rightEnd || t.right === this.rightEnd
    );
  }

  handleAction(playerId, action) {
    if (this.status === GAME_STATUS.MATCH_END || this.status === GAME_STATUS.FINISHED) {
      throw new GameActionError(ERROR_CODES.GAME_ALREADY_FINISHED, 'انتهت اللعبة بالفعل (Game has finished)', 'Game has finished');
    }

    if (action.type === 'NEXT_ROUND') {
      if (this.status !== GAME_STATUS.ROUND_END) {
        throw new GameActionError(ERROR_CODES.INVALID_ACTION, 'لا يمكن بدء الجولة التالية الآن', 'Cannot start next round before current round ends');
      }
      this.startNextRound();
      return { success: true, event: 'NEXT_ROUND_STARTED', round: this.roundNumber };
    }

    const current = this.getCurrentPlayer();
    if (current.id !== playerId) {
      throw new GameActionError(ERROR_CODES.NOT_YOUR_TURN, 'ليس دورك الآن', 'Not your turn');
    }

    let res;
    switch (action.type) {
      case 'PLAY_TILE':
        res = this.executePlay(current, action.tileId, action.side);
        break;

      case 'DRAW_TILE':
        res = this.executeDraw(current);
        break;

      case 'PASS':
        res = this.executePass(current);
        break;

      default:
        throw new GameActionError(ERROR_CODES.INVALID_ACTION, `حركة غير معروفة: ${action.type}`, `Unknown domino action: ${action.type}`);
    }

    this.version++;
    return res;
  }

  executePlay(player, tileId, requestedSide = 'right') {
    const tileIndex = player.hand.findIndex(t => t.id === tileId);
    if (tileIndex === -1) {
      throw new GameActionError(ERROR_CODES.TILE_NOT_IN_HAND, 'القطعة غير موجودة بيدك', 'Tile not in hand');
    }
    const tile = player.hand[tileIndex];

    // First tile of the board
    if (this.board.length === 0) {
      player.hand.splice(tileIndex, 1);
      this.board.push({
        ...tile,
        placedLeft: tile.left,
        placedRight: tile.right
      });
      this.leftEnd = tile.left;
      this.rightEnd = tile.right;
      this.consecutivePasses = 0;

      if (player.hand.length === 0) {
        this.handleDominoWin(player);
        return { success: true, event: 'DOMINO_WON', winner: player.username, status: this.status };
      }

      this.advanceTurn();
      return { success: true, event: 'TILE_PLAYED', board: this.board };
    }

    let side = requestedSide;
    const canLeft = (tile.left === this.leftEnd || tile.right === this.leftEnd);
    const canRight = (tile.left === this.rightEnd || tile.right === this.rightEnd);

    if (!canLeft && !canRight) {
      throw new GameActionError(ERROR_CODES.INVALID_MOVE, 'حركة غير قانونية (هذه الحركة غير مسموحة)', 'Illegal move');
    }

    // Auto-pick side if only one side is legal
    if (canLeft && !canRight) side = 'left';
    else if (!canLeft && canRight) side = 'right';

    // Place on Left
    if (side === 'left') {
      if (!canLeft) throw new GameActionError(ERROR_CODES.INVALID_MOVE, 'حركة غير قانونية (هذه الحركة غير مسموحة)', 'Illegal move');
      player.hand.splice(tileIndex, 1);

      let placedTile;
      if (tile.right === this.leftEnd) {
        placedTile = { ...tile, placedLeft: tile.left, placedRight: tile.right };
        this.leftEnd = tile.left;
      } else {
        // Invert to match
        placedTile = { ...tile, placedLeft: tile.right, placedRight: tile.left };
        this.leftEnd = tile.right;
      }
      this.board.unshift(placedTile);
    }
    // Place on Right
    else {
      if (!canRight) throw new Error('حركة غير قانونية');
      player.hand.splice(tileIndex, 1);

      let placedTile;
      if (tile.left === this.rightEnd) {
        placedTile = { ...tile, placedLeft: tile.left, placedRight: tile.right };
        this.rightEnd = tile.right;
      } else {
        // Invert to match
        placedTile = { ...tile, placedLeft: tile.right, placedRight: tile.left };
        this.rightEnd = tile.left;
      }
      this.board.push(placedTile);
    }

    this.consecutivePasses = 0;

    // Check Domino (empty hand) - IMMEDIATE END
    if (player.hand.length === 0) {
      this.handleDominoWin(player);
      return { success: true, event: 'DOMINO_WON', winner: player.username, status: this.status };
    }

    this.advanceTurn();
    return { success: true, event: 'TILE_PLAYED', board: this.board };
  }

  executeDraw(player) {
    if (this.canPlayAnyTile(player)) {
      throw new Error('حركة غير قانونية');
    }
    if (this.boneyard.length === 0) {
      throw new Error('مخزن القطع فارغ');
    }

    const drawn = this.boneyard.pop();
    player.hand.push(drawn);

    return {
      success: true,
      event: 'TILE_DRAWN',
      drawnTile: drawn
    };
  }

  executePass(player) {
    if (this.canPlayAnyTile(player)) {
      throw new Error('حركة غير قانونية');
    }
    if (this.boneyard.length > 0 && this.rules.drawRule !== 'pass') {
      throw new Error('يجب السحب من المخزن أولاً');
    }

    this.consecutivePasses++;

    // Check if game is blocked (locked / صكّة)
    if (this.consecutivePasses >= this.players.length) {
      this.handleBlockedGame();
      return { success: true, event: 'GAME_BLOCKED', status: this.status };
    }

    this.advanceTurn();
    return { success: true, event: 'PASSED' };
  }

  handleDominoWin(winner, isBlocked = false) {
    let pipSum = 0;
    this.players.forEach(p => {
      if (p.id !== winner.id) {
        p.hand.forEach(t => { pipSum += t.weight; });
      }
    });

    this.scores[winner.id] = (this.scores[winner.id] || 0) + pipSum;
    this.roundWinner = winner.username;
    this.roundWinnerId = winner.id;
    this.roundPointsAwarded = pipSum;

    const target = this.rules.targetScore || 100;
    const isMatchWin = (this.rules.singleRound !== false) || (this.scores[winner.id] >= target);

    if (isMatchWin) {
      this.status = GAME_STATUS.MATCH_END;
      this.endedAt = Date.now();
      this.finishedAt = this.endedAt;
      this.winner = winner.username;
      this.winnerId = winner.id;
      const otherPlayers = this.players.filter(p => p.id !== winner.id);
      otherPlayers.sort((a, b) => (this.scores[a.id] || 0) - (this.scores[b.id] || 0));
      this.loser = otherPlayers[0] ? otherPlayers[0].username : null;
      this.loserId = otherPlayers[0] ? otherPlayers[0].id : null;
      this.draw = false;
      this.reason = isBlocked ? 'فوز بالصكّة' : (this.scores[winner.id] >= target ? 'POINTS_TARGET' : 'DOMINO_OUT');
      this.finishReason = isBlocked ? 'BLOCKED_WIN' : (this.scores[winner.id] >= target ? 'POINTS_TARGET' : 'DOMINO_OUT');
    } else {
      this.status = GAME_STATUS.ROUND_END;
      this.reason = isBlocked ? 'انتهت الجولة بالصكّة' : 'أنهى جميع قطعه';
      this.finishReason = isBlocked ? 'BLOCKED_ROUND' : 'DOMINO_ROUND';
    }
  }

  handleBlockedGame() {
    // Round ends locked: player with lowest pip sum wins
    let lowestSum = Infinity;
    let winningPlayer = null;
    let isTie = false;

    this.players.forEach(p => {
      let sum = 0;
      p.hand.forEach(t => { sum += t.weight; });
      if (sum < lowestSum) {
        lowestSum = sum;
        winningPlayer = p;
        isTie = false;
      } else if (sum === lowestSum) {
        isTie = true;
      }
    });

    if (winningPlayer && !isTie) {
      this.handleDominoWin(winningPlayer, true);
    } else {
      if (this.rules.singleRound !== false) {
        this.status = GAME_STATUS.MATCH_END;
        this.endedAt = Date.now();
        this.finishedAt = this.endedAt;
        this.winner = null;
        this.winnerId = null;
        this.loser = null;
        this.loserId = null;
        this.draw = true;
        this.reason = 'تعادل في مجموع نقاط الصكّة';
        this.finishReason = 'BLOCKED_TIE';
      } else {
        this.status = GAME_STATUS.ROUND_END;
        this.roundWinner = null;
        this.roundWinnerId = null;
        this.draw = true;
        this.reason = 'تعادل في مجموع نقاط الصكّة';
        this.finishReason = 'BLOCKED_TIE';
      }
    }
  }

  getPublicState() {
    const current = this.getCurrentPlayer();

    return {
      gameId: this.gameId,
      roomId: this.roomId,
      gameType: 'domino',
      version: this.version,
      status: this.status,
      round: this.roundNumber,
      roundNumber: this.roundNumber,
      winner: this.winner,
      winnerId: this.winnerId,
      loser: this.loser,
      loserId: this.loserId,
      draw: this.draw,
      reason: this.reason,
      finishReason: this.finishReason || this.reason,
      finishedAt: this.finishedAt || this.endedAt,
      roundWinner: this.roundWinner,
      roundWinnerId: this.roundWinnerId,
      roundPointsAwarded: this.roundPointsAwarded,
      scores: this.scores,
      rules: this.rules,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      currentTurn: current ? current.id : null,
      currentTurnPlayerId: current ? current.id : null,
      currentTurnIndex: this.currentTurnIndex,
      board: this.board,
      leftEnd: this.leftEnd,
      rightEnd: this.rightEnd,
      boneyardCount: this.boneyard.length,
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        seat: p.seat,
        tileCount: p.hand.length,
        score: this.scores[p.id] || 0
      }))
    };
  }

  getStateForPlayer(playerId) {
    const me = this.players.find(p => p.id === playerId);
    const current = this.getCurrentPlayer();

    return {
      gameId: this.gameId,
      roomId: this.roomId,
      gameType: 'domino',
      myPlayerId: playerId,
      version: this.version,
      status: this.status,
      round: this.roundNumber,
      roundNumber: this.roundNumber,
      winner: this.winner,
      winnerId: this.winnerId,
      loser: this.loser,
      loserId: this.loserId,
      draw: this.draw,
      reason: this.reason,
      finishReason: this.finishReason || this.reason,
      finishedAt: this.finishedAt || this.endedAt,
      roundWinner: this.roundWinner,
      roundWinnerId: this.roundWinnerId,
      roundPointsAwarded: this.roundPointsAwarded,
      scores: this.scores,
      rules: this.rules,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      currentTurn: current ? current.id : null,
      currentTurnPlayerId: current ? current.id : null,
      currentTurnIndex: this.currentTurnIndex,
      board: this.board,
      leftEnd: this.leftEnd,
      rightEnd: this.rightEnd,
      boneyardCount: this.boneyard.length,
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        seat: p.seat,
        tileCount: p.hand.length,
        score: this.scores[p.id] || 0
      })),
      // Clean private hand without hints
      myHand: me ? me.hand.map(t => ({
        id: t.id,
        left: t.left,
        right: t.right,
        isDouble: t.isDouble,
        weight: t.weight
      })) : []
    };
  }

  handlePlayerLeft(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const leaver = this.players[idx];
      this.players.splice(idx, 1);
      if (this.players.length < 2 && this.status !== GAME_STATUS.MATCH_END && this.status !== GAME_STATUS.FINISHED) {
        this.status = GAME_STATUS.MATCH_END;
        this.endedAt = Date.now();
        this.finishedAt = this.endedAt;
        this.winner = this.players[0] ? this.players[0].username : 'None';
        this.winnerId = this.players[0] ? this.players[0].id : null;
        this.loser = leaver ? leaver.username : playerId;
        this.loserId = leaver ? leaver.id : playerId;
        this.draw = false;
        this.reason = 'PLAYER_LEFT';
        this.finishReason = 'PLAYER_LEFT';
      } else {
        this.currentTurnIndex = this.currentTurnIndex % this.players.length;
      }
    }
  }
}

export default DominoGame;
