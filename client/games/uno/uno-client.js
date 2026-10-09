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
    this.actionInFlight = false;
    this.actionTimeout = null;
  }

  handleActionError(err) {
    this.actionInFlight = false;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.selectedCardId = null;
    this.selectedWildCardId = null;
    const modal = this.container.querySelector('#wild-color-modal');
    if (modal) modal.classList.remove('active');
    this.render();
  }

  update(gameState) {
    const previousTurn = this.state?.currentTurnPlayerId;
    this.state = gameState;
    this.actionInFlight = false;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);

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
    if (this.state.status === 'MATCH_END' || this.state.status === 'FINISHED' || this.state.status === 'GAME_OVER' || this.state.status === 'ROUND_END') {
      return;
    }
    const myId = this.state.myPlayerId;
    const isMyTurn = (this.state.currentTurnPlayerId === myId);

    // Direct card play from hand: click/tap immediately plays card!
    this.container.querySelectorAll('.player-hand .uno-card').forEach(el => {
      el.addEventListener('click', () => {
        if (this.actionInFlight) return;
        const cardId = el.getAttribute('data-id');
        const card = this.state.myHand.find(c => c.id === cardId);
        if (!card) return;

        if (!isMyTurn) {
          showToast('ليس دورك الآن (انتظر دورك)', 'warning');
          el.classList.add('shake-anim');
          setTimeout(() => el.classList.remove('shake-anim'), 400);
          return;
        }

        // Direct play without needing secondary button
        this.handleCardPlay(card, el);
      });
    });

    // Wild color picker modal options
    this.container.querySelectorAll('.color-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosenColor = btn.getAttribute('data-color');
        if (this.selectedWildCardId) {
          const cardId = this.selectedWildCardId;
          this.selectedWildCardId = null;
          const modal = this.container.querySelector('#wild-color-modal');
          if (modal) modal.classList.remove('active');
          this.playCard(cardId, chosenColor);
        }
      });
    });

    // Interactive Draw Pile click: Direct draw or pass
    const drawPile = this.container.querySelector('#uno-draw-pile');
    if (drawPile) {
      drawPile.addEventListener('click', () => {
        if (!isMyTurn) {
          showToast('ليس دورك الآن', 'warning');
          return;
        }
        if (this.state.hasDrawnThisTurn) {
          // If already drawn, clicking pile offers passing the turn
          this.passTurn();
        } else {
          this.drawCard();
        }
      });
    }

    // Contextual Pass Chip
    const passChip = this.container.querySelector('#uno-pass-chip');
    if (passChip) {
      passChip.addEventListener('click', () => {
        if (isMyTurn) this.passTurn();
      });
    }

    // UNO shout button
    const unoBtn = this.container.querySelector('#uno-call-btn');
    if (unoBtn) {
      unoBtn.addEventListener('click', () => {
        const actionId = `uno_call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        socket.sendGameAction({ type: 'CALL_UNO', actionId }, this.roomId);
        sfx.winFanfare();
        showToast('📢 أونو! (UNO Called)', 'success');
      });
    }

    // Catch UNO buttons
    this.container.querySelectorAll('.catch-uno-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.getAttribute('data-target');
        const actionId = `uno_catch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        socket.sendGameAction({ type: 'CATCH_UNO', targetId, actionId }, this.roomId);
      });
    });
  }

  handleCardPlay(card, cardEl = null) {
    if (this.actionInFlight) return;
    if (card.color === 'wild') {
      this.selectedWildCardId = card.id;
      const modal = this.container.querySelector('#wild-color-modal');
      if (modal) modal.classList.add('active');
    } else {
      if (cardEl) {
        cardEl.classList.add('card-play-anim');
      }
      this.playCard(card.id);
    }
  }

  playCard(cardId, chosenColor = null) {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
    sfx.playCard();
    const actionId = `uno_play_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({
      type: 'PLAY_CARD',
      cardId,
      chosenColor,
      callUno: false,
      actionId
    }, this.roomId);
  }

  drawCard() {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
    sfx.drawCard();
    const actionId = `uno_draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({ type: 'DRAW_CARD', actionId }, this.roomId);
  }

  passTurn() {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
    sfx.click();
    const actionId = `uno_pass_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({ type: 'PASS_TURN', actionId }, this.roomId);
  }
}

export default UnoClient;
