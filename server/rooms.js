/**
 * Room Management System
 * Handles room lifecycle, seats, host permissions, and state delegation.
 */

import crypto from 'node:crypto';
import { ROOM_STATUS, ROOM_PRIVACY, GAME_INFO, GAME_TYPES } from '../shared/constants.js';
import { getEffectiveRules } from '../shared/rules.js';
import database from './database.js';

// Active in-memory rooms: roomId -> Room
export const activeRooms = new Map();
// Code lookup: code -> roomId
export const codeToRoomId = new Map();

export class Room {
  constructor({ id, code, hostUser, gameType, maxPlayers, privacy = ROOM_PRIVACY.PUBLIC, rules = {} }) {
    this.id = id || crypto.randomUUID();
    this.code = code || Room.generateCode();
    this.hostId = hostUser.id;
    this.gameType = gameType;
    this.status = ROOM_STATUS.WAITING;
    this.privacy = privacy;
    this.locked = false;

    const gameSpec = GAME_INFO[gameType];
    if (!gameSpec) {
      throw new Error(`Unsupported game type: ${gameType}`);
    }
    this.minPlayers = gameSpec.minPlayers;
    this.maxPlayers = Math.min(Math.max(maxPlayers || gameSpec.defaultPlayers, gameSpec.minPlayers), gameSpec.maxPlayers);

    this.rules = getEffectiveRules(gameType, rules);
    this.settings = {
      allowSpectators: true,
      turnTimer: this.rules.turnTimer || 0
    };

    this.players = [];
    this.spectators = [];
    this.gameInstance = null;
    this.rematchVotes = new Set();
    this.createdAt = Date.now();
    this.lastActiveAt = Date.now();
    this.version = 1;
    this.disconnectTimers = new Map();

    // Add initial host player
    this.addPlayer(hostUser, true);
  }

  static generateCode() {
    let code;
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (codeToRoomId.has(code));
    return code;
  }

  clearDisconnectTimer(userId) {
    if (this.disconnectTimers.has(userId)) {
      clearTimeout(this.disconnectTimers.get(userId));
      this.disconnectTimers.delete(userId);
    }
  }

  addPlayer(user, isHost = false) {
    // Clear any disconnect timer for this user
    this.clearDisconnectTimer(user.id);

    // If user already in room, update connection
    const existing = this.players.find(p => p.id === user.id);
    if (existing) {
      existing.connected = true;
      existing.username = user.username;
      existing.avatar = user.avatar;
      existing.preferences = user.preferences || {};
      this.version++;
      return existing;
    }

    if (this.status !== ROOM_STATUS.WAITING) {
      throw new Error('Game already in progress');
    }

    if (this.locked) {
      throw new Error('Room is locked');
    }

    if (this.players.length >= this.maxPlayers) {
      throw new Error('Room is full');
    }

    const seat = this.findNextAvailableSeat();
    const playerObj = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      isGuest: user.isGuest,
      preferences: user.preferences || {},
      seat,
      isHost,
      connected: true,
      ready: isHost, // Host is ready by default
      score: 0,
      joinedAt: Date.now()
    };

