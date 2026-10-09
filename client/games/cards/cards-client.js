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
    this.actionTimeout = null;
  }

  handleActionError(err) {
    this.actionInFlight = false;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.selectedCardId = null;
    this.selectedEightCardId = null;
    const modal = this.container.querySelector('#cards-suit-modal');
    if (modal) modal.classList.remove('active');
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

    // Direct card play from hand: click/tap immediately plays card!
    this.container.querySelectorAll('.player-hand .playing-card').forEach(el => {
      el.addEventListener('click', () => {
        if (this.actionInFlight) return;
        const cardId = el.getAttribute('data-id');
        const card = this.state.myHand?.find(c => c.id === cardId);
        if (!card) return;

        if (!isMyTurn) {
          showToast('ليس دورك الآن (انتظر دورك)', 'warning');
          el.classList.add('shake-anim');
          setTimeout(() => el.classList.remove('shake-anim'), 400);
          return;
        }

        this.handleCardPlay(card, el);
      });
    });

    // Suit selection for 8
    this.container.querySelectorAll('.suit-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.actionInFlight) return;
        const suit = btn.getAttribute('data-suit');
        if (this.selectedEightCardId) {
          const cardId = this.selectedEightCardId;
          this.selectedEightCardId = null;
          const modal = this.container.querySelector('#cards-suit-modal');
          if (modal) modal.classList.remove('active');
          this.playCard(cardId, suit);
        }
      });
    });

    // Draw pile direct interaction: draw or pass
    const drawPile = this.container.querySelector('#cards-draw-pile');
    if (drawPile) {
      drawPile.addEventListener('click', () => {
        if (!isMyTurn) {
          showToast('ليس دورك الآن للسحب', 'warning');
          return;
        }
        if (this.state.hasDrawnThisTurn) {
          this.passTurn();
        } else {
          this.drawCard();
        }
      });
    }

    // Contextual Pass Chip
    const passChip = this.container.querySelector('#cards-pass-chip');
    if (passChip) {
      passChip.addEventListener('click', () => {
        if (isMyTurn && !this.actionInFlight) this.passTurn();
      });
    }
  }

  handleCardPlay(card, cardEl = null) {
    if (this.actionInFlight) return;
    if (card.rank === '8') {
      this.selectedEightCardId = card.id;
      const modal = this.container.querySelector('#cards-suit-modal');
      if (modal) modal.classList.add('active');
    } else {
      if (cardEl) {
        cardEl.classList.add('card-play-anim');
      }
      this.playCard(card.id);
    }
  }

  playCard(cardId, chosenSuit = null) {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
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
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
    sfx.drawCard();
    const actionId = `cards_draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({ type: 'DRAW_CARD', actionId }, this.roomId);
  }

  passTurn() {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
    sfx.click();
    const actionId = `cards_pass_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({ type: 'PASS_TURN', actionId }, this.roomId);
  }
}

export default CardsClient;
