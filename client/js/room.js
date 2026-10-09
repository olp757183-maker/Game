/**
 * Room Page Controller
 * Handles real-time room synchronization, game lifecycle, chat, and host controls.
 */

import api from './api.js';
import socket from './socket.js';
import ui from './ui.js';
import i18n from './language.js';
import { showToast, sfx, escapeHtml } from './utils.js';
import { SOCKET_EVENTS } from '../shared/constants.js';

// Game Clients
import UnoClient from '../games/uno/uno-client.js';
import ChessClient from '../games/chess/chess-client.js';
import DominoClient from '../games/domino/domino-client.js';

window.DEBUG_GAME = true;

// Prevent any unhandled error from causing browser reload or white-screen crash
window.addEventListener('error', (event) => {
  console.warn('[ROOM_CLIENT_ERROR]', event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.warn('[ROOM_UNHANDLED_REJECTION]', event.reason);
});

let currentRoomData = null;
let currentGameData = null;
let currentGameClient = null;
let activeGameType = null;
let latestRoomVersion = 0;
let latestGameVersion = 0;
let roomLoadTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
  ui.setupGlobalNav();

  // Ensure authenticated user exists
  let token = api.getToken();
  if (!token) {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    return;
  }

  // Get Room ID or Code from URL
  const urlParams = new URLSearchParams(window.location.search);
  let roomId = urlParams.get('id');
  let roomCode = urlParams.get('code');
  
  if (!roomId && !roomCode && window.location.pathname.startsWith('/room/')) {
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 3) {
      // Assuming /room/ID_OR_CODE
      roomCode = pathParts[2];
      roomId = pathParts[2]; // Can be either, server will resolve
    }
  }

  if (!roomId && !roomCode) {
    showToast('Invalid room URL', 'error');
    window.location.href = '/lobby.html';
    return;
  }

  // Fetch initial room info via HTTP API immediately so skeleton renders instantly
  try {
    const res = await api.getRoom(roomId || roomCode);
    if (res && res.room) {
      handleRoomState({ room: res.room });
    }
  } catch (err) {
    console.warn('[Room] HTTP initial fetch error:', err.message);
    if (err.status === 404 || (err.message && (err.message.includes('not found') || err.message.includes('غير موجودة')))) {
      const stage = document.getElementById('game-stage-container');
      if (stage) {
        stage.innerHTML = `
          <div class="waiting-screen">
            <h2 style="color: #ef4444;">⚠️ الغرفة غير موجودة</h2>
            <p style="margin: 1.25rem 0; font-size: 1.1rem;">لم يتم العثور على الغرفة المطلوبة، ربما تم إغلاقها أو أن الرمز غير صحيح.</p>
            <a href="/lobby.html" class="btn btn-primary btn-lg" style="margin-top: 1rem;">🚪 العودة لصالة الألعاب</a>
          </div>
        `;
      }
      return;
    }
  }

  // Safety timeout: If room state is not received within 10 seconds, show graceful error notice
  roomLoadTimeout = setTimeout(() => {
    if (!currentRoomData) {
      const stage = document.getElementById('game-stage-container');
      if (stage && !stage.querySelector('.room-load-error')) {
        stage.innerHTML = `
          <div class="waiting-screen room-load-error">
            <h2 style="color: #f59e0b;">⏳ استغرق تحميل الغرفة وقتاً طويلاً</h2>
            <p style="margin: 1.25rem 0; font-size: 1.05rem;">لم نتمكن من مزامنة بيانات الغرفة في الوقت المحدد. قد يكون هناك بطء في الاتصال.</p>
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1rem;">
              <button onclick="window.location.reload()" class="btn btn-primary">🔄 إعادة المحاولة</button>
              <a href="/lobby.html" class="btn btn-outline">🚪 العودة للصالة</a>
            </div>
          </div>
        `;
      }
    }
  }, 10000);

  // Setup Socket Events before connecting
  socket.on(SOCKET_EVENTS.ROOM_STATE, (data) => {
    handleRoomState(data);
  });

  socket.on(SOCKET_EVENTS.GAME_STATE, (gameData) => {
    if (!gameData) return;
    const user = api.getUser() || {};
    gameData.myPlayerId = gameData.myPlayerId || user.id;

    // Ensure Chess color is derived if missing
    if (currentRoomData && currentRoomData.gameType === 'chess' && (!gameData.myColor || gameData.myColor === 'spectator')) {
      const me = gameData.players?.find(p => p.id === gameData.myPlayerId);
      if (me && me.color) {
        gameData.myColor = me.color;
      }
    }

    // Preserve private fields from previous game data if incoming is partial
    if (currentGameData && currentGameData.gameId === gameData.gameId) {
      if ((!gameData.myHand || gameData.myHand.length === 0) && currentGameData.myHand && currentGameData.myHand.length > 0) {
        gameData.myHand = currentGameData.myHand;
      }
      if ((!gameData.myColor || gameData.myColor === 'spectator') && currentGameData.myColor && currentGameData.myColor !== 'spectator') {
        gameData.myColor = currentGameData.myColor;
      }
    }

    currentGameData = gameData;

    // Instantly initialize game client if stage exists and room is playing
    const stage = document.getElementById('game-stage-container');
    if (currentRoomData && currentRoomData.status === 'PLAYING' && stage) {
      if (!currentGameClient || activeGameType !== currentRoomData.gameType) {
        activeGameType = currentRoomData.gameType;
        currentGameClient = createGameClient(currentRoomData.gameType, stage, currentRoomData.id);
      }
    }

    if (currentRoomData && currentGameClient) {
      try {
        currentGameClient.update(gameData);
      } catch (err) {
        console.warn('[Room] Client update error on GAME_STATE:', err);
      }
    }

    if (currentRoomData) {
      const amHost = (currentRoomData.hostId === user.id);
      if (gameData.status === 'MATCH_END' || gameData.status === 'FINISHED' || gameData.status === 'GAME_OVER') {
        const existingRoundModal = document.getElementById('round-end-overlay');
        if (existingRoundModal) existingRoundModal.remove();
        showGameOverOverlay(currentRoomData, gameData, amHost, user.id);
      } else if (gameData.status === 'ROUND_END') {
        showRoundEndOverlay(currentRoomData, gameData, amHost, user.id);
      }
    }
  });

  socket.on('room:public-state', (data) => {
    if (data && data.room) {
      // Prioritize player's own personalized game state so public channel state does not strip private cards/color
      const effectiveGame = (currentGameData && (!data.game || data.game.gameId === currentGameData.gameId))
        ? currentGameData
        : (currentGameData || data.game || null);
      handleRoomState({ room: data.room, game: effectiveGame });
    }
  });

  socket.on(SOCKET_EVENTS.REMATCH_UPDATE, (data) => {
    console.log('[Room] Rematch update:', data);
    const overlay = document.getElementById('game-over-overlay');
    if (overlay && currentRoomData) {
      const rematchBtn = overlay.querySelector('#rematch-btn');
      if (rematchBtn) {
        const myId = api.getUser()?.id;
        const votes = data.votes || [];
        const hasVoted = votes.includes(myId) || rematchBtn.classList.contains('btn-secondary');
        const count = data.votedCount !== undefined ? data.votedCount : votes.length;
        const total = data.totalNeeded || currentRoomData.players.length;
        rematchBtn.textContent = hasVoted
          ? `⏳ في انتظار بقية اللاعبين (${count} / ${total})`
          : `🔄 إعادة المباراة (${count} / ${total})`;
        if (hasVoted) {
          rematchBtn.disabled = true;
          rematchBtn.classList.add('btn-secondary');
          rematchBtn.classList.remove('btn-primary');
        }
      }
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_JOINED, (data) => {
    console.log('[Room] room:joined received:', data);
    if (data && data.roomId) {
      if (currentRoomData) {
        currentRoomData.id = data.roomId;
        currentRoomData.code = data.roomCode;
      }
    }
  });

  socket.on(SOCKET_EVENTS.ROOM_PLAYER_JOINED, (data) => {
    console.log('[Room] Player joined:', data);
    sfx.click();
    showToast(i18n.getLanguage() === 'ar' ? `انضم ${data.username} إلى الغرفة` : `${data.username} joined the room`, 'info');
  });

  socket.on(SOCKET_EVENTS.ROOM_PLAYER_RECONNECTED, (data) => {
    console.log('[Room] Player reconnected:', data);
    sfx.click();
    showToast(i18n.getLanguage() === 'ar' ? `عائد ${data.username} للاتصال` : `${data.username} reconnected`, 'info');
    socket.syncState(roomId || roomCode);
  });

  socket.on(SOCKET_EVENTS.DISCONNECT_WARNING, (data) => {
    console.log('[Room] Player disconnect warning:', data);
    showToast(i18n.getLanguage() === 'ar'
      ? `انقطع اتصال ${data.username}، في انتظار عودته (${data.timeoutSeconds} ثانية)`
      : `${data.username} disconnected (${data.timeoutSeconds}s grace period)`, 'warning');
  });

  socket.on(SOCKET_EVENTS.ROOM_PLAYER_LEFT, (data) => {
    console.log('[Room] Player left:', data);
    const msg = data.timedOut
      ? (i18n.getLanguage() === 'ar' ? `تم استبعاد ${data.username} لانتهاء مهلة الاتصال` : `${data.username} timed out`)
      : (i18n.getLanguage() === 'ar' ? `غادر ${data.username} الغرفة` : `${data.username} left the room`);
    showToast(msg, 'warning');
  });

  socket.on(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, (data) => {
    showToast(i18n.getLanguage() === 'ar' ? 'تم تحديث إعدادات الغرفة' : 'Room settings updated', 'info');
  });

  socket.on(SOCKET_EVENTS.ROOM_STARTED, () => {
    sfx.winFanfare();
    showToast(i18n.getLanguage() === 'ar' ? 'بدأت اللعبة!' : 'Game started!', 'success');
  });

  socket.on('player:skin-updated', (data) => {
    console.log('[Room] Skin updated for player:', data);
    if (currentRoomData && currentRoomData.players) {
      const p = currentRoomData.players.find(x => x.id === data.playerId);
      if (p) {
        p.preferences = p.preferences || {};
        p.preferences.gameSkins = p.preferences.gameSkins || {};
        p.preferences.gameSkins[data.gameType] = data.skin;
        handleRoomState({ room: currentRoomData });
      }
    }
  });

  socket.on(SOCKET_EVENTS.CHAT_BROADCAST, (chatObj) => {
    appendChatMessage(chatObj);
  });

  socket.on('connect', () => {
    console.log('[Room] Socket reconnected, syncing state...');
    if (roomId || roomCode) {
      socket.syncState(roomId || roomCode);
    }
  });

  socket.on('disconnect', () => {
    console.warn('[Room] Socket disconnected, waiting for reconnection...');
  });

  socket.on(SOCKET_EVENTS.GAME_ERROR, (err) => {
    console.warn('[Room] Game action error for player:', err);
    if (currentGameClient && typeof currentGameClient.handleActionError === 'function') {
      try {
        currentGameClient.handleActionError(err);
      } catch (clientErr) {
        console.error('[Room] Client error during handleActionError:', clientErr);
      }
    }
  });

  socket.on('room:error', (err) => {
    if (err && err.isPlayerError) return; // Ignore player move errors here
    console.error('[Room] Room error received:', err);
    const msg = i18n.getLanguage() === 'ar' ? (err.messageAr || err.messageEn || err.message) : (err.messageEn || err.messageAr || err.message);

    if (err.code === 'ROOM_NOT_FOUND' || err.code === 'ROOM_FULL') {
      const stage = document.getElementById('game-stage-container');
      if (stage) {
        stage.innerHTML = `
          <div class="waiting-screen">
            <h2 style="color: #ef4444;">⚠️ ${escapeHtml(msg || 'خطأ')}</h2>
            <p style="margin: 1.25rem 0; font-size: 1.1rem;">${i18n.getLanguage() === 'ar' ? 'تعذر الدخول إلى هذه الغرفة.' : 'Unable to join this room.'}</p>
            <a href="/lobby.html" class="btn btn-primary btn-lg" style="margin-top: 1rem;">🚪 ${i18n.getLanguage() === 'ar' ? 'العودة لصالة الألعاب' : 'Back to Lobby'}</a>
          </div>
        `;
      }
    }
  });

  // Connect socket and join room
  try {
    await socket.connect();
  } catch (err) {
    console.warn('[Room] Socket connect warning:', err.message);
  }

  socket.joinRoom(roomId, roomCode);

  // Setup DOM Event Listeners
  setupRoomDomListeners();
});

