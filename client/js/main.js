/**
 * Main Landing Page Controller
 */

import api from './api.js';
import ui from './ui.js';
import i18n from './language.js';
import { showToast, sfx } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  ui.setupGlobalNav();

  // Play Now button
  const playNowBtn = document.getElementById('hero-play-now-btn');
  if (playNowBtn) {
    playNowBtn.addEventListener('click', () => {
      window.location.href = '/lobby.html';
    });
  }

  // Join Room button on Home
  const joinRoomBtn = document.getElementById('hero-join-room-btn');
  if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', () => {
      const code = prompt(i18n.getLanguage() === 'ar' ? 'أدخل رمز الغرفة (مثال: X7K92P):' : 'Enter room code (e.g. X7K92P):');
      if (code && code.trim()) {
        window.location.href = `/room/${code.trim().toUpperCase()}`;
      }
    });
  }

  // Game Cards Click
  document.querySelectorAll('.featured-game-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.href = '/lobby.html';
    });
  });
});
