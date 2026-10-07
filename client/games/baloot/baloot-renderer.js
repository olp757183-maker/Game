/**
 * Baloot Dedicated Renderer
 * 4 Seats (Me, Partner, Left, Right), Felt Arena, Center Trick, Contract & Scoreboards.
 */

import { escapeHtml } from '../../js/utils.js';
import i18n from '../../js/language.js';
import { renderPlayingCard, SUIT_ICONS } from '../cards/cards-renderer.js';

export function renderBaloot(state, options = {}) {
  if (window.DEBUG_GAME) {
    console.log('[RENDER] Rendering Baloot', state);
  }

  if (!state) return '<div class="game-loading">جاري تحميل بيانات لعبة البلوت...</div>';

  const myId = state.myPlayerId;
  const me = state.players.find(p => p.id === myId) || state.players[0] || {};
  const isMyTurn = (state.currentTurnPlayerId === myId);
  const mySeat = me.seat || 0;

  // 4 seats relative to me: Bottom (me: 0), Right (+1), Top (+2, Partner), Left (+3)
  const rightPlayer = state.players.find(p => p.seat === (mySeat + 1) % 4);
  const partnerPlayer = state.players.find(p => p.seat === (mySeat + 2) % 4);
  const leftPlayer = state.players.find(p => p.seat === (mySeat + 3) % 4);

  const selectedCardId = options.selectedCardId || null;

  return `
    <div class="game-container baloot-game-container">
      <!-- Baloot Scoreboard Header -->
      <div class="game-header baloot-scoreboard">
        <div class="team-score-card team-us">
          <span class="team-tag">لنا (فريقنا - Team 1)</span>
          <span class="score-num">${state.teamScores?.[0] ?? 0} <small>نقطة</small></span>
          <span class="abnat-num">أبناط الجولة: ${state.teamAbnat?.[0] ?? 0}</span>
        </div>

        <div class="contract-info-pill">
          <div class="contract-type-title">
            ${state.contract ? `
              <span class="contract-badge ${state.contract.type}">
                ${state.contract.type === 'sun' ? '☀️ صَن' : '👑 حُكم'}
                ${state.contract.trumpSuit ? SUIT_ICONS[state.contract.trumpSuit] : ''}
              </span>
            ` : '<span class="contract-badge bidding">مرحلة المزايدة (شراء)</span>'}
          </div>
          <div class="tricks-tracker">
            <span>الأكلات: <strong>${state.tricksCompleted ?? 0} / 8</strong></span>
            <span class="round-tracker">الجولة: <strong>${state.roundNumber ?? 1}</strong></span>
          </div>
        </div>

        <div class="team-score-card team-them">
          <span class="team-tag">لهم (الخصم - Team 2)</span>
          <span class="score-num">${state.teamScores?.[1] ?? 0} <small>نقطة</small></span>
          <span class="abnat-num">أبناط الجولة: ${state.teamAbnat?.[1] ?? 0}</span>
        </div>
      </div>

      <!-- Baloot Green Felt Arena -->
      <div class="game-board baloot-felt-arena">
        <!-- Top Seat (Partner) -->
        <div class="seat-pos seat-top ${partnerPlayer?.seat === state.currentTurnSeat ? 'active-turn' : ''}">
          <div class="avatar-badge ${partnerPlayer?.avatar || 'avatar1'}"></div>
          <div class="seat-info">
            <span class="player-name">${escapeHtml(partnerPlayer?.username || 'Partner')} (الشريك)</span>
            <span class="card-count-badge">🎴 ${partnerPlayer?.cardCount ?? 0} أوراق</span>
          </div>
          <div class="seat-mini-hand">
            ${Array.from({ length: Math.min(partnerPlayer?.cardCount || 0, 5) }).map(() => '<div class="mini-card-back"></div>').join('')}
          </div>
        </div>

        <!-- Left Seat (Opponent) -->
        <div class="seat-pos seat-left ${leftPlayer?.seat === state.currentTurnSeat ? 'active-turn' : ''}">
          <div class="avatar-badge ${leftPlayer?.avatar || 'avatar1'}"></div>
          <div class="seat-info">
            <span class="player-name">${escapeHtml(leftPlayer?.username || 'Player')}</span>
            <span class="card-count-badge">🎴 ${leftPlayer?.cardCount ?? 0} أوراق</span>
          </div>
          <div class="seat-mini-hand">
            ${Array.from({ length: Math.min(leftPlayer?.cardCount || 0, 5) }).map(() => '<div class="mini-card-back"></div>').join('')}
          </div>
        </div>

        <!-- Center Arena: Floor Card or Active Trick -->
        <div class="game-table baloot-center-felt">
          ${state.status === 'BIDDING' ? `
            <div class="bidding-floor-slot">
              <span class="floor-label">ورقة الساحة (المشترى)</span>
              ${state.floorCard ? renderPlayingCard(state.floorCard, { inHand: false, interactive: false }) : '<div class="empty-pile"></div>'}
            </div>
          ` : `
            <div class="active-trick-layout">
              ${(state.currentTrick || []).map(item => {
                const relPos = (item.seat - mySeat + 4) % 4;
                const posClass = ['trick-pos-bottom', 'trick-pos-right', 'trick-pos-top', 'trick-pos-left'][relPos];
                return `
                  <div class="trick-played-card ${posClass}">
                    ${renderPlayingCard(item.card, { inHand: false, interactive: false })}
                    <span class="trick-owner-name">${escapeHtml(state.players[item.seat]?.username || '')}</span>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Right Seat (Opponent) -->
        <div class="seat-pos seat-right ${rightPlayer?.seat === state.currentTurnSeat ? 'active-turn' : ''}">
          <div class="avatar-badge ${rightPlayer?.avatar || 'avatar1'}"></div>
          <div class="seat-info">
            <span class="player-name">${escapeHtml(rightPlayer?.username || 'Player')}</span>
            <span class="card-count-badge">🎴 ${rightPlayer?.cardCount ?? 0} أوراق</span>
          </div>
          <div class="seat-mini-hand">
            ${Array.from({ length: Math.min(rightPlayer?.cardCount || 0, 5) }).map(() => '<div class="mini-card-back"></div>').join('')}
          </div>
        </div>
      </div>

      <!-- Action Controls & Turn Status -->
      <div class="game-actions">
        <div class="turn-status-banner ${isMyTurn ? 'my-turn-banner' : ''}">
          ${isMyTurn ? `🟢 ${i18n.t('yourTurn')}!` : `🕒 ${i18n.t('waitingTurn')}`}
        </div>

        ${state.status === 'BIDDING' && isMyTurn ? `
          <div class="bidding-actions-group">
            <button class="btn btn-warning bid-btn" data-bid="sun">☀️ ${i18n.t('balootSun') || 'صَن'}</button>
            <button class="btn btn-primary bid-btn" data-bid="hokom">👑 ${i18n.t('balootHokom') || 'حُكم'}</button>
            ${state.biddingRound === 1 && (mySeat % 2 === 0) ? `
              <button class="btn btn-info bid-btn" data-bid="ashkal">🔄 ${i18n.t('balootAshkal') || 'أشكال'}</button>
            ` : ''}
            <button class="btn btn-outline bid-btn" data-bid="pass">⏭ ${i18n.t('balootPass') || 'بس (تمرير)'}</button>
          </div>
        ` : ''}

        ${state.status === 'PLAYING' && isMyTurn ? `
          <div class="action-buttons-group">
            <button id="baloot-play-btn" class="btn btn-success" ${!selectedCardId ? 'disabled' : ''}>
              ▶ العب البطاقة
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Player Hand (Bottom Area) -->
      <div class="player-area">
        <div class="player-hand-label">
          <span>${i18n.t('yourHand') || 'أوراقك'} (${state.myHand?.length || 0})</span>
        </div>
        <div class="player-hand" id="player-hand-container">
          ${(state.myHand || []).map(card => renderPlayingCard(card, {
            inHand: true,
            isMyTurn: isMyTurn && (state.status === 'PLAYING'),
            isSelected: (card.id === selectedCardId),
            interactive: true
          })).join('')}
        </div>
      </div>

      <!-- Round 2 Hokom Trump Suit Picker Modal -->
      <div id="baloot-suit-modal" class="wild-modal-backdrop">
        <div class="wild-modal-box">
          <h3>اختر نوع الحكم (مشترى دور ثاني)</h3>
          <div class="suit-choices-grid">
            <button class="btn btn-outline baloot-trump-choice" data-suit="spades">♠ Spades (سبيت)</button>
            <button class="btn btn-outline baloot-trump-choice text-danger" data-suit="hearts">♥ Hearts (هاص)</button>
            <button class="btn btn-outline baloot-trump-choice text-danger" data-suit="diamonds">♦ Diamonds (ديمن)</button>
            <button class="btn btn-outline baloot-trump-choice" data-suit="clubs">♣ Clubs (كلفس)</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export default {
  renderBaloot
};
