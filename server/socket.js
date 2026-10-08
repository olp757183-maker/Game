/**
 * Socket.IO Multiplayer Real-Time Server
 * Manages connections, rooms, turns, chat, and server-authoritative state distribution.
 */

import { Server } from 'socket.io';
import auth from './auth.js';
import users from './users.js';
import rooms, { activeRooms } from './rooms.js';
import database from './database.js';
import { SOCKET_EVENTS, ROOM_STATUS, ERROR_CODES, GameActionError } from '../shared/constants.js';
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

// Map of actionId -> timestamp for idempotent deduplication
const processedActions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of processedActions.entries()) {
    if (now - ts > 60000) {
      processedActions.delete(key);
    }
  }
}, 30000);

// Global io instance reference
let ioInstance = null;

export function getIO() {
  return ioInstance;
}

/**
 * Broadcast full room and game state to each participant securely
 */
export function broadcastRoomState(room) {
  if (!room || !ioInstance) return;
  const channel = `room:${room.id}`;

  console.log(`[ROOM STATE BROADCAST] room=${room.id} code=${room.code} players=${room.players.length} status=${room.status}`);

  // Send personalized state to each active player in the room
  for (const player of room.players) {
    const playerSockets = userSockets.get(player.id);
    const personalizedState = room.getStateForPlayer(player.id);

    if (playerSockets && playerSockets.size > 0) {
      for (const sId of playerSockets) {
        ioInstance.to(sId).emit(SOCKET_EVENTS.ROOM_STATE, personalizedState);
        if (personalizedState.game) {
          ioInstance.to(sId).emit(SOCKET_EVENTS.GAME_STATE, personalizedState.game);
        }
      }
    }
  }

  // Also broadcast public room state to the room channel
  const publicState = {
    room: room.getPublicRoomInfo(),
    game: room.gameInstance ? (typeof room.gameInstance.getPublicState === 'function' ? room.gameInstance.getPublicState() : null) : null
  };
  ioInstance.to(channel).emit('room:public-state', publicState);
}

/**
 * Broadcast lobby notifications
 */
