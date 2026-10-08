/**
 * Lobby Controller
 * Handles room browsing, filters, create room modal with custom rules accordions,
 * player count grid, and join by code.
 */

import api from './api.js';
import ui from './ui.js';
import socket from './socket.js';
import i18n from './language.js';
import { showToast, sfx } from './utils.js';
import { getDefaultRules } from '../shared/rules.js';
import { SOCKET_EVENTS } from '../shared/constants.js';

let allRooms = [];
let activeGameFilter = 'all';

// Allowed players range per game
const GAME_PLAYERS_CONFIG = {
  uno: { min: 2, max: 8, options: [2, 3, 4, 6, 8], default: 4 },
  baloot: { min: 4, max: 4, options: [4], default: 4 },
  chess: { min: 2, max: 2, options: [2], default: 2 },
  domino: { min: 2, max: 4, options: [2, 3, 4], default: 4 },
  cards: { min: 2, max: 6, options: [2, 3, 4, 6], default: 4 }
};

document.addEventListener('DOMContentLoaded', async () => {
  ui.setupGlobalNav();

  // Ensure user is authenticated
  let token = api.getToken();
  if (!token) {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    return;
  }

  // Connect socket for real-time lobby synchronization
  socket.connect();

  socket.on(SOCKET_EVENTS.LOBBY_ROOM_CREATED, (newRoom) => {
    console.log('[Lobby] Real-time room created:', newRoom);
    const idx = allRooms.findIndex(r => r.id === newRoom.id || r.code === newRoom.code);
    if (idx >= 0) {
      allRooms[idx] = newRoom;
    } else {
      allRooms.unshift(newRoom);
    }
    renderRoomsTable();
  });

  socket.on(SOCKET_EVENTS.LOBBY_ROOM_UPDATED, (updatedRoom) => {
    console.log('[Lobby] Real-time room updated:', updatedRoom);
    const idx = allRooms.findIndex(r => r.id === updatedRoom.id || r.code === updatedRoom.code);
    if (idx >= 0) {
      allRooms[idx] = { ...allRooms[idx], ...updatedRoom };
    } else {
      allRooms.unshift(updatedRoom);
    }
    renderRoomsTable();
  });

  socket.on(SOCKET_EVENTS.LOBBY_ROOM_REMOVED, (data) => {
    const id = data?.id;
    console.log('[Lobby] Real-time room removed:', id);
    if (id) {
      allRooms = allRooms.filter(r => r.id !== id);
      renderRoomsTable();
    }
  });

  // Load and render initial open rooms
  await loadRooms();

  // Setup Event Listeners
  setupLobbyEvents();

  // Initial rules & player count setup
  const initGame = document.getElementById('create-room-game')?.value || 'uno';
  updatePlayerCountGrid(initGame);
  updateRulesEditorFields(initGame);
});

async function loadRooms() {
  try {
    allRooms = await api.getRooms();
    renderRoomsTable();
  } catch (err) {
    console.error('Failed to load rooms:', err);
  }
}

function renderRoomsTable() {
  const tbody = document.getElementById('rooms-table-body');
  const searchVal = document.getElementById('room-search-input')?.value.toLowerCase().trim() || '';

  if (!tbody) return;

  const filtered = allRooms.filter(r => {
    const matchesGame = (activeGameFilter === 'all' || r.gameType === activeGameFilter);
    const matchesSearch = (!searchVal || r.code.toLowerCase().includes(searchVal) || r.hostName.toLowerCase().includes(searchVal));
    return matchesGame && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-rooms-state" data-i18n="noRoomsFound">
          ${i18n.t('noRoomsFound')}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(room => `
    <tr>
      <td><span class="room-code-tag">${room.code}</span></td>
      <td><strong>${room.gameType.toUpperCase()}</strong></td>
      <td>${room.hostName}</td>
      <td>${room.players}</td>
      <td>
        <span class="status-indicator status-${room.status.toLowerCase()}">
          <span class="status-dot"></span>
          ${room.status}
        </span>
      </td>
      <td>
        <button class="btn btn-sm btn-primary join-room-btn" data-code="${room.code}">
          ${i18n.t('joinBtn')}
        </button>
      </td>
    </tr>
  `).join('');

  // Attach join clicks
  tbody.querySelectorAll('.join-room-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-code');
      joinRoomByCode(code);
    });
  });
}

