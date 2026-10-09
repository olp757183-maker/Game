/**
 * Domino Dedicated Renderer
 * Domino tiles with authentic pips (dots), horizontal/vertical board chain, player hand & boneyard.
 */

import { escapeHtml } from '../../js/utils.js';
import i18n from '../../js/language.js';

export function renderPips(num) {
  const n = parseInt(num, 10);
  if (isNaN(n) || n < 0) return '';
  const pipLayouts = {
    0: '',
    1: '<div class="pip center"></div>',
    2: '<div class="pip top-left"></div><div class="pip bottom-right"></div>',
    3: '<div class="pip top-left"></div><div class="pip center"></div><div class="pip bottom-right"></div>',
    4: '<div class="pip top-left"></div><div class="pip top-right"></div><div class="pip bottom-left"></div><div class="pip bottom-right"></div>',
    5: '<div class="pip top-left"></div><div class="pip top-right"></div><div class="pip center"></div><div class="pip bottom-left"></div><div class="pip bottom-right"></div>',
    6: '<div class="pip top-left"></div><div class="pip top-right"></div><div class="pip mid-left"></div><div class="pip mid-right"></div><div class="pip bottom-left"></div><div class="pip bottom-right"></div>'
  };
  return `<div class="pips-grid pips-${n}">${pipLayouts[n] || ''}</div>`;
}

export function renderBoardTile(tile) {
  if (!tile) return '';
  const leftVal = tile.placedLeft !== undefined ? tile.placedLeft : (tile.left !== undefined ? tile.left : 0);
  const rightVal = tile.placedRight !== undefined ? tile.placedRight : (tile.right !== undefined ? tile.right : 0);
  return `
    <div class="domino-tile board-tile ${tile.isDouble ? 'tile-double' : ''}" data-left="${leftVal}" data-right="${rightVal}" title="Domino [${leftVal}|${rightVal}]">
      <div class="tile-half half-top">${renderPips(leftVal)}</div>
      <div class="tile-divider"></div>
      <div class="tile-half half-bottom">${renderPips(rightVal)}</div>
    </div>
  `;
}

export function renderHandTile(tile, isMyTurn, isSelected = false) {
  if (!tile) return '';
  const leftVal = tile.left !== undefined ? tile.left : 0;
  const rightVal = tile.right !== undefined ? tile.right : 0;
  return `
    <div class="domino-tile hand-tile ${isSelected ? 'selected' : ''}"
         data-id="${tile.id || ''}"
         data-left="${leftVal}"
         data-right="${rightVal}"
         title="Tile [${leftVal}|${rightVal}]">
      <div class="tile-half half-top">${renderPips(leftVal)}</div>
      <div class="tile-divider"></div>
      <div class="tile-half half-bottom">${renderPips(rightVal)}</div>
    </div>
  `;
}

export function renderDomino(state, options = {}) {
  if (typeof window !== 'undefined' && window.DEBUG_GAME) {
    console.log('[RENDER] Rendering Domino', state);
  }

  if (!state) return '<div class="game-loading">جاري تحميل طاولة الدومينو...</div>';

  const myId = state.myPlayerId;
  const isMyTurn = (state.currentTurnPlayerId === myId);
  const opponents = state.players.filter(p => p.id !== myId);
  const selectedTileId = options.selectedTileId || null;

  const selectedTile = (state.myHand || []).find(t => t.id === selectedTileId);
  const isBoardEmpty = (state.board || []).length === 0;
  const canLeft = selectedTile && (isBoardEmpty || selectedTile.left === state.leftEnd || selectedTile.right === state.leftEnd);
  const canRight = selectedTile && (isBoardEmpty || selectedTile.left === state.rightEnd || selectedTile.right === state.rightEnd);

  // Check if player has no playable tiles
  const hasPlayableTile = isBoardEmpty
    ? (state.myHand?.length > 0)
    : (state.myHand || []).some(t => t.left === state.leftEnd || t.right === state.leftEnd || t.left === state.rightEnd || t.right === state.rightEnd);

  return `
    <div class="game-container domino-game-container">
      <!-- Game Header / Ends & Boneyard Meta -->
      <div class="game-header">
        <div class="boneyard-pill ${isMyTurn && state.boneyardCount > 0 && !hasPlayableTile ? 'can-draw-boneyard pulse-glow' : ''}"
             id="domino-boneyard-slot"
             title="${isMyTurn && state.boneyardCount > 0 ? 'اضغط هنا لسحب قطعة من المخزن' : 'مخزن السحب'}">
          <span class="badge badge-info">🁢 ${i18n.t('dominoBoneyard') || 'السحب (Boneyard)'}: <strong>${state.boneyardCount}</strong></span>
        </div>

        <div class="ends-tracker">
          <span class="end-tag left-end ${canLeft ? 'end-target-legal pulse-target' : ''}"
                id="domino-target-left"
                data-side="left"
                title="${canLeft ? 'اضغط لوضع القطعة على الطرف الأيسر' : 'الطرف الأيسر'}">
            ◀ الطرف الأيسر: <strong>${state.leftEnd ?? '-'}</strong>
          </span>
          <span class="end-tag right-end ${canRight ? 'end-target-legal pulse-target' : ''}"
                id="domino-target-right"
                data-side="right"
                title="${canRight ? 'اضغط لوضع القطعة على الطرف الأيمن' : 'الطرف الأيمن'}">
            الطرف الأيمن: <strong>${state.rightEnd ?? '-'}</strong> ▶
          </span>
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
          <div class="domino-chain" id="domino-chain-container">
            ${canLeft && !isBoardEmpty ? `<div class="chain-drop-zone drop-left" data-side="left" title="ضع هنا (يسار)">◀</div>` : ''}
            ${isBoardEmpty ? `
              <div class="empty-table-placeholder ${selectedTile ? 'can-drop-first' : ''}" id="domino-empty-table" title="اضغط هنا لوضع أول قطعة">
                <span>🁢 ${selectedTile ? 'اضغط هنا لوضع أول قطعة دومينو!' : 'اختر قطعة من يدك لبدء السلسلة!'}</span>
              </div>
            ` : state.board.map(t => renderBoardTile(t)).join('')}
            ${canRight && !isBoardEmpty ? `<div class="chain-drop-zone drop-right" data-side="right" title="ضع هنا (يمين)">▶</div>` : ''}
          </div>
        </div>
      </div>

      <!-- Contextual Turn Bar (No standalone action buttons) -->
      <div class="game-actions domino-direct-actions">
        ${isMyTurn && !hasPlayableTile && state.boneyardCount === 0 ? `
          <button id="domino-pass-chip" class="btn btn-sm btn-outline domino-pass-chip pulse-glow">
            ⏭ ${i18n.t('dominoPassBtn') || 'تمرير الدور (لا توجد حركة)'}
          </button>
        ` : ''}
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
