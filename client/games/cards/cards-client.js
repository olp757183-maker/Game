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
  }

  update(gameState) {
    const prevTurn = this.state?.currentTurnPlayerId;
    this.state = gameState;

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
        if (!isMyTurn || !this.selectedCardId) return;
        const card = this.state.myHand.find(c => c.id === this.selectedCardId);
        if (card) {
          this.handleCardPlay(card);
        }
      });
    }

    // Suit selection for 8
    this.container.querySelectorAll('.suit-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
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
        if (isMyTurn) this.drawCard();
      });
    }

    const drawBtn = this.container.querySelector('#cards-draw-btn');
    if (drawBtn) {
      drawBtn.addEventListener('click', () => {
        if (isMyTurn) this.drawCard();
      });
    }

    // Pass button
    const passBtn = this.container.querySelector('#cards-pass-btn');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        if (isMyTurn) this.passTurn();
      });
    }
  }

  handleCardPlay(card) {
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
    sfx.playCard();
    socket.sendGameAction({
      type: 'PLAY_CARD',
      cardId,
      chosenSuit
    }, this.roomId);
  }

  drawCard() {
    sfx.drawCard();
    socket.sendGameAction({ type: 'DRAW_CARD' }, this.roomId);
  }

  passTurn() {
    sfx.click();
    socket.sendGameAction({ type: 'PASS_TURN' }, this.roomId);
  }
}

export default CardsClient;
