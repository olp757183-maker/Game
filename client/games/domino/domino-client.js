/**
 * Domino Client Game Controller
 * Integrates with domino-renderer.js and manages user interactions & socket communications.
 */

import socket from '../../js/socket.js';
import { sfx } from '../../js/utils.js';
import { renderDomino } from './domino-renderer.js';

export class DominoClient {
  constructor(containerElement, roomId) {
    this.container = containerElement;
    this.roomId = roomId;
    this.state = null;
    this.pendingDualTileId = null;
    this.selectedTileId = null;
    this.actionInFlight = false;
    this.actionTimeout = null;
  }

  handleActionError(err) {
    this.actionInFlight = false;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.pendingDualTileId = null;
    this.selectedTileId = null;
    const modal = this.container.querySelector('#domino-side-modal');
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

    if (this.selectedTileId && !this.state.myHand.some(t => t.id === this.selectedTileId)) {
      this.selectedTileId = null;
    }

    this.render();
  }

  render() {
    if (!this.state) return;

    this.container.innerHTML = renderDomino(this.state, {
      selectedTileId: this.selectedTileId
    });

    this.attachEventListeners();
  }

  attachEventListeners() {
    const myId = this.state.myPlayerId;
    const isMyTurn = (this.state.currentTurnPlayerId === myId);

    // Hand tiles: Click selects tile and highlights legal ends
    this.container.querySelectorAll('.player-hand .domino-tile').forEach(el => {
      el.addEventListener('click', () => {
        if (!isMyTurn || this.actionInFlight) return;
        const tileId = el.getAttribute('data-id');
        const tile = this.state.myHand?.find(t => t.id === tileId);
        if (!tile) return;

        // If clicking already selected tile, or if only 1 matching end exists, play it!
        if (this.selectedTileId === tileId) {
          const isBoardEmpty = (this.state.board || []).length === 0;
          if (isBoardEmpty) {
            this.playTile(tileId, 'right');
            return;
          }
          const canLeft = (tile.left === this.state.leftEnd || tile.right === this.state.leftEnd);
          const canRight = (tile.left === this.state.rightEnd || tile.right === this.state.rightEnd);

          if (canLeft && !canRight) {
            this.playTile(tileId, 'left');
            return;
          } else if (!canLeft && canRight) {
            this.playTile(tileId, 'right');
            return;
          } else if (canLeft && canRight) {
            // Open modal to choose side
            this.pendingDualTileId = tileId;
            const modal = this.container.querySelector('#domino-side-modal');
            if (modal) modal.classList.add('active');
            return;
          }
        }

        // Select tile and highlight ends
        this.selectedTileId = tileId;
        sfx.click();
        this.render();
      });
    });

    // Board Ends / Drop zones direct click
    const handleEndClick = (side) => {
      if (!isMyTurn || !this.selectedTileId || this.actionInFlight) return;
      this.playTile(this.selectedTileId, side);
    };

    const leftEndEl = this.container.querySelector('#domino-target-left');
    if (leftEndEl) leftEndEl.addEventListener('click', () => handleEndClick('left'));

    const rightEndEl = this.container.querySelector('#domino-target-right');
    if (rightEndEl) rightEndEl.addEventListener('click', () => handleEndClick('right'));

    const leftDropEl = this.container.querySelector('.drop-left');
    if (leftDropEl) leftDropEl.addEventListener('click', () => handleEndClick('left'));

    const rightDropEl = this.container.querySelector('.drop-right');
    if (rightDropEl) rightDropEl.addEventListener('click', () => handleEndClick('right'));

    const emptyTable = this.container.querySelector('#domino-empty-table');
    if (emptyTable) {
      emptyTable.addEventListener('click', () => {
        if (isMyTurn && this.selectedTileId && !this.actionInFlight) {
          this.playTile(this.selectedTileId, 'right');
        }
      });
    }

    // Direct Boneyard click to draw
    const boneyardSlot = this.container.querySelector('#domino-boneyard-slot');
    if (boneyardSlot) {
      boneyardSlot.addEventListener('click', () => {
        if (isMyTurn && !this.actionInFlight) {
          if (this.state.boneyardCount === 0) {
            showToast('مخزن القطع فارغ', 'info');
            return;
          }
          this.actionInFlight = true;
          if (this.actionTimeout) clearTimeout(this.actionTimeout);
          this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
          sfx.drawCard();
          const actionId = `domino_draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          socket.sendGameAction({ type: 'DRAW_TILE', actionId }, this.roomId);
        }
      });
    }

    // Contextual Pass Chip
    const passChip = this.container.querySelector('#domino-pass-chip');
    if (passChip) {
      passChip.addEventListener('click', () => {
        if (isMyTurn && !this.actionInFlight) {
          this.actionInFlight = true;
          if (this.actionTimeout) clearTimeout(this.actionTimeout);
          this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
          sfx.click();
          const actionId = `domino_pass_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          socket.sendGameAction({ type: 'PASS', actionId }, this.roomId);
        }
      });
    }

    // Side selection modal buttons
    this.container.querySelectorAll('.side-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.getAttribute('data-side');
        if (this.pendingDualTileId) {
          this.playTile(this.pendingDualTileId, side);
          this.pendingDualTileId = null;
          const modal = this.container.querySelector('#domino-side-modal');
          if (modal) modal.classList.remove('active');
        }
      });
    });
  }

  playTile(tileId, side) {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    if (this.actionTimeout) clearTimeout(this.actionTimeout);
    this.actionTimeout = setTimeout(() => { this.actionInFlight = false; }, 2000);
    sfx.playCard();
    const actionId = `domino_play_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.sendGameAction({
      type: 'PLAY_TILE',
      tileId,
      side,
      actionId
    }, this.roomId);
    this.selectedTileId = null;
  }
}

export default DominoClient;
