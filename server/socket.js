/**
 * Socket.IO Multiplayer Real-Time Server
 * Manages connections, rooms, turns, chat, and server-authoritative state distribution.
 */

import { Server } from 'socket.io';
import auth from './auth.js';
import rooms, { activeRooms } from './rooms.js';
import database from './database.js';
import { SOCKET_EVENTS, ROOM_STATUS } from '../shared/constants.js';
import { sanitizeChatMessage } from '../shared/validation.js';

// Import Game Engines
import UnoGame from './games/uno.js';
import ChessGame from './games/chess.js';
import DominoGame from './games/domino.js';
import BalootGame from './games/baloot.js';
import CardsGame from './games/cards.js';

const GAME_ENGINES = {
  uno: UnoGame,
  chess: ChessGame,
  domino: DominoGame,
  baloot: BalootGame,
  cards: CardsGame
};

// Map of userId -> Set of socket IDs
const userSockets = new Map();
// Map of socketId -> currentRoomId
const socketRoomMap = new Map();

export function setupSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true
    }
  });

  // Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const user = auth.verifyToken(token);
    if (!user) {
      return next(new Error('Invalid or expired authentication token'));
    }

    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.user;

    // Track user socket
    if (!userSockets.has(user.id)) {
      userSockets.set(user.id, new Set());
    }
    userSockets.get(user.id).add(socket.id);

    // Broadcast room and game state to each participant securely
    function broadcastRoomState(room) {
      if (!room) return;

      for (const player of room.players) {
        const playerSockets = userSockets.get(player.id);
        if (playerSockets) {
          const personalizedState = room.getStateForPlayer(player.id);
          for (const sId of playerSockets) {
            io.to(sId).emit(SOCKET_EVENTS.ROOM_STATE, personalizedState);
          }
        }
      }
    }

    // Join Room
    socket.on(SOCKET_EVENTS.JOIN_ROOM, ({ roomId, code }) => {
      try {
        let room = null;
        if (roomId) {
          room = rooms.getRoomById(roomId);
        } else if (code) {
          room = rooms.getRoomByCode(code);
        }

        if (!room) {
          return socket.emit(SOCKET_EVENTS.ERROR, { messageEn: 'Room not found', messageAr: 'الغرفة غير موجودة' });
        }

        // Add player to room model
        room.addPlayer(user);

        // Associate socket with Socket.IO room channel
        socket.join(`room:${room.id}`);
        socketRoomMap.set(socket.id, room.id);

        // Notify room members
        io.to(`room:${room.id}`).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
          id: `sys_${Date.now()}_${Math.random()}`,
          isSystem: true,
          messageEn: `${user.username} joined the room`,
          messageAr: `انضم ${user.username} إلى الغرفة`,
          timestamp: Date.now()
        });

        broadcastRoomState(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          messageEn: err.message || 'Failed to join room',
          messageAr: err.message || 'تعذر الانضمام إلى الغرفة'
        });
      }
    });

    // Leave Room
    socket.on(SOCKET_EVENTS.LEAVE_ROOM, ({ roomId }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) return;

        socket.leave(`room:${room.id}`);
        socketRoomMap.delete(socket.id);

        const removed = room.removePlayer(user.id);
        if (removed) {
          io.to(`room:${room.id}`).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
            id: `sys_${Date.now()}_${Math.random()}`,
            isSystem: true,
            messageEn: `${user.username} left the room`,
            messageAr: `غادر ${user.username} الغرفة`,
            timestamp: Date.now()
          });

          if (room.players.length === 0) {
            rooms.closeRoom(room.id);
          } else {
            broadcastRoomState(room);
          }
        }

        socket.emit(SOCKET_EVENTS.ROOM_CLOSED, { reason: 'You left the room' });
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Start Game (Host only)
    socket.on(SOCKET_EVENTS.START_GAME, ({ roomId }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');

        const EngineClass = GAME_ENGINES[room.gameType];
        if (!EngineClass) throw new Error('Game engine not available');

        room.startGame(user.id, EngineClass);

        io.to(`room:${room.id}`).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
          id: `sys_${Date.now()}_${Math.random()}`,
          isSystem: true,
          messageEn: 'The game has started!',
          messageAr: 'بدأت اللعبة!',
          timestamp: Date.now()
        });

        broadcastRoomState(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Restart Game (Host only)
    socket.on(SOCKET_EVENTS.RESTART_GAME, ({ roomId }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');

        const EngineClass = GAME_ENGINES[room.gameType];
        room.restartGame(user.id, EngineClass);

        io.to(`room:${room.id}`).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
          id: `sys_${Date.now()}_${Math.random()}`,
          isSystem: true,
          messageEn: 'Game restarted by host',
          messageAr: 'تمت إعادة بدء اللعبة بواسطة المضيف',
          timestamp: Date.now()
        });

        broadcastRoomState(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Update Settings & Rules (Host only)
    socket.on(SOCKET_EVENTS.UPDATE_SETTINGS, ({ roomId, settings, rules }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');

        room.updateSettings(user.id, settings, rules);
        broadcastRoomState(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Kick Player (Host only)
    socket.on(SOCKET_EVENTS.KICK_PLAYER, ({ roomId, targetUserId }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');

        const kicked = room.kickPlayer(user.id, targetUserId);
        if (kicked) {
          const kickedSockets = userSockets.get(targetUserId);
          if (kickedSockets) {
            for (const sId of kickedSockets) {
              io.to(sId).emit(SOCKET_EVENTS.NOTIFICATION, {
                messageEn: 'You have been kicked by the host',
                messageAr: 'تم طردك من الغرفة بواسطة المضيف'
              });
              io.to(sId).emit(SOCKET_EVENTS.ROOM_CLOSED, { reason: 'Kicked' });
            }
          }

          io.to(`room:${room.id}`).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
            id: `sys_${Date.now()}_${Math.random()}`,
            isSystem: true,
            messageEn: `${kicked.username} was kicked from the room`,
            messageAr: `تم طرد ${kicked.username} من الغرفة`,
            timestamp: Date.now()
          });

          broadcastRoomState(room);
        }
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Transfer Host
    socket.on(SOCKET_EVENTS.TRANSFER_HOST, ({ roomId, targetUserId }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');
        if (room.hostId !== user.id) throw new Error('Only current host can transfer host');

        room.transferHost(targetUserId);
        broadcastRoomState(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Update Player Skin (Phase 5)
    socket.on('player:skin:update', async ({ gameType, skin }) => {
      try {
        // Save to DB
        const profile = users.getUserProfile(user.id);
        const prefs = profile.preferences || {};
        prefs.gameSkins = prefs.gameSkins || {};
        prefs.gameSkins[gameType] = skin;
        users.updateProfile(user.id, { preferences: prefs });

        // Update in-memory user reference
        user.preferences = prefs;

        // Broadcast to current room
        const roomId = socketRoomMap.get(socket.id);
        if (roomId) {
          const room = rooms.getRoomById(roomId);
          if (room) {
             io.to(`room:${room.id}`).emit('player:skin:updated', {
               playerId: user.id,
               gameType,
               skin,
               username: user.username,
               avatar: user.avatar
             });
             broadcastRoomState(room); // Optional, if state relies on it
          }
        }
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: 'خطأ في تحديث الشكل' });
      }
    });

    // Game Action (Server Authoritative)
    socket.on(SOCKET_EVENTS.GAME_ACTION, ({ roomId, action }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');
        if (!room.gameInstance) throw new Error('No game is currently active');

        const result = room.gameInstance.handleAction(user.id, action);

        // Check if match ended and record stats & match result
        const game = room.gameInstance;
        if (game.status === 'GAME_OVER' || game.status === 'MATCH_END' || game.status === 'FINISHED') {
          room.status = ROOM_STATUS.FINISHED;
          database.updateRoomStatus(room.id, ROOM_STATUS.FINISHED);

          try {
            database.recordMatchResult({
              gameId: game.gameId || `g_${Date.now()}`,
              roomId: room.id,
              gameType: room.gameType,
              players: room.players.map(p => ({ id: p.id, username: p.username })),
              winner: game.winner,
              loser: game.loser,
              draw: Boolean(game.draw),
              reason: game.reason || 'NORMAL_FINISH',
              scores: game.scores || {},
              startedAt: game.startedAt || Date.now(),
              endedAt: game.endedAt || Date.now()
            });

            const winnerName = game.winner;
            for (const p of room.players) {
              const won = (p.username === winnerName);
              const pScore = (game.scores && (game.scores[p.id] || game.scores[p.username])) || 0;
              database.recordGameStat(p.id, room.gameType, won, pScore);
            }
          } catch (dbErr) {
            console.error('Failed to record match stats:', dbErr);
          }
        }

        broadcastRoomState(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          messageEn: err.message || 'Illegal move',
          messageAr: err.message || 'حركة غير قانونية'
        });
      }
    });

    // Rematch Consensus Voting
    socket.on(SOCKET_EVENTS.VOTE_REMATCH, ({ roomId }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');

        const voteResult = room.voteRematch(user.id);

        io.to(`room:${room.id}`).emit(SOCKET_EVENTS.REMATCH_UPDATE, {
          votedCount: voteResult.votedCount,
          totalNeeded: voteResult.totalNeeded,
          votedPlayers: Array.from(room.rematchVotes),
          userWhoVoted: user.username
        });

        io.to(`room:${room.id}`).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
          id: `sys_${Date.now()}_${Math.random()}`,
          isSystem: true,
          messageEn: `${user.username} is ready for a rematch (${voteResult.votedCount}/${voteResult.totalNeeded})`,
          messageAr: `${user.username} جاهز لإعادة المباراة (${voteResult.votedCount}/${voteResult.totalNeeded})`,
          timestamp: Date.now()
        });

        if (voteResult.ready) {
          const EngineClass = GAME_ENGINES[room.gameType];
          if (EngineClass) {
            room.startNextGame(EngineClass);

            io.to(`room:${room.id}`).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
              id: `sys_${Date.now()}_${Math.random()}`,
              isSystem: true,
              messageEn: 'All players agreed! New match has started.',
              messageAr: 'وافق جميع اللاعبين! بدأت مباراة جديدة.',
              timestamp: Date.now()
            });
          }
        }

        broadcastRoomState(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Next Round Trigger
    socket.on(SOCKET_EVENTS.NEXT_ROUND, ({ roomId }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');
        if (!room.gameInstance) throw new Error('No game is currently active');

        if (typeof room.gameInstance.startNextRound === 'function') {
          room.gameInstance.startNextRound();
        } else {
          room.gameInstance.handleAction(user.id, { type: 'NEXT_ROUND' });
        }

        broadcastRoomState(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Chat Message
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, ({ roomId, message }) => {
      try {
        const cleanMessage = sanitizeChatMessage(message);
        if (!cleanMessage) return;

        const chatObj = {
          id: `msg_${Date.now()}_${Math.random()}`,
          roomId,
          userId: user.id,
          username: user.username,
          avatar: user.avatar,
          message: cleanMessage,
          timestamp: Date.now()
        };

        database.saveChatMessage(chatObj);
        io.to(`room:${roomId}`).emit(SOCKET_EVENTS.CHAT_BROADCAST, chatObj);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: 'Failed to send chat', messageAr: 'تعذر إرسال المحادثة' });
      }
    });

    // Reconnection Request
    socket.on(SOCKET_EVENTS.RECONNECT, ({ roomId }) => {
      const room = rooms.getRoomById(roomId);
      if (room) {
        room.markPlayerConnected(user.id, true);
        socket.join(`room:${room.id}`);
        socketRoomMap.set(socket.id, room.id);
        socket.emit(SOCKET_EVENTS.ROOM_STATE, room.getStateForPlayer(user.id));
      }
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
      const uSockets = userSockets.get(user.id);
      if (uSockets) {
        uSockets.delete(socket.id);
        if (uSockets.size === 0) {
          userSockets.delete(user.id);
        }
      }

      const roomId = socketRoomMap.get(socket.id);
      if (roomId) {
        socketRoomMap.delete(socket.id);
        const room = rooms.getRoomById(roomId);
        if (room) {
          // Check if user has no other active sockets
          if (!userSockets.has(user.id)) {
            room.markPlayerConnected(user.id, false);
            broadcastRoomState(room);
          }
        }
      }
    });
  });

  return io;
}

export default setupSocketServer;
