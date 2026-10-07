/**
 * UNO Client Game Controller
 * Integrates with uno-renderer.js and manages user interactions & socket communications.
 */

import socket from '../../js/socket.js';
import { sfx, showToast } from '../../js/utils.js';
import { renderUNO } from './uno-renderer.js';

export class UnoClient {
  constructor(containerElement, roomId) {
    this.container = containerElement;
    this.roomId = roomId;
    this.state = null;
    this.selectedCardId = null;
    this.selectedWildCardId = null;
  }

  update(gameState) {
    const previousTurn = this.state?.currentTurnPlayerId;
    this.state = gameState;

    const myId = this.state.myPlayerId;
    if (gameState.currentTurnPlayerId === myId && previousTurn !== myId) {
      sfx.turnAlert();
    }

    if (this.selectedCardId && !this.state.myHand.some(c => c.id === this.selectedCardId)) {
      this.selectedCardId = null;
    }

    this.render();
  }

  render() {
    if (!this.state) return;

    this.container.innerHTML = renderUNO(this.state, {
      selectedCardId: this.selectedCardId
    });

    this.attachEventListeners();
  }

  attachEventListeners() {
    const myId = this.state.myPlayerId;
    const isMyTurn = (this.state.currentTurnPlayerId === myId);

    // Play card click from hand
    this.container.querySelectorAll('.player-hand .uno-card').forEach(el => {
      el.addEventListener('click', () => {
        const cardId = el.getAttribute('data-id');
        const card = this.state.myHand.find(c => c.id === cardId);
        if (!card) return;

        // If already selected, play it
        if (this.selectedCardId === cardId) {
          if (isMyTurn) {
            this.handleCardPlay(card);
          }
          return;
        }

        // Otherwise select card
        this.selectedCardId = cardId;
        sfx.click();
        this.render();
      });
    });

    // Action bar play button
    const playBtn = this.container.querySelector('#uno-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!isMyTurn || !this.selectedCardId) return;
        const card = this.state.myHand.find(c => c.id === this.selectedCardId);
        if (card) {
          this.handleCardPlay(card);
        }
      });
    }

    // Wild color picker buttons
    this.container.querySelectorAll('.color-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosenColor = btn.getAttribute('data-color');
        if (this.selectedWildCardId) {
          this.playCard(this.selectedWildCardId, chosenColor);
          this.selectedWildCardId = null;
          const modal = this.container.querySelector('#wild-color-modal');
          if (modal) modal.classList.remove('active');
        }
      });
    });

    // Draw buttons (felt pile & action bar)
    const drawPile = this.container.querySelector('#uno-draw-pile');
    if (drawPile) {
      drawPile.addEventListener('click', () => {
        if (isMyTurn) this.drawCard();
      });
    }
    const drawBtn = this.container.querySelector('#uno-draw-btn');
    if (drawBtn) {
      drawBtn.addEventListener('click', () => {
        if (isMyTurn) this.drawCard();
      });
    }

    // Pass button
    const passBtn = this.container.querySelector('#uno-pass-btn');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        if (isMyTurn) this.passTurn();
      });
    }

    // UNO shout button
    const unoBtn = this.container.querySelector('#uno-call-btn');
    if (unoBtn) {
      unoBtn.addEventListener('click', () => {
        socket.sendGameAction({ type: 'CALL_UNO' }, this.roomId);
        sfx.winFanfare();
        showToast('📢 UNO Called!', 'success');
      });
    }

    // Catch UNO buttons
    this.container.querySelectorAll('.catch-uno-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.getAttribute('data-target');
        socket.sendGameAction({ type: 'CATCH_UNO', targetId }, this.roomId);
      });
    });
  }

  handleCardPlay(card) {
    if (card.color === 'wild') {
      this.selectedWildCardId = card.id;
      const modal = this.container.querySelector('#wild-color-modal');
      if (modal) modal.classList.add('active');
    } else {
      this.playCard(card.id);
      this.selectedCardId = null;
    }
  }

  playCard(cardId, chosenColor = null) {
    sfx.playCard();
    socket.sendGameAction({
      type: 'PLAY_CARD',
      cardId,
      chosenColor,
      callUno: false
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

export default UnoClient;