    this.players.push(playerObj);
    this.lastActiveAt = Date.now();
    this.version++;
    return playerObj;
  }

  findNextAvailableSeat() {
    const taken = new Set(this.players.map(p => p.seat));
    for (let i = 0; i < this.maxPlayers; i++) {
      if (!taken.has(i)) return i;
    }
    return this.players.length;
  }

  removePlayer(userId) {
    this.clearDisconnectTimer(userId);
    const idx = this.players.findIndex(p => p.id === userId);
    if (idx === -1) return null;

    const removed = this.players[idx];
    this.lastActiveAt = Date.now();
    this.version++;

    if (this.status === ROOM_STATUS.WAITING) {
      this.players.splice(idx, 1);
      // Reassign host if host left
      if (removed.isHost && this.players.length > 0) {
        const nextHost = this.players.find(p => p.connected) || this.players[0];
        if (nextHost) {
          this.transferHost(nextHost.id);
        }
      }
    } else {
      // In-game leave: mark disconnected
      removed.connected = false;
      // Reassign host if host left during active game
      if (removed.isHost) {
        const nextHost = this.players.find(p => p.connected && p.id !== userId);
        if (nextHost) {
          this.transferHost(nextHost.id);
        }
      }
      // If all players disconnected, handle closure
      const connectedCount = this.players.filter(p => p.connected).length;
      if (connectedCount === 0) {
        this.status = ROOM_STATUS.CLOSED;
      }
    }

    return removed;
  }

  markPlayerConnected(userId, connected = true) {
    if (connected) {
      this.clearDisconnectTimer(userId);
    }
    const player = this.players.find(p => p.id === userId);
    if (player) {
      player.connected = connected;
      this.lastActiveAt = Date.now();
      this.version++;
    }
    return player;
  }

  transferHost(newHostId) {
    const target = this.players.find(p => p.id === newHostId);
    if (!target) {
      throw new Error('Target player not found in room');
    }

    this.players.forEach(p => { p.isHost = (p.id === newHostId); });
    this.hostId = newHostId;
    this.version++;
    database.updateRoomHost(this.id, newHostId);
    return target;
  }

  kickPlayer(requesterId, targetUserId) {
    if (requesterId !== this.hostId) {
      throw new Error('Only the room host can kick players');
    }
    if (targetUserId === this.hostId) {
      throw new Error('Host cannot kick themselves');
    }
    const idx = this.players.findIndex(p => p.id === targetUserId);
    if (idx === -1) {
      throw new Error('Player not in room');
    }

    const kicked = this.players.splice(idx, 1)[0];
    this.version++;
    if (this.gameInstance && typeof this.gameInstance.handlePlayerLeft === 'function') {
      this.gameInstance.handlePlayerLeft(targetUserId);
    }
    return kicked;
  }

  updateSettings(requesterId, newSettings, newRules) {
    if (requesterId !== this.hostId) {
      throw new Error('Only the host can update room settings');
    }
    if (this.status === ROOM_STATUS.PLAYING) {
      throw new Error('Cannot change rules while a game is active');
    }

    if (newRules) {
      this.rules = getEffectiveRules(this.gameType, newRules);
    }

    if (newSettings) {
      if (typeof newSettings.maxPlayers === 'number') {
        const spec = GAME_INFO[this.gameType];
        const val = Math.max(spec.minPlayers, Math.min(newSettings.maxPlayers, spec.maxPlayers));
        if (val >= this.players.length) {
          this.maxPlayers = val;
        }
      }
      if (typeof newSettings.locked === 'boolean') {
        this.locked = newSettings.locked;
      }
      if (typeof newSettings.privacy === 'string' && [ROOM_PRIVACY.PUBLIC, ROOM_PRIVACY.PRIVATE].includes(newSettings.privacy)) {
        this.privacy = newSettings.privacy;
      }
      this.settings = { ...this.settings, ...newSettings };
    }

    this.version++;
    database.saveRoom(this);
    return this.getPublicRoomInfo();
  }

  startGame(requesterId, GameEngineClass) {
    if (requesterId !== this.hostId) {
      throw new Error('Only the room host can start the game');
    }

    if (this.players.length < this.minPlayers) {
      throw new Error(`At least ${this.minPlayers} players are required to start ${this.gameType.toUpperCase()}`);
    }

    this.status = ROOM_STATUS.PLAYING;
    this.gameInstance = new GameEngineClass({
      room: this,
      players: this.players,
      rules: this.rules
    });

    this.rematchVotes.clear();
    this.version++;
    this.gameInstance.start();
    database.updateRoomStatus(this.id, this.status);
    return this.gameInstance;
  }

  restartGame(requesterId, GameEngineClass) {
    if (requesterId !== this.hostId) {
      throw new Error('Only the host can restart the game');
    }
    this.status = ROOM_STATUS.WAITING;
    this.gameInstance = null;
    this.rematchVotes.clear();
    this.version++;
    return this.startGame(requesterId, GameEngineClass);
  }

  voteRematch(userId) {
    const player = this.players.find(p => p.id === userId);
    if (!player) throw new Error('Player not in room');

    this.rematchVotes.add(userId);
    this.version++;
    const activePlayers = this.players.filter(p => p.connected);
    const totalNeeded = Math.max(this.minPlayers, activePlayers.length);
    const isReady = this.rematchVotes.size >= totalNeeded;

    return {
      votedCount: this.rematchVotes.size,
      totalNeeded,
      ready: isReady
    };
  }

  startNextGame(GameEngineClass) {
    this.rematchVotes.clear();
    this.status = ROOM_STATUS.PLAYING;
    this.gameInstance = new GameEngineClass({
      room: this,
      players: this.players,
      rules: this.rules
    });
    this.version++;
    this.gameInstance.start();
    database.updateRoomStatus(this.id, this.status);
    return this.gameInstance;
  }

  // Get sanitized info visible in lobby or room
  getPublicRoomInfo() {
    return {
      id: this.id,
      code: this.code,
      hostId: this.hostId,
      gameType: this.gameType,
      status: this.status,
      privacy: this.privacy,
      locked: this.locked,
      maxPlayers: this.maxPlayers,
      minPlayers: this.minPlayers,
      playerCount: this.players.length,
      version: this.version,
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        preferences: p.preferences || {},
        seat: p.seat,
        isHost: p.isHost,
        connected: p.connected,
        score: p.score
      })),
      rematchVotes: Array.from(this.rematchVotes),
      rematchNeeded: Math.max(this.minPlayers, this.players.filter(p => p.connected).length),
      settings: this.settings,
      rules: this.rules,
      createdAt: this.createdAt
    };
  }

  // Get full room state + player's secret state
  getStateForPlayer(userId) {
    const publicRoom = this.getPublicRoomInfo();
    let gameState = null;

    if (this.gameInstance) {
      gameState = this.gameInstance.getStateForPlayer(userId);
    }

    return {
      room: publicRoom,
      game: gameState,
      myPlayerId: userId,
      isHost: (this.hostId === userId),
      version: this.version,
      gameStateVersion: this.gameInstance ? (this.gameInstance.version || 1) : 0
    };
  }
}

