import crypto from 'node:crypto';
import { CHESS_COLORS, GAME_STATUS, ERROR_CODES, GameActionError } from '../../shared/constants.js';

export class ChessGame {
  constructor({ room, players, rules }) {
    this.gameId = crypto.randomUUID();
    this.roomId = room.id;
    this.gameType = 'chess';
    this.room = room;
    this.players = players.map((p, idx) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      seat: idx,
      color: idx === 0 ? CHESS_COLORS.WHITE : CHESS_COLORS.BLACK,
      timeLeft: (rules.timeControl || 300), // in seconds
      score: 0
    }));
    this.rules = rules;

    this.board = this.createInitialBoard();
    this.currentTurn = CHESS_COLORS.WHITE;
    this.moveHistory = [];
    this.enPassantTarget = null; // { row, col }
    this.castlingRights = {
      w: { kingside: true, queenside: true },
      b: { kingside: true, queenside: true }
    };
    this.status = GAME_STATUS.PLAYING;
    this.winner = null;
    this.winnerId = null;
    this.loser = null;
    this.loserId = null;
    this.draw = false;
    this.reason = null;
    this.finishReason = null;
    this.round = 1;
    this.scores = {};
    for (const p of this.players) {
      this.scores[p.username] = 0;
    }
    this.inCheck = false;
    this.drawOfferedBy = null;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.finishedAt = null;
    this.lastMoveTimestamp = Date.now();
    this.timerInterval = null;
    this.version = 1;
  }

  createSnapshot() {
    return {
      board: this.cloneBoard(this.board),
      currentTurn: this.currentTurn,
      moveHistory: [...this.moveHistory],
      enPassantTarget: this.enPassantTarget ? { ...this.enPassantTarget } : null,
      castlingRights: {
        w: { ...this.castlingRights.w },
        b: { ...this.castlingRights.b }
      },
      status: this.status,
      inCheck: this.inCheck,
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
      players: this.players.map(p => ({ ...p })),
      version: this.version
    };
  }

  restoreSnapshot(snap) {
    if (!snap) return;
    this.board = this.cloneBoard(snap.board);
    this.currentTurn = snap.currentTurn;
    this.moveHistory = [...snap.moveHistory];
    this.enPassantTarget = snap.enPassantTarget ? { ...snap.enPassantTarget } : null;
    this.castlingRights = {
      w: { ...snap.castlingRights.w },
      b: { ...snap.castlingRights.b }
    };
    this.status = snap.status;
    this.inCheck = snap.inCheck;
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
    this.players = snap.players.map(p => ({ ...p }));
    this.version = snap.version;
  }

  start() {
    this.startClock();
  }

  createInitialBoard() {
    // 8x8 representation: row 0 is rank 8 (Black), row 7 is rank 1 (White)
    // col 0 = a, col 7 = h
    const board = Array(8).fill(null).map(() => Array(8).fill(null));

    const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

    for (let c = 0; c < 8; c++) {
      board[0][c] = { type: backRank[c], color: 'b' };
      board[1][c] = { type: 'p', color: 'b' };
      board[6][c] = { type: 'p', color: 'w' };
      board[7][c] = { type: backRank[c], color: 'w' };
    }

    return board;
  }

  startClock() {
    if ((this.rules.timeControl || 0) <= 0) return;

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.lastMoveTimestamp = Date.now();

    this.timerInterval = setInterval(() => {
      if (this.status !== GAME_STATUS.PLAYING) {
        clearInterval(this.timerInterval);
        return;
      }

      const activePlayer = this.players.find(p => p.color === this.currentTurn);
      if (activePlayer) {
        activePlayer.timeLeft -= 1;
        if (activePlayer.timeLeft <= 0) {
          activePlayer.timeLeft = 0;
          this.status = GAME_STATUS.MATCH_END;
          this.endedAt = Date.now();
          this.finishedAt = this.endedAt;
          const opponent = this.players.find(p => p.color !== this.currentTurn);
          this.winner = opponent ? opponent.username : null;
          this.winnerId = opponent ? opponent.id : null;
          this.loser = activePlayer.username;
          this.loserId = activePlayer.id;
          this.draw = false;
          this.reason = 'TIMEOUT';
          this.finishReason = 'TIMEOUT';
          if (opponent) this.scores[opponent.username] = (this.scores[opponent.username] || 0) + 1;
          clearInterval(this.timerInterval);
        }
      }
    }, 1000);
  }

  isInsideBoard(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  cloneBoard(board) {
    return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
  }

  findKing(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === color) {
          return { row: r, col: c };
        }
      }
    }
    return null;
  }

  isSquareAttacked(board, targetRow, targetCol, attackerColor) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.color === attackerColor) {
          const attacks = this.getPseudoLegalMoves(board, r, c, false, null);
          if (attacks.some(m => m.to.row === targetRow && m.to.col === targetCol)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  isKingInCheck(board, color) {
    const kingPos = this.findKing(board, color);
    if (!kingPos) return false;
    const enemyColor = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(board, kingPos.row, kingPos.col, enemyColor);
  }

  getPseudoLegalMoves(board, r, c, includeCastling = true, enPassant = this.enPassantTarget) {
    const piece = board[r][c];
    if (!piece) return [];

    const moves = [];
    const color = piece.color;
    const enemyColor = color === 'w' ? 'b' : 'w';

    if (piece.type === 'p') {
      const dir = (color === 'w') ? -1 : 1;
      const startRow = (color === 'w') ? 6 : 1;

      // Forward 1
      const forwardR = r + dir;
      if (this.isInsideBoard(forwardR, c) && !board[forwardR][c]) {
        moves.push({ from: { row: r, col: c }, to: { row: forwardR, col: c } });

        // Forward 2
        const forward2R = r + 2 * dir;
        if (r === startRow && !board[forward2R][c]) {
          moves.push({ from: { row: r, col: c }, to: { row: forward2R, col: c }, isDoublePawn: true });
        }
      }

      // Diagonal captures
      for (const dc of [-1, 1]) {
        const capR = r + dir;
        const capC = c + dc;
        if (this.isInsideBoard(capR, capC)) {
          const targetPiece = board[capR][capC];
          if (targetPiece && targetPiece.color === enemyColor) {
            moves.push({ from: { row: r, col: c }, to: { row: capR, col: capC } });
          } else if (enPassant && enPassant.row === capR && enPassant.col === capC) {
            // En Passant
            moves.push({ from: { row: r, col: c }, to: { row: capR, col: capC }, isEnPassant: true });
          }
        }
      }
    }

    if (piece.type === 'n') {
      const knightOffsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dr, dc] of knightOffsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (this.isInsideBoard(nr, nc)) {
          const target = board[nr][nc];
          if (!target || target.color === enemyColor) {
            moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
          }
        }
      }
    }

    const slide = (directions) => {
      for (const [dr, dc] of directions) {
        let nr = r + dr;
        let nc = c + dc;
        while (this.isInsideBoard(nr, nc)) {
          const target = board[nr][nc];
          if (!target) {
            moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
          } else {
            if (target.color === enemyColor) {
              moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
            }
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    };

    if (piece.type === 'b') {
      slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
    }

    if (piece.type === 'r') {
      slide([[-1, 0], [1, 0], [0, -1], [0, 1]]);
    }

    if (piece.type === 'q') {
      slide([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
    }

    if (piece.type === 'k') {
      const kingDirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      for (const [dr, dc] of kingDirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (this.isInsideBoard(nr, nc)) {
          const target = board[nr][nc];
          if (!target || target.color === enemyColor) {
            moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
          }
        }
      }

      // Castling
      if (includeCastling) {
        const rights = this.castlingRights[color];
        const kingRow = color === 'w' ? 7 : 0;
        if (r === kingRow && c === 4 && !this.isKingInCheck(board, color)) {
          // Kingside (O-O)
          if (rights.kingside && !board[kingRow][5] && !board[kingRow][6]) {
            if (!this.isSquareAttacked(board, kingRow, 5, enemyColor) &&
                !this.isSquareAttacked(board, kingRow, 6, enemyColor)) {
              moves.push({ from: { row: r, col: c }, to: { row: kingRow, col: 6 }, isCastlingKingside: true });
            }
          }
          // Queenside (O-O-O)
          if (rights.queenside && !board[kingRow][1] && !board[kingRow][2] && !board[kingRow][3]) {
            if (!this.isSquareAttacked(board, kingRow, 3, enemyColor) &&
                !this.isSquareAttacked(board, kingRow, 2, enemyColor)) {
              moves.push({ from: { row: r, col: c }, to: { row: kingRow, col: 2 }, isCastlingQueenside: true });
            }
          }
        }
      }
    }

    return moves;
  }

  getLegalMoves(color = this.currentTurn) {
    const legalMoves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (piece && piece.color === color) {
          const pseudos = this.getPseudoLegalMoves(this.board, r, c, true, this.enPassantTarget);
          for (const m of pseudos) {
            if (this.isMoveSafe(m, color)) {
              legalMoves.push(m);
            }
          }
        }
      }
    }
    return legalMoves;
  }

  isMoveSafe(move, color) {
    const tempBoard = this.cloneBoard(this.board);
    const piece = tempBoard[move.from.row][move.from.col];

    tempBoard[move.to.row][move.to.col] = piece;
    tempBoard[move.from.row][move.from.col] = null;

    if (move.isEnPassant) {
      const enemyPawnRow = move.from.row;
      tempBoard[enemyPawnRow][move.to.col] = null;
    }

    return !this.isKingInCheck(tempBoard, color);
  }

  handleAction(playerId, action) {
    if (this.status === GAME_STATUS.MATCH_END || this.status === GAME_STATUS.FINISHED) {
      throw new GameActionError(ERROR_CODES.GAME_ALREADY_FINISHED, 'انتهت اللعبة بالفعل (Game has finished)', 'Game has finished');
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) throw new GameActionError(ERROR_CODES.PLAYER_NOT_IN_GAME, 'اللاعب غير متواجد في المباراة', 'Player not in game');

    switch (action.type) {
      case 'MOVE':
        return this.executeMove(player, action.from, action.to, action.promotion);

      case 'RESIGN':
        return this.executeResign(player);

      case 'OFFER_DRAW':
        return this.executeOfferDraw(player);

      case 'RESPOND_DRAW':
        return this.executeRespondDraw(player, action.accept);

      default:
        throw new GameActionError(ERROR_CODES.INVALID_ACTION, `حركة غير معروفة: ${action.type}`, `Unknown chess action: ${action.type}`);
    }
  }

  executeMove(player, from, to, promotion = 'q') {
    if (player.color !== this.currentTurn) {
      throw new GameActionError(ERROR_CODES.NOT_YOUR_TURN, 'ليس دورك الآن (ليست هذه حركتك)', 'Not your turn');
    }

    if (!from || !to || typeof from.row !== 'number' || typeof from.col !== 'number' || typeof to.row !== 'number' || typeof to.col !== 'number') {
      throw new GameActionError(ERROR_CODES.INVALID_ACTION, 'إحداثيات الحركة غير صالحة', 'Invalid move coordinates');
    }

    const piece = this.board[from.row]?.[from.col];
    if (!piece || piece.color !== player.color) {
      throw new GameActionError(ERROR_CODES.INVALID_MOVE, 'حركة غير قانونية (هذه الحركة غير مسموحة)', 'Illegal move');
    }

    const legalMoves = this.getLegalMoves(player.color);
    const validMove = legalMoves.find(m =>
      m.from.row === from.row && m.from.col === from.col &&
      m.to.row === to.row && m.to.col === to.col
    );

    if (!validMove) {
      throw new GameActionError(ERROR_CODES.INVALID_MOVE, 'حركة غير قانونية (هذه الحركة غير مسموحة)', 'Illegal move');
    }

    // Execute Move on Board
    const movingPiece = this.board[from.row][from.col];
    const capturedPiece = this.board[to.row][to.col];

    this.board[to.row][to.col] = movingPiece;
    this.board[from.row][from.col] = null;

    // Handle En Passant capture removal
    if (validMove.isEnPassant) {
      this.board[from.row][to.col] = null;
    }

    // Handle Castling Rook reposition
    if (validMove.isCastlingKingside) {
      this.board[to.row][5] = this.board[to.row][7];
      this.board[to.row][7] = null;
    } else if (validMove.isCastlingQueenside) {
      this.board[to.row][3] = this.board[to.row][0];
      this.board[to.row][0] = null;
    }

    // Handle Pawn Promotion
    if (movingPiece.type === 'p') {
      const promotionRank = player.color === 'w' ? 0 : 7;
      if (to.row === promotionRank) {
        const allowedPromotions = ['q', 'r', 'b', 'n'];
        movingPiece.type = allowedPromotions.includes(promotion) ? promotion : 'q';
      }
    }

    // Update Castling Rights
    if (movingPiece.type === 'k') {
      this.castlingRights[player.color].kingside = false;
      this.castlingRights[player.color].queenside = false;
    }
    if (movingPiece.type === 'r') {
      if (from.col === 0) this.castlingRights[player.color].queenside = false;
      if (from.col === 7) this.castlingRights[player.color].kingside = false;
    }

    // Update En Passant Target
    if (validMove.isDoublePawn) {
      const epRow = (from.row + to.row) / 2;
      this.enPassantTarget = { row: epRow, col: from.col };
    } else {
      this.enPassantTarget = null;
    }

    // Add increment to player's clock
    const inc = this.rules.increment || 0;
    player.timeLeft += inc;

    // Switch turn
    const nextColor = this.currentTurn === 'w' ? 'b' : 'w';
    this.currentTurn = nextColor;
    this.inCheck = this.isKingInCheck(this.board, nextColor);

    // Record history
    this.moveHistory.push({
      from,
      to,
      piece: movingPiece.type,
      color: player.color,
      captured: capturedPiece ? capturedPiece.type : null,
      timestamp: Date.now()
    });

    this.version++;

    // Check for checkmate or stalemate
    const opponentMoves = this.getLegalMoves(nextColor);
    if (opponentMoves.length === 0) {
      this.endedAt = Date.now();
      this.finishedAt = this.endedAt;
      const opponentPlayer = this.players.find(p => p.color === nextColor);
      if (this.inCheck) {
        this.status = GAME_STATUS.MATCH_END;
        this.winner = player.username;
        this.winnerId = player.id;
        this.loser = opponentPlayer ? opponentPlayer.username : null;
        this.loserId = opponentPlayer ? opponentPlayer.id : null;
        this.draw = false;
        this.reason = 'CHECKMATE';
        this.finishReason = 'CHECKMATE';
        this.scores[player.username] = (this.scores[player.username] || 0) + 1;
      } else {
        this.status = GAME_STATUS.MATCH_END;
        this.winner = null;
        this.winnerId = null;
        this.loser = null;
        this.loserId = null;
        this.draw = true;
        this.reason = 'STALEMATE';
        this.finishReason = 'STALEMATE';
        for (const p of this.players) {
          this.scores[p.username] = (this.scores[p.username] || 0) + 0.5;
        }
      }
      if (this.timerInterval) clearInterval(this.timerInterval);
    }

    return { success: true, event: 'MOVE_EXECUTED', inCheck: this.inCheck, status: this.status };
  }

  executeResign(player) {
    this.status = GAME_STATUS.MATCH_END;
    this.endedAt = Date.now();
    this.finishedAt = this.endedAt;
    const opponent = this.players.find(p => p.id !== player.id);
    this.winner = opponent ? opponent.username : null;
    this.winnerId = opponent ? opponent.id : null;
    this.loser = player.username;
    this.loserId = player.id;
    this.draw = false;
    this.reason = 'RESIGNATION';
    this.finishReason = 'RESIGNATION';
    if (opponent) this.scores[opponent.username] = (this.scores[opponent.username] || 0) + 1;
    if (this.timerInterval) clearInterval(this.timerInterval);
    return { success: true, event: 'RESIGNED', winner: this.winner };
  }

  executeOfferDraw(player) {
    if (!this.rules.allowDraw) {
      throw new Error('Draws are not enabled for this match');
    }
    this.drawOfferedBy = player.id;
    return { success: true, event: 'DRAW_OFFERED', offeredBy: player.username };
  }

  executeRespondDraw(player, accept) {
    if (!this.drawOfferedBy || this.drawOfferedBy === player.id) {
      throw new Error('No pending draw offer to respond to');
    }

    if (accept) {
      this.status = GAME_STATUS.MATCH_END;
      this.endedAt = Date.now();
      this.finishedAt = this.endedAt;
      this.winner = null;
      this.winnerId = null;
      this.loser = null;
      this.loserId = null;
      this.draw = true;
      this.reason = 'DRAW_AGREEMENT';
      this.finishReason = 'DRAW_AGREEMENT';
      for (const p of this.players) {
        this.scores[p.username] = (this.scores[p.username] || 0) + 0.5;
      }
      if (this.timerInterval) clearInterval(this.timerInterval);
      return { success: true, event: 'DRAW_ACCEPTED' };
    } else {
      this.drawOfferedBy = null;
      return { success: true, event: 'DRAW_DECLINED' };
    }
  }

  getPublicState() {
    const currentTurnPlayer = this.players.find(p => p.color === this.currentTurn);

    return {
      gameId: this.gameId,
      roomId: this.roomId,
      gameType: 'chess',
      version: this.version,
      board: this.board,
      currentTurn: currentTurnPlayer ? currentTurnPlayer.id : this.currentTurn,
      currentTurnPlayerId: currentTurnPlayer ? currentTurnPlayer.id : null,
      currentTurnColor: this.currentTurn,
      status: this.status,
      winner: this.winner,
      winnerId: this.winnerId,
      loser: this.loser,
      loserId: this.loserId,
      draw: this.draw,
      reason: this.reason,
      finishReason: this.finishReason || this.reason,
      finishedAt: this.finishedAt || this.endedAt,
      round: this.round,
      scores: this.scores,
      rules: this.rules,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      inCheck: this.inCheck,
      drawOfferedBy: this.drawOfferedBy,
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        color: p.color,
        timeLeft: p.timeLeft,
        seat: p.seat,
        score: this.scores[p.username] || 0
      })),
      historyLength: this.moveHistory.length,
      lastMove: this.moveHistory.length > 0 ? this.moveHistory[this.moveHistory.length - 1] : null
    };
  }

  getStateForPlayer(playerId) {
    const me = this.players.find(p => p.id === playerId);
    const myColor = me ? me.color : null;
    const currentTurnPlayer = this.players.find(p => p.color === this.currentTurn);

    return {
      gameId: this.gameId,
      roomId: this.roomId,
      gameType: 'chess',
      myPlayerId: playerId,
      version: this.version,
      board: this.board,
      currentTurn: currentTurnPlayer ? currentTurnPlayer.id : this.currentTurn,
      currentTurnPlayerId: currentTurnPlayer ? currentTurnPlayer.id : null,
      currentTurnColor: this.currentTurn,
      status: this.status,
      winner: this.winner,
      winnerId: this.winnerId,
      loser: this.loser,
      loserId: this.loserId,
      draw: this.draw,
      reason: this.reason,
      finishReason: this.finishReason || this.reason,
      finishedAt: this.finishedAt || this.endedAt,
      round: this.round,
      scores: this.scores,
      rules: this.rules,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      inCheck: this.inCheck,
      drawOfferedBy: this.drawOfferedBy,
      myColor: myColor || 'spectator',
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        color: p.color,
        timeLeft: p.timeLeft,
        seat: p.seat,
        score: this.scores[p.username] || 0
      })),
      historyLength: this.moveHistory.length,
      lastMove: this.moveHistory.length > 0 ? this.moveHistory[this.moveHistory.length - 1] : null
    };
  }

  handlePlayerLeft(playerId) {
    const leaving = this.players.find(p => p.id === playerId);
    if (leaving && this.status === GAME_STATUS.PLAYING) {
      this.executeResign(leaving);
    }
  }
}

export default ChessGame;