function handleRoomState(data) {
  const { room, game, isHost: serverIsHost, myPlayerId, version, gameStateVersion } = data;
  if (!room) return;

  if (roomLoadTimeout) {
    clearTimeout(roomLoadTimeout);
    roomLoadTimeout = null;
  }

  if (version !== undefined && latestRoomVersion > 0 && version < latestRoomVersion) {
    console.log(`[Room] Stale packet ignored: rev=${version} current=${latestRoomVersion}`);
    return;
  }
  if (version) latestRoomVersion = version;
  if (gameStateVersion) latestGameVersion = gameStateVersion;

  currentRoomData = room;
  if (game) {
    // If incoming game packet lacks private fields (e.g. from public broadcast), preserve them!
    if (currentGameData && (currentGameData.gameId === game.gameId || !game.gameId)) {
      if ((!game.myHand || game.myHand.length === 0) && currentGameData.myHand && currentGameData.myHand.length > 0) {
        game.myHand = currentGameData.myHand;
      }
      if ((!game.myColor || game.myColor === 'spectator') && currentGameData.myColor && currentGameData.myColor !== 'spectator') {
        game.myColor = currentGameData.myColor;
      }
      if (!game.myPlayerId && currentGameData.myPlayerId) {
        game.myPlayerId = currentGameData.myPlayerId;
      }
    }
    currentGameData = game;
  }
  const effectiveGame = game || currentGameData || null;

  const user = api.getUser() || {};
  const amHost = (serverIsHost !== undefined) ? serverIsHost : (room.hostId === user.id);
  const myId = myPlayerId || user.id;

  // Ensure effectiveGame has all essential player-specific identifiers
  if (effectiveGame) {
    effectiveGame.myPlayerId = effectiveGame.myPlayerId || myId;

    if (room.gameType === 'chess') {
      if (!effectiveGame.myColor || effectiveGame.myColor === 'spectator') {
        const me = effectiveGame.players?.find(p => p.id === myId);
        if (me && me.color) {
          effectiveGame.myColor = me.color;
        }
      }
    } else if (room.gameType === 'uno' || room.gameType === 'domino') {
      if (!Array.isArray(effectiveGame.myHand)) {
        effectiveGame.myHand = (currentGameData?.myHand && Array.isArray(currentGameData.myHand)) ? currentGameData.myHand : [];
      }
    }
  }

  if (window.DEBUG_GAME) {
    console.log('[GAME STATE UPDATE]');
    console.log('Room:', room.id, 'Code:', room.code, 'Players:', room.players?.length);
    console.log('Game:', effectiveGame);
  }


  // Update Room Header
  updateRoomHeader(room, amHost);

  // Update Players Sidebar
  updatePlayersSidebar(room.players, room.hostId, myId);

  // Stage container
  const stage = document.getElementById('game-stage-container');
  if (!stage) return;

  const existingOverlay = document.getElementById('game-over-overlay');
  const existingRoundModal = document.getElementById('round-end-overlay');

  const isGameOver = room.status === 'FINISHED' || (effectiveGame && (effectiveGame.status === 'MATCH_END' || effectiveGame.status === 'FINISHED' || effectiveGame.status === 'GAME_OVER'));
  const isRoundOver = !isGameOver && effectiveGame && effectiveGame.status === 'ROUND_END';

  if (room.status === 'WAITING') {
    if (existingOverlay) existingOverlay.remove();
    if (existingRoundModal) existingRoundModal.remove();
    renderWaitingLobby(stage, room, amHost);
    currentGameClient = null;
    currentGameData = null;
  } else if (isGameOver) {
    if (existingRoundModal) existingRoundModal.remove();

    if (!currentGameClient || activeGameType !== room.gameType) {
      activeGameType = room.gameType;
      currentGameClient = createGameClient(room.gameType, stage, room.id);
    }
    if (currentGameClient && effectiveGame) {
      try {
        effectiveGame.myPlayerId = myId;
        currentGameClient.update(effectiveGame);
      } catch (renderErr) {
        console.warn('Game client final render error:', renderErr);
      }
    }
    showGameOverOverlay(room, effectiveGame, amHost, myId);
  } else if (isRoundOver) {
    if (existingOverlay) existingOverlay.remove();

    if (!currentGameClient || activeGameType !== room.gameType) {
      activeGameType = room.gameType;
      currentGameClient = createGameClient(room.gameType, stage, room.id);
    }
    if (currentGameClient && effectiveGame) {
      try {
        effectiveGame.myPlayerId = myId;
        currentGameClient.update(effectiveGame);
      } catch (renderErr) {
        console.warn('Game client round end render error:', renderErr);
      }
    }
    showRoundEndOverlay(room, effectiveGame, amHost, myId);
  } else if (room.status === 'PLAYING') {
    if (existingOverlay) existingOverlay.remove();
    if (existingRoundModal) existingRoundModal.remove();

    if (!currentGameClient || activeGameType !== room.gameType) {
      activeGameType = room.gameType;
      currentGameClient = createGameClient(room.gameType, stage, room.id);
    }

    if (currentGameClient && effectiveGame) {
      try {
        effectiveGame.myPlayerId = myId;
        currentGameClient.update(effectiveGame);
      } catch (renderErr) {
        console.error('[Room] Game client render caught error:', renderErr);
        setTimeout(() => {
          socket.syncState(room.id);
        }, 500);
      }
    }
  }
}

