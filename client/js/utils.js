/**
 * Utilities & Audio Synthesizer (Web Audio API)
 */

class SoundEffects {
  constructor() {
    this.audioCtx = null;
    this.enabled = typeof localStorage !== 'undefined' ? localStorage.getItem('sound_enabled') !== 'false' : true;
  }

  init() {
    if (!this.audioCtx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleSound(enable) {
    this.enabled = enable !== undefined ? enable : !this.enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sound_enabled', this.enabled ? 'true' : 'false');
    }
    return this.enabled;
  }

  playTone(freq, duration = 0.1, type = 'sine', gainVal = 0.15) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  playCard() {
    this.playTone(480, 0.08, 'triangle', 0.2);
    setTimeout(() => this.playTone(600, 0.08, 'triangle', 0.15), 50);
  }

  drawCard() {
    this.playTone(320, 0.07, 'sine', 0.18);
  }

  turnAlert() {
    this.playTone(523.25, 0.12, 'sine', 0.25); // C5
    setTimeout(() => this.playTone(659.25, 0.18, 'sine', 0.25), 120); // E5
  }

  winFanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 0.22, 'triangle', 0.3), idx * 120);
    });
  }

  errorBuzz() {
    this.playTone(180, 0.2, 'sawtooth', 0.2);
  }

  click() {
    this.playTone(400, 0.04, 'sine', 0.1);
  }
}

export const sfx = new SoundEffects();

/**
 * Toast Notification System
 */
export function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  if (type === 'success') icon.textContent = '✓';
  else if (type === 'error') icon.textContent = '✕';
  else if (type === 'warning') icon.textContent = '⚠';
  else icon.textContent = 'ℹ';

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add('visible'), 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
