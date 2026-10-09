/**
 * Shared Rules Engine
 * Defines default rules, rule specifications, and validation for all games.
 */

import { GAME_TYPES } from './constants.js';

export const UNO_DEFAULT_RULES = {
  startingCards: 7,
  stacking: true,             // Stack +2 on +2, +4 on +4
  jumpIn: false,              // Jump in if identical card held
  sevenZero: false,           // 7 = swap hands, 0 = pass hand along
  drawUntilPlayable: false,   // Keep drawing until a valid card is drawn
  progressive: true,          // Draw cards compound across players
  singleRound: true,          // Match ends on empty hand unless multiRound configured
  targetScore: 500,           // Points to trigger match win in multi-round mode
  turnTimer: 60               // 0 = off, 30, 60, 120 seconds
};

export const BALOOT_DEFAULT_RULES = {
  targetScore: 152,           // Standard Baloot winning score
  turnTimer: 30,              // 30 seconds per bid/card
  allowProjects: true,        // Declarations (سرا، خمسين، مية، 400)
  allowDoubling: true,        // دبل، ثري، أربعة، قهوة
  biddingMode: 'standard'     // Standard Sun & Hokom rounds
};

export const CHESS_DEFAULT_RULES = {
  timeControl: 300,           // 5 minutes (300 sec); 0 = unlimited
  increment: 3,               // 3 sec increment per move
  allowDraw: true,            // Offer and accept draw
  spectators: true            // Allow spectators
};

export const DOMINO_DEFAULT_RULES = {
  startingTiles: 7,           // 7 tiles for 2 players, 5 for 3-4
  singleRound: true,          // Match ends on domino out unless multiRound configured
  targetScore: 100,           // Match winning score
  drawRule: 'boneyard',       // 'boneyard' (draw till playable or empty) or 'pass'
  turnTimer: 45               // Seconds per turn
};

export const CARDS_DEFAULT_RULES = {
  startingCards: 5,           // Cards dealt per player
  singleRound: true,          // Match ends on shedding all cards
  matchingMode: 'rank_or_suit',// Match top card by rank or suit
  specialCards: true,         // 2 draws 2, 8 changes suit, A skips, J reverses
  targetScore: 100,           // Target penalty points for match end
  turnTimer: 45               // Turn timer
};

export const DEFAULT_RULES_BY_GAME = {
  [GAME_TYPES.UNO]: UNO_DEFAULT_RULES,
  [GAME_TYPES.BALOOT]: BALOOT_DEFAULT_RULES,
  [GAME_TYPES.CHESS]: CHESS_DEFAULT_RULES,
  [GAME_TYPES.DOMINO]: DOMINO_DEFAULT_RULES,
  [GAME_TYPES.CARDS]: CARDS_DEFAULT_RULES
};

/**
 * Returns a cloned copy of default rules for a game
 */
export function getDefaultRules(gameType) {
  const defaults = DEFAULT_RULES_BY_GAME[gameType] || {};
  return JSON.parse(JSON.stringify(defaults));
}

/**
 * Sanitizes and validates rules, combining custom rules with defaults
 */
export function getEffectiveRules(gameType, customRules = {}) {
  const defaults = getDefaultRules(gameType);
  const effective = { ...defaults };

  if (!customRules || typeof customRules !== 'object') {
    return effective;
  }

  switch (gameType) {
    case GAME_TYPES.UNO:
      if (typeof customRules.startingCards === 'number' && customRules.startingCards >= 1 && customRules.startingCards <= 15) {
        effective.startingCards = Math.floor(customRules.startingCards);
      }
      if (typeof customRules.stacking === 'boolean') effective.stacking = customRules.stacking;
      if (typeof customRules.jumpIn === 'boolean') effective.jumpIn = customRules.jumpIn;
      if (typeof customRules.sevenZero === 'boolean') effective.sevenZero = customRules.sevenZero;
      if (typeof customRules.drawUntilPlayable === 'boolean') effective.drawUntilPlayable = customRules.drawUntilPlayable;
      if (typeof customRules.progressive === 'boolean') effective.progressive = customRules.progressive;
      if (typeof customRules.singleRound === 'boolean') effective.singleRound = customRules.singleRound;
      if (typeof customRules.targetScore === 'number' && customRules.targetScore >= 1 && customRules.targetScore <= 2000) {
        effective.targetScore = Math.floor(customRules.targetScore);
      }
      if (typeof customRules.turnTimer === 'number') {
        effective.turnTimer = customRules.turnTimer;
      }
      break;

    case GAME_TYPES.BALOOT:
      if (typeof customRules.targetScore === 'number' && customRules.targetScore >= 1) {
        effective.targetScore = Math.floor(customRules.targetScore);
      }
      if (typeof customRules.turnTimer === 'number') {
        effective.turnTimer = customRules.turnTimer;
      }
      if (typeof customRules.allowProjects === 'boolean') effective.allowProjects = customRules.allowProjects;
      if (typeof customRules.allowDoubling === 'boolean') effective.allowDoubling = customRules.allowDoubling;
      break;

    case GAME_TYPES.CHESS:
      if (typeof customRules.timeControl === 'number') {
        effective.timeControl = customRules.timeControl;
      }
      if (typeof customRules.increment === 'number') {
        effective.increment = customRules.increment;
      }
      if (typeof customRules.allowDraw === 'boolean') effective.allowDraw = customRules.allowDraw;
      if (typeof customRules.spectators === 'boolean') effective.spectators = customRules.spectators;
      break;

    case GAME_TYPES.DOMINO:
      if (typeof customRules.startingTiles === 'number' && customRules.startingTiles >= 1 && customRules.startingTiles <= 7) {
        effective.startingTiles = Math.floor(customRules.startingTiles);
      }
      if (typeof customRules.singleRound === 'boolean') effective.singleRound = customRules.singleRound;
      if (typeof customRules.targetScore === 'number' && customRules.targetScore >= 1) {
        effective.targetScore = Math.floor(customRules.targetScore);
      }
      if (['boneyard', 'pass'].includes(customRules.drawRule)) {
        effective.drawRule = customRules.drawRule;
      }
      if (typeof customRules.turnTimer === 'number') {
        effective.turnTimer = customRules.turnTimer;
      }
      break;

    case GAME_TYPES.CARDS:
      if (typeof customRules.startingCards === 'number' && customRules.startingCards >= 1 && customRules.startingCards <= 10) {
        effective.startingCards = Math.floor(customRules.startingCards);
      }
      if (typeof customRules.singleRound === 'boolean') effective.singleRound = customRules.singleRound;
      if (typeof customRules.specialCards === 'boolean') effective.specialCards = customRules.specialCards;
      if (typeof customRules.targetScore === 'number' && customRules.targetScore >= 1) {
        effective.targetScore = Math.floor(customRules.targetScore);
      }
      if (typeof customRules.turnTimer === 'number') {
        effective.turnTimer = customRules.turnTimer;
      }
      break;
  }

  return effective;
}
