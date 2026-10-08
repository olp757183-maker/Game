/**
 * Server-Authoritative Baloot Engine
 * 4 Players, 2 Teams, Sun & Hokom bidding, trick-taking, official card hierarchies & scoring.
 */

import crypto from 'node:crypto';
import { BALOOT_SUITS, BALOOT_BIDS, GAME_STATUS, ERROR_CODES, GameActionError } from '../../shared/constants.js';

export class BalootGame {
  constructor({ room, players, rules }) {
    this.gameId = crypto.randomUUID();
    this.roomId = room.id;
    this.gameType = 'baloot';
    this.room = room;
    // Exactly 4 players required
    this.players = players.map((p, idx) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      seat: idx,
      team: idx % 2, // Team 0 = seats 0 & 2, Team 1 = seats 1 & 3
      hand: [],
      score: 0
    }));
    this.rules = rules;

    this.dealerIndex = 0;
    this.currentTurnIndex = 1; // First bidder is right of dealer
    this.deck = [];
    this.floorCard = null;
    this.biddingRound = 1; // 1 or 2
    this.consecutivePasses = 0;

    // Contract
    this.contract = null; // { type: 'sun' | 'hokom', trumpSuit: null, buyerSeat: null, team: null }

    // Play Phase
    this.currentTrick = []; // Array of { seat, card }
    this.trickLeadSeat = 1;
    this.tricksCompleted = 0;
    this.teamAbnat = [0, 0]; // Card points in current round
    this.teamScores = [0, 0]; // Game points (target 152)
    this.status = 'BIDDING'; // BIDDING, PLAYING, ROUND_END, MATCH_END, FINISHED
    this.winner = null;
    this.loser = null;
    this.draw = false;
    this.reason = null;
    this.roundNumber = 1;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.version = 1;
  }

  createSnapshot() {
    return {
      players: this.players.map(p => ({
        ...p,
        hand: p.hand ? p.hand.map(c => ({ ...c })) : []
      })),
      deck: this.deck ? this.deck.map(c => ({ ...c })) : [],
      floorCard: this.floorCard ? { ...this.floorCard } : null,
      status: this.status,
      contract: this.contract ? { ...this.contract } : null,
      currentTrick: this.currentTrick ? this.currentTrick.map(t => ({ ...t, card: { ...t.card } })) : [],
      tricksCompleted: this.tricksCompleted,
      currentTurnIndex: this.currentTurnIndex,
      consecutivePasses: this.consecutivePasses,
      biddingRound: this.biddingRound,
      teamAbnat: [...this.teamAbnat],
      teamScores: [...this.teamScores],
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
    this.floorCard = snap.floorCard ? { ...snap.floorCard } : null;
    this.status = snap.status;
    this.contract = snap.contract ? { ...snap.contract } : null;
    this.currentTrick = snap.currentTrick ? snap.currentTrick.map(t => ({ ...t, card: { ...t.card } })) : [];
    this.tricksCompleted = snap.tricksCompleted;
    this.currentTurnIndex = snap.currentTurnIndex;
    this.consecutivePasses = snap.consecutivePasses;
    this.biddingRound = snap.biddingRound;
    this.teamAbnat = [...snap.teamAbnat];
    this.teamScores = [...snap.teamScores];
    this.scores = { ...snap.scores };
    this.version = snap.version;
  }

  start() {
    this.startRound();
  }

  generateDeck() {
    const suits = [BALOOT_SUITS.SPADES, BALOOT_SUITS.HEARTS, BALOOT_SUITS.DIAMONDS, BALOOT_SUITS.CLUBS];
    const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const cards = [];
    let id = 1;

    for (const suit of suits) {
      for (const rank of ranks) {
        cards.push({ id: `b_${id++}`, suit, rank });
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
    this.deck = this.generateDeck();
    this.status = 'BIDDING';
    this.biddingRound = 1;
    this.consecutivePasses = 0;
    this.contract = null;
    this.currentTrick = [];
    this.tricksCompleted = 0;
    this.teamAbnat = [0, 0];

    // Deal 5 cards to each player (3 then 2)
    for (const p of this.players) {
      p.hand = [];
      for (let i = 0; i < 5; i++) {
        p.hand.push(this.deck.pop());
      }
    }

    // Flip 21st card to center floor
    this.floorCard = this.deck.pop();

    // First bidder is seat to the right of dealer
    this.currentTurnIndex = (this.dealerIndex + 1) % 4;
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
  }

  handleAction(playerId, action) {
    if (this.status === GAME_STATUS.MATCH_END || this.status === GAME_STATUS.FINISHED) {
      throw new GameActionError(ERROR_CODES.GAME_ALREADY_FINISHED, 'انتهت اللعبة بالفعل (Game has finished)', 'Game has finished');
    }

    if (action.type === 'NEXT_ROUND') {
      if (this.status !== GAME_STATUS.ROUND_END) {
        throw new GameActionError(ERROR_CODES.INVALID_ACTION, 'لا يمكن بدء الجولة التالية الآن', 'Cannot start next round before current round has ended');
      }
      this.startNextRound();
      return { success: true, event: 'NEXT_ROUND_STARTED', round: this.roundNumber };
    }

    const current = this.getCurrentPlayer();
    if (current.id !== playerId) {
      throw new GameActionError(ERROR_CODES.NOT_YOUR_TURN, 'ليس دورك الآن', 'Not your turn');
    }

    let res;
    if (this.status === 'BIDDING') {
      res = this.handleBiddingAction(current, action);
    } else if (this.status === 'PLAYING') {
      res = this.handlePlayAction(current, action);
    } else {
      throw new GameActionError(ERROR_CODES.INVALID_ACTION, 'لا يمكن تنفيذ حركة في هذه المرحلة', 'Action cannot be performed right now');
    }

    this.version++;
    return res;
  }

  handleBiddingAction(player, action) {
    const bid = action.bid; // 'pass', 'sun', 'hokom', 'ashkal'
    const chosenSuit = action.trumpSuit;

    if (bid === BALOOT_BIDS.PASS) {
      this.consecutivePasses++;

      if (this.biddingRound === 1 && this.consecutivePasses === 4) {
        // Move to bidding round 2
        this.biddingRound = 2;
        this.consecutivePasses = 0;
        this.currentTurnIndex = (this.dealerIndex + 1) % 4;
        return { success: true, event: 'ROUND_2_BIDDING' };
      } else if (this.biddingRound === 2 && this.consecutivePasses === 4) {
        // All passed both rounds: Reshuffle and pass dealer
        this.dealerIndex = (this.dealerIndex + 1) % 4;
        this.startRound();
        return { success: true, event: 'REDRAW_ROUND' };
      }

      this.currentTurnIndex = (this.currentTurnIndex + 1) % 4;
      return { success: true, event: 'BID_PASSED' };
    }

    if (bid === BALOOT_BIDS.SUN) {
      this.contract = {
        type: 'sun',
        trumpSuit: null,
        buyerSeat: player.seat,
        buyerId: player.id,
        team: player.team
      };
      this.finishBidding(player);
      return { success: true, event: 'CONTRACT_SET', contract: this.contract };
    }

    if (bid === BALOOT_BIDS.HOKOM) {
      let trump = this.floorCard.suit;
      if (this.biddingRound === 2) {
        if (!chosenSuit || chosenSuit === this.floorCard.suit) {
          throw new Error('In round 2 Hokom, you must choose a different suit from the floor card');
        }
        trump = chosenSuit;
      }
      this.contract = {
        type: 'hokom',
        trumpSuit: trump,
        buyerSeat: player.seat,
        buyerId: player.id,
        team: player.team
      };
      this.finishBidding(player);
      return { success: true, event: 'CONTRACT_SET', contract: this.contract };
    }

    if (bid === BALOOT_BIDS.ASHKAL) {
      // Ashkal is only valid in Round 1 and for partner of dealer (seats 1 and 3 depending on dealer)
      if (this.biddingRound !== 1) throw new Error('Ashkal is only available in Round 1');
      const partnerSeat = (player.seat + 2) % 4;
      this.contract = {
        type: 'sun',
        trumpSuit: null,
        buyerSeat: partnerSeat,
        buyerId: this.players[partnerSeat].id,
        team: player.team
      };
      this.finishBidding(this.players[partnerSeat]);
      return { success: true, event: 'CONTRACT_SET', contract: this.contract };
    }

    throw new Error('Invalid bid');
  }

  finishBidding(buyer) {
    // Distribute remaining 11 cards:
    // Buyer takes floor card + 2 cards from deck (now has 8)
    buyer.hand.push(this.floorCard);
    buyer.hand.push(this.deck.pop());
    buyer.hand.push(this.deck.pop());

    // Other 3 players take 3 cards each from deck (now all have 8)
    for (const p of this.players) {
      if (p.seat !== buyer.seat) {
        for (let i = 0; i < 3; i++) {
          p.hand.push(this.deck.pop());
        }
      }
    }

    this.status = 'PLAYING';
    this.currentTrick = [];
    this.tricksCompleted = 0;
    // Trick lead starts with player to right of dealer
    this.currentTurnIndex = (this.dealerIndex + 1) % 4;
    this.trickLeadSeat = this.currentTurnIndex;
  }

  handlePlayAction(player, action) {
    const cardId = action.cardId;
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) throw new GameActionError(ERROR_CODES.CARD_NOT_IN_HAND, 'الورقة غير موجودة بيدك', 'Card not in hand');
    const card = player.hand[cardIndex];

    // Validate legal card play
    if (!this.isCardPlayable(player, card)) {
      throw new GameActionError(ERROR_CODES.INVALID_MOVE, 'هذه الحركة غير مسموحة', 'Illegal move');
    }

    // Play card
    player.hand.splice(cardIndex, 1);
    this.currentTrick.push({ seat: player.seat, playerId: player.id, card });

    // If trick complete (4 cards)
    if (this.currentTrick.length === 4) {
      const winnerSeat = this.evaluateTrickWinner(this.currentTrick);
      const winningTeam = this.players[winnerSeat].team;

      // Calculate trick points (Abnat)
      let trickAbnat = 0;
      for (const item of this.currentTrick) {
        trickAbnat += this.getCardPoints(item.card);
      }

      this.tricksCompleted++;

      // Ground bonus (الأرض) = 10 pts for last trick (8th)
      if (this.tricksCompleted === 8) {
        trickAbnat += 10;
      }

      this.teamAbnat[winningTeam] += trickAbnat;

      // Winner leads next trick
      this.currentTurnIndex = winnerSeat;
      this.trickLeadSeat = winnerSeat;
      const finishedTrick = [...this.currentTrick];
      this.currentTrick = [];

      if (this.tricksCompleted === 8) {
        this.finishRound();
        return { success: true, event: 'ROUND_FINISHED', trickWinner: winnerSeat, finishedTrick };
      }

      return { success: true, event: 'TRICK_COMPLETED', trickWinner: winnerSeat, finishedTrick };
    }

    // Advance turn to next player in trick
    this.currentTurnIndex = (this.currentTurnIndex + 1) % 4;
    return { success: true, event: 'CARD_PLAYED', card };
  }

  isCardPlayable(player, card) {
    if (this.currentTrick.length === 0) return true; // Leading card can be anything

    const leadSuit = this.currentTrick[0].card.suit;
    const hasLeadSuit = player.hand.some(c => c.suit === leadSuit);

    // Rule: Must follow suit if player possesses it
    if (hasLeadSuit) {
      return card.suit === leadSuit;
    }

    // If Sun: any card can be discarded
    if (this.contract.type === 'sun') {
      return true;
    }

    // If Hokom: If partner is winning trick, can play any card; otherwise must trump if possible
    const hasTrump = player.hand.some(c => c.suit === this.contract.trumpSuit);
    if (hasTrump) {
      return card.suit === this.contract.trumpSuit;
    }

    return true;
  }

  evaluateTrickWinner(trick) {
    const leadSuit = trick[0].card.suit;
    let winningItem = trick[0];

    for (let i = 1; i < trick.length; i++) {
      const candidate = trick[i];

      if (this.contract.type === 'hokom') {
        const winningIsTrump = (winningItem.card.suit === this.contract.trumpSuit);
        const candidateIsTrump = (candidate.card.suit === this.contract.trumpSuit);

        if (candidateIsTrump && !winningIsTrump) {
          winningItem = candidate;
        } else if (candidateIsTrump && winningIsTrump) {
          if (this.getTrumpStrength(candidate.card.rank) > this.getTrumpStrength(winningItem.card.rank)) {
            winningItem = candidate;
          }
        } else if (!candidateIsTrump && !winningIsTrump && candidate.card.suit === leadSuit) {
          if (this.getNonTrumpStrength(candidate.card.rank) > this.getNonTrumpStrength(winningItem.card.rank)) {
            winningItem = candidate;
          }
        }
      } else {
        // Sun rules
        if (candidate.card.suit === leadSuit) {
          if (this.getSunStrength(candidate.card.rank) > this.getSunStrength(winningItem.card.rank)) {
            winningItem = candidate;
          }
        }
      }
    }

    return winningItem.seat;
  }

  getCardPoints(card) {
    const r = card.rank;
    if (this.contract.type === 'hokom' && card.suit === this.contract.trumpSuit) {
      // Hokom Trump values: J=20, 9=14, A=11, 10=10, K=4, Q=3, 8=0, 7=0
      if (r === 'J') return 20;
      if (r === '9') return 14;
      if (r === 'A') return 11;
      if (r === '10') return 10;
      if (r === 'K') return 4;
      if (r === 'Q') return 3;
      return 0;
    } else {
      // Sun & Non-trump Hokom values: A=11, 10=10, K=4, Q=3, J=2, others=0
      if (r === 'A') return 11;
      if (r === '10') return 10;
      if (r === 'K') return 4;
      if (r === 'Q') return 3;
      if (r === 'J') return 2;
      return 0;
    }
  }

  getSunStrength(rank) {
    const order = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
    return order.indexOf(rank);
  }

  getNonTrumpStrength(rank) {
    const order = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
    return order.indexOf(rank);
  }

  getTrumpStrength(rank) {
    // Hokom Trump hierarchy: 7, 8, Q, K, 10, A, 9, J
    const order = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];
    return order.indexOf(rank);
  }

  finishRound() {
    // Convert Abnat to Baloot game score (1 pt per 10 abnat in Hokom, doubled in Sun)
    const buyerTeam = this.contract.team;
    const defenderTeam = 1 - buyerTeam;

    let pointsBuyer = Math.round(this.teamAbnat[buyerTeam] / 10);
    let pointsDefender = Math.round(this.teamAbnat[defenderTeam] / 10);

    if (this.contract.type === 'sun') {
      pointsBuyer *= 2;
      pointsDefender *= 2;
    }

    // Check if buyer won the purchase (Khasara rule: must score strictly more than defender)
    if (this.teamAbnat[buyerTeam] <= this.teamAbnat[defenderTeam]) {
      // Buyer lost! All points go to defenders (Khasara)
      this.teamScores[defenderTeam] += (pointsBuyer + pointsDefender);
    } else {
      this.teamScores[buyerTeam] += pointsBuyer;
      this.teamScores[defenderTeam] += pointsDefender;
    }

    const target = this.rules.targetScore || 152;
    if (this.teamScores[0] >= target || this.teamScores[1] >= target) {
      this.status = GAME_STATUS.MATCH_END;
      this.endedAt = Date.now();
      const winningTeamIdx = this.teamScores[0] >= this.teamScores[1] ? 0 : 1;
      const winningPlayers = this.players.filter(p => p.team === winningTeamIdx).map(p => p.username).join(' & ');
      const losingPlayers = this.players.filter(p => p.team !== winningTeamIdx).map(p => p.username).join(' & ');
      this.winner = `فريق ${winningTeamIdx === 0 ? '1' : '2'} (${winningPlayers})`;
      this.loser = `فريق ${winningTeamIdx === 0 ? '2' : '1'} (${losingPlayers})`;
      this.reason = `وصل إلى نقاط الفوز المطلوبة (${target})`;
    } else {
      this.status = GAME_STATUS.ROUND_END;
      this.roundNumber++;
      this.dealerIndex = (this.dealerIndex + 1) % 4;
    }
  }

  startNextRound() {
    if (this.status !== GAME_STATUS.ROUND_END) return;
    this.startRound();
  }

  getStateForPlayer(playerId) {
    const me = this.players.find(p => p.id === playerId);
    const current = this.getCurrentPlayer();

    return {
      gameId: this.gameId,
      roomId: this.roomId,
      gameType: 'baloot',
      myPlayerId: playerId,
      version: this.version,
      status: this.status,
      round: this.roundNumber,
      roundNumber: this.roundNumber,
      winner: this.winner,
      loser: this.loser,
      draw: this.draw,
      reason: this.reason,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      scores: {
        'فريق 1': this.teamScores[0],
        'فريق 2': this.teamScores[1]
      },
      rules: this.rules,
      dealerSeat: this.dealerIndex,
      currentTurn: current ? current.id : null,
      currentTurnPlayerId: current ? current.id : null,
      currentTurnSeat: this.currentTurnIndex,
      biddingRound: this.biddingRound,
      floorCard: this.floorCard,
      contract: this.contract,
      currentTrick: this.currentTrick,
      tricksCompleted: this.tricksCompleted,
      teamScores: this.teamScores,
      teamAbnat: this.teamAbnat,
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        seat: p.seat,
        team: p.team,
        cardCount: p.hand.length
      })),
      // Clean hand: no isPlayable hints, player decides what card to play
      myHand: me ? me.hand.map(c => ({
        id: c.id,
        suit: c.suit,
        rank: c.rank
      })) : []
    };
  }

  handlePlayerLeft(playerId) {
    if (this.status !== GAME_STATUS.MATCH_END && this.status !== GAME_STATUS.FINISHED) {
      this.status = GAME_STATUS.MATCH_END;
      this.endedAt = Date.now();
      const leaver = this.players.find(p => p.id === playerId);
      const remaining = this.players.filter(p => p.id !== playerId);
      this.winner = remaining.map(p => p.username).join(', ');
      this.loser = leaver ? leaver.username : playerId;
      this.reason = 'انسحاب لاعب';
    }
  }
}

export default BalootGame;