export const rooms = {
  createRoom({ hostUser, gameType, maxPlayers, privacy = ROOM_PRIVACY.PUBLIC, rules = {} }) {
    const room = new Room({ hostUser, gameType, maxPlayers, privacy, rules });
    activeRooms.set(room.id, room);
    codeToRoomId.set(room.code, room.id);
    database.saveRoom(room);
    return room;
  },

  getRoomById(id) {
    return activeRooms.get(id) || null;
  },

  getRoomByCode(code) {
    if (!code) return null;
    const clean = code.trim().toUpperCase();
    const id = codeToRoomId.get(clean);
    if (!id) return null;
    return activeRooms.get(id) || null;
  },

  listPublicRooms() {
    const list = [];
    for (const room of activeRooms.values()) {
      if (room.privacy === ROOM_PRIVACY.PUBLIC && room.status !== ROOM_STATUS.CLOSED) {
        list.push({
          id: room.id,
          code: room.code,
          gameType: room.gameType,
          hostName: room.players.find(p => p.isHost)?.username || 'Host',
          players: `${room.players.length}/${room.maxPlayers}`,
          status: room.status,
          rules: room.rules,
          createdAt: room.createdAt
        });
      }
    }
    return list;
  },

  closeRoom(roomId) {
    const room = activeRooms.get(roomId);
    if (room) {
      room.status = ROOM_STATUS.CLOSED;
      codeToRoomId.delete(room.code);
      activeRooms.delete(roomId);
      database.deleteRoom(roomId);
    }
  }
};

export default rooms;
