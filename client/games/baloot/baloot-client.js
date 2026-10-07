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
  }

  update(gameState) {
    const prevTurn = this.state?.currentTurnPlayerId;
    this.state = gameState;

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

    // Hand card selection & play
    this.container.querySelectorAll('.player-hand .playing-card').forEach(el => {
      el.addEventListener('click', () => {
        const cardId = el.getAttribute('data-id');
        const card = this.state.myHand.find(c => c.id === cardId);
        if (!card) return;

        // If in play phase and already selected, play the card
        if (this.selectedCardId === cardId) {
          if (isMyTurn && this.state.status === 'PLAYING') {
            this.playCard(cardId);
            this.selectedCardId = null;
          }
          return;
        }

        // Select card
        this.selectedCardId = cardId;
        sfx.click();
        this.render();
      });
    });

    // Play button in action bar
    const playBtn = this.container.querySelector('#baloot-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!isMyTurn || !this.selectedCardId || this.state.status !== 'PLAYING') return;
        this.playCard(this.selectedCardId);
        this.selectedCardId = null;
      });
    }

    // Bidding actions
    this.container.querySelectorAll('.bid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bid = btn.getAttribute('data-bid');
        if (bid === 'hokom' && this.state.biddingRound === 2) {
          // Open trump suit modal for round 2
          this.pendingRoundTwoHokom = true;
          const modal = this.container.querySelector('#baloot-suit-modal');
          if (modal) modal.classList.add('active');
          return;
        }

        sfx.click();
        socket.sendGameAction({ type: 'BID', bid }, this.roomId);
      });
    });

    // Round 2 Hokom suit selection
    this.container.querySelectorAll('.baloot-trump-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const trumpSuit = btn.getAttribute('data-suit');
        sfx.click();
        socket.sendGameAction({ type: 'BID', bid: 'hokom', trumpSuit }, this.roomId);
        this.pendingRoundTwoHokom = false;
        const modal = this.container.querySelector('#baloot-suit-modal');
        if (modal) modal.classList.remove('active');
      });
    });
  }

  playCard(cardId) {
    sfx.playCard();
    socket.sendGameAction({ type: 'PLAY_CARD', cardId }, this.roomId);
  }
}

export default BalootClient;