function setupLobbyEvents() {
  // Game Shelf Selection
  document.querySelectorAll('.game-shelf-card').forEach(card => {
    card.addEventListener('click', () => {
      const game = card.getAttribute('data-game');
      document.querySelectorAll('.game-shelf-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      const gameSelect = document.getElementById('create-room-game');
      if (gameSelect) {
        gameSelect.value = game;
        updatePlayerCountGrid(game);
        updateRulesEditorFields(game);
      }
      ui.openModal('create-room-modal');
    });
  });

  // Filter Pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeGameFilter = pill.getAttribute('data-filter');
      renderRoomsTable();
    });
  });

  // Search Input
  const searchInput = document.getElementById('room-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderRoomsTable());
  }

  // Create Room Button
  const openCreateModalBtn = document.getElementById('open-create-room-btn');
  if (openCreateModalBtn) {
    openCreateModalBtn.addEventListener('click', () => {
      const selectedGame = document.getElementById('create-room-game')?.value || 'uno';
      updatePlayerCountGrid(selectedGame);
      updateRulesEditorFields(selectedGame);
      ui.openModal('create-room-modal');
    });
  }

  // Game select change inside create modal
  const gameSelect = document.getElementById('create-room-game');
  if (gameSelect) {
    gameSelect.addEventListener('change', (e) => {
      const g = e.target.value;
      updatePlayerCountGrid(g);
      updateRulesEditorFields(g);
    });
  }

  // Create Room Form Submit with disabled button state (Requirement 24)
  const createForm = document.getElementById('create-room-form');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = createForm.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : 'إنشاء الغرفة';

      const gameType = document.getElementById('create-room-game')?.value;
      const privacy = document.getElementById('create-room-privacy')?.value;
      const maxPlayers = parseInt(document.getElementById('create-room-max-players')?.value || '4', 10);
      const rules = collectRulesFromForm(gameType);

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ جاري إنشاء الغرفة...';
      }

      try {
        const res = await api.createRoom({ gameType, maxPlayers, privacy, rules });
        if (submitBtn) {
          submitBtn.textContent = '✅ تم إنشاء الغرفة!';
        }
        sfx.winFanfare();
        window.location.href = `/room/${res.room.id}`;
      } catch (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
        sfx.errorBuzz();
        showToast(err.message, 'error');
      }
    });
  }

  // Join Room by Code Modal & Button
  const openJoinModalBtn = document.getElementById('open-join-room-btn');
  if (openJoinModalBtn) {
    openJoinModalBtn.addEventListener('click', () => {
      ui.openModal('join-room-modal');
    });
  }

  const joinForm = document.getElementById('join-room-form');
  if (joinForm) {
    joinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('join-room-code-input')?.value.trim().toUpperCase();
      if (!code) return;
      joinRoomByCode(code);
    });
  }
}

async function joinRoomByCode(code) {
  try {
    const res = await api.joinRoom(code);
    window.location.href = `/room/${res.room.id}`;
  } catch (err) {
    sfx.errorBuzz();
    showToast(err.message, 'error');
  }
}

function updatePlayerCountGrid(gameType) {
  const container = document.getElementById('player-count-buttons-grid');
  const hiddenInput = document.getElementById('create-room-max-players');
  if (!container || !hiddenInput) return;

  const config = GAME_PLAYERS_CONFIG[gameType] || { min: 2, max: 4, options: [2, 3, 4], default: 4 };
  const allCounts = [2, 3, 4, 6, 8];

  let currentVal = parseInt(hiddenInput.value, 10);
  if (!config.options.includes(currentVal)) {
    currentVal = config.default;
    hiddenInput.value = currentVal;
  }

  container.innerHTML = allCounts.map(count => {
    const isAllowed = config.options.includes(count);
    const isSelected = (count === currentVal);
    return `
      <button type="button"
              class="player-count-btn ${isSelected ? 'active' : ''}"
              data-count="${count}"
              ${!isAllowed ? 'disabled' : ''}>
        ${count} لاعبين
      </button>
    `;
  }).join('');

  // Attach button click handlers
  container.querySelectorAll('.player-count-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      hiddenInput.value = btn.getAttribute('data-count');
      sfx.click();
    });
  });
}