export function broadcastLobbyRoomCreated(room) {
  if (!ioInstance || !room) return;
  if (room.privacy === 'public' && room.status !== ROOM_STATUS.CLOSED) {
    ioInstance.emit(SOCKET_EVENTS.LOBBY_ROOM_CREATED, {
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

export function broadcastLobbyRoomUpdated(room) {
  if (!ioInstance || !room) return;
  ioInstance.emit(SOCKET_EVENTS.LOBBY_ROOM_UPDATED, {
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

export function broadcastLobbyRoomRemoved(roomId) {
  if (!ioInstance || !roomId) return;
  ioInstance.emit(SOCKET_EVENTS.LOBBY_ROOM_REMOVED, { id: roomId });
}

export function setupSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
    allowEIO3: true
  });

  ioInstance = io;

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
    console.log(`[SOCKET CONNECT] id=${socket.id} user=${user.username} (${user.id})`);

    // Track user socket
    if (!userSockets.has(user.id)) {
      userSockets.set(user.id, new Set());
    }
    userSockets.get(user.id).add(socket.id);

    // Join Room
    socket.on(SOCKET_EVENTS.JOIN_ROOM, ({ roomId, code }) => {
      try {
        console.log(`[ROOM JOIN] socket=${socket.id} user=${user.username} roomId=${roomId} code=${code}`);

        let room = null;
        if (roomId) {
          room = rooms.getRoomById(roomId);
        }
        if (!room && (code || roomId)) {
          room = rooms.getRoomByCode(code || roomId);
        }

        if (!room) {
          return socket.emit(SOCKET_EVENTS.ERROR, {
            code: 'ROOM_NOT_FOUND',
            messageEn: 'Room not found',
            messageAr: 'الغرفة غير موجودة'
          });
        }

        // Check if game in progress or locked
        const existingPlayer = room.players.find(p => p.id === user.id);
        if (room.status !== ROOM_STATUS.WAITING && !existingPlayer) {
          return socket.emit(SOCKET_EVENTS.ERROR, {
            code: 'ROOM_STARTED',
            messageEn: 'Game already in progress',
            messageAr: 'اللعبة بدأت بالفعل'
          });
        }

        if (room.locked && !existingPlayer) {
          return socket.emit(SOCKET_EVENTS.ERROR, {
            code: 'ROOM_LOCKED',
            messageEn: 'Room is locked',
            messageAr: 'الغرفة مغلقة'
          });
        }

        // Add or re-activate player in room
        const isHost = (room.hostId === user.id);
        const wasExisting = Boolean(existingPlayer);
        const wasDisconnected = existingPlayer && !existingPlayer.connected;
        const player = room.addPlayer(user, isHost);

        // Associate socket with unified Socket.IO room channel
        const channel = `room:${room.id}`;
        socket.join(channel);
        socketRoomMap.set(socket.id, room.id);

        // Send acknowledgement to the joining client
        socket.emit(SOCKET_EVENTS.ROOM_JOINED, {
          roomId: room.id,
          roomCode: room.code,
          player,
          isReconnect: wasExisting
        });

        // Notify other room members
        if (wasDisconnected) {
          socket.to(channel).emit(SOCKET_EVENTS.ROOM_PLAYER_RECONNECTED, {
            playerId: user.id,
            username: user.username
          });
        } else if (!wasExisting) {
          socket.to(channel).emit(SOCKET_EVENTS.ROOM_PLAYER_JOINED, {
            player,
            username: user.username
          });

          io.to(channel).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
            id: `sys_${Date.now()}_${Math.random()}`,
            isSystem: true,
            messageEn: `${user.username} joined the room`,
            messageAr: `انضم ${user.username} إلى الغرفة`,
            timestamp: Date.now()
          });
        }

        // Broadcast updated room state to all players
        broadcastRoomState(room);

        // Update lobby count
        broadcastLobbyRoomUpdated(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: 'JOIN_FAILED',
          messageEn: err.message || 'Failed to join room',
          messageAr: err.message || 'تعذر الانضمام إلى الغرفة'
        });
      }
    });

    // Leave Room
    socket.on(SOCKET_EVENTS.LEAVE_ROOM, ({ roomId }) => {
      try {
        console.log(`[ROOM LEAVE] socket=${socket.id} user=${user.username} roomId=${roomId}`);
        const targetRoomId = roomId || socketRoomMap.get(socket.id);
        const room = rooms.getRoomById(targetRoomId);
        if (!room) return;

        const channel = `room:${room.id}`;
        socket.leave(channel);
        socketRoomMap.delete(socket.id);

        const removed = room.removePlayer(user.id);
        if (removed) {
          io.to(channel).emit(SOCKET_EVENTS.ROOM_PLAYER_LEFT, {
            playerId: user.id,
            username: user.username
          });

          io.to(channel).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
            id: `sys_${Date.now()}_${Math.random()}`,
            isSystem: true,
            messageEn: `${user.username} left the room`,
            messageAr: `غادر ${user.username} الغرفة`,
            timestamp: Date.now()
          });

          if (room.players.length === 0) {
            rooms.closeRoom(room.id);
            broadcastLobbyRoomRemoved(room.id);
          } else {
            broadcastRoomState(room);
            broadcastLobbyRoomUpdated(room);
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
        console.log(`[GAME START] socket=${socket.id} user=${user.username} roomId=${roomId}`);
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');

        const EngineClass = GAME_ENGINES[room.gameType];
        if (!EngineClass) throw new Error('Game engine not available');

        room.startGame(user.id, EngineClass);
        const channel = `room:${room.id}`;

        io.to(channel).emit(SOCKET_EVENTS.ROOM_STARTED, { roomId: room.id });

        io.to(channel).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
          id: `sys_${Date.now()}_${Math.random()}`,
          isSystem: true,
          messageEn: 'The game has started!',
          messageAr: 'بدأت اللعبة!',
          timestamp: Date.now()
        });

        broadcastRoomState(room);
        broadcastLobbyRoomUpdated(room);
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
        const channel = `room:${room.id}`;

        io.to(channel).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
          id: `sys_${Date.now()}_${Math.random()}`,
          isSystem: true,
          messageEn: 'Game restarted by host',
          messageAr: 'تمت إعادة بدء اللعبة بواسطة المضيف',
          timestamp: Date.now()
        });

        broadcastRoomState(room);
        broadcastLobbyRoomUpdated(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Update Settings & Rules (Host only)
    socket.on(SOCKET_EVENTS.UPDATE_SETTINGS, ({ roomId, settings, rules }) => {
      try {
        console.log(`[ROOM SETTINGS] user=${user.username} roomId=${roomId}`);
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');

        room.updateSettings(user.id, settings, rules);
        const channel = `room:${room.id}`;

        io.to(channel).emit(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
          settings: room.settings,
          rules: room.rules
        });

        broadcastRoomState(room);
        broadcastLobbyRoomUpdated(room);
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

          const channel = `room:${room.id}`;
          io.to(channel).emit(SOCKET_EVENTS.ROOM_PLAYER_LEFT, {
            playerId: targetUserId,
            username: kicked.username,
            kicked: true
          });

          io.to(channel).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
            id: `sys_${Date.now()}_${Math.random()}`,
            isSystem: true,
            messageEn: `${kicked.username} was kicked from the room`,
            messageAr: `تم طرد ${kicked.username} من الغرفة`,
            timestamp: Date.now()
          });

          broadcastRoomState(room);
          broadcastLobbyRoomUpdated(room);
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
        broadcastLobbyRoomUpdated(room);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: err.message });
      }
    });

    // Update Player Skin
    socket.on('player:skin:update', async ({ gameType, skin }) => {
      try {
        console.log(`[SKIN UPDATE] user=${user.username} gameType=${gameType} skin=${skin}`);
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
            const player = room.players.find(p => p.id === user.id);
            if (player) {
              player.preferences = prefs;
            }

            const channel = `room:${room.id}`;
            io.to(channel).emit('player:skin-updated', {
              playerId: user.id,
              gameType,
              skin,
              username: user.username,
              avatar: user.avatar
            });
            broadcastRoomState(room);
          }
        }
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, { messageEn: err.message, messageAr: 'خطأ في تحديث الشكل' });
      }
    });

    // Game Action (Server Authoritative with Atomic Validation & Rollback)
    socket.on(SOCKET_EVENTS.GAME_ACTION, ({ roomId, action, actionId }) => {
      try {
        const effActionId = actionId || action?.actionId;

        // 1. Validate request payload shape
        if (!roomId || typeof roomId !== 'string' || !action || typeof action !== 'object' || !action.type) {
          socket.emit(SOCKET_EVENTS.GAME_ERROR, {
            code: ERROR_CODES.INVALID_ACTION,
            messageAr: 'بيانات الحركة غير صالحة',
            messageEn: 'Invalid action payload',
            actionId: effActionId,
            isPlayerError: true
          });
          return;
        }

        // 2. Validate Room
        const targetRoomId = roomId || socketRoomMap.get(socket.id);
        const room = rooms.getRoomById(targetRoomId);
        if (!room) {
          socket.emit(SOCKET_EVENTS.GAME_ERROR, {
            code: ERROR_CODES.ROOM_NOT_FOUND,
            messageAr: 'الغرفة غير موجودة',
            messageEn: 'Room not found',
            actionId: effActionId,
            isPlayerError: true
          });
          return;
        }

        // 3. Validate Player is member of Room
        const isPlayer = room.players.some(p => p.id === user.id);
        if (!isPlayer) {
          socket.emit(SOCKET_EVENTS.GAME_ERROR, {
            code: ERROR_CODES.PLAYER_NOT_IN_GAME,
            messageAr: 'أنت لست عضواً في هذه الغرفة',
            messageEn: 'Player not member of room',
            actionId: effActionId,
            isPlayerError: true
          });
          return;
        }

        // 4. Validate Game is Active
        if (!room.gameInstance || room.status !== ROOM_STATUS.PLAYING) {
          const isFinished = room.status === ROOM_STATUS.FINISHED || (room.gameInstance && (room.gameInstance.status === 'MATCH_END' || room.gameInstance.status === 'FINISHED' || room.gameInstance.status === 'GAME_OVER'));
          socket.emit(SOCKET_EVENTS.GAME_ERROR, {
            code: isFinished ? ERROR_CODES.GAME_ALREADY_FINISHED : ERROR_CODES.GAME_NOT_ACTIVE,
            messageAr: isFinished ? 'انتهت اللعبة بالفعل' : 'لا توجد مباراة نشطة حالياً',
            messageEn: isFinished ? 'Game already finished' : 'No game currently active',
            actionId: effActionId,
            isPlayerError: true
          });
          if (room.gameInstance) {
            socket.emit(SOCKET_EVENTS.GAME_STATE, room.gameInstance.getStateForPlayer(user.id));
          }
          return;
        }

        // 5. Deduplication check (Idempotency)
        const dupKey = effActionId ? `${room.id}:${user.id}:${effActionId}` : null;
        if (dupKey && processedActions.has(dupKey)) {
          console.log(`[GAME ACTION DUPLICATE IGNORED] key=${dupKey} user=${user.username}`);
          socket.emit(SOCKET_EVENTS.GAME_STATE, room.gameInstance.getStateForPlayer(user.id));
          return;
        }

        console.log(`[GAME ACTION] user=${user.username} roomId=${room.id} action=${action.type} id=${effActionId}`);

        // 6. Snapshot current game state before execution (Atomic Transaction)
        const snapshot = (typeof room.gameInstance.createSnapshot === 'function')
          ? room.gameInstance.createSnapshot()
          : null;

        try {
          // Execute authoritative game action
          const result = room.gameInstance.handleAction(user.id, action);

          // Mark actionId as processed successfully
          if (dupKey) {
            processedActions.set(dupKey, Date.now());
          }

          // Increment versions
          if (room.gameInstance) {
            room.gameInstance.version = (room.gameInstance.version || 0) + 1;
          }
          room.version++;

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
            broadcastLobbyRoomUpdated(room);
          }

          // Broadcast valid new state to ALL players in room
          broadcastRoomState(room);

        } catch (actionErr) {
          // ATOMIC ROLLBACK: Restore state snapshot so game state is pristine!
          if (snapshot && typeof room.gameInstance.restoreSnapshot === 'function') {
            room.gameInstance.restoreSnapshot(snapshot);
          }

          console.warn(`[GAME_ACTION_REJECTED] user=${user.username} action=${action?.type} code=${actionErr.code || 'ERR'} reason=${actionErr.message}`);

          const errorCode = actionErr.code || (
            (actionErr.message && (actionErr.message.includes('دورك') || actionErr.message.includes('حركتك')))
              ? ERROR_CODES.NOT_YOUR_TURN
              : ERROR_CODES.INVALID_MOVE
          );
          const messageAr = actionErr.messageAr || actionErr.message || 'هذه الحركة غير مسموحة';
          const messageEn = actionErr.messageEn || actionErr.message || 'Illegal move';

          const errPayload = {
            code: errorCode,
            messageAr,
            messageEn,
            actionId: effActionId,
            isPlayerError: true
          };

          // Emit GAME_ERROR & ERROR to THIS PLAYER'S SOCKET ONLY!
          // NEVER broadcast error to other players!
          socket.emit(SOCKET_EVENTS.GAME_ERROR, errPayload);
          socket.emit(SOCKET_EVENTS.ERROR, errPayload);

          // Resend current valid state to THIS player so their UI resynchronizes instantly without refresh!
          if (room.gameInstance) {
            socket.emit(SOCKET_EVENTS.GAME_STATE, room.gameInstance.getStateForPlayer(user.id));
          }
        }
      } catch (fatalErr) {
        console.error('[UNEXPECTED_GAME_ACTION_ERROR]', fatalErr);
        socket.emit(SOCKET_EVENTS.GAME_ERROR, {
          code: ERROR_CODES.INTERNAL_ERROR,
          messageAr: 'حدث خطأ في معالجة الحركة',
          messageEn: 'Internal error processing action',
          isPlayerError: true
        });
      }
    });

    // Sync Game State on demand
    socket.on(SOCKET_EVENTS.SYNC_STATE, ({ roomId }) => {
      try {
        const targetRoomId = roomId || socketRoomMap.get(socket.id);
        if (!targetRoomId) return;
        const room = rooms.getRoomById(targetRoomId);
        if (room) {
          console.log(`[SYNC STATE REQUEST] user=${user.username} roomId=${room.id} rev=${room.version}`);
          const pState = room.getStateForPlayer(user.id);
          socket.emit(SOCKET_EVENTS.ROOM_STATE, pState);
          if (pState.game) {
            socket.emit(SOCKET_EVENTS.GAME_STATE, pState.game);
          }
        }
      } catch (err) {
        console.error('[SYNC ERROR]:', err);
      }
    });

    // Rematch Consensus Voting
    socket.on(SOCKET_EVENTS.VOTE_REMATCH, ({ roomId }) => {
      try {
        const room = rooms.getRoomById(roomId);
        if (!room) throw new Error('Room not found');

        const voteResult = room.voteRematch(user.id);
        const channel = `room:${room.id}`;

        io.to(channel).emit(SOCKET_EVENTS.REMATCH_UPDATE, {
          votedCount: voteResult.votedCount,
          totalNeeded: voteResult.totalNeeded,
          votedPlayers: Array.from(room.rematchVotes),
          userWhoVoted: user.username
        });

        io.to(channel).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
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

            io.to(channel).emit(SOCKET_EVENTS.CHAT_BROADCAST, {
              id: `sys_${Date.now()}_${Math.random()}`,
              isSystem: true,
              messageEn: 'All players agreed! New match has started.',
              messageAr: 'وافق جميع اللاعبين! بدأت مباراة جديدة.',
              timestamp: Date.now()
            });
          }
        }

        broadcastRoomState(room);
        broadcastLobbyRoomUpdated(room);
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
      console.log(`[USER RECONNECT] socket=${socket.id} user=${user.username} roomId=${roomId}`);
      const room = rooms.getRoomById(roomId);
      if (room) {
        room.clearDisconnectTimer(user.id);
        room.markPlayerConnected(user.id, true);
        const channel = `room:${room.id}`;
        socket.join(channel);
        socketRoomMap.set(socket.id, room.id);

        socket.to(channel).emit(SOCKET_EVENTS.ROOM_PLAYER_RECONNECTED, {
          playerId: user.id,
          username: user.username
        });

        const pState = room.getStateForPlayer(user.id);
        socket.emit(SOCKET_EVENTS.ROOM_STATE, pState);
        if (pState.game) {
          socket.emit(SOCKET_EVENTS.GAME_STATE, pState.game);
        }

        broadcastRoomState(room);
        broadcastLobbyRoomUpdated(room);
      }
    });

    // Disconnect Handler
    socket.on('disconnect', (reason) => {
      console.log(`[SOCKET DISCONNECT] socket=${socket.id} user=${user.username} reason=${reason}`);
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
          // Check if user has no remaining active sockets
          if (!userSockets.has(user.id)) {
            room.markPlayerConnected(user.id, false);
            const channel = `room:${room.id}`;

            io.to(channel).emit(SOCKET_EVENTS.ROOM_PLAYER_LEFT, {
              playerId: user.id,
              username: user.username,
              disconnected: true
            });

            broadcastRoomState(room);
            broadcastLobbyRoomUpdated(room);

            if (room.status === ROOM_STATUS.WAITING) {
              // Wait 6 seconds before removing player from waiting room
              room.clearDisconnectTimer(user.id);
              const timer = setTimeout(() => {
                room.clearDisconnectTimer(user.id);
                if (!userSockets.has(user.id) && room.status === ROOM_STATUS.WAITING) {
                  const removed = room.removePlayer(user.id);
                  if (removed) {
                    console.log(`[ROOM TIMEOUT REMOVAL] user=${user.username} room=${room.id}`);
                    io.to(channel).emit(SOCKET_EVENTS.ROOM_PLAYER_LEFT, {
                      playerId: user.id,
                      username: user.username,
                      timedOut: true
                    });
                    if (room.players.length === 0) {
                      rooms.closeRoom(room.id);
                      broadcastLobbyRoomRemoved(room.id);
                    } else {
                      broadcastRoomState(room);
                      broadcastLobbyRoomUpdated(room);
                    }
                  }
                }
              }, 6000);
              room.disconnectTimers.set(user.id, timer);

            } else if (room.status === ROOM_STATUS.PLAYING) {
              // Grace period of 45 seconds for in-game reconnection
              io.to(channel).emit(SOCKET_EVENTS.DISCONNECT_WARNING, {
                playerId: user.id,
                username: user.username,
                timeoutSeconds: 45
              });

              room.clearDisconnectTimer(user.id);
              const timer = setTimeout(() => {
                room.clearDisconnectTimer(user.id);
                if (!userSockets.has(user.id) && room.status === ROOM_STATUS.PLAYING) {
                  console.log(`[GAME TIMEOUT FORFEIT] user=${user.username} room=${room.id}`);
                  if (room.gameInstance && typeof room.gameInstance.handlePlayerLeft === 'function') {
                    room.gameInstance.handlePlayerLeft(user.id);
                    if (['GAME_OVER', 'MATCH_END', 'FINISHED'].includes(room.gameInstance.status)) {
                      room.status = ROOM_STATUS.FINISHED;
                    }
                  }
                  broadcastRoomState(room);
                  broadcastLobbyRoomUpdated(room);
                }
              }, 45000);
              room.disconnectTimers.set(user.id, timer);
            }
          }
        }
      }
    });
  });

  return io;
}

export default setupSocketServer;
