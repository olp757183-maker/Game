/**
 * UNO Dedicated Renderer
 * Transforms server game state into rich UNO visual elements.
 */

import { escapeHtml } from '../../js/utils.js';
import i18n from '../../js/language.js';

export function getUnoSymbol(value) {
  switch (value) {
    case 'skip': return '⊘';
    case 'reverse': return '⇄';
    case 'draw2': return '+2';
    case 'wild': return '★';
    case 'wild4': return '+4';
    default: return value;
  }
}

export function renderUnoCard(card, options = {}) {
  const {
    inHand = true,
    isMyTurn = true,
    isSelected = false,
    interactive = true
  } = options;

  if (!card) return '';

  const symbol = getUnoSymbol(card.value);
  const colorClass = `card-${card.color}`;

  const classes = [
    'uno-card',
    colorClass,
    isSelected ? 'selected' : '',
    interactive ? 'interactive' : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="${classes}"
         data-id="${card.id}"
         data-color="${card.color}"
         data-value="${card.value}"
         title="${card.color.toUpperCase()} ${card.value}">
      <div class="uno-card-inner">
        <span class="uno-corner top-left">${symbol}</span>
        <div class="uno-card-oval">
          <span class="uno-center-value">${symbol}</span>
        </div>
        <span class="uno-corner bottom-right">${symbol}</span>
      </div>
    </div>
  `;
}

export function renderUnoCardBack(options = {}) {
  const { count = null, label = '' } = options;
  return `
    <div class="uno-card card-back" title="UNO Deck">
      <div class="uno-card-inner">
        <div class="uno-back-oval">
          <span class="uno-back-text">UNO</span>
        </div>
        ${count !== null ? `<span class="pile-count-badge">${count}</span>` : ''}
        ${label ? `<span class="pile-label-text">${label}</span>` : ''}
      </div>
    </div>
  `;
}

export function renderUNO(state, options = {}) {
  if (window.DEBUG_GAME) {
    console.log('[RENDER] Rendering UNO', state);
  }

  if (!state) return '<div class="game-loading">جاري تحميل بيانات اللعبة...</div>';

  const myId = state.myPlayerId;
  const isMyTurn = (state.currentTurnPlayerId === myId);
  const opponents = state.players.filter(p => p.id !== myId);
  const selectedCardId = options.selectedCardId || null;

  return `
    <div class="game-container uno-game-container">
      <!-- Game Header / Turn & Active Color -->
      <div class="game-header">
        <div class="active-color-pill color-${state.currentColor || 'red'}">
          <span class="color-dot"></span>
          <span>${i18n.t('activeColorLabel') || 'Color'}:</span>
          <strong>${(state.currentColor || 'None').toUpperCase()}</strong>
        </div>

        <div class="turn-direction-pill">
          <span>${state.direction === 1 ? '↻ Clockwise' : '↺ Counter-Clockwise'}</span>
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

      <!-- Opponent Area: Cards Hidden (Card Backs) -->
      <div class="opponent-area">
        ${opponents.map(opp => {
          const isOppTurn = (opp.id === state.currentTurnPlayerId);
          const oppCardCount = opp.cardCount || 0;
          const backCards = Array.from({ length: Math.min(oppCardCount, 8) })
            .map(() => `<div class="mini-uno-back"></div>`)
            .join('');

          return `
            <div class="opponent-box ${isOppTurn ? 'active-turn' : ''}">
              <div class="opponent-meta">
                <div class="avatar-badge ${opp.avatar || 'avatar1'}"></div>
                <div class="opponent-info">
                  <span class="opponent-name">${escapeHtml(opp.username)}</span>
                  <span class="opponent-card-count">🎴 ${oppCardCount} Cards</span>
                  ${opp.hasCalledUno ? '<span class="badge badge-uno">UNO!</span>' : ''}
                </div>
                ${oppCardCount === 1 && !opp.hasCalledUno ? `
                  <button class="btn btn-xs btn-danger catch-uno-btn" data-target="${opp.id}" title="Catch UNO penalty">
                    🚨 Catch UNO!
                  </button>
                ` : ''}
              </div>
              <div class="opponent-hand" title="${opp.username}: ${oppCardCount} cards">
                ${backCards}
                ${oppCardCount > 8 ? `<span class="more-cards-indicator">+${oppCardCount - 8}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Game Table / Center Felt Area -->
      <div class="game-table uno-center-table">
        <!-- Draw Pile -->
        <div class="draw-pile-slot" id="uno-draw-pile" title="Click to draw card">
          ${renderUnoCardBack({ count: state.deckCount, label: i18n.t('unoDrawBtn') })}
          <span class="pile-label">${i18n.t('unoDrawBtn')} (${state.deckCount})</span>
        </div>

        <!-- Discard Pile -->
        <div class="discard-pile-slot">
          ${state.topDiscard ? renderUnoCard(state.topDiscard, { inHand: false, interactive: false }) : '<div class="empty-pile"></div>'}
          <span class="pile-label">${i18n.t('unoDiscardLabel') || 'Top Card'}</span>
        </div>
      </div>

      <!-- Action Controls -->
      <div class="game-actions">
        <div class="action-buttons-group">
          <button id="uno-call-btn" class="btn btn-warning uno-shout-btn">
            📣 ${i18n.t('unoCallBtn')}
          </button>
          <button id="uno-draw-btn" class="btn btn-primary" ${!isMyTurn ? 'disabled' : ''}>
            🎴 ${i18n.t('unoDrawBtn')}
          </button>
          <button id="uno-play-btn" class="btn btn-success" ${!isMyTurn || !selectedCardId ? 'disabled' : ''}>
            ▶ ${i18n.t('cardsPlayBtn') || 'العب البطاقة'}
          </button>
          <button id="uno-pass-btn" class="btn btn-outline" ${!isMyTurn || (!state.hasDrawnThisTurn && state.pendingDraw === 0) ? 'disabled' : ''}>
            ⏭ ${i18n.t('unoPassBtn')}
          </button>
        </div>
      </div>

      <!-- Player Hand Area -->
      <div class="player-area">
        <div class="player-hand-label">
          <span>${i18n.t('yourHand') || 'أوراقك'} (${state.myHand?.length || 0})</span>
        </div>
        <div class="player-hand" id="player-hand-container">
          ${(state.myHand || []).map(card => renderUnoCard(card, {
            inHand: true,
            isMyTurn,
            isSelected: (card.id === selectedCardId),
            interactive: true
          })).join('')}
        </div>
      </div>

      <!-- Wild Color Picker Modal -->
      <div id="wild-color-modal" class="wild-modal-backdrop">
        <div class="wild-modal-box">
          <h3 data-i18n="unoSelectColor">${i18n.t('unoSelectColor')}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">اختر لون اللعب القادم:</p>
          <div class="wild-colors-grid">
            <button class="color-choice-btn btn-red" data-color="red">🔴 Red</button>
            <button class="color-choice-btn btn-blue" data-color="blue">🔵 Blue</button>
            <button class="color-choice-btn btn-green" data-color="green">🟢 Green</button>
            <button class="color-choice-btn btn-yellow" data-color="yellow">🟡 Yellow</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export default {
  renderUNO,
  renderUnoCard,
  renderUnoCardBack,
  getUnoSymbol
};