function updateRulesEditorFields(gameType) {
  const container = document.getElementById('game-specific-rules-container');
  if (!container) return;

  const defaults = getDefaultRules(gameType);

  if (gameType === 'uno') {
    container.innerHTML = `
      <div class="rules-accordion">
        <!-- General Rules -->
        <div class="accordion-item open">
          <button type="button" class="accordion-header">
            <span>⚙️ القواعد العامة (General Rules)</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content">
            <div class="form-group">
              <label class="form-label">${i18n.t('startingCardsRule')}:</label>
              <input type="number" id="rule-starting-cards" class="form-control" min="3" max="15" value="${defaults.startingCards}">
            </div>
            <div class="form-group">
              <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="rule-draw-until-playable" ${defaults.drawUntilPlayable ? 'checked' : ''}>
                <span>${i18n.t('drawUntilPlayableRule')}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Special Gameplay -->
        <div class="accordion-item open">
          <button type="button" class="accordion-header">
            <span>🎴 قوى البطاقات (Gameplay & Stacking)</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content">
            <div class="form-group">
              <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="rule-stacking" ${defaults.stacking ? 'checked' : ''}>
                <span>${i18n.t('stackingRule')} (+2 / +4 Stacking)</span>
              </label>
            </div>
            <div class="form-group">
              <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="rule-jump-in" ${defaults.jumpIn ? 'checked' : ''}>
                <span>${i18n.t('jumpInRule')} (Jump-In out of turn)</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Timer -->
        <div class="accordion-item">
          <button type="button" class="accordion-header">
            <span>⏱️ مؤقت الدور (Turn Timer)</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content">
            <div class="form-group">
              <label class="form-label">${i18n.t('turnTimerRule')}:</label>
              <select id="rule-turn-timer" class="form-control">
                <option value="0">${i18n.t('timerOff')}</option>
                <option value="30">30 ${i18n.t('secondsLabel')}</option>
                <option value="60" selected>60 ${i18n.t('secondsLabel')}</option>
                <option value="120">120 ${i18n.t('secondsLabel')}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (gameType === 'chess') {
    container.innerHTML = `
      <div class="rules-accordion">
        <div class="accordion-item open">
          <button type="button" class="accordion-header">
            <span>⏱️ مؤقت الوقت (Time Control)</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content">
            <div class="form-group">
              <label class="form-label">الوقت الإجمالي لكل لاعب:</label>
              <select id="rule-time-control" class="form-control">
                <option value="0">بدون وقت (Unlimited)</option>
                <option value="60">دقيقة واحدة (Bullet)</option>
                <option value="180">3 دقائق (Blitz)</option>
                <option value="300" selected>5 دقائق (Rapid)</option>
                <option value="600">10 دقائق (Classical)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">الزيادة بعد كل نقلة (Increment):</label>
              <select id="rule-increment" class="form-control">
                <option value="0">0 ثانية</option>
                <option value="2">2 ثانية</option>
                <option value="3" selected>3 ثوانٍ</option>
                <option value="5">5 ثوانٍ</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (gameType === 'domino') {
    container.innerHTML = `
      <div class="rules-accordion">
        <div class="accordion-item open">
          <button type="button" class="accordion-header">
            <span>🁢 قواعد الدومينو (General & Scoring)</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content">
            <div class="form-group">
              <label class="form-label">عدد القطع لكل لاعب عند البداية:</label>
              <input type="number" id="rule-starting-tiles" class="form-control" min="4" max="7" value="${defaults.startingTiles}">
            </div>
            <div class="form-group">
              <label class="form-label">الهدف للفوز بالمباراة (Target Score):</label>
              <select id="rule-target-score" class="form-control">
                <option value="50">50 نقطة</option>
                <option value="100" selected>100 نقطة</option>
                <option value="150">150 نقطة</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (gameType === 'baloot') {
    container.innerHTML = `
      <div class="rules-accordion">
        <div class="accordion-item open">
          <button type="button" class="accordion-header">
            <span>🃏 إعدادات البلوت (Baloot Rules)</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content">
            <div class="form-group">
              <label class="form-label">نهاية النشرة (Target Score):</label>
              <select id="rule-target-score" class="form-control">
                <option value="152" selected>152 نقطة (نشرة رسمية)</option>
                <option value="100">100 نقطة (سريعة)</option>
                <option value="200">200 نقطة (طويلة)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (gameType === 'cards') {
    container.innerHTML = `
      <div class="rules-accordion">
        <div class="accordion-item open">
          <button type="button" class="accordion-header">
            <span>♠️ قواعد لعبة الشدة (Cards / Batta)</span>
            <span class="accordion-icon">▼</span>
          </button>
          <div class="accordion-content">
            <div class="form-group">
              <label class="form-label">أوراق البداية في يد كل لاعب:</label>
              <input type="number" id="rule-starting-cards" class="form-control" min="3" max="10" value="${defaults.startingCards}">
            </div>
            <div class="form-group">
              <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="rule-special-cards" ${defaults.specialCards ? 'checked' : ''}>
                <span>تفعيل كروت القوة الخاصة (2 يسحب، 8 يغير اللون، A يتخطى، J يعكس)</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Setup accordion toggle listeners
  container.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      if (item) {
        item.classList.toggle('open');
      }
    });
  });
}

function collectRulesFromForm(gameType) {
  const rules = {};
  if (gameType === 'uno') {
    rules.startingCards = parseInt(document.getElementById('rule-starting-cards')?.value || '7', 10);
    rules.stacking = document.getElementById('rule-stacking')?.checked ?? true;
    rules.jumpIn = document.getElementById('rule-jump-in')?.checked ?? true;
    rules.drawUntilPlayable = document.getElementById('rule-draw-until-playable')?.checked ?? false;
    rules.turnTimer = parseInt(document.getElementById('rule-turn-timer')?.value || '60', 10);
  } else if (gameType === 'chess') {
    rules.timeControl = parseInt(document.getElementById('rule-time-control')?.value || '300', 10);
    rules.increment = parseInt(document.getElementById('rule-increment')?.value || '3', 10);
  } else if (gameType === 'domino') {
    rules.startingTiles = parseInt(document.getElementById('rule-starting-tiles')?.value || '7', 10);
    rules.targetScore = parseInt(document.getElementById('rule-target-score')?.value || '100', 10);
  } else if (gameType === 'baloot') {
    rules.targetScore = parseInt(document.getElementById('rule-target-score')?.value || '152', 10);
  } else if (gameType === 'cards') {
    rules.startingCards = parseInt(document.getElementById('rule-starting-cards')?.value || '5', 10);
    rules.specialCards = document.getElementById('rule-special-cards')?.checked ?? true;
  }
  return rules;
}
