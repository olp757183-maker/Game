/**
 * Socket.IO Client Wrapper
 * Manages real-time connection, room lifecycle, reconnection and event handling.
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
    this.eventListeners = new Map();
  }

  connect() {
    if (this.socket && this.connected) return this.socket;

    const token = api.getToken();
    if (!token) {
      console.warn('Socket connect called without auth token');
      return null;
    }

    if (typeof window.io !== 'function') {
      console.error('Socket.IO script not loaded on page');
      return null;
    }

    this.socket = window.io('/', {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Socket] Connected as', this.socket.id);
      this.trigger('connect');

      // If we were in a room before disconnect, notify server
      if (this.currentRoomId) {
        showToast(i18n.t('reconnected'), 'success');
        this.emit(SOCKET_EVENTS.RECONNECT, { roomId: this.currentRoomId });
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.warn('[Socket] Disconnected:', reason);
      showToast(i18n.t('connectionLost'), 'warning');
      this.trigger('disconnect', reason);
    });

    this.socket.on(SOCKET_EVENTS.ROOM_STATE, (data) => {
      this.trigger(SOCKET_EVENTS.ROOM_STATE, data);
    });

    this.socket.on(SOCKET_EVENTS.CHAT_BROADCAST, (data) => {
      this.trigger(SOCKET_EVENTS.CHAT_BROADCAST, data);
    });

    this.socket.on(SOCKET_EVENTS.ERROR, (err) => {
      sfx.errorBuzz();
      const msg = i18n.getLanguage() === 'ar' ? (err.messageAr || err.messageEn || err) : (err.messageEn || err.messageAr || err);
      showToast(msg, 'error');
      this.trigger(SOCKET_EVENTS.ERROR, err);
    });

    this.socket.on(SOCKET_EVENTS.NOTIFICATION, (data) => {
      const msg = i18n.getLanguage() === 'ar' ? data.messageAr : data.messageEn;
      showToast(msg, 'info');
      this.trigger(SOCKET_EVENTS.NOTIFICATION, data);
    });

    this.socket.on(SOCKET_EVENTS.ROOM_CLOSED, (data) => {
      showToast(data.reason || 'Room closed', 'warning');
      this.currentRoomId = null;
      setTimeout(() => {
        window.location.href = '/lobby.html';
      }, 1500);
    });

    return this.socket;
  }

  joinRoom(roomId, code) {
    this.currentRoomId = roomId;
    this.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId, code });
  }

  leaveRoom(roomId = this.currentRoomId) {
    if (roomId) {
      this.emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId });
      this.currentRoomId = null;
    }
  }

  startGame(roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.START_GAME, { roomId });
  }

  restartGame(roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.RESTART_GAME, { roomId });
  }

  sendGameAction(action, roomId = this.currentRoomId) {
    this.emit(SOCKET_EVENTS.GAME_ACTION, { roomId, action });
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

  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('[Socket] Cannot emit, not connected');
    }
  }

  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  off(event, handler) {
    if (this.eventListeners.has(event)) {
      const list = this.eventListeners.get(event).filter(h => h !== handler);
      this.eventListeners.set(event, list);
    }
  }

  trigger(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(handler => handler(data));
    }
  }
}

export const socket = new SocketClient();
export default socket;
