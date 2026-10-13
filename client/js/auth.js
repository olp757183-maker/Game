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
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    if (redirect && redirect.startsWith('/')) {
      window.location.href = redirect;
    } else {
      window.location.href = '/lobby.html';
    }
    return;
  }

  // ==========================================
  // Register Form Custom Validation & Domain Completion
  // ==========================================
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    function setFieldError(fieldId, message) {
      const input = document.getElementById(fieldId);
      const errContainer = document.getElementById(fieldId + '-error');
      if (input) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
      }
      if (errContainer) {
        errContainer.textContent = `⚠️ ${message}`;
        errContainer.classList.add('visible');
      }
    }

    function clearFieldError(fieldId) {
      const input = document.getElementById(fieldId);
      const errContainer = document.getElementById(fieldId + '-error');
      if (input) {
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
      }
      if (errContainer) {
        errContainer.textContent = '';
        errContainer.classList.remove('visible');
      }
    }

    function validateField(fieldId) {
      const input = document.getElementById(fieldId);
      if (!input) return true;
      const val = input.value;
      const isAr = i18n.getLanguage() === 'ar';

      if (fieldId === 'username') {
        const trimmed = val.trim();
        if (!trimmed) {
          setFieldError('username', isAr ? 'أدخل اسم المستخدم' : 'Username is required');
          return false;
        }
        if (trimmed.length < 3 || trimmed.length > 20) {
          setFieldError('username', isAr ? 'يجب أن يكون اسم المستخدم بين 3 و 20 حرفًا' : 'Username must be between 3 and 20 characters');
          return false;
        }
        const validRegex = /^[\w\s\u0600-\u06FF]{3,20}$/;
        if (!validRegex.test(trimmed)) {
          setFieldError('username', isAr ? 'اسم المستخدم يحتوي على أحرف غير مسموحة' : 'Username contains invalid characters');
          return false;
        }
        clearFieldError('username');
        return true;
      }

      if (fieldId === 'email') {
        const trimmed = val.trim();
        if (!trimmed) {
          setFieldError('email', isAr ? 'أدخل اسم البريد الإلكتروني' : 'Email is required');
          return false;
        }
        if (!trimmed.includes('@')) {
          setFieldError('email', isAr ? 'أكمل عنوان البريد الإلكتروني أو اختر النطاق المقترح' : 'Complete email domain or choose a suggested domain');
          return false;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
          setFieldError('email', isAr ? 'صيغة البريد الإلكتروني غير صحيحة' : 'Invalid email address format');
          return false;
        }
        clearFieldError('email');
        return true;
      }

      if (fieldId === 'password') {
        if (!val) {
          setFieldError('password', isAr ? 'أدخل كلمة المرور' : 'Password is required');
          return false;
        }
        if (val.length < 6) {
          setFieldError('password', isAr ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' : 'Password must be at least 6 characters');
          return false;
        }
        clearFieldError('password');
        const confirmInput = document.getElementById('confirmPassword');
        if (confirmInput && confirmInput.value) {
          validateField('confirmPassword');
        }
        return true;
      }

      if (fieldId === 'confirmPassword') {
        const passVal = document.getElementById('password')?.value || '';
        if (!val) {
          setFieldError('confirmPassword', isAr ? 'أدخل تأكيد كلمة المرور' : 'Confirm password is required');
          return false;
        }
        if (val !== passVal) {
          setFieldError('confirmPassword', isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
          return false;
        }
        clearFieldError('confirmPassword');
        return true;
      }

      return true;
    }

    function applyEmailDomain(domain) {
      const emailInput = document.getElementById('email');
      if (!emailInput) return;
      const raw = emailInput.value.trim();

      let prefix = raw;
      if (prefix.includes('@')) {
        prefix = prefix.split('@')[0].trim();
      }

      if (prefix) {
        emailInput.value = `${prefix}${domain}`;
      } else {
        emailInput.value = domain;
      }

      clearFieldError('email');
      validateField('email');
      updateDomainChipsState();
      emailInput.focus();
    }

    function updateDomainChipsState() {
      const emailInput = document.getElementById('email');
      if (!emailInput) return;
      const current = emailInput.value.trim().toLowerCase();
      document.querySelectorAll('.domain-chip').forEach(chip => {
        const d = (chip.getAttribute('data-domain') || '').toLowerCase();
        if (d && current.endsWith(d)) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }

    // Attach domain chip click listeners
    document.querySelectorAll('.domain-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const domain = chip.getAttribute('data-domain');
        if (domain) {
          sfx.click();
          applyEmailDomain(domain);
        }
      });
    });

    // Real-time input error clearing
    ['username', 'email', 'password', 'confirmPassword'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          if (el.classList.contains('is-invalid')) {
            validateField(id);
          }
          if (id === 'email') {
            updateDomainChipsState();
          }
        });
        el.addEventListener('blur', () => {
          if (el.value.trim()) {
            validateField(id);
          }
        });
      }
    });

    // Submit handler with debounce & loading
    let isSubmitting = false;
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const isUValid = validateField('username');
      const isEValid = validateField('email');
      const isPValid = validateField('password');
      const isCValid = validateField('confirmPassword');

      if (!isUValid || !isEValid || !isPValid || !isCValid) {
        sfx.errorBuzz();
        const firstInvalid = registerForm.querySelector('.form-control.is-invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      const submitBtn = document.getElementById('register-submit-btn') || registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : (i18n.getLanguage() === 'ar' ? 'إنشاء الحساب' : 'Register');

      isSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = i18n.getLanguage() === 'ar' ? '⏳ جارٍ التسجيل...' : '⏳ Registering...';
      }

      let registerSuccess = false;
      try {
        const username = document.getElementById('username')?.value.trim();
        const email = document.getElementById('email')?.value.trim();
        const password = document.getElementById('password')?.value;
        const confirmPassword = document.getElementById('confirmPassword')?.value;
        const avatar = document.querySelector('input[name="avatar"]:checked')?.value || 'avatar1';

        await api.register({ username, email, password, confirmPassword, avatar });
        registerSuccess = true;
        sfx.winFanfare();
        showToast(i18n.t('registerSuccess'), 'success');

        setTimeout(() => {
          const urlParams = new URLSearchParams(window.location.search);
          const redirect = urlParams.get('redirect');
          if (redirect && redirect.startsWith('/')) {
            window.location.href = redirect;
          } else {
            window.location.href = '/lobby.html';
          }
        }, 800);
      } catch (err) {
        sfx.errorBuzz();
        const msg = err.message || (i18n.getLanguage() === 'ar' ? 'فشل التسجيل، يرجى المحاولة مرة أخرى' : 'Registration failed');
        if (msg.includes('البريد') || msg.toLowerCase().includes('email')) {
          setFieldError('email', msg);
        } else if (msg.includes('المستخدم') || msg.toLowerCase().includes('username')) {
          setFieldError('username', msg);
        }
        showToast(msg, 'error');
      } finally {
        if (!registerSuccess) {
          isSubmitting = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
          }
        }
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
          const urlParams = new URLSearchParams(window.location.search);
          const redirect = urlParams.get('redirect');
          if (redirect && redirect.startsWith('/')) {
            window.location.href = redirect;
          } else {
            window.location.href = '/lobby.html';
          }
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
          const urlParams = new URLSearchParams(window.location.search);
          const redirect = urlParams.get('redirect');
          if (redirect && redirect.startsWith('/')) {
            window.location.href = redirect;
          } else {
            window.location.href = '/lobby.html';
          }
        }, 500);
      } catch (err) {
        sfx.errorBuzz();
        showToast(err.message, 'error');
      }
    });
  }
});