function createGameClient(gameType, container, roomId) {
  switch (gameType) {
    case 'uno': return new UnoClient(container, roomId);
    case 'chess': return new ChessClient(container, roomId);
    case 'domino': return new DominoClient(container, roomId);
    default: return null;
  }
}

function updateRoomHeader(room, amHost) {
  const codeEl = document.getElementById('room-code-display');
  if (codeEl) codeEl.textContent = room.code;

  const titleEl = document.getElementById('room-game-title');
  if (titleEl) titleEl.textContent = `${room.gameType.toUpperCase()} — ${room.players.length}/${room.maxPlayers}`;

  const hostCrown = document.getElementById('room-host-badge');
  if (hostCrown) {
    hostCrown.style.display = amHost ? 'inline-block' : 'none';
  }
}

function renderWaitingLobby(stage, room, isHost) {
  // Deduplicate players by unique ID
  const uniqueMap = new Map();
  (room.players || []).forEach(p => {
    if (p && p.id && !uniqueMap.has(p.id)) {
      uniqueMap.set(p.id, p);
    }
  });
  const uniquePlayers = Array.from(uniqueMap.values());

  const slots = [];
  for (let i = 0; i < room.maxPlayers; i++) {
    const player = uniquePlayers[i];
    if (player) {
      slots.push(`
        <div class="waiting-player-slot occupied ${player.connected ? '' : 'slot-disconnected'}">
          <div class="avatar-badge ${player.avatar || 'avatar1'}"></div>
          <span class="user-name">${escapeHtml(player.username)}</span>
          ${player.isHost ? '<span class="badge badge-info" data-i18n="hostBadge">Host</span>' : ''}
          ${!player.connected ? '<span class="badge badge-warning" style="font-size: 0.7rem; margin-inline-start: 4px;">قطع الاتصال</span>' : ''}
        </div>
      `);
    } else {
      slots.push(`
        <div class="waiting-player-slot">
          <span style="font-size: 1.6rem; opacity: 0.4;">👤</span>
          <span class="text-muted" style="font-size: 0.85rem;">Empty Slot</span>
        </div>
      `);
    }
  }

  const canStart = isHost && uniquePlayers.length >= room.minPlayers;

  stage.innerHTML = `
    <div class="waiting-screen">
      <h2 data-i18n="waitingForPlayers">${i18n.t('waitingForPlayers')}</h2>
      <p style="margin: 0.75rem 0;">Room Code: <strong style="color: var(--accent); font-size: 1.3rem; font-family: monospace; letter-spacing: 1px;">${room.code}</strong></p>

      <div class="waiting-players-grid">
        ${slots.join('')}
      </div>

      <div class="waiting-actions">
        ${isHost ? `
          <button id="start-game-btn" class="btn btn-lg btn-primary" ${!canStart ? 'disabled' : ''} style="${canStart ? 'box-shadow: 0 0 20px rgba(16, 185, 129, 0.6); background: #10b981;' : ''}">
            🚀 ${i18n.t('startGameBtn')} (${uniquePlayers.length}/${room.minPlayers} ${uniquePlayers.length >= room.minPlayers ? 'جاهز!' : 'مطلوب'})
          </button>
        ` : `
          <div class="turn-status-banner">🕒 في انتظار المضيف لبدء اللعبة... (${uniquePlayers.length}/${room.minPlayers})</div>
        `}
      </div>
    </div>
  `;

  const startBtn = stage.querySelector('#start-game-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      sfx.winFanfare();
      socket.startGame(room.id);
    });
  }
}

