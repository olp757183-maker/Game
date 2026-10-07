/**
 * Server-Authoritative Card Engine (بطة / شدة / Shedding & Trick Engine)
 * Fully customizable via room rules: deck size, hand size, special card powers, matching mode.
 */

import crypto from 'node:crypto';
import { GAME_STATUS } from '../../shared/constants.js';

export class CardsGame {
  constructor({ room, players, rules }) {
    this.gameId = crypto.randomUUID();
    this.roomId = room.id;
    this.gameType = 'cards';
    this.room = room;
    this.players = players.map(p => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      seat: p.seat,
      hand: [],
      score: 0
    }));
    this.rules = rules;

    this.deck = [];
    this.discardPile = [];
    this.currentTurnIndex = 0;
    this.direction = 1;
    this.activeSuit = null;
    this.pendingDraw = 0;
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

    this.players.forEach(p => {
      this.scores[p.id] = 0;
    });
  }

  start() {
    this.startRound();
  }

  generate52Deck() {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const cards = [];
    let id = 1;

    for (const suit of suits) {
      for (const rank of ranks) {
        let score = 10;
        if (['J', 'Q', 'K'].includes(rank)) score = 10;
        else if (rank === 'A') score = 15;
        else if (rank === '8') score = 25;
        else score = parseInt(rank, 10);

        cards.push({ id: `cd_${id++}`, suit, rank, score });
      }
    }
    return this.shuffle(cards);
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
    this.deck = this.generate52Deck();
    this.discardPile = [];
    this.currentTurnIndex = 0;
    this.direction = 1;
    this.pendingDraw = 0;
    this.hasDrawnThisTurn = false;
    this.status = GAME_STATUS.PLAYING;
    this.winner = null;

    const count = this.rules.startingCards || 5;
    for (const p of this.players) {
      p.hand = [];
      for (let i = 0; i < count; i++) {
        p.hand.push(this.drawCard());
      }
    }

    // Top discard
    let top = this.drawCard();
    while (top.rank === '8' || top.rank === '2') {
      this.deck.unshift(top);
      this.deck = this.shuffle(this.deck);
      top = this.drawCard();
    }

    this.discardPile.push(top);
    this.activeSuit = top.suit;
  }

  drawCard() {
    if (this.deck.length === 0) {
      if (this.discardPile.length <= 1) return null;
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
  }

  isPlayable(card) {
    const top = this.getTopDiscard();
    if (!top) return false;

    // Special card: 8 is wildcard in shedding mode
    if (this.rules.specialCards && card.rank === '8') return true;

    // If pending draw penalty (e.g. from 2)
    if (this.pendingDraw > 0) {
      return card.rank === '2';
    }

    // Match active suit or matching rank
    return card.suit === this.activeSuit || card.rank === top.rank;
  }

  handleAction(playerId, action) {
    if (this.status === GAME_STATUS.MATCH_END || this.status === GAME_STATUS.FINISHED) {
      throw new Error('Game has finished');
    }

    if (action.type === 'NEXT_ROUND') {
      if (this.status !== GAME_STATUS.ROUND_END) {
        throw new Error('Cannot start next round before round has ended');
      }
      this.startNextRound();
      return { success: true, event: 'NEXT_ROUND_STARTED', round: this.roundNumber };
    }

    if (this.status !== GAME_STATUS.PLAYING) {
      throw new Error('Game is not in progress');
    }

    const current = this.getCurrentPlayer();
    if (current.id !== playerId) {
      throw new Error('ليست هذه حركتك');
    }

    switch (action.type) {
      case 'PLAY_CARD':
        return this.executePlay(current, action.cardId, action.chosenSuit);

      case 'DRAW_CARD':
        return this.executeDraw(current);

      case 'PASS_TURN':
        return this.executePass(current);

      default:
        throw new Error(`حركة غير معروفة: ${action.type}`);
    }
  }

  executePlay(player, cardId, chosenSuit) {
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) throw new Error('الورقة غير موجودة بيدك');
    const card = player.hand[cardIndex];

    if (!this.isPlayable(card)) {
      throw new Error('حركة غير قانونية');
    }

    // If 8 played, chosenSuit is required
    if (this.rules.specialCards && card.rank === '8') {
      const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
      if (!chosenSuit || !suits.includes(chosenSuit)) {
        throw new Error('Must select a new suit when playing an 8');
      }
      this.activeSuit = chosenSuit;
    } else {
      this.activeSuit = card.suit;
    }

    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);

    // Win condition (Empty hand)
    if (player.hand.length === 0) {
      this.handleRoundWon(player);
      return { success: true, event: 'ROUND_WON', winner: player.username };
    }

    // Apply Special Powers
    if (this.rules.specialCards) {
      if (card.rank === '2') {
        this.pendingDraw += 2;
        this.advanceTurn(1);
      } else if (card.rank === 'A') {
        // Skip
        this.advanceTurn(2);
      } else if (card.rank === 'J') {
        // Reverse
        this.direction *= -1;
        this.advanceTurn(1);
      } else {
        this.advanceTurn(1);
      }
    } else {
      this.advanceTurn(1);
    }

    return { success: true, event: 'CARD_PLAYED', card };
  }

  executeDraw(player) {
    if (this.hasDrawnThisTurn) {
      throw new Error('Already drawn a card this turn');
    }

    // If pending penalty draw
    if (this.pendingDraw > 0) {
      for (let i = 0; i < this.pendingDraw; i++) {
        const c = this.drawCard();
        if (c) player.hand.push(c);
      }
      this.pendingDraw = 0;
      this.advanceTurn(1);
      return { success: true, event: 'PENALTY_DRAWN' };
    }

    const drawn = this.drawCard();
    if (drawn) {
      player.hand.push(drawn);
    }
    this.hasDrawnThisTurn = true;
    return { success: true, event: 'CARD_DRAWN', card: drawn };
  }

  executePass(player) {
    if (!this.hasDrawnThisTurn && this.pendingDraw === 0) {
      throw new Error('Must draw a card before passing');
    }
    this.advanceTurn(1);
    return { success: true, event: 'TURN_PASSED' };
  }

  handleRoundWon(winner) {
    let roundPoints = 0;
    this.players.forEach(p => {
      if (p.id !== winner.id) {
        p.hand.forEach(c => {
          if (typeof c.score === 'number') {
            roundPoints += c.score;
          } else if (c.rank === '8') {
            roundPoints += 50;
          } else if (['K', 'Q', 'J', '10'].includes(c.rank)) {
            roundPoints += 10;
          } else {
            roundPoints += (parseInt(c.rank, 10) || 5);
          }
        });
      }
    });

    this.scores[winner.id] = (this.scores[winner.id] || 0) + roundPoints;
    this.players.forEach(p => { p.score = this.scores[p.id] || 0; });

    const target = this.rules.targetScore || 100;
    this.roundWinner = winner.username;
    this.roundPointsAwarded = roundPoints;

    if (this.scores[winner.id] >= target) {
      this.status = GAME_STATUS.MATCH_END;
      this.winner = winner.username;
      const others = this.players.filter(p => p.id !== winner.id);
      this.loser = others[0] ? others[0].username : null;
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
    const current = this.getCurrentPlayer();
    const top = this.getTopDiscard();

    return {
      gameId: this.gameId,
      roomId: this.roomId,
      gameType: 'cards',
      myPlayerId: playerId,
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
      currentTurn: current ? current.id : null,
      currentTurnPlayerId: current ? current.id : null,
      currentTurnIndex: this.currentTurnIndex,
      activeSuit: this.activeSuit,
      direction: this.direction,
      pendingDraw: this.pendingDraw,
      hasDrawnThisTurn: this.hasDrawnThisTurn,
      deckCount: this.deck.length,
      topDiscard: top ? { id: top.id, suit: top.suit, rank: top.rank } : null,
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        seat: p.seat,
        cardCount: p.hand.length,
        score: this.scores[p.id] || 0
      })),
      // Private hand without hints
      myHand: me ? me.hand.map(c => ({
        id: c.id,
        suit: c.suit,
        rank: c.rank,
        score: c.score
      })) : []
    };
  }

  handlePlayerLeft(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      this.players.splice(idx, 1);
      if (this.players.length < 2) {
        this.status = 'GAME_OVER';
        this.winner = this.players[0] ? this.players[0].username : 'None';
      } else {
        this.currentTurnIndex = this.currentTurnIndex % this.players.length;
      }
    }
  }
}

export default CardsGame;
