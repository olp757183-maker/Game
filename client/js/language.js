/**
 * Language Manager
 * Handles switching between Arabic (RTL) and English (LTR)
 */

import { en } from './translations/en.js';
import { ar } from './translations/ar.js';

const TRANSLATIONS = { en, ar };
const DEFAULT_LANG = 'ar'; // Default language Arabic or English

class LanguageManager {
  constructor() {
    this.currentLang = localStorage.getItem('app_lang') || DEFAULT_LANG;
    this.applyLanguage(this.currentLang);
  }

  setLanguage(lang) {
    if (!TRANSLATIONS[lang]) return;
    this.currentLang = lang;
    localStorage.setItem('app_lang', lang);
    this.applyLanguage(lang);
  }

  getLanguage() {
    return this.currentLang;
  }

  t(key, fallback = '') {
    const dict = TRANSLATIONS[this.currentLang] || TRANSLATIONS.en;
    return dict[key] || TRANSLATIONS.en[key] || fallback || key;
  }

  applyLanguage(lang) {
    const html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    // Update all elements with data-i18n
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = this.t(key);
      if (translation) {
        if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
          el.value = translation;
        } else if (el.hasAttribute('placeholder')) {
          el.setAttribute('placeholder', translation);
        } else {
          el.textContent = translation;
        }
      }
    });

    // Update elements with data-i18n-placeholder
    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translation = this.t(key);
      if (translation) {
        el.setAttribute('placeholder', translation);
      }
    });

    // Fire custom event
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  }
}

export const i18n = new LanguageManager();
export default i18n;
