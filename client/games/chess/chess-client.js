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
    this.pendingPromotionMove = null;
  }

  update(gameState) {
    const prevTurn = this.state?.currentTurn;
    this.state = gameState;

    if (this.state.myColor === this.state.currentTurn && prevTurn !== this.state.currentTurn) {
      sfx.turnAlert();
    }

    this.render();
  }

  render() {
    if (!this.state) return;

    this.container.innerHTML = renderChess(this.state, {
      selectedSquare: this.selectedSquare
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
    if (this.state.myColor !== this.state.currentTurn) return;

    const piece = this.state.board[r]?.[c];

    // If player already selected a square
    if (this.selectedSquare) {
      // If clicking the exact same square, deselect
      if (this.selectedSquare.row === r && this.selectedSquare.col === c) {
        this.selectedSquare = null;
        this.render();
        return;
      }

      // If clicking another piece of player's own color, switch selection
      if (piece && piece.color === this.state.myColor) {
        this.selectedSquare = { row: r, col: c };
        sfx.click();
        this.render();
        return;
      }

      // Player clicked target square to execute move!
      const selectedPiece = this.state.board[this.selectedSquare.row]?.[this.selectedSquare.col];
      const promoRow = (this.state.myColor === 'w') ? 0 : 7;

      // Check pawn promotion condition
      if (selectedPiece && selectedPiece.type === 'p' && r === promoRow) {
        this.pendingPromotionMove = { from: this.selectedSquare, to: { row: r, col: c } };
        const modal = this.container.querySelector('#chess-promotion-modal');
        if (modal) modal.classList.add('active');
        return;
      }

      // Execute move directly (server validates legality)
      const from = this.selectedSquare;
      this.selectedSquare = null;
      this.executeMove(from, { row: r, col: c });
      this.render();
      return;
    }

    // No piece selected yet: clicking own piece selects it
    if (piece && piece.color === this.state.myColor) {
      this.selectedSquare = { row: r, col: c };
      sfx.click();
      this.render();
    }
  }

  executeMove(from, to, promotion = 'q') {
    sfx.playCard();
    socket.sendGameAction({
      type: 'MOVE',
      from,
      to,
      promotion
    }, this.roomId);
  }
}

export default ChessClient;
