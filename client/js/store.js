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
      actionBtnHtml = `
        <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
          <button class="btn btn-outline btn-skin-action" disabled style="color: var(--success); border-color: var(--success); cursor: default; padding: 0.35rem 0.6rem;">✓ مُفعّل حالياً</button>
          <button class="btn btn-xs btn-outline btn-revert-default" data-game="${skin.gameType}" title="العودة للمظهر الافتراضي للعبة" style="color: var(--text-muted); border-color: var(--border);">↩ الافتراضي</button>
        </div>
      `;
    } else if (isOwned) {
      actionBtnHtml = `<button class="btn btn-outline btn-skin-action btn-equip-skin" data-id="${skin.id}" data-game="${skin.gameType}" style="border-color: var(--accent); color: var(--accent);">تفعيل السكن</button>`;
    } else {
      actionBtnHtml = `<button class="btn btn-primary btn-skin-action btn-buy-skin" data-id="${skin.id}" data-price="${skin.price}">شراء مقابل ${skin.price} نقطة</button>`;
    }

    const previewThumb = skin.previewUrl ? `<img src="${skin.previewUrl}" alt="${escapeHtml(skin.name)}" style="max-height: 85%; max-width: 85%; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));">` : `<span class="skin-demo-symbol">${gameIcons[skin.gameType] || '⭐'}</span>`;

    return `
      <div class="store-skin-card ${themeClass} ${isEquipped ? 'is-equipped' : ''}">
        <div class="skin-card-header">
          <span class="skin-game-tag">${gameNames[skin.gameType] || skin.gameType}</span>
          <div class="skin-visual-demo">
            ${previewThumb}
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
          <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-sm btn-outline btn-preview-bundle" data-id="${skin.id}" title="معاينة محتويات وحجارة/قطع الحزمة">👁️ معاينة</button>
            ${actionBtnHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach Preview Handlers
  container.querySelectorAll('.btn-preview-bundle').forEach(btn => {
    btn.addEventListener('click', () => {
      const skinId = btn.getAttribute('data-id');
      const skin = allStoreSkins.find(s => s.id === skinId);
      if (skin) openBundlePreviewModal(skin);
    });
  });

  // Attach Revert to Default Handlers
  container.querySelectorAll('.btn-revert-default').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gameType = btn.getAttribute('data-game');
      try {
        await api.equipSkin(gameType, 'default');
        sfx.click();
        showToast('تمت العودة إلى المظهر الافتراضي للعبة بنجاح!', 'info');
        await refreshUserState();
        await loadSkins();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

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

async function openBundlePreviewModal(skin) {
  const modal = document.getElementById('modal-preview-bundle');
  if (!modal) return;

  const infoEl = document.getElementById('bundle-preview-info');
  const itemsEl = document.getElementById('bundle-preview-items');
  const titleEl = document.getElementById('preview-modal-title');
  const buyBtn = document.getElementById('preview-buy-btn');

  if (titleEl) titleEl.textContent = `👁️ معاينة: ${skin.name}`;
  if (infoEl) {
    infoEl.innerHTML = `
      <div>
        <div style="font-weight: 800; font-size: 1.1rem;">${escapeHtml(skin.name)}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(skin.description || '')}</div>
      </div>
      <div style="font-weight: 800; color: var(--warning); font-size: 1.2rem;">
        ⭐ ${skin.price} نقطة
      </div>
    `;
  }

  if (buyBtn) {
    buyBtn.style.display = skin.isOwned ? 'none' : 'inline-block';
    buyBtn.onclick = () => {
      modal.style.display = 'none';
      openPurchaseModal(skin);
    };
  }

  if (itemsEl) {
    itemsEl.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">جاري تحميل محتويات الحزمة...</div>';
  }

  modal.style.display = 'flex';

  // Setup close buttons
  document.getElementById('close-preview-modal').onclick = () => { modal.style.display = 'none'; };
  document.getElementById('cancel-preview-btn').onclick = () => { modal.style.display = 'none'; };

  try {
    const res = await fetch(`/api/store/bundles/${encodeURIComponent(skin.id)}/preview`);
    if (!res.ok) throw new Error('فشل جلب تفاصيل الحزمة');
    const data = await res.json();
    const items = data.items || [];

    if (itemsEl) {
      if (items.length === 0) {
        itemsEl.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">هذه الحزمة تعتمد على المظهر البرمجي العام.</div>';
      } else {
        itemsEl.innerHTML = items.map(item => `
          <div style="background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.5rem; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            ${item.assetUrl ? `
              <img src="${item.assetUrl}" alt="${item.nameAr}" style="width: 50px; height: 50px; object-fit: contain; margin-bottom: 0.25rem;">
            ` : `
              <div style="font-size: 1.8rem; margin-bottom: 0.25rem;">${item.symbol || '🎴'}</div>
            `}
            <span style="font-size: 0.7rem; color: var(--text); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;" title="${item.nameAr}">${escapeHtml(item.nameAr)}</span>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    if (itemsEl) {
      itemsEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">سكن كلاسيكي (${escapeHtml(skin.name)})</div>`;
    }
  }
}

