/**
 * Socket.IO Client Wrapper
 * Manages real-time connection, room lifecycle, packet queuing, reconnection and event handling.
 */

import api from './api.js';
import { SOCKET_EVENTS } from '../shared/constants.js';
import { showToast, sfx } from './utils.js';
import i18n from './language.js';

class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.currentRoomId = null;
    this.currentRoomCode = null;
    this.eventListeners = new Map();
    this.pendingQueue = [];
    this.connectPromise = null;
  }

  /**
   * Connect to Socket.IO server asynchronously
   * @returns {Promise<any>} Resolves with the socket instance once connected
   */
  connect() {
    if (this.socket && this.connected) {
      return Promise.resolve(this.socket);
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    const token = api.getToken();
    if (!token) {
      console.warn('[Socket] Connect called without auth token');
      return Promise.reject(new Error('Authentication token required'));
    }

    if (typeof window.io !== 'function') {
      console.error('[Socket] Socket.IO client script is not loaded on page');
      return Promise.reject(new Error('Socket.IO script not found'));
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const isHttps = window.location.protocol === 'https:';
      this.socket = window.io('/', {
        auth: { token },
        transports: ['websocket', 'polling'],
        secure: isHttps,
        rejectUnauthorized: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });

      this.socket.on('connect', () => {
        this.connected = true;
        console.log('[Socket] Connected successfully with ID:', this.socket.id);
        this.trigger('connect', this.socket.id);

        // Flush any queued packets sent while connecting
        this._flushQueue();

        // If previously in a room, automatically re-join and recover state
        if (this.currentRoomId || this.currentRoomCode) {
          console.log('[Socket] Rejoining active room after reconnect:', this.currentRoomId || this.currentRoomCode);
          this.emit(SOCKET_EVENTS.JOIN_ROOM, {
            roomId: this.currentRoomId,
            code: this.currentRoomCode
          });
          this.emit(SOCKET_EVENTS.RECONNECT, {
            roomId: this.currentRoomId
          });
        }

        resolve(this.socket);
      });

      this.socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
        this.trigger('connect_error', err);
        // Only reject initial connect promise if not yet connected once
        if (!this.connected) {
          // Keep promise pending so reconnection attempts can resolve it
        }
      });

      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        console.warn('[Socket] Disconnected:', reason);
        this.trigger('disconnect', reason);
      });

      // Register standard server -> client events
      const forwardEvents = [
        SOCKET_EVENTS.ROOM_STATE,
        SOCKET_EVENTS.ROOM_JOINED,
        SOCKET_EVENTS.ROOM_PLAYER_JOINED,
        SOCKET_EVENTS.ROOM_PLAYER_LEFT,
        SOCKET_EVENTS.ROOM_PLAYER_RECONNECTED,
        SOCKET_EVENTS.DISCONNECT_WARNING,
        SOCKET_EVENTS.ROOM_SETTINGS_UPDATED,
        SOCKET_EVENTS.ROOM_STARTED,
        SOCKET_EVENTS.GAME_STATE,
        SOCKET_EVENTS.REMATCH_UPDATE,
        SOCKET_EVENTS.CHAT_BROADCAST,
        SOCKET_EVENTS.NOTIFICATION,
        SOCKET_EVENTS.ROOM_CLOSED,
        SOCKET_EVENTS.LOBBY_ROOM_CREATED,
        SOCKET_EVENTS.LOBBY_ROOM_UPDATED,
        SOCKET_EVENTS.LOBBY_ROOM_REMOVED,
        'player:skin:updated',
        'player:skin-updated',
        'room:public-state'
      ];

      forwardEvents.forEach(evt => {
        if (evt) {
          this.socket.on(evt, (data) => this.trigger(evt, data));
        }
      });

      // Error event handling
      const handleErr = (err) => {
        sfx.errorBuzz();
        const msg = i18n.getLanguage() === 'ar'
          ? (err.messageAr || err.messageEn || err.message || 'حدث خطأ')
          : (err.messageEn || err.messageAr || err.message || 'An error occurred');
        showToast(msg, 'error');
        this.trigger(SOCKET_EVENTS.ERROR, err);
        this.trigger('room:error', err);
      };

      this.socket.on(SOCKET_EVENTS.ERROR, handleErr);
      this.socket.on('error:message', handleErr);
      this.socket.on('room:error', handleErr);

      this.socket.on(SOCKET_EVENTS.NOTIFICATION, (data) => {
        const msg = i18n.getLanguage() === 'ar' ? (data.messageAr || data.messageEn) : (data.messageEn || data.messageAr);
        showToast(msg, 'info');
      });

      this.socket.on(SOCKET_EVENTS.ROOM_CLOSED, (data) => {
        const reason = (data && data.reason) || 'Room closed';
        showToast(reason, 'warning');
        this.currentRoomId = null;
        this.currentRoomCode = null;
        setTimeout(() => {
          window.location.href = '/lobby.html';
        }, 1500);
      });
    });

    return this.connectPromise;
  }

  /**
   * Wait until socket is confirmed connected
   */
  async waitForConnection(timeoutMs = 10000) {
    if (this.socket && this.connected) return true;

    await this.connect();
    if (this.connected) return true;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.connected) resolve(true);
        else reject(new Error('Socket connection timed out'));
      }, timeoutMs);

      const onConn = () => {
        clearTimeout(timer);
        this.off('connect', onConn);
        resolve(true);
      };
      this.on('connect', onConn);
    });
  }

  _flushQueue() {
    if (!this.connected || !this.socket) return;
    while (this.pendingQueue.length > 0) {
      const item = this.pendingQueue.shift();
      console.log(`[Socket] Flushing queued event: ${item.event}`);
      this.socket.emit(item.event, item.data);
    }
  }

  joinRoom(roomId, code) {
    this.currentRoomId = roomId;
    this.currentRoomCode = code;
    this.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId, code });
  }

  leaveRoom(roomId = this.currentRoomId) {
    if (roomId) {
      this.emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId });
      this.currentRoomId = null;
      this.currentRoomCode = null;
    }
  }

  startGame(roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.START_GAME, { roomId });
  }

  restartGame(roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.RESTART_GAME, { roomId });
  }

  sendGameAction(action, roomId = this.currentRoomId) {
    if (!action.actionId) {
      action.actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    this.emit(SOCKET_EVENTS.GAME_ACTION, { roomId, action, actionId: action.actionId });
  }

  syncState(roomId = this.currentRoomId) {
    if (roomId) {
      this.emit(SOCKET_EVENTS.SYNC_STATE, { roomId });
    }
  }

  sendChatMessage(message, roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.CHAT_MESSAGE, { roomId, message });
  }

  updateSettings(settings, rules, roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.UPDATE_SETTINGS, { roomId, settings, rules });
  }

  kickPlayer(targetUserId, roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.KICK_PLAYER, { roomId, targetUserId });
  }

  transferHost(targetUserId, roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.TRANSFER_HOST, { roomId, targetUserId });
  }

  voteRematch(roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.VOTE_REMATCH, { roomId });
  }

  nextRound(roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.NEXT_ROUND, { roomId });
  }

  updateSkin(gameType, skin) {
    this.emit('player:skin:update', { gameType, skin });
  }

  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    } else {
      console.log(`[Socket] Queuing packet '${event}' until connected`);
      this.pendingQueue.push({ event, data });
      // Ensure connect is in flight
      if (!this.connectPromise) {
        this.connect().catch(err => console.warn('[Socket] Background connect failed:', err));
      }
    }
  }

  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  once(event, handler) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      handler(data);
    };
    this.on(event, wrapper);
  }

  off(event, handler) {
    if (this.eventListeners.has(event)) {
      const list = this.eventListeners.get(event).filter(h => h !== handler);
      this.eventListeners.set(event, list);
    }
  }

  trigger(event, data) {
    if (this.eventListeners.has(event)) {
      // Create a shallow copy to prevent mutation during iteration
      const listeners = [...this.eventListeners.get(event)];
      listeners.forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error(`[Socket] Error in listener for '${event}':`, e);
        }
      });
    }
  }
}

export const socket = new SocketClient();
export default socket;
