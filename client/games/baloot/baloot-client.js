/**
 * Baloot Client Game Controller
 * Integrates with baloot-renderer.js and manages user interactions & socket communications.
 */

import socket from '../../js/socket.js';
import { sfx } from '../../js/utils.js';
import { renderBaloot } from './baloot-renderer.js';

export class BalootClient {
  constructor(containerElement, roomId) {
    this.container = containerElement;
    this.roomId = roomId;
    this.state = null;
    this.selectedCardId = null;
    this.pendingRoundTwoHokom = false;
    this.actionInFlight = false;
    this.actionTimeout = null;
  }

  handleActionError(err) {
    this.actionInFlight = false;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.selectedCardId = null;
    this.pendingRoundTwoHokom = false;
    const modal = this.container.querySelector('#baloot-suit-modal');
    if (modal) modal.classList.remove('active');
    const msg = err?.messageAr || err?.messageEn || 'هذه الحركة غير مسموحة';
    showToast(`⚠️ ${msg}`, 'error');
    this.render();
  }

  update(gameState) {
    const prevTurn = this.state?.currentTurnPlayerId;
    this.state = gameState;
    this.actionInFlight = false;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);

    const myId = this.state.myPlayerId;
    if (this.state.currentTurnPlayerId === myId && prevTurn !== myId) {
      sfx.turnAlert();
    }

    if (this.selectedCardId && !this.state.myHand.some(c => c.id === this.selectedCardId)) {
      this.selectedCardId = null;
    }

    this.render();
  }

  render() {
    if (!this.state) return;

    this.container.innerHTML = renderBaloot(this.state, {
      selectedCardId: this.selectedCardId
    });

    this.attachEventListeners();
  }

  attachEventListeners() {
    const myId = this.state.myPlayerId;
    const isMyTurn = (this.state.currentTurnPlayerId === myId);

    // Direct card play from hand: click/tap immediately plays the card!
    this.container.querySelectorAll('.player-hand .playing-card').forEach(el => {
      el.addEventListener('click', () => {
        if (this.actionInFlight) return;
        const cardId = el.getAttribute('data-id');
        const card = this.state.myHand?.find(c => c.id === cardId);
        if (!card) return;

        if (this.state.status === 'BIDDING') {
          showToast('اللعبة في مرحلة المزايدة حالياً (اختر صَن أو حُكم أو بس)', 'info');
          return;
        }

        if (!isMyTurn) {
          showToast('ليس دورك الآن (انتظر دورك)', 'warning');
          el.classList.add('shake-anim');
          setTimeout(() => el.classList.remove('shake-anim'), 400);
          return;
        }

        // Direct play without needing secondary button
        el.classList.add('card-play-anim');
        this.playCard(cardId);
      });
    });

    // Bidding actions
    this.container.querySelectorAll('.bid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!isMyTurn || this.actionInFlight) return;
        const bid = btn.getAttribute('data-bid');
        if (bid === 'hokom' && this.state.biddingRound === 2) {
          // Open trump suit modal for round 2
          this.pendingRoundTwoHokom = true;
          const modal = this.container.querySelector('#baloot-suit-modal');
          if (modal) modal.classList.add('active');
          return;
        }

        this.actionInFlight = true;
        if (this.actionTimeout) clearTimeout(this.actionTimeout);
        this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
        sfx.click();
        const actionId = `baloot_bid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        socket.sendGameAction({ type: 'BID', bid, actionId }, this.roomId);
      });
    });

    // Round 2 Hokom suit selection
    this.container.querySelectorAll('.baloot-trump-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.actionInFlight) return;
        this.actionInFlight = true;
        if (this.actionTimeout) clearTimeout(this.actionTimeout);
        this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
        const trumpSuit = btn.getAttribute('data-suit');
        sfx.click();
        const actionId = `baloot_hokom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        socket.sendGameAction({ type: 'BID', bid: 'hokom', trumpSuit, actionId }, this.roomId);
        this.pendingRoundTwoHokom = false;
        const modal = this.container.querySelector('#baloot-suit-modal');
        if (modal) modal.classList.remove('active');
      });
    });
  }

  playCard(cardId) {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
    sfx.playCard();
    const actionId = `baloot_play_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({ type: 'PLAY_CARD', cardId, actionId }, this.roomId);
  }
}

export default BalootClient;
