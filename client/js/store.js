/**
 * Game Skins Store Controller
 * Real-time browsing, points balance verification, atomic purchasing & equipping of skins.
 */

import api from './api.js';
import ui from './ui.js';
import { showToast, sfx, escapeHtml } from './utils.js';

let currentUser = null;
let allStoreSkins = [];
let currentFilter = 'all';
let pendingPurchaseSkin = null;

document.addEventListener('DOMContentLoaded', async () => {
  ui.setupGlobalNav();

  // Load current user
  await refreshUserState();

  // Setup tab filter buttons
  setupFilterTabs();

  // Setup purchase modal
  setupPurchaseModal();

  // Load skins
  await loadSkins();
});

async function refreshUserState() {
  const token = api.getToken();
  if (token) {
    try {
      const res = await api.request('/me');
      currentUser = res.user;
    } catch (e) {
      currentUser = null;
    }
  } else {
    currentUser = null;
  }

  const balanceEl = document.getElementById('user-points-balance');
  if (balanceEl) {
    balanceEl.textContent = currentUser?.totalPoints || 0;
  }
}

function setupFilterTabs() {
  const buttons = document.querySelectorAll('.store-filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter') || 'all';
      renderSkins();
      sfx.click();
    });
  });
}

async function loadSkins() {
  const container = document.getElementById('store-skins-container');
  if (!container) return;

  container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">جاري تحميل سكنات الألعاب...</div>';

  try {
    allStoreSkins = await api.getStoreSkins();
    renderSkins();
  } catch (err) {
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--danger); padding: 3rem;">خطأ في تحميل المتجر: ${err.message}</div>`;
  }
}

function renderSkins() {
  const container = document.getElementById('store-skins-container');
  if (!container) return;

  let filtered = allStoreSkins;
  if (currentFilter === 'owned') {
    filtered = allStoreSkins.filter(s => s.isOwned);
  } else if (currentFilter !== 'all') {
    filtered = allStoreSkins.filter(s => s.gameType === currentFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">لا توجد سكنات متوفرة في هذا القسم حالياً</div>';
    return;
  }

  const gameNames = { uno: '🃏 UNO', chess: '♟️ Chess', domino: '🁢 Domino' };
  const gameIcons = { uno: '🎴', chess: '♚', domino: '🁢' };

  container.innerHTML = filtered.map(skin => {
    const isOwned = Boolean(skin.isOwned);
    const isEquipped = Boolean(skin.isEquipped);
    const themeClass = skin.config?.theme ? `theme-${skin.config.theme}` : '';

    let actionBtnHtml = '';
    if (!currentUser || currentUser.isGuest) {
      actionBtnHtml = `<button class="btn btn-primary btn-skin-action btn-buy-skin" data-id="${skin.id}" data-price="${skin.price}">شراء (${skin.price} نقطة)</button>`;
    } else if (isEquipped) {
      actionBtnHtml = '<button class="btn btn-outline btn-skin-action" disabled style="color: var(--success); border-color: var(--success); cursor: default;">✓ مُفعّل حالياً</button>';
    } else if (isOwned) {
      actionBtnHtml = `<button class="btn btn-outline btn-skin-action btn-equip-skin" data-id="${skin.id}" data-game="${skin.gameType}" style="border-color: var(--accent); color: var(--accent);">تفعيل السكن</button>`;
    } else {
      actionBtnHtml = `<button class="btn btn-primary btn-skin-action btn-buy-skin" data-id="${skin.id}" data-price="${skin.price}">شراء مقابل ${skin.price} نقطة</button>`;
    }

    return `
      <div class="store-skin-card ${themeClass} ${isEquipped ? 'is-equipped' : ''}">
        <div class="skin-card-header">
          <span class="skin-game-tag">${gameNames[skin.gameType] || skin.gameType}</span>
          <div class="skin-visual-demo">
            <span class="skin-demo-symbol">${gameIcons[skin.gameType] || '⭐'}</span>
          </div>
        </div>
        <div class="skin-card-body">
          <div class="skin-card-name">${escapeHtml(skin.name)}</div>
          <div class="skin-card-desc">${escapeHtml(skin.description || 'سكن بصري مميز للعبة')}</div>
        </div>
        <div class="skin-card-footer">
          <div class="skin-price-tag">
            <span>⭐</span>
            <span>${skin.price}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">نقطة</span>
          </div>
          <div>
            ${actionBtnHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach Buy Handlers
  container.querySelectorAll('.btn-buy-skin').forEach(btn => {
    btn.addEventListener('click', () => {
      const skinId = btn.getAttribute('data-id');
      const skin = allStoreSkins.find(s => s.id === skinId);
      if (!skin) return;

      if (!currentUser) {
        showToast('يرجى تسجيل الدخول بحساب مسجل لشراء السكنات', 'info');
        setTimeout(() => { window.location.href = '/login.html?redirect=/store.html'; }, 1000);
        return;
      }

      if (currentUser.isGuest) {
        showToast('حسابات الضيوف لا يمكنها شراء السكنات. يرجى تسجيل حساب رسمي.', 'error');
        return;
      }

      const balance = currentUser.totalPoints || 0;
      if (balance < skin.price) {
        sfx.errorBuzz();
        showToast(`رصيد نقاطك (${balance}) غير كافٍ لشراء هذا السكن (${skin.price} نقطة). العب مباريات واكسب نقاطاً!`, 'error');
        return;
      }

      openPurchaseModal(skin);
    });
  });

  // Attach Equip Handlers
  container.querySelectorAll('.btn-equip-skin').forEach(btn => {
    btn.addEventListener('click', async () => {
      const skinId = btn.getAttribute('data-id');
      const gameType = btn.getAttribute('data-game');
      try {
        await api.equipSkin(gameType, skinId);
        sfx.click();
        showToast('تم تفعيل السكن بنجاح للعبة!', 'success');
        await refreshUserState();
        await loadSkins();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function setupPurchaseModal() {
  const modal = document.getElementById('modal-purchase-skin');
  document.getElementById('close-purchase-modal')?.addEventListener('click', () => modal?.classList.remove('active'));
  document.getElementById('cancel-purchase-btn')?.addEventListener('click', () => modal?.classList.remove('active'));

  document.getElementById('confirm-purchase-btn')?.addEventListener('click', async () => {
    if (!pendingPurchaseSkin) return;
    const confirmBtn = document.getElementById('confirm-purchase-btn');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
      const res = await api.buySkin(pendingPurchaseSkin.id);
      sfx.play('win');
      showToast(`تهانينا! تم شراء ${pendingPurchaseSkin.name} بنجاح!`, 'success');
      modal?.classList.remove('active');

      // Update balance & reload skins
      await refreshUserState();
      await loadSkins();
    } catch (err) {
      sfx.errorBuzz();
      showToast(err.message, 'error');
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  });
}

function openPurchaseModal(skin) {
  pendingPurchaseSkin = skin;
  const modal = document.getElementById('modal-purchase-skin');
  const nameEl = document.getElementById('purchase-skin-name');
  const priceEl = document.getElementById('purchase-skin-price');
  const currentBalEl = document.getElementById('purchase-current-balance');
  const afterBalEl = document.getElementById('purchase-after-balance');

  const curBalance = currentUser?.totalPoints || 0;
  const afterBalance = curBalance - skin.price;

  if (nameEl) nameEl.textContent = skin.name;
  if (priceEl) priceEl.textContent = `${skin.price} نقطة`;
  if (currentBalEl) currentBalEl.textContent = curBalance;
  if (afterBalEl) afterBalEl.textContent = afterBalance;

  modal?.classList.add('active');
}
