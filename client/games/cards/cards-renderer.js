/**
 * Cards / Batta Dedicated Renderer
 * Transforms server game state into rich DOM elements.
 */

import { escapeHtml } from '../../js/utils.js';
import i18n from '../../js/language.js';

export const SUIT_ICONS = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣'
};

export function renderPlayingCard(card, options = {}) {
  const {
    inHand = true,
    isMyTurn = true,
    isSelected = false,
    interactive = true
  } = options;

  if (!card) return '';

  const isRed = (card.suit === 'hearts' || card.suit === 'diamonds');
  const suitIcon = SUIT_ICONS[card.suit] || '♠';

  const classes = [
    'playing-card',
    isRed ? 'card-red' : 'card-black',
    isSelected ? 'selected' : '',
    interactive ? 'interactive' : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="${classes}"
         data-id="${card.id}"
         data-rank="${card.rank}"
         data-suit="${card.suit}"
         title="${card.rank} of ${card.suit}">
      <div class="card-corner card-corner-top">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit">${suitIcon}</span>
      </div>
      <div class="card-suit-center">${suitIcon}</div>
      <div class="card-corner card-corner-bottom">
        <span class="card-rank">${card.rank}</span>
        <span class="card-suit">${suitIcon}</span>
      </div>
    </div>
  `;
}

export function renderCardBack(options = {}) {
  const { count = null, label = '' } = options;
  return `
    <div class="playing-card card-back">
      <div class="card-back-pattern"></div>
      ${count !== null ? `<span class="pile-count-badge">${count}</span>` : ''}
      ${label ? `<span class="card-back-label">${label}</span>` : ''}
    </div>
  `;
}

export function renderCards(state, options = {}) {
  if (window.DEBUG_GAME) {
    console.log('[RENDER] Rendering Cards', state);
  }

  if (!state) return '<div class="game-loading">جاري تحميل بيانات اللعبة...</div>';

  const myId = state.myPlayerId;
  const isMyTurn = (state.currentTurnPlayerId === myId);
  const opponents = state.players.filter(p => p.id !== myId);
  const selectedCardId = options.selectedCardId || null;

  return `
    <div class="game-container cards-game-container">
      <!-- Game Header / Turn & Active Suit -->
      <div class="game-header">
        <div class="active-suit-pill suit-${state.activeSuit || 'spades'}">
          <span>${i18n.t('activeSuitLabel') || 'Active Suit'}:</span>
          <strong>${SUIT_ICONS[state.activeSuit] || ''} ${(state.activeSuit || '').toUpperCase()}</strong>
        </div>

        <div class="game-status-badge ${isMyTurn ? 'my-turn' : ''}">
          ${isMyTurn ? `🟢 ${i18n.t('yourTurn')}` : `🕒 ${i18n.t('waitingTurn')}`}
        </div>

        ${state.pendingDraw > 0 ? `
          <div class="penalty-pill">
            ⚠️ +${state.pendingDraw} Penalty Stack!
          </div>
        ` : ''}
      </div>

      <!-- Opponent Area: Hands with Card Backs -->
      <div class="opponent-area">
        ${opponents.map(opp => {
          const isOppTurn = (opp.id === state.currentTurnPlayerId);
          const oppCardCount = opp.cardCount || 0;
          // Render miniature card backs for opponent
          const backCards = Array.from({ length: Math.min(oppCardCount, 8) })
            .map(() => `<div class="mini-card-back"></div>`)
            .join('');

          return `
            <div class="opponent-box ${isOppTurn ? 'active-turn' : ''}">
              <div class="opponent-meta">
                <div class="avatar-badge ${opp.avatar || 'avatar1'}"></div>
                <div class="opponent-info">
                  <span class="opponent-name">${escapeHtml(opp.username)}</span>
                  <span class="opponent-card-count">🎴 ${oppCardCount} ${i18n.t('cardsCountLabel') || 'Cards'}</span>
                </div>
              </div>
              <div class="opponent-hand" title="${opp.username}: ${oppCardCount} cards">
                ${backCards}
                ${oppCardCount > 8 ? `<span class="more-cards-indicator">+${oppCardCount - 8}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Game Table / Felt Center -->
      <div class="game-table cards-felt">
        <!-- Draw Pile -->
        <div class="draw-pile-slot" id="cards-draw-pile" title="Click to draw a card">
          ${renderCardBack({ count: state.deckCount, label: i18n.t('cardsDrawBtn') })}
          <span class="pile-label">${i18n.t('cardsDrawBtn')} (${state.deckCount})</span>
        </div>

        <!-- Discard Pile -->
        <div class="discard-pile-slot">
          ${state.topDiscard ? renderPlayingCard(state.topDiscard, { inHand: false, interactive: false }) : '<div class="empty-pile"></div>'}
          <span class="pile-label">${i18n.t('cardsDiscardBtn') || 'Table'}</span>
        </div>
      </div>

      <!-- Action Controls -->
      <div class="game-actions">
        <div class="action-buttons-group">
          <button id="cards-draw-btn" class="btn btn-primary" ${!isMyTurn ? 'disabled' : ''}>
            🎴 ${i18n.t('cardsDrawBtn')}
          </button>
          <button id="cards-play-btn" class="btn btn-success" ${!isMyTurn || !selectedCardId ? 'disabled' : ''}>
            ▶ ${i18n.t('cardsPlayBtn') || 'العب البطاقة'}
          </button>
          <button id="cards-pass-btn" class="btn btn-outline" ${!isMyTurn || (!state.hasDrawnThisTurn && state.pendingDraw === 0) ? 'disabled' : ''}>
            ⏭ ${i18n.t('cardsPassBtn')}
          </button>
        </div>
      </div>

      <!-- Player Hand Area -->
      <div class="player-area">
        <div class="player-hand-label">
          <span>${i18n.t('yourHand') || 'أوراقك'} (${state.myHand?.length || 0})</span>
        </div>
        <div class="player-hand" id="player-hand-container">
          ${(state.myHand || []).map(card => renderPlayingCard(card, {
            inHand: true,
            isMyTurn,
            isSelected: (card.id === selectedCardId),
            interactive: true
          })).join('')}
        </div>
      </div>

      <!-- 8 Suit Selection Modal -->
      <div id="cards-suit-modal" class="wild-modal-backdrop">
        <div class="wild-modal-box">
          <h3 data-i18n="cardsSelectSuit">${i18n.t('cardsSelectSuit')}</h3>
          <div class="suit-choices-grid">
            <button class="btn btn-outline suit-choice-btn" data-suit="spades">♠ Spades (سبيت)</button>
            <button class="btn btn-outline suit-choice-btn text-danger" data-suit="hearts">♥ Hearts (هاص)</button>
            <button class="btn btn-outline suit-choice-btn text-danger" data-suit="diamonds">♦ Diamonds (ديمن)</button>
            <button class="btn btn-outline suit-choice-btn" data-suit="clubs">♣ Clubs (كلفس)</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export default {
  renderCards,
  renderPlayingCard,
  renderCardBack,
  SUIT_ICONS
};
