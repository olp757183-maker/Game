/**
 * Chess Client Game Controller
 * Integrates with chess-renderer.js and manages user interactions & socket communications.
 */

import socket from '../../js/socket.js';
import { sfx, showToast } from '../../js/utils.js';
import { renderChess } from './chess-renderer.js';

export class ChessClient {
  constructor(containerElement, roomId) {
    this.container = containerElement;
    this.roomId = roomId;
    this.state = null;
    this.selectedSquare = null; // { row, col }
    this.legalDestinations = []; // Array of { row, col }
    this.pendingPromotionMove = null;
    this.actionInFlight = false;
    this.actionTimeout = null;
  }

  handleActionError(err) {
    this.actionInFlight = false;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.selectedSquare = null;
    this.legalDestinations = [];
    this.pendingPromotionMove = null;
    const modal = this.container.querySelector('#chess-promotion-modal');
    if (modal) modal.classList.remove('active');
    const msg = err?.messageAr || err?.messageEn || 'حركة غير قانونية (Illegal Move)';
    showToast(`⚠️ ${msg}`, 'error');
    this.render();
  }

  update(gameState) {
    const prevTurn = this.state?.currentTurn;
    this.state = gameState;
    this.actionInFlight = false;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);

    const isMyTurn = (this.state.myPlayerId === this.state.currentTurn) ||
                     (this.state.myPlayerId === this.state.currentTurnPlayerId) ||
                     (this.state.myColor === this.state.currentTurnColor) ||
                     (this.state.myColor === this.state.currentTurn);

    if (isMyTurn && prevTurn !== this.state.currentTurn) {
      sfx.turnAlert();
    }

