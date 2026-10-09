/**
 * Server-Authoritative UNO Engine
 * Implements complete official UNO rules + customizable house rules.
 */

import crypto from 'node:crypto';
import { UNO_COLORS, UNO_VALUES, GAME_STATUS, ERROR_CODES, GameActionError } from '../../shared/constants.js';

export class UnoGame {
  constructor({ room, players, rules }) {
    this.gameId = crypto.randomUUID();
    this.roomId = room.id;
    this.gameType = 'uno';
    this.room = room;
    this.players = players.map(p => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      seat: p.seat,
      hand: [],
      hasCalledUno: false,
      score: 0
    }));
    this.rules = rules;

    this.deck = [];
    this.discardPile = [];
    this.currentTurnIndex = 0;
    this.direction = 1; // 1 = clockwise, -1 = counter-clockwise
    this.currentColor = null;
    this.pendingDraw = 0; // accumulated draw penalty (stacking)
    this.hasDrawnThisTurn = false;
    this.status = GAME_STATUS.PLAYING;
    this.winner = null;
    this.loser = null;
    this.draw = false;
    this.reason = null;
    this.roundNumber = 1;
    this.roundWinner = null;
    this.roundPointsAwarded = 0;
    this.scores = {};
    this.startedAt = Date.now();
    this.endedAt = null;
    this.turnTimer = null;
    this.turnDeadline = 0;
    this.version = 1;

    this.players.forEach(p => {
      this.scores[p.id] = 0;
    });
  }

  createSnapshot() {
    return {
      players: this.players.map(p => ({
        ...p,
        hand: p.hand ? p.hand.map(c => ({ ...c })) : []
      })),
      deck: this.deck ? this.deck.map(c => ({ ...c })) : [],
      discardPile: this.discardPile ? this.discardPile.map(c => ({ ...c })) : [],
      currentTurnIndex: this.currentTurnIndex,
      currentColor: this.currentColor,
      direction: this.direction,
      pendingDraw: this.pendingDraw,
      status: this.status,
      winner: this.winner,
      scores: { ...this.scores },
      version: this.version
    };
  }

  restoreSnapshot(snap) {
    if (!snap) return;
    this.players = snap.players.map(p => ({
      ...p,
      hand: p.hand ? p.hand.map(c => ({ ...c })) : []
    }));
    this.deck = snap.deck ? snap.deck.map(c => ({ ...c })) : [];
    this.discardPile = snap.discardPile ? snap.discardPile.map(c => ({ ...c })) : [];
    this.currentTurnIndex = snap.currentTurnIndex;
    this.currentColor = snap.currentColor;
    this.direction = snap.direction;
    this.pendingDraw = snap.pendingDraw;
    this.status = snap.status;
    this.winner = snap.winner;
    this.scores = { ...snap.scores };
    this.version = snap.version;
  }

  start() {
    this.startRound();
  }

  buildDeck() {
    const deck = [];
    const colors = [UNO_COLORS.RED, UNO_COLORS.BLUE, UNO_COLORS.GREEN, UNO_COLORS.YELLOW];
    let cardIdCounter = 1;

    for (const color of colors) {
      // One 0 per color
      deck.push({ id: `c_${cardIdCounter++}`, color, value: UNO_VALUES.ZERO, score: 0 });

      // Two 1-9 per color
      for (const num of [
        UNO_VALUES.ONE, UNO_VALUES.TWO, UNO_VALUES.THREE, UNO_VALUES.FOUR,
        UNO_VALUES.FIVE, UNO_VALUES.SIX, UNO_VALUES.SEVEN, UNO_VALUES.EIGHT, UNO_VALUES.NINE
      ]) {
        deck.push({ id: `c_${cardIdCounter++}`, color, value: num, score: parseInt(num, 10) });
        deck.push({ id: `c_${cardIdCounter++}`, color, value: num, score: parseInt(num, 10) });
      }

      // Two Skip, Reverse, Draw Two per color
      for (const action of [UNO_VALUES.SKIP, UNO_VALUES.REVERSE, UNO_VALUES.DRAW_TWO]) {
        deck.push({ id: `c_${cardIdCounter++}`, color, value: action, score: 20 });
        deck.push({ id: `c_${cardIdCounter++}`, color, value: action, score: 20 });
      }
    }

    // Four Wild & Four Wild Draw Four
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `c_${cardIdCounter++}`, color: UNO_COLORS.WILD, value: UNO_VALUES.WILD, score: 50 });
      deck.push({ id: `c_${cardIdCounter++}`, color: UNO_COLORS.WILD, value: UNO_VALUES.WILD_DRAW_FOUR, score: 50 });
    }

    return this.shuffle(deck);
  }

  shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  startRound() {
    this.deck = this.buildDeck();
    this.discardPile = [];
    this.currentTurnIndex = 0;
    this.direction = 1;
    this.pendingDraw = 0;
    this.hasDrawnThisTurn = false;
    this.status = GAME_STATUS.PLAYING;
    this.winner = null;

    // Deal cards to each player
    const handSize = this.rules.startingCards || 7;
    for (const player of this.players) {
      player.hand = [];
      player.hasCalledUno = false;
      for (let i = 0; i < handSize; i++) {
        player.hand.push(this.drawCardFromDeck());
      }
    }

    // Flip top card for discard pile (avoid wild draw 4 on start)
    let top = this.drawCardFromDeck();
    while (top.value === UNO_VALUES.WILD_DRAW_FOUR) {
      this.deck.unshift(top);
      this.deck = this.shuffle(this.deck);
      top = this.drawCardFromDeck();
    }

    this.discardPile.push(top);
    if (top.color === UNO_COLORS.WILD) {
      const colors = [UNO_COLORS.RED, UNO_COLORS.BLUE, UNO_COLORS.GREEN, UNO_COLORS.YELLOW];
      this.currentColor = colors[Math.floor(Math.random() * colors.length)];
    } else {
      this.currentColor = top.color;
    }

    // Handle initial action card if flipped first
    if (top.value === UNO_VALUES.DRAW_TWO) {
      this.pendingDraw = 2;
    } else if (top.value === UNO_VALUES.REVERSE) {
      this.direction = -1;
      this.currentTurnIndex = this.players.length - 1;
    } else if (top.value === UNO_VALUES.SKIP) {
      this.advanceTurn();
    }

    this.resetTurnTimer();
  }

  drawCardFromDeck() {
    if (this.deck.length === 0) {
      if (this.discardPile.length <= 1) {
        // No cards left to shuffle
        return null;
      }
      const top = this.discardPile.pop();
      this.deck = this.shuffle(this.discardPile);
      this.discardPile = [top];
    }
    return this.deck.pop();
  }

  getTopDiscard() {
    return this.discardPile[this.discardPile.length - 1];
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
  }

  advanceTurn(steps = 1) {
    const total = this.players.length;
    this.currentTurnIndex = (this.currentTurnIndex + (this.direction * steps) % total + total) % total;
    this.hasDrawnThisTurn = false;
    this.resetTurnTimer();
  }

  resetTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    const seconds = this.rules.turnTimer || 0;
    if (seconds > 0 && this.status === GAME_STATUS.PLAYING) {
      this.turnDeadline = Date.now() + seconds * 1000;
      this.turnTimer = setTimeout(() => {
        this.handleTurnTimeout();
      }, seconds * 1000);
    } else {
      this.turnDeadline = 0;
    }
  }

  handleTurnTimeout() {
    if (this.status !== GAME_STATUS.PLAYING) return;
    const current = this.getCurrentPlayer();
    if (!current) return;

    // Auto-draw for timed-out player
    this.executeDraw(current.id);
    this.advanceTurn();
    this.room.getStateForPlayer(current.id);
  }

  isPlayable(card) {
    const top = this.getTopDiscard();
    if (!top) return false;

    // If there is an active stacking draw penalty
    if (this.pendingDraw > 0) {
      if (this.rules.stacking) {
        if (top.value === UNO_VALUES.DRAW_TWO && card.value === UNO_VALUES.DRAW_TWO) return true;
        if (top.value === UNO_VALUES.WILD_DRAW_FOUR && card.value === UNO_VALUES.WILD_DRAW_FOUR) return true;
      }
      return false;
    }

    // Wilds are always playable
    if (card.color === UNO_COLORS.WILD) return true;

    // Matching color
    if (card.color === this.currentColor) return true;

    // Matching value / symbol
    if (card.value === top.value) return true;

    return false;
  }

  handleAction(playerId, action) {
    if (this.status === GAME_STATUS.MATCH_END || this.status === GAME_STATUS.FINISHED) {
      throw new GameActionError(ERROR_CODES.GAME_ALREADY_FINISHED, 'انتهت اللعبة بالفعل (Game has finished)', 'Game has finished');
    }

    if (action.type === 'NEXT_ROUND') {
      if (this.status !== GAME_STATUS.ROUND_END) {
        throw new GameActionError(ERROR_CODES.INVALID_ACTION, 'لا يمكن بدء الجولة التالية الآن', 'Cannot start next round before round has ended');
      }
      this.startNextRound();
      return { success: true, event: 'NEXT_ROUND_STARTED', round: this.roundNumber };
    }

    if (this.status !== GAME_STATUS.PLAYING) {
      throw new GameActionError(ERROR_CODES.GAME_NOT_ACTIVE, 'اللعبة ليست جارية الآن', 'Game is not in progress');
    }

    let res;
    switch (action.type) {
      case 'PLAY_CARD':
        res = this.executePlay(playerId, action.cardId, action.chosenColor, action.callUno);
        break;

      case 'DRAW_CARD':
        res = this.executeDraw(playerId);
        break;

      case 'PASS_TURN':
        res = this.executePass(playerId);
        break;

      case 'CALL_UNO':
        res = this.executeCallUno(playerId);
        break;

      case 'CATCH_UNO':
        res = this.executeCatchUno(playerId, action.targetId);
        break;

      default:
        throw new GameActionError(ERROR_CODES.INVALID_ACTION, `حركة غير معروفة: ${action.type}`, `Unknown UNO action: ${action.type}`);
    }

    this.version++;
    return res;
  }

  executePlay(playerId, cardId, chosenColor, callUno = false) {
    const current = this.getCurrentPlayer();
    const isCurrentTurn = (current.id === playerId);

    const player = this.players.find(p => p.id === playerId);
    if (!player) throw new GameActionError(ERROR_CODES.PLAYER_NOT_IN_GAME, 'اللاعب غير متواجد في المباراة', 'Player not found');

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) throw new GameActionError(ERROR_CODES.CARD_NOT_IN_HAND, 'البطاقة غير موجودة بيدك', 'Card not in hand');
    const card = player.hand[cardIndex];

    // Jump-in check: If jumpIn rule enabled and player plays exact match out of turn
    if (!isCurrentTurn) {
      if (this.rules.jumpIn) {
        const top = this.getTopDiscard();
        if (card.color === top.color && card.value === top.value) {
          // Valid Jump-In! Turn jumps to this player
          this.currentTurnIndex = this.players.findIndex(p => p.id === playerId);
        } else {
          throw new GameActionError(ERROR_CODES.NOT_YOUR_TURN, 'ليس دورك الآن (ليست هذه حركتك)', 'Not your turn');
        }
      } else {
        throw new GameActionError(ERROR_CODES.NOT_YOUR_TURN, 'ليس دورك الآن (ليست هذه حركتك)', 'Not your turn');
      }
    }

    if (!this.isPlayable(card)) {
      throw new GameActionError(ERROR_CODES.INVALID_MOVE, 'حركة غير قانونية (هذه الحركة غير مسموحة)', 'Illegal move');
    }

    // If wild, require chosen color
    if (card.color === UNO_COLORS.WILD) {
      const validColors = [UNO_COLORS.RED, UNO_COLORS.BLUE, UNO_COLORS.GREEN, UNO_COLORS.YELLOW];
      if (!chosenColor || !validColors.includes(chosenColor)) {
        throw new Error('Must specify a valid color for Wild card');
      }
      this.currentColor = chosenColor;
    } else {
      this.currentColor = card.color;
    }

    // Play card
    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);

    if (callUno && player.hand.length === 1) {
      player.hasCalledUno = true;
    } else if (player.hand.length !== 1) {
      player.hasCalledUno = false;
    }

    // Check round win (handling final card effects like Draw Two / Wild Draw Four)
    if (player.hand.length === 0) {
      if (card.value === UNO_VALUES.DRAW_TWO) {
        this.pendingDraw += 2;
        this.applyDrawPenaltyAndAdvance();
      } else if (card.value === UNO_VALUES.WILD_DRAW_FOUR) {
        this.pendingDraw += 4;
        this.applyDrawPenaltyAndAdvance();
      }
      this.handleRoundWon(player);
      return { success: true, event: 'ROUND_WON', winner: player.username };
    }

    // Apply Card Effects
    this.applyCardEffects(card);
    return { success: true, event: 'CARD_PLAYED', card };
  }

  applyCardEffects(card) {
    const playerCount = this.players.length;

    switch (card.value) {
      case UNO_VALUES.SKIP:
        if (playerCount === 2) {
          // In 2 players, skip gives another turn
          this.resetTurnTimer();
        } else {
          this.advanceTurn(2);
        }
        break;

      case UNO_VALUES.REVERSE:
        if (playerCount === 2) {
          // In 2 players, reverse acts like a skip
          this.resetTurnTimer();
        } else {
          this.direction *= -1;
          this.advanceTurn(1);
        }
        break;

      case UNO_VALUES.DRAW_TWO:
        this.pendingDraw += 2;
        if (!this.rules.stacking) {
          this.applyDrawPenaltyAndAdvance();
        } else {
          this.advanceTurn(1);
        }
        break;

      case UNO_VALUES.WILD_DRAW_FOUR:
        this.pendingDraw += 4;
        if (!this.rules.stacking) {
          this.applyDrawPenaltyAndAdvance();
        } else {
          this.advanceTurn(1);
        }
        break;

      case UNO_VALUES.SEVEN:
        if (this.rules.sevenZero) {
          // House rule: 7 allows swapping hands (future extension)
        }
        this.advanceTurn(1);
        break;

      case UNO_VALUES.ZERO:
        if (this.rules.sevenZero) {
          // House rule: 0 rotates hands in play direction
          this.rotateHands();
        }
        this.advanceTurn(1);
        break;

      default:
        this.advanceTurn(1);
        break;
    }
  }

  rotateHands() {
    const hands = this.players.map(p => p.hand);
    const count = this.players.length;
    for (let i = 0; i < count; i++) {
      const sourceIdx = (i - this.direction + count) % count;
      this.players[i].hand = hands[sourceIdx];
    }
  }

  applyDrawPenaltyAndAdvance() {
    const total = this.players.length;
    const targetIdx = (this.currentTurnIndex + (this.direction) % total + total) % total;
    const victim = this.players[targetIdx];

    for (let i = 0; i < this.pendingDraw; i++) {
      const drawn = this.drawCardFromDeck();
      if (drawn) victim.hand.push(drawn);
    }
    this.pendingDraw = 0;
    victim.hasCalledUno = false;
    // Victim also loses their turn
    this.advanceTurn(2);
  }

  executeDraw(playerId) {
    const current = this.getCurrentPlayer();
    if (current.id !== playerId) {
      throw new Error('ليست هذه حركتك');
    }

    if (this.hasDrawnThisTurn && !this.rules.drawUntilPlayable) {
      throw new Error('حركة غير قانونية');
    }

    // If there is an active pending draw that cannot be stacked
    if (this.pendingDraw > 0) {
      for (let i = 0; i < this.pendingDraw; i++) {
        const drawn = this.drawCardFromDeck();
        if (drawn) current.hand.push(drawn);
      }
      this.pendingDraw = 0;
      current.hasCalledUno = false;
      this.advanceTurn(1);
      return { success: true, event: 'PENALTY_DRAWN' };
    }

    const drawn = this.drawCardFromDeck();
    if (drawn) {
      current.hand.push(drawn);
      current.hasCalledUno = false;
    }

    this.hasDrawnThisTurn = true;

    if (this.rules.drawUntilPlayable) {
      if (drawn && this.isPlayable(drawn)) {
        // Stop drawing, player can now play or pass
        return { success: true, event: 'CARD_DRAWN', playable: true };
      }
      // Continue drawing or pass if empty
    }

    return { success: true, event: 'CARD_DRAWN', card: drawn };
  }

  executePass(playerId) {
    const current = this.getCurrentPlayer();
    if (current.id !== playerId) {
      throw new Error('ليست هذه حركتك');
    }

    if (!this.hasDrawnThisTurn && this.pendingDraw === 0) {
      throw new Error('حركة غير قانونية');
    }

    this.advanceTurn(1);
    return { success: true, event: 'TURN_PASSED' };
  }

  executeCallUno(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) throw new Error('Player not found');

    if (player.hand.length <= 2) {
      player.hasCalledUno = true;
      return { success: true, event: 'UNO_CALLED', username: player.username };
    }
    throw new Error('Can only call UNO when you have 1 or 2 cards remaining');
  }

  executeCatchUno(catcherId, targetId) {
    const target = this.players.find(p => p.id === targetId);
    if (!target) throw new Error('Target player not found');

    if (target.hand.length === 1 && !target.hasCalledUno) {
      // Caught! Penalty 2 cards
      for (let i = 0; i < 2; i++) {
        const c = this.drawCardFromDeck();
        if (c) target.hand.push(c);
      }
      return { success: true, event: 'UNO_CAUGHT', victim: target.username };
    }
    throw new Error('Player cannot be caught for UNO');
  }

  handleRoundWon(winner) {
    if (this.turnTimer) clearTimeout(this.turnTimer);

    // Sum points of remaining cards in opponents' hands
    let roundPoints = 0;
    for (const player of this.players) {
      if (player.id !== winner.id) {
        for (const card of player.hand) {
          if (typeof card.score === 'number') {
            roundPoints += card.score;
          } else if (card.value === UNO_VALUES.WILD || card.value === UNO_VALUES.WILD_DRAW_FOUR) {
            roundPoints += 50;
          } else if (card.value === UNO_VALUES.DRAW_TWO || card.value === UNO_VALUES.REVERSE || card.value === UNO_VALUES.SKIP) {
            roundPoints += 20;
          } else {
            roundPoints += (parseInt(card.value, 10) || 5);
          }
        }
      }
    }

    this.scores[winner.id] = (this.scores[winner.id] || 0) + roundPoints;
    this.players.forEach(p => { p.score = this.scores[p.id] || 0; });

    const target = this.rules.targetScore || 500;
    this.roundWinner = winner.username;
    this.roundPointsAwarded = roundPoints;

    if (this.rules.singleRound === true || this.scores[winner.id] >= target) {
      this.status = GAME_STATUS.MATCH_END;
      this.winner = winner.username;
      const otherPlayers = this.players.filter(p => p.id !== winner.id);
      otherPlayers.sort((a, b) => (this.scores[a.id] || 0) - (this.scores[b.id] || 0));
      this.loser = otherPlayers[0] ? otherPlayers[0].username : null;
      this.draw = false;
      this.reason = 'POINTS_TARGET';
      this.endedAt = Date.now();
    } else {
      this.status = GAME_STATUS.ROUND_END;
    }
  }

  startNextRound() {
    this.roundNumber++;
    this.status = GAME_STATUS.PLAYING;
    this.roundWinner = null;
    this.roundPointsAwarded = 0;
    this.startRound();
  }

  getStateForPlayer(playerId) {
    const me = this.players.find(p => p.id === playerId);
    const topCard = this.getTopDiscard();
    const current = this.getCurrentPlayer();

    return {
      gameId: this.gameId,
      roomId: this.roomId,
      gameType: 'uno',
      myPlayerId: playerId,
      version: this.version,
      status: this.status,
      round: this.roundNumber,
      roundNumber: this.roundNumber,
      winner: this.winner,
      loser: this.loser,
      draw: this.draw,
      reason: this.reason,
      roundWinner: this.roundWinner,
      roundPointsAwarded: this.roundPointsAwarded,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      scores: this.scores,
      rules: this.rules,
      currentColor: this.currentColor,
      currentTurn: current ? current.id : null,
      currentTurnPlayerId: current ? current.id : null,
      currentTurnIndex: this.currentTurnIndex,
      direction: this.direction,
      pendingDraw: this.pendingDraw,
      hasDrawnThisTurn: this.hasDrawnThisTurn,
      turnDeadline: this.turnDeadline,
      deckCount: this.deck.length,
      topDiscard: topCard ? {
        id: topCard.id,
        color: topCard.color,
        value: topCard.value
      } : null,
      // Public view of all players (cards hidden!)
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        seat: p.seat,
        cardCount: p.hand.length,
        hasCalledUno: p.hasCalledUno,
        score: this.scores[p.id] || 0
      })),
      // Private hand only for the requesting player without hints!
      myHand: me ? me.hand.map(c => ({
        id: c.id,
        color: c.color,
        value: c.value,
        score: c.score
      })) : []
    };
  }

  handlePlayerLeft(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const leavingPlayer = this.players[idx];
      this.players.splice(idx, 1);
      if (this.players.length < 2) {
        this.status = GAME_STATUS.MATCH_END;
        this.winner = this.players[0] ? this.players[0].username : 'None';
        this.loser = leavingPlayer ? leavingPlayer.username : null;
        this.draw = false;
        this.reason = 'PLAYER_LEFT';
        this.endedAt = Date.now();
      } else {
        this.currentTurnIndex = this.currentTurnIndex % this.players.length;
      }
    }
  }
}

export default UnoGame;
