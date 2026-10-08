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
import BalootClient from '../games/baloot/baloot-client.js';
import CardsClient from '../games/cards/cards-client.js';

window.DEBUG_GAME = true;

let currentRoomData = null;
let currentGameClient = null;
let activeGameType = null;

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
    console.log('[Room] HTTP initial fetch:', err.message);
  }

  // Setup Socket Events before connecting
  socket.on(SOCKET_EVENTS.ROOM_STATE, (data) => {
    handleRoomState(data);
  });

  socket.on('room:public-state', (data) => {
    if (data && data.room) {
      handleRoomState({ room: data.room, game: data.game });
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

  socket.on(SOCKET_EVENTS.ROOM_PLAYER_LEFT, (data) => {
    console.log('[Room] Player left:', data);
    showToast(i18n.getLanguage() === 'ar' ? `غادر ${data.username} الغرفة` : `${data.username} left the room`, 'warning');
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

  socket.on('room:error', (err) => {
    console.error('[Room] Room error received:', err);
    const msg = i18n.getLanguage() === 'ar' ? (err.messageAr || err.messageEn || err.message) : (err.messageEn || err.messageAr || err.message);
    showToast(msg || 'Room error', 'error');

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
  const { room, game, isHost: serverIsHost, myPlayerId } = data;
  if (!room) return;
  currentRoomData = room;

  if (window.DEBUG_GAME) {
    console.log('[GAME STATE UPDATE]');
    console.log('Room:', room.id, 'Code:', room.code, 'Players:', room.players?.length);
    console.log('Game:', game);
  }

  const user = api.getUser() || {};
  const amHost = (serverIsHost !== undefined) ? serverIsHost : (room.hostId === user.id);
  const myId = myPlayerId || user.id;

  // Update Room Header
  updateRoomHeader(room, amHost);

  // Update Players Sidebar
  updatePlayersSidebar(room.players, room.hostId, myId);

  // If status is WAITING: Render waiting lobby
  const stage = document.getElementById('game-stage-container');
  if (!stage) return;

  const existingOverlay = document.getElementById('game-over-overlay');
  const existingRoundModal = document.getElementById('round-end-overlay');

  if (room.status === 'WAITING') {
    if (existingOverlay) existingOverlay.remove();
    if (existingRoundModal) existingRoundModal.remove();
    renderWaitingLobby(stage, room, amHost);
    currentGameClient = null;
  } else if (room.status === 'PLAYING') {
    if (existingOverlay) existingOverlay.remove();

    // Mount or update Game Client
    if (!currentGameClient || activeGameType !== room.gameType) {
      activeGameType = room.gameType;
      currentGameClient = createGameClient(room.gameType, stage, room.id);
    }

    if (currentGameClient && game) {
      game.myPlayerId = myId;
      currentGameClient.update(game);
    }

    // Check if round or match ended
    if (game && game.status === 'ROUND_END') {
      showRoundEndOverlay(room, game, amHost, myId);
    } else if (game && (game.status === 'MATCH_END' || game.status === 'FINISHED' || game.status === 'GAME_OVER')) {
      if (existingRoundModal) existingRoundModal.remove();
      showGameOverOverlay(room, game, amHost, myId);
    } else {
      if (existingRoundModal) existingRoundModal.remove();
    }
  } else if (room.status === 'FINISHED') {
    if (existingRoundModal) existingRoundModal.remove();
    if (currentGameClient && game) {
      game.myPlayerId = myId;
      currentGameClient.update(game);
    }
    showGameOverOverlay(room, game, amHost, myId);
  }
}

function createGameClient(gameType, container, roomId) {
  switch (gameType) {
    case 'uno': return new UnoClient(container, roomId);
    case 'chess': return new ChessClient(container, roomId);
    case 'domino': return new DominoClient(container, roomId);
    case 'baloot': return new BalootClient(container, roomId);
    case 'cards': return new CardsClient(container, roomId);
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
        <div class="waiting-player-slot occupied">
          <div class="avatar-badge ${player.avatar || 'avatar1'}"></div>
          <span class="user-name">${escapeHtml(player.username)}</span>
          ${player.isHost ? '<span class="badge badge-info" data-i18n="hostBadge">Host</span>' : ''}
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

  const isDraw = Boolean(game?.draw);
  const winner = game?.winner;
  const reason = game?.reason;

  // Rematch consensus state
  const rematchVotes = room.rematchVotes || [];
  const rematchNeeded = room.rematchNeeded || room.players.length;
  const hasVotedRematch = rematchVotes.includes(myId);

  // Scores breakdown
  let scoresHtml = '';
  if (game?.scores && Object.keys(game.scores).length > 0) {
    scoresHtml = `
      <div style="margin: 1.25rem 0; padding: 0.75rem; background: rgba(0,0,0,0.25); border-radius: 8px;">
        <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem;">النقاط النهائية</h4>
        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem;">
          ${Object.entries(game.scores).map(([player, score]) => `
            <div style="padding: 0.4rem 0.8rem; background: rgba(255,255,255,0.05); border-radius: 6px;">
              <span style="font-size: 0.9rem;">${escapeHtml(player)}:</span>
              <strong style="color: var(--accent); margin-inline-start: 4px;">${score}</strong>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  overlay.innerHTML = `
    <div class="modal-box text-center" style="text-align: center; padding: 2.2rem; max-width: 480px;">
      <h1 style="font-size: 2.8rem; margin-bottom: 0.25rem;">
        ${isDraw ? '🤝' : '🏆'}
      </h1>
      <h2 style="font-size: 1.6rem; margin-bottom: 0.5rem;">
        ${isDraw ? 'GAME DRAW' : 'GAME OVER'}
      </h2>

      ${!isDraw && winner ? `
        <p style="font-size: 1.3rem; font-weight: 800; color: #10b981; margin: 0.75rem 0;">
          ${escapeHtml(winner)} Wins!
        </p>
      ` : `
        <p style="font-size: 1.2rem; font-weight: 700; color: var(--text-muted); margin: 0.75rem 0;">
          انتهت المباراة بالتعادل
        </p>
      `}

      ${reason ? `
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">
          السبب: ${escapeHtml(reason)}
        </p>
      ` : ''}

      ${scoresHtml}

      <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; align-items: center;">
        <button id="rematch-btn" class="btn ${hasVotedRematch ? 'btn-secondary' : 'btn-primary'} btn-lg" style="width: 100%; max-width: 320px;" ${hasVotedRematch ? 'disabled' : ''}>
          ${hasVotedRematch ? `⏳ في انتظار بقية اللاعبين (${rematchVotes.length} / ${rematchNeeded})` : `🔄 إعادة المباراة (${rematchVotes.length} / ${rematchNeeded})`}
        </button>

        <button id="exit-to-lobby-btn" class="btn btn-outline" style="width: 100%; max-width: 320px;">
          🚪 العودة إلى قائمة الغرف
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
      if (confirm('Leave room?')) {
        socket.leaveRoom();
        window.location.href = '/lobby.html';
      }
    });
  }

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
}