function showRoundEndOverlay(room, game, isHost, myId) {
  let overlay = document.getElementById('round-end-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'round-end-overlay';
    overlay.className = 'modal-backdrop active';
    document.body.appendChild(overlay);
  }

  const roundNum = game.round || game.roundNumber || 1;
  const reason = game.reason || '';
  const winner = game.roundWinner || game.winner || null;
  const points = game.roundPointsAwarded || 0;

  overlay.innerHTML = `
    <div class="modal-box text-center" style="text-align: center; padding: 2rem; max-width: 440px;">
      <h3 style="color: var(--accent); margin-bottom: 0.5rem;">🎉 نهاية الجولة ${roundNum}</h3>
      ${winner ? `<p style="font-size: 1.15rem; font-weight: 700; margin: 0.75rem 0;">الفائز بالجولة: <strong style="color: #10b981;">${escapeHtml(winner)}</strong></p>` : ''}
      ${points > 0 ? `<p style="color: var(--text-muted); font-size: 0.95rem;">النقاط المحتسبة: <strong>+${points}</strong></p>` : ''}
      ${reason ? `<p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem;">${escapeHtml(reason)}</p>` : ''}

      <div style="margin-top: 1.5rem; display: flex; justify-content: center; gap: 1rem;">
        ${isHost ? `
          <button id="next-round-btn" class="btn btn-primary btn-lg" style="box-shadow: 0 0 16px rgba(6, 182, 212, 0.6);">
            ▶ الجولة التالية
          </button>
        ` : `
          <div class="turn-status-banner">🕒 في انتظار المضيف لبدء الجولة التالية...</div>
        `}
      </div>
    </div>
  `;

  const nextBtn = overlay.querySelector('#next-round-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      sfx.click();
      socket.nextRound(room.id);
    });
  }
}

function showGameOverOverlay(room, game, isHost, myId) {
  let overlay = document.getElementById('game-over-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'game-over-overlay';
    overlay.className = 'modal-backdrop active';
    document.body.appendChild(overlay);
  }

  const user = api.getUser() || {};
  const currentUsername = user.username || '';
  const currentUserId = myId || user.id;

  const isDraw = Boolean(game?.draw);
  const winner = game?.winner;
  const winnerId = game?.winnerId;
  const loser = game?.loser;
  const loserId = game?.loserId;
  const winningTeam = game?.winningTeam;
  const reason = game?.finishReason || game?.reason;

  const myTeam = room?.players?.find(p => p.id === currentUserId)?.team;
  const amWinner = !isDraw && (
    (winnerId && winnerId === currentUserId) ||
    (winner && (winner === currentUsername || winner.includes(currentUsername))) ||
    (winningTeam !== undefined && winningTeam !== null && myTeam === winningTeam)
  );

  const amLoser = !isDraw && !amWinner && (
    (loserId && loserId === currentUserId) ||
    (loser && (loser === currentUsername || loser.includes(currentUsername))) ||
    (winningTeam !== undefined && winningTeam !== null && myTeam !== undefined && myTeam !== winningTeam)
  );

  if (!overlay.dataset.soundPlayed) {
    overlay.dataset.soundPlayed = 'true';
    if (amWinner) {
      sfx.winFanfare();
    } else if (isDraw) {
      sfx.click();
    } else {
      sfx.errorBuzz();
    }
  }

  // Rematch consensus state
  const rematchVotes = room.rematchVotes || [];
  const rematchNeeded = room.rematchNeeded || room.players.length;
  const hasVotedRematch = rematchVotes.includes(currentUserId);

  // Scores breakdown
  let scoresHtml = '';
  if (game?.scores && Object.keys(game.scores).length > 0) {
    scoresHtml = `
      <div style="margin: 1.25rem 0; padding: 0.75rem; background: rgba(0,0,0,0.25); border-radius: 8px;">
        <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem;">النقاط النهائية (Final Scores)</h4>
        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 0.8rem;">
          ${Object.entries(game.scores).map(([player, score]) => `
            <div style="padding: 0.4rem 0.85rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;">
              <span style="font-size: 0.9rem;">${escapeHtml(player)}:</span>
              <strong style="color: var(--accent); margin-inline-start: 4px;">${score}</strong>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  let statusHeader = '';
  let statusBanner = '';

  if (isDraw) {
    statusHeader = `
      <h1 style="font-size: 3.2rem; margin-bottom: 0.25rem;">🤝</h1>
      <h2 style="font-size: 1.6rem; margin-bottom: 0.5rem; color: #f59e0b; font-weight: 800;">انتهت المباراة بالتعادل (DRAW)</h2>
    `;
    statusBanner = `<p style="font-size: 1.15rem; font-weight: 700; color: #f59e0b; margin: 0.5rem 0;">تعادل الفريقان / اللاعبان</p>`;
  } else if (amWinner) {
    statusHeader = `
      <h1 style="font-size: 3.2rem; margin-bottom: 0.25rem;">🎉</h1>
      <h2 style="font-size: 1.6rem; margin-bottom: 0.5rem; color: #10b981; font-weight: 800;">مبروك! لقد فزت بالمباراة! (VICTORY)</h2>
    `;
    statusBanner = `
      <div class="winner-announcement-box" style="margin: 0.8rem 0; padding: 0.75rem; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 8px;">
        <p style="font-size: 1.3rem; font-weight: 800; color: #10b981; margin: 0.25rem 0;">
          🏆 أنت الفائز باللقاء!
        </p>
        ${loser ? `<p style="font-size: 0.95rem; color: var(--text-muted); margin: 0.2rem 0;">الخاسر: ${escapeHtml(loser)}</p>` : ''}
      </div>
    `;
  } else if (amLoser) {
    statusHeader = `
      <h1 style="font-size: 3.2rem; margin-bottom: 0.25rem;">💔</h1>
      <h2 style="font-size: 1.6rem; margin-bottom: 0.5rem; color: #ef4444; font-weight: 800;">حظاً أوفر في المرة القادمة (DEFEAT)</h2>
    `;
    statusBanner = `
      <div class="winner-announcement-box" style="margin: 0.8rem 0; padding: 0.75rem; background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; border-radius: 8px;">
        <p style="font-size: 1.2rem; font-weight: 800; color: #ef4444; margin: 0.25rem 0;">
          خسارة المباراة
        </p>
        ${winner ? `<p style="font-size: 1rem; color: #10b981; font-weight: 700; margin: 0.2rem 0;">الفائز: ${escapeHtml(winner)}</p>` : ''}
      </div>
    `;
  } else {
    // Spectator view
    statusHeader = `
      <h1 style="font-size: 3.2rem; margin-bottom: 0.25rem;">🏆</h1>
      <h2 style="font-size: 1.6rem; margin-bottom: 0.5rem; letter-spacing: 0.5px;">نهاية المباراة (GAME OVER)</h2>
    `;
    statusBanner = `
      <div class="winner-announcement-box" style="margin: 0.8rem 0;">
        ${winner ? `<p style="font-size: 1.3rem; font-weight: 800; color: #10b981; margin: 0.25rem 0;">🏆 الفائز: ${escapeHtml(winner)}</p>` : ''}
        ${loser ? `<p style="font-size: 1rem; font-weight: 600; color: #f87171; margin: 0.25rem 0;">الخاسر: ${escapeHtml(loser)}</p>` : ''}
      </div>
    `;
  }

  overlay.innerHTML = `
    <div class="modal-box text-center winner-fanfare-modal" style="text-align: center; padding: 2.2rem; max-width: 490px;">
      ${statusHeader}
      ${statusBanner}

      ${reason ? `
        <div style="margin: 0.5rem 0; padding: 0.35rem 0.75rem; background: rgba(255,255,255,0.06); border-radius: 6px; display: inline-block;">
          <span style="color: var(--text-muted); font-size: 0.85rem;">سبب النهاية: </span>
          <strong style="color: var(--text-color); font-size: 0.85rem;">${escapeHtml(reason)}</strong>
        </div>
      ` : ''}

      ${scoresHtml}

      <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; align-items: center;">
        <button id="rematch-btn" class="btn ${hasVotedRematch ? 'btn-secondary' : 'btn-primary'} btn-lg" style="width: 100%; max-width: 320px;" ${hasVotedRematch ? 'disabled' : ''}>
          ${hasVotedRematch ? `⏳ في انتظار بقية اللاعبين (${rematchVotes.length} / ${rematchNeeded})` : `🔄 طلب إعادة المباراة (${rematchVotes.length} / ${rematchNeeded})`}
        </button>

        <button id="exit-to-lobby-btn" class="btn btn-outline" style="width: 100%; max-width: 320px;">
          🚪 العودة إلى صالة الألعاب
        </button>
      </div>
    </div>
  `;

  const rematchBtn = overlay.querySelector('#rematch-btn');
  if (rematchBtn && !hasVotedRematch) {
    rematchBtn.addEventListener('click', () => {
      sfx.click();
      socket.voteRematch(room.id);
    });
  }

  const exitBtn = overlay.querySelector('#exit-to-lobby-btn');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      overlay.remove();
      socket.leaveRoom(room.id);
      window.location.href = '/lobby.html';
    });
  }
}

function updatePlayersSidebar(players, hostId) {
  const container = document.getElementById('sidebar-players-container');
  if (!container || !players) return;

  const uniqueMap = new Map();
  players.forEach(p => {
    if (p && p.id && !uniqueMap.has(p.id)) {
      uniqueMap.set(p.id, p);
    }
  });
  const uniquePlayers = Array.from(uniqueMap.values());

  const currentUserId = api.getUser()?.id;
  const isCurrentUserHost = (currentUserId === hostId);

  container.innerHTML = uniquePlayers.map(p => `
    <div class="sidebar-player-item">
      <div class="player-item-meta">
        <span class="player-connection-dot ${p.connected ? '' : 'disconnected'}"></span>
        <div class="avatar-badge ${p.avatar || 'avatar1'}"></div>
        <div>
          <span class="user-name">${escapeHtml(p.username)}</span>
          ${p.id === hostId ? '<span class="badge badge-info">Host</span>' : ''}
        </div>
      </div>
      <div>
        ${isCurrentUserHost && p.id !== hostId ? `
          <button class="btn btn-xs btn-outline kick-btn" data-id="${p.id}" title="Kick Player">✕</button>
        ` : ''}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-id');
      if (confirm('Kick this player?')) {
        socket.kickPlayer(targetId, currentRoomData.id);
      }
    });
  });
}

