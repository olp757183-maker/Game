/**
 * Domino Dedicated Renderer
 * Domino tiles with authentic pips (dots), horizontal/vertical board chain, player hand & boneyard.
 */

import { escapeHtml } from '../../js/utils.js';
import i18n from '../../js/language.js';

export function renderPips(num) {
  const pipLayouts = {
    0: '',
    1: '<div class="pip center"></div>',
    2: '<div class="pip top-left"></div><div class="pip bottom-right"></div>',
    3: '<div class="pip top-left"></div><div class="pip center"></div><div class="pip bottom-right"></div>',
    4: '<div class="pip top-left"></div><div class="pip top-right"></div><div class="pip bottom-left"></div><div class="pip bottom-right"></div>',
    5: '<div class="pip top-left"></div><div class="pip top-right"></div><div class="pip center"></div><div class="pip bottom-left"></div><div class="pip bottom-right"></div>',
    6: '<div class="pip top-left"></div><div class="pip top-right"></div><div class="pip mid-left"></div><div class="pip mid-right"></div><div class="pip bottom-left"></div><div class="pip bottom-right"></div>'
  };
  return `<div class="pips-grid pips-${num}">${pipLayouts[num] || ''}</div>`;
}

export function renderBoardTile(tile) {
  return `
    <div class="domino-tile board-tile ${tile.isDouble ? 'tile-double' : ''}" title="Domino [${tile.placedLeft}|${tile.placedRight}]">
      <div class="tile-half half-top">${renderPips(tile.placedLeft)}</div>
      <div class="tile-divider"></div>
      <div class="tile-half half-bottom">${renderPips(tile.placedRight)}</div>
    </div>
  `;
}

export function renderHandTile(tile, isMyTurn, isSelected = false) {
  return `
    <div class="domino-tile hand-tile ${isSelected ? 'selected' : ''}"
         data-id="${tile.id}"
         title="Tile [${tile.left}|${tile.right}]">
      <div class="tile-half half-top">${renderPips(tile.left)}</div>
      <div class="tile-divider"></div>
      <div class="tile-half half-bottom">${renderPips(tile.right)}</div>
    </div>
  `;
}

export function renderDomino(state, options = {}) {
  if (window.DEBUG_GAME) {
    console.log('[RENDER] Rendering Domino', state);
  }

  if (!state) return '<div class="game-loading">جاري تحميل طاولة الدومينو...</div>';

  const myId = state.myPlayerId;
  const isMyTurn = (state.currentTurnPlayerId === myId);
  const opponents = state.players.filter(p => p.id !== myId);
  const selectedTileId = options.selectedTileId || null;

  return `
    <div class="game-container domino-game-container">
      <!-- Game Header / Ends & Boneyard Meta -->
      <div class="game-header">
        <div class="boneyard-pill">
          <span class="badge badge-info">🁢 ${i18n.t('dominoBoneyard') || 'السحب (Boneyard)'}: <strong>${state.boneyardCount}</strong></span>
        </div>

        <div class="ends-tracker">
          <span class="end-tag left-end">◀ الطرف الأيسر: <strong>${state.leftEnd ?? '-'}</strong></span>
          <span class="end-tag right-end">الطرف الأيمن: <strong>${state.rightEnd ?? '-'}</strong> ▶</span>
        </div>

        <div class="game-status-badge ${isMyTurn ? 'my-turn' : ''}">
          ${isMyTurn ? `🟢 ${i18n.t('yourTurn')}` : `🕒 ${i18n.t('waitingTurn')}`}
        </div>
      </div>

      <!-- Opponents Area -->
      <div class="opponent-area">
        ${opponents.map(opp => {
          const isOppTurn = (opp.id === state.currentTurnPlayerId);
          return `
            <div class="opponent-box ${isOppTurn ? 'active-turn' : ''}">
              <div class="opponent-meta">
                <div class="avatar-badge ${opp.avatar || 'avatar1'}"></div>
                <div class="opponent-info">
                  <span class="opponent-name">${escapeHtml(opp.username)}</span>
                  <span class="opponent-card-count">🁢 ${opp.tileCount} قطع</span>
                  <span class="score-pill">النقاط: ${opp.score}</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Center Board: Domino Chain -->
      <div class="game-board domino-center-table">
        <div class="domino-chain-scroll">
          <div class="domino-chain">
            ${(state.board || []).length === 0 ? `
              <div class="empty-table-placeholder">
                <span>🁢 ضع أول قطعة دومينو لبدء السلسلة!</span>
              </div>
            ` : state.board.map(t => renderBoardTile(t)).join('')}
          </div>
        </div>
      </div>

      <!-- Action Controls -->
      <div class="game-actions">
        <div class="action-buttons-group">
          <button id="domino-draw-btn" class="btn btn-primary" ${!isMyTurn || state.boneyardCount === 0 ? 'disabled' : ''}>
            🁢 ${i18n.t('dominoDrawBtn') || 'سحب قطعة'}
          </button>
          <button id="domino-pass-btn" class="btn btn-outline" ${!isMyTurn ? 'disabled' : ''}>
            ⏭ ${i18n.t('dominoPassBtn') || 'تمرير (Pass)'}
          </button>
        </div>
      </div>

      <!-- Player Hand Area -->
      <div class="player-area">
        <div class="player-hand-label">
          <span>قطعك (${state.myHand?.length || 0})</span>
        </div>
        <div class="player-hand domino-hand-scroll" id="domino-hand-container">
          ${(state.myHand || []).map(t => renderHandTile(t, isMyTurn, t.id === selectedTileId)).join('')}
        </div>
      </div>

      <!-- Pick Side Modal (when tile can be played on both Left and Right) -->
      <div id="domino-side-modal" class="wild-modal-backdrop">
        <div class="wild-modal-box">
          <h3 data-i18n="dominoPickSide">${i18n.t('dominoPickSide') || 'اختر طرف اللعب'}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">هذه القطعة تطابق كلا طرفي السلسلة، أين تريد وضعها؟</p>
          <div class="domino-side-btn-group">
            <button class="btn btn-info side-pick-btn" data-side="left">◀ ${i18n.t('dominoLeft') || 'اليسار'} (${state.leftEnd})</button>
            <button class="btn btn-primary side-pick-btn" data-side="right">${i18n.t('dominoRight') || 'اليمين'} (${state.rightEnd}) ▶</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export default {
  renderDomino,
  renderBoardTile,
  renderHandTile,
  renderPips
};
