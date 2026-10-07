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
  }

  update(gameState) {
    const prevTurn = this.state?.currentTurnPlayerId;
    this.state = gameState;

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

    // Hand tiles click
    this.container.querySelectorAll('.player-hand .domino-tile').forEach(el => {
      el.addEventListener('click', () => {
        if (!isMyTurn) return;
        const tileId = el.getAttribute('data-id');
        const tile = this.state.myHand?.find(t => t.id === tileId);
        if (!tile) return;

        const canLeft = (tile.left === this.state.leftEnd || tile.right === this.state.leftEnd);
        const canRight = (tile.left === this.state.rightEnd || tile.right === this.state.rightEnd);

        // If tile can be placed on both ends and ends are different
        if (canLeft && canRight && this.state.board.length > 0 && this.state.leftEnd !== this.state.rightEnd) {
          this.pendingDualTileId = tileId;
          const modal = this.container.querySelector('#domino-side-modal');
          if (modal) modal.classList.add('active');
        } else {
          const side = canLeft ? 'left' : 'right';
          this.playTile(tileId, side);
        }
      });
    });

    // Side selection buttons
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

    // Draw button
    const drawBtn = this.container.querySelector('#domino-draw-btn');
    if (drawBtn) {
      drawBtn.addEventListener('click', () => {
        if (isMyTurn) {
          sfx.drawCard();
          socket.sendGameAction({ type: 'DRAW_TILE' }, this.roomId);
        }
      });
    }

    // Pass button
    const passBtn = this.container.querySelector('#domino-pass-btn');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        if (isMyTurn) {
          sfx.click();
          socket.sendGameAction({ type: 'PASS' }, this.roomId);
        }
      });
    }
  }

  playTile(tileId, side) {
    sfx.playCard();
    socket.sendGameAction({
      type: 'PLAY_TILE',
      tileId,
      side
    }, this.roomId);
    this.selectedTileId = null;
  }
}

export default DominoClient;
