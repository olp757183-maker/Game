/**
 * Chess Dedicated Renderer
 * 8x8 Board (64 Squares), Unicode/Stylized Pieces, Responsive Desktop & Mobile Sizing.
 */

import { escapeHtml, formatTime } from '../../js/utils.js';
import i18n from '../../js/language.js';

export const PIECE_SYMBOLS = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
};

export function renderChessSquares(state, options = {}) {
  const { isFlipped = false, selectedSquare = null } = options;
  const board = state.board || [];
  let html = '';

  const rowIndices = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const colIndices = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const turnColor = state.currentTurnColor || (state.currentTurn === 'w' || state.currentTurn === 'b' ? state.currentTurn : (state.players?.find(p => p.id === state.currentTurn)?.color) || 'w');

  for (const r of rowIndices) {
    for (const c of colIndices) {
      const isDark = (r + c) % 2 === 1;
      const piece = board[r]?.[c];
      const isSelected = selectedSquare && selectedSquare.row === r && selectedSquare.col === c;
      const isCheckSquare = state.inCheck && piece && piece.type === 'k' && piece.color === turnColor;

      let pieceHtml = '';
      if (piece) {
        const sym = PIECE_SYMBOLS[piece.color]?.[piece.type] || '';
        pieceHtml = `<span class="chess-piece piece-${piece.color}">${sym}</span>`;
      }

      html += `
        <div class="chess-square ${isDark ? 'square-dark' : 'square-light'}
                    ${isSelected ? 'square-selected' : ''}
                    ${isCheckSquare ? 'square-check' : ''}"
             data-row="${r}"
             data-col="${c}"
             title="Square ${String.fromCharCode(97 + c)}${8 - r}">
          ${pieceHtml}
        </div>
      `;
    }
  }

  return html;
}

export function renderChess(state, options = {}) {
  if (window.DEBUG_GAME) {
    console.log('[RENDER] Rendering Chess', state);
  }

  if (!state) return '<div class="game-loading">جاري تحميل لوحة الشطرنج...</div>';

  const myColor = state.myColor;
  const isFlipped = (myColor === 'b');
  const turnColor = state.currentTurnColor || (state.currentTurn === 'w' || state.currentTurn === 'b' ? state.currentTurn : (state.players?.find(p => p.id === state.currentTurn)?.color) || 'w');
  const isMyTurn = (state.myPlayerId === state.currentTurn) || (state.myPlayerId === state.currentTurnPlayerId) || (myColor === turnColor);
  const selectedSquare = options.selectedSquare || null;

  const whitePlayer = state.players.find(p => p.color === 'w') || { username: 'White', timeLeft: 300 };
  const blackPlayer = state.players.find(p => p.color === 'b') || { username: 'Black', timeLeft: 300 };

  const topPlayer = isFlipped ? whitePlayer : blackPlayer;
  const bottomPlayer = isFlipped ? blackPlayer : whitePlayer;

  return `
    <div class="game-container chess-game-container">
      <!-- Top Opponent Strip -->
      <div class="game-header chess-player-strip ${topPlayer.color === turnColor ? 'active-clock' : ''}">
        <div class="player-info-wrap">
          <div class="avatar-badge ${topPlayer.avatar || 'avatar1'}"></div>
          <div>
            <span class="player-name">${escapeHtml(topPlayer.username)}</span>
            <span class="player-color-tag">(${topPlayer.color === 'w' ? 'White / أبيض' : 'Black / أسود'})</span>
          </div>
        </div>
        <div class="chess-timer-badge">
          ⏱ ${formatTime(topPlayer.timeLeft || 0)}
        </div>
      </div>

      <!-- Center Board Stage -->
      <div class="game-board chess-center-board">
        <div class="chess-grid-wrapper">
          <div class="chess-board ${isFlipped ? 'board-flipped' : ''}" id="chess-board-grid">
            ${renderChessSquares(state, { isFlipped, selectedSquare })}
          </div>
        </div>
      </div>

      <!-- Bottom Player Strip -->
      <div class="player-area chess-player-strip ${bottomPlayer.color === turnColor ? 'active-clock' : ''}">
        <div class="player-info-wrap">
          <div class="avatar-badge ${bottomPlayer.avatar || 'avatar1'}"></div>
          <div>
            <span class="player-name">${escapeHtml(bottomPlayer.username)} (أنت)</span>
            <span class="player-color-tag">(${bottomPlayer.color === 'w' ? 'White / أبيض' : 'Black / أسود'})</span>
          </div>
        </div>
        <div class="chess-timer-badge">
          ⏱ ${formatTime(bottomPlayer.timeLeft || 0)}
        </div>
      </div>

      <!-- Game Status & Action Controls -->
      <div class="game-actions chess-actions-bar">
        <div class="chess-status-pill">
          ${state.inCheck ? `<span class="badge badge-danger">⚠️ ${i18n.t('chessCheck') || 'كش ملك (Check!)'}</span>` : ''}
          <span class="turn-status-banner ${isMyTurn ? 'my-turn-banner' : ''}">
            ${isMyTurn ? `🟢 ${i18n.t('yourTurn')}!` : `🕒 ${i18n.t('waitingTurn')}`}
          </span>
        </div>

        <div class="chess-btn-group">
          <button id="chess-draw-btn" class="btn btn-sm btn-outline" ${!isMyTurn ? 'disabled' : ''}>
            🤝 ${i18n.t('chessDrawOfferBtn') || 'عرض تعادل'}
          </button>
          <button id="chess-resign-btn" class="btn btn-sm btn-danger">
            🏳️ ${i18n.t('chessResignBtn') || 'استسلام'}
          </button>
        </div>
      </div>

      <!-- Pawn Promotion Modal -->
      <div id="chess-promotion-modal" class="wild-modal-backdrop">
        <div class="wild-modal-box">
          <h3>ترقية البيدق (Pawn Promotion)</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">اختر القطعة التي تريد الترقية إليها:</p>
          <div class="promotion-choices-grid">
            <button class="promo-btn" data-promo="q">♕ Queen (وزير)</button>
            <button class="promo-btn" data-promo="r">♖ Rook (قلعة)</button>
            <button class="promo-btn" data-promo="b">♗ Bishop (فيل)</button>
            <button class="promo-btn" data-promo="n">♘ Knight (حصان)</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export default {
  renderChess,
  renderChessSquares,
  PIECE_SYMBOLS
};
