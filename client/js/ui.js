/**
 * UI Component & Theme Manager
 */

import i18n from './language.js';
import { sfx } from './utils.js';
import api from './api.js';

class UIManager {
  constructor() {
    this.initTheme();
    this.initAudioClicks();
  }

  initTheme() {
    const savedTheme = localStorage.getItem('app_theme') || 'dark';
    this.setTheme(savedTheme);
  }

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      themeToggleBtn.setAttribute('title', theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
    sfx.click();
  }

  initAudioClicks() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, .btn, .nav-link, .game-card');
      if (btn) {
        sfx.click();
      }
    });
  }

  setupModals() {
    // Close modal on backdrop click or close button
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        this.closeAllModals();
      }
      if (e.target.closest('.modal-close-btn')) {
        this.closeAllModals();
      }
    });

    // Close on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.classList.add('modal-open');
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
    if (!document.querySelector('.modal-backdrop.active, .wild-modal-backdrop.active')) {
      document.body.classList.remove('modal-open');
    }
  }

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop.active, .wild-modal-backdrop.active').forEach(m => m.classList.remove('active'));
    document.body.classList.remove('modal-open');
  }

  setupTabs(containerSelector = '.tabs-container') {
    const containers = document.querySelectorAll(containerSelector);
    containers.forEach(container => {
      const tabs = container.querySelectorAll('.tab-btn');
      const panels = container.querySelectorAll('.tab-panel');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const target = tab.getAttribute('data-tab');

          tabs.forEach(t => t.classList.remove('active'));
          panels.forEach(p => p.classList.remove('active'));

          tab.classList.add('active');
          const activePanel = container.querySelector(`.tab-panel[data-panel="${target}"]`);
          if (activePanel) activePanel.classList.add('active');
        });
      });
    });
  }

  renderHeaderUser() {
    const userContainer = document.getElementById('header-user-actions');
    if (!userContainer) return;

    const user = api.getUser();
    if (user) {
      userContainer.innerHTML = `
        <div class="user-pill">
          <div class="avatar-badge ${user.avatar || 'avatar1'}"></div>
          <span class="user-name">${user.username}</span>
          ${user.isGuest ? '<span class="badge badge-guest">Guest</span>' : ''}
        </div>
        <button id="logout-btn" class="btn btn-sm btn-outline" data-i18n="navLogout">${i18n.t('navLogout')}</button>
      `;
      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => api.logout());
      }
    } else {
      userContainer.innerHTML = `
        <a href="/login.html" class="btn btn-sm btn-outline" data-i18n="navLogin">${i18n.t('navLogin')}</a>
        <a href="/register.html" class="btn btn-sm btn-primary" data-i18n="navRegister">${i18n.t('navRegister')}</a>
      `;
    }
  }

  setupGlobalNav() {
    this.renderHeaderUser();

    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Language Toggle
    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        const next = i18n.getLanguage() === 'ar' ? 'en' : 'ar';
        i18n.setLanguage(next);
        langBtn.textContent = next === 'ar' ? 'English' : 'العربية';
        sfx.click();
      });
      langBtn.textContent = i18n.getLanguage() === 'ar' ? 'English' : 'العربية';
    }

    // Sound Toggle
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const isEnabled = sfx.toggleSound();
        soundBtn.innerHTML = isEnabled ? '🔊' : '🔇';
        sfx.click();
      });
      soundBtn.innerHTML = sfx.enabled ? '🔊' : '🔇';
    }

    // Mobile Hamburger Menu Toggle
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navLinks = document.getElementById('site-nav-links') || document.querySelector('.nav-links');
    if (mobileMenuToggle && navLinks) {
      mobileMenuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = navLinks.classList.toggle('mobile-nav-open');
        mobileMenuToggle.textContent = isOpen ? '✕' : '☰';
        mobileMenuToggle.setAttribute('aria-expanded', isOpen);
      });

      // Close mobile menu on nav link click
      navLinks.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
          navLinks.classList.remove('mobile-nav-open');
          mobileMenuToggle.textContent = '☰';
          mobileMenuToggle.setAttribute('aria-expanded', 'false');
        });
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!navLinks.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
          navLinks.classList.remove('mobile-nav-open');
          mobileMenuToggle.textContent = '☰';
          mobileMenuToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    this.setupModals();
  }
}

export const ui = new UIManager();
export default ui;
