/**
 * Auth Controller (Login, Register, Guest)
 */

import api from './api.js';
import ui from './ui.js';
import i18n from './language.js';
import { showToast, sfx } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  ui.setupGlobalNav();

  // If already logged in, redirect to lobby if on auth pages
  const token = api.getToken();
  if (token && (window.location.pathname.endsWith('login.html') || window.location.pathname.endsWith('register.html'))) {
    window.location.href = '/lobby.html';
    return;
  }

  // Register Form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username')?.value.trim();
      const email = document.getElementById('email')?.value.trim();
      const password = document.getElementById('password')?.value;
      const confirmPassword = document.getElementById('confirmPassword')?.value;
      const avatar = document.querySelector('input[name="avatar"]:checked')?.value || 'avatar1';

      if (password !== confirmPassword) {
        showToast(i18n.t('errorTitle') + ': ' + (i18n.getLanguage() === 'ar' ? 'كلمات المرور غير متطابقة' : 'Passwords do not match'), 'error');
        sfx.errorBuzz();
        return;
      }

      try {
        await api.register({ username, email, password, confirmPassword, avatar });
        sfx.winFanfare();
        showToast(i18n.t('registerSuccess'), 'success');
        setTimeout(() => {
          window.location.href = '/lobby.html';
        }, 800);
      } catch (err) {
        sfx.errorBuzz();
        showToast(err.message, 'error');
      }
    });
  }

  // Login Form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('identifier')?.value.trim();
      const password = document.getElementById('password')?.value;

      try {
        await api.login({ identifier, password });
        sfx.click();
        showToast(i18n.t('loginSuccess'), 'success');
        setTimeout(() => {
          window.location.href = '/lobby.html';
        }, 600);
      } catch (err) {
        sfx.errorBuzz();
        showToast(err.message, 'error');
      }
    });
  }

  // Quick Guest Login
  const guestBtn = document.getElementById('guest-login-btn');
  if (guestBtn) {
    guestBtn.addEventListener('click', async () => {
      try {
        const nickname = prompt(i18n.getLanguage() === 'ar' ? 'أدخل اسمك المستعار (اختياري):' : 'Enter a nickname (optional):', '');
        await api.guest(nickname || null);
        sfx.click();
        showToast(i18n.t('loginSuccess'), 'success');
        setTimeout(() => {
          window.location.href = '/lobby.html';
        }, 500);
      } catch (err) {
        sfx.errorBuzz();
        showToast(err.message, 'error');
      }
    });
  }
});