function appendChatMessage(chatObj) {
  const container = document.getElementById('chat-messages-scroll');
  if (!container) return;

  const currentUserId = api.getUser()?.id;
  const isOwn = (chatObj.userId === currentUserId);

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isOwn ? 'own-message' : ''} ${chatObj.isSystem ? 'system-message' : ''}`;

  if (chatObj.isSystem) {
    const text = i18n.getLanguage() === 'ar' ? (chatObj.messageAr || chatObj.messageEn) : (chatObj.messageEn || chatObj.messageAr);
    bubble.textContent = `📢 ${text}`;
  } else {
    bubble.innerHTML = `
      <div class="chat-meta">
        <strong>${escapeHtml(chatObj.username)}</strong>
        <span>${new Date(chatObj.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div>${escapeHtml(chatObj.message)}</div>
    `;
  }

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;

  // If mobile and sidebar is not open, highlight sidebar button
  const sidebar = document.querySelector('.room-sidebar');
  const indicator = document.querySelector('.sidebar-unread-indicator');
  if (sidebar && !sidebar.classList.contains('mobile-open') && indicator) {
    indicator.classList.add('has-unread');
  }
}

function setupRoomDomListeners() {
  // Copy Code
  const copyBtn = document.getElementById('copy-room-code-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (currentRoomData?.code) {
        navigator.clipboard.writeText(currentRoomData.code);
        showToast(i18n.t('codeCopied'), 'success');
        sfx.click();
      }
    });
  }

  // Copy Link
  const copyLinkBtn = document.getElementById('copy-room-link-btn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      if (currentRoomData?.id) {
        const link = `${window.location.origin}/room/${currentRoomData.id}`;
        navigator.clipboard.writeText(link);
        showToast(i18n.getLanguage() === 'ar' ? 'تم نسخ الرابط' : 'Link copied', 'success');
        sfx.click();
      }
    });
  }

  // Leave Room
  const leaveBtn = document.getElementById('leave-room-btn');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      const confirmText = i18n.getLanguage() === 'ar' ? 'هل أنت متأكد من مغادرة الغرفة؟' : 'Are you sure you want to leave the room?';
      if (confirm(confirmText)) {
        if (roomLoadTimeout) {
          clearTimeout(roomLoadTimeout);
          roomLoadTimeout = null;
        }
        socket.leaveRoom();
        window.location.href = '/lobby.html';
      }
    });
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (roomLoadTimeout) {
      clearTimeout(roomLoadTimeout);
    }
    if (currentRoomData?.id) {
      socket.leaveRoom(currentRoomData.id);
    }
  });

  // Send Chat
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input-text');
  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text && currentRoomData) {
        socket.sendChatMessage(text, currentRoomData.id);
        chatInput.value = '';
      }
    });
  }

  // Sidebar Tab Switcher
  document.querySelectorAll('.sidebar-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.sidebar-tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sidebar-tab-panel').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const panel = document.getElementById(`panel-${target}`);
      if (panel) panel.classList.add('active');
    });
  });

  // Mobile Sidebar Toggle
  const mobileSidebarToggleBtn = document.getElementById('mobile-sidebar-toggle-btn');
  const sidebar = document.querySelector('.room-sidebar');
  if (mobileSidebarToggleBtn && sidebar) {
    mobileSidebarToggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      const isOpen = sidebar.classList.contains('mobile-open');
      mobileSidebarToggleBtn.classList.toggle('btn-primary', isOpen);
      mobileSidebarToggleBtn.classList.toggle('btn-outline', !isOpen);
      const indicator = document.querySelector('.sidebar-unread-indicator');
      if (isOpen && indicator) {
        indicator.classList.remove('has-unread');
      }
    });
  }
}
