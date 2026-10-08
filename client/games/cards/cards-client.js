/**
 * Cards / Batta Client Game Controller
 * Integrates with cards-renderer.js and manages user interactions & socket communications.
 */

import socket from '../../js/socket.js';
import { sfx } from '../../js/utils.js';
import { renderCards } from './cards-renderer.js';

export class CardsClient {
  constructor(containerElement, roomId) {
    this.container = containerElement;
    this.roomId = roomId;
    this.state = null;
    this.selectedCardId = null;
    this.selectedEightCardId = null;
    this.actionInFlight = false;
  }

  update(gameState) {
    const prevTurn = this.state?.currentTurnPlayerId;
    this.state = gameState;
    this.actionInFlight = false;

    const myId = this.state.myPlayerId;
    if (this.state.currentTurnPlayerId === myId && prevTurn !== myId) {
      sfx.turnAlert();
    }

    // Deselect if selected card is no longer in hand
    if (this.selectedCardId && !this.state.myHand.some(c => c.id === this.selectedCardId)) {
      this.selectedCardId = null;
    }

    this.render();
  }

  render() {
    if (!this.state) return;

    this.container.innerHTML = renderCards(this.state, {
      selectedCardId: this.selectedCardId
    });

    this.attachEventListeners();
  }

  attachEventListeners() {
    const myId = this.state.myPlayerId;
    const isMyTurn = (this.state.currentTurnPlayerId === myId);

    // Player hand card selection and playing
    this.container.querySelectorAll('.player-hand .playing-card').forEach(el => {
      el.addEventListener('click', () => {
        if (this.actionInFlight) return;
        const cardId = el.getAttribute('data-id');
        const card = this.state.myHand.find(c => c.id === cardId);
        if (!card) return;

        // If card was already selected and it's my turn, play it
        if (this.selectedCardId === cardId) {
          if (isMyTurn) {
            this.handleCardPlay(card);
          }
          return;
        }

        // Otherwise, select the card
        this.selectedCardId = cardId;
        sfx.click();
        this.render();
      });
    });

    // Play button in action bar
    const playBtn = this.container.querySelector('#cards-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!isMyTurn || !this.selectedCardId || this.actionInFlight) return;
        const card = this.state.myHand.find(c => c.id === this.selectedCardId);
        if (card) {
          this.handleCardPlay(card);
        }
      });
    }

    // Suit selection for 8
    this.container.querySelectorAll('.suit-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.actionInFlight) return;
        const suit = btn.getAttribute('data-suit');
        if (this.selectedEightCardId) {
          this.playCard(this.selectedEightCardId, suit);
          this.selectedEightCardId = null;
          const modal = this.container.querySelector('#cards-suit-modal');
          if (modal) modal.classList.remove('active');
        }
      });
    });

    // Draw buttons (felt pile and action button)
    const drawPile = this.container.querySelector('#cards-draw-pile');
    if (drawPile) {
      drawPile.addEventListener('click', () => {
        if (isMyTurn && !this.actionInFlight) this.drawCard();
      });
    }

    const drawBtn = this.container.querySelector('#cards-draw-btn');
    if (drawBtn) {
      drawBtn.addEventListener('click', () => {
        if (isMyTurn && !this.actionInFlight) this.drawCard();
      });
    }

    // Pass button
    const passBtn = this.container.querySelector('#cards-pass-btn');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        if (isMyTurn && !this.actionInFlight) this.passTurn();
      });
    }
  }

  handleCardPlay(card) {
    if (this.actionInFlight) return;
    if (card.rank === '8') {
      this.selectedEightCardId = card.id;
      const modal = this.container.querySelector('#cards-suit-modal');
      if (modal) modal.classList.add('active');
    } else {
      this.playCard(card.id);
      this.selectedCardId = null;
    }
  }

  playCard(cardId, chosenSuit = null) {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    sfx.playCard();
    const actionId = `cards_play_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({
      type: 'PLAY_CARD',
      cardId,
      chosenSuit,
      actionId
    }, this.roomId);
  }

  drawCard() {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    sfx.drawCard();
    const actionId = `cards_draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({ type: 'DRAW_CARD', actionId }, this.roomId);
  }

  passTurn() {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    sfx.click();
    const actionId = `cards_pass_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({ type: 'PASS_TURN', actionId }, this.roomId);
  }
}

export default CardsClient;
