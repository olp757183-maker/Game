/**
 * Shared Input Validation
 */

import { GAME_TYPES } from './constants.js';

export function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, errorEn: 'Username is required', errorAr: 'اسم المستخدم مطلوب' };
  }
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {
    return { valid: false, errorEn: 'Username must be between 3 and 20 characters', errorAr: 'يجب أن يكون اسم المستخدم بين 3 و 20 حرفًا' };
  }
  // Allow letters, numbers, spaces, underscores, Arabic characters
  const validRegex = /^[\w\s\u0600-\u06FF]{3,20}$/;
  if (!validRegex.test(trimmed)) {
    return { valid: false, errorEn: 'Username contains invalid characters', errorAr: 'اسم المستخدم يحتوي على أحرف غير مسموحة' };
  }
  return { valid: true, value: trimmed };
}

export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, errorEn: 'Email is required', errorAr: 'البريد الإلكتروني مطلوب' };
  }
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, errorEn: 'Invalid email address format', errorAr: 'صيغة البريد الإلكتروني غير صحيحة' };
  }
  return { valid: true, value: trimmed.toLowerCase() };
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, errorEn: 'Password is required', errorAr: 'كلمة المرور مطلوبة' };
  }
  if (password.length < 6) {
    return { valid: false, errorEn: 'Password must be at least 6 characters', errorAr: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' };
  }
  return { valid: true, value: password };
}

export function validateRoomCode(code) {
  if (!code || typeof code !== 'string') {
    return { valid: false, errorEn: 'Room code is required', errorAr: 'رمز الغرفة مطلوب' };
  }
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(clean)) {
    return { valid: false, errorEn: 'Room code must be 4 to 8 alphanumeric characters', errorAr: 'رمز الغرفة يجب أن يتكون من 4 إلى 8 خانات أحرف وأرقام' };
  }
  return { valid: true, value: clean };
}

export function validateGameType(gameType) {
  if (!Object.values(GAME_TYPES).includes(gameType)) {
    return { valid: false, errorEn: 'Unsupported game type', errorAr: 'نوع اللعبة غير مدعوم' };
  }
  return { valid: true, value: gameType };
}

export function sanitizeChatMessage(message) {
  if (!message || typeof message !== 'string') return '';
  return message.trim().slice(0, 200);
}