    this.selectedSquare = null;
    this.legalDestinations = [];
    this.render();
  }

  render() {
    if (!this.state) return;

    this.container.innerHTML = renderChess(this.state, {
      selectedSquare: this.selectedSquare,
      legalDestinations: this.legalDestinations
    });

    this.attachEventListeners();
  }

  attachEventListeners() {
    const squares = this.container.querySelectorAll('.chess-square');
    squares.forEach(sq => {
      sq.addEventListener('click', () => {
        const r = parseInt(sq.getAttribute('data-row'), 10);
        const c = parseInt(sq.getAttribute('data-col'), 10);
        this.handleSquareClick(r, c);
      });
    });

    // Promotion choices
    this.container.querySelectorAll('.promo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const promo = btn.getAttribute('data-promo');
        if (this.pendingPromotionMove) {
          this.executeMove(this.pendingPromotionMove.from, this.pendingPromotionMove.to, promo);
          this.pendingPromotionMove = null;
          const modal = this.container.querySelector('#chess-promotion-modal');
          if (modal) modal.classList.remove('active');
        }
      });
    });

    // Resign
    const resignBtn = this.container.querySelector('#chess-resign-btn');
    if (resignBtn) {
      resignBtn.addEventListener('click', () => {
        if (confirm('هل أنت متأكد من رغبتك بالاستسلام؟')) {
          socket.sendGameAction({ type: 'RESIGN' }, this.roomId);
        }
      });
    }

    // Draw offer
    const drawBtn = this.container.querySelector('#chess-draw-btn');
    if (drawBtn) {
      drawBtn.addEventListener('click', () => {
        socket.sendGameAction({ type: 'OFFER_DRAW' }, this.roomId);
        showToast('تم إرسال عرض التعادل إلى الخصم', 'info');
      });
    }
  }

  handleSquareClick(r, c) {
    const isMyTurn = (this.state.myPlayerId === this.state.currentTurn) ||
                     (this.state.myPlayerId === this.state.currentTurnPlayerId) ||
                     (this.state.myColor === this.state.currentTurnColor) ||
                     (this.state.myColor === this.state.currentTurn);
    if (!isMyTurn || this.actionInFlight) return;

    const piece = this.state.board[r]?.[c];

    // If player already selected a square
    if (this.selectedSquare) {
      // 1. If clicking the exact same square, deselect
      if (this.selectedSquare.row === r && this.selectedSquare.col === c) {
        this.selectedSquare = null;
        this.legalDestinations = [];
        this.render();
        return;
      }

      // 2. If clicking another piece of player's own color, switch selection
      if (piece && piece.color === this.state.myColor) {
        this.selectedSquare = { row: r, col: c };
        this.legalDestinations = this.computeLegalDestinations(r, c);
        sfx.click();
        this.render();
        return;
      }

      // 3. Check if target square is one of the legal destinations
      const isLegal = this.legalDestinations.some(d => d.row === r && d.col === c);
      if (!isLegal) {
        showToast('حركة غير قانونية لهذه القطعة', 'warning');
        this.selectedSquare = null;
        this.legalDestinations = [];
        this.render();
        return;
      }

      // 4. Target square is legal: check pawn promotion condition
      const selectedPiece = this.state.board[this.selectedSquare.row]?.[this.selectedSquare.col];
      const promoRow = (this.state.myColor === 'w') ? 0 : 7;

      if (selectedPiece && selectedPiece.type === 'p' && r === promoRow) {
        this.pendingPromotionMove = { from: this.selectedSquare, to: { row: r, col: c } };
        const modal = this.container.querySelector('#chess-promotion-modal');
        if (modal) modal.classList.add('active');
        return;
      }

      // 5. Execute move directly (server authoritatively validates)
      const from = this.selectedSquare;
      this.selectedSquare = null;
      this.legalDestinations = [];
      this.executeMove(from, { row: r, col: c });
      this.render();
      return;
    }

    // No piece selected yet: clicking own piece selects it and highlights destinations
    if (piece && piece.color === this.state.myColor) {
      this.selectedSquare = { row: r, col: c };
      this.legalDestinations = this.computeLegalDestinations(r, c);
      sfx.click();
      this.render();
    }
  }

  computeLegalDestinations(r, c) {
    if (!this.state?.board) return [];
    const board = this.state.board;
    const piece = board[r]?.[c];
    if (!piece || piece.color !== this.state.myColor) return [];

    const moves = [];
    const color = piece.color;
    const enemyColor = color === 'w' ? 'b' : 'w';
    const isInside = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;

    if (piece.type === 'p') {
      const dir = (color === 'w') ? -1 : 1;
      const startRow = (color === 'w') ? 6 : 1;

      // 1 square forward
      const f1 = r + dir;
      if (isInside(f1, c) && !board[f1][c]) {
        moves.push({ row: f1, col: c });
        // 2 squares forward
        const f2 = r + 2 * dir;
        if (r === startRow && !board[f2][c]) {
          moves.push({ row: f2, col: c });
        }
      }
      // Diagonal captures
      for (const dc of [-1, 1]) {
        const cr = r + dir;
        const cc = c + dc;
        if (isInside(cr, cc)) {
          if (board[cr][cc] && board[cr][cc].color === enemyColor) {
            moves.push({ row: cr, col: cc });
          } else if (this.state.enPassantTarget && this.state.enPassantTarget.row === cr && this.state.enPassantTarget.col === cc) {
            moves.push({ row: cr, col: cc });
          }
        }
      }
    } else if (piece.type === 'n') {
      const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (const [dr, dc] of offsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (isInside(nr, nc)) {
          const target = board[nr][nc];
          if (!target || target.color === enemyColor) {
            moves.push({ row: nr, col: nc });
          }
        }
      }
    } else if (piece.type === 'k') {
      const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      for (const [dr, dc] of offsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (isInside(nr, nc)) {
          const target = board[nr][nc];
          if (!target || target.color === enemyColor) {
            moves.push({ row: nr, col: nc });
          }
        }
      }
      // Castling
      const kingRow = color === 'w' ? 7 : 0;
      if (r === kingRow && c === 4) {
        if (!board[kingRow][5] && !board[kingRow][6] && board[kingRow][7]?.type === 'r') {
          moves.push({ row: kingRow, col: 6 });
        }
        if (!board[kingRow][3] && !board[kingRow][2] && !board[kingRow][1] && board[kingRow][0]?.type === 'r') {
          moves.push({ row: kingRow, col: 2 });
        }
      }
    } else {
      // Sliders: b, r, q
      let dirs = [];
      if (piece.type === 'b') dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      else if (piece.type === 'r') dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      else if (piece.type === 'q') dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];

      for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (isInside(nr, nc)) {
          const target = board[nr][nc];
          if (!target) {
            moves.push({ row: nr, col: nc });
          } else {
            if (target.color === enemyColor) {
              moves.push({ row: nr, col: nc });
            }
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    }

    return moves;
  }

  executeMove(from, to, promotion = 'q') {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
    sfx.playCard();
    const actionId = `chess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({
      type: 'MOVE',
      from,
      to,
      promotion,
      actionId
    }, this.roomId);
  }
}

export default ChessClient;
