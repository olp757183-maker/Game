/**
 * Skin Bundle Editor Controller
 * Handles bundle creation, draft saving, asset uploading/deleting, real-time preview, and store publishing.
 */

import { GAME_ASSETS_SPEC } from '../shared/game-assets-spec.js';
import skinAssets from './skin-assets.js';
import { escapeHtml } from './utils.js';

// State
let currentUser = null;
let currentGame = 'uno';
let currentBundleId = 'new';
let bundleData = {
  id: '',
  gameType: 'uno',
  name: '',
  description: '',
  price: 25,
  status: 'draft',
  assets: {}
};

let filterCategory = 'all';
let filterStatus = 'all';
let searchQuery = '';
let activeUploadKey = null;

// DOM Elements
const gameSelect = document.getElementById('editor-game-select');
const bundleSelect = document.getElementById('editor-bundle-select');
const bundleNameInput = document.getElementById('editor-bundle-name');
const bundlePriceInput = document.getElementById('editor-bundle-price');
const bundleDescInput = document.getElementById('editor-bundle-desc');
const statusBadge = document.getElementById('bundle-status-badge');
const progressCountsText = document.getElementById('progress-counts-text');
const progressBarFill = document.getElementById('progress-bar-fill');
const gameItemsHint = document.getElementById('game-items-count-hint');

const categoryTabsContainer = document.getElementById('category-tabs-container');
const assetSearchInput = document.getElementById('asset-search-input');
const assetsGridContainer = document.getElementById('assets-grid-container');
const hiddenFileInput = document.getElementById('hidden-asset-file-input');

const filterAllBtn = document.getElementById('filter-all-btn');
const filterCompletedBtn = document.getElementById('filter-completed-btn');
const filterMissingBtn = document.getElementById('filter-missing-btn');
const countAllBadge = document.getElementById('count-all-badge');
const countCompletedBadge = document.getElementById('count-completed-badge');
const countMissingBadge = document.getElementById('count-missing-badge');

const btnSaveDraft = document.getElementById('btn-save-draft');
const btnPreviewBundle = document.getElementById('btn-preview-bundle');
const btnPublishBundle = document.getElementById('btn-publish-bundle');
const btnDeleteBundle = document.getElementById('btn-delete-bundle');
const btnRefreshBundles = document.getElementById('btn-refresh-bundles');

// Modal Elements
const previewModal = document.getElementById('bundle-preview-modal');
const btnClosePreview = document.getElementById('btn-close-preview');
const btnPreviewCloseFooter = document.getElementById('btn-preview-close-footer');
const btnPreviewPublishAction = document.getElementById('btn-preview-publish-action');

// Toast Notification Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Authentication Check
async function checkAuth() {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = './login.html?redirect=bundle-editor.html';
      return false;
    }
    const res = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      window.location.href = './login.html?redirect=bundle-editor.html';
      return false;
    }
    const data = await res.json();
    currentUser = data.user;

    const isAdmin = currentUser && (currentUser.role === 'super_admin' || currentUser.role === 'sub_admin');
    if (!isAdmin) {
      alert('عذراً، محرر حزم السكنات متاح للمديرين فقط.');
      window.location.href = './index.html';
      return false;
    }

    // Render User Header badge
    const headerUserWrap = document.getElementById('header-user-actions');
    if (headerUserWrap) {
      headerUserWrap.innerHTML = `
        <span class="user-greeting">مرحباً، <strong>${escapeHtml(currentUser.username)}</strong></span>
        <button id="logout-btn" class="btn btn-outline btn-xs">خروج</button>
      `;
      document.getElementById('logout-btn')?.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = './login.html';
      });
    }

    return true;
  } catch (err) {
    console.error('Auth error:', err);
    return false;
  }
}

// Helper: Get Auth Headers
function getHeaders(isJson = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

// Load List of Bundles for current game
async function loadBundlesList() {
  try {
    const res = await fetch(`/api/admin/skins`, { headers: getHeaders() });
    if (!res.ok) throw new Error('فشل جلب قائمة السكنات');
    const data = await res.json();
    const allSkins = data.skins || [];
    const gameSkins = allSkins.filter(s => s.gameType === currentGame);

    bundleSelect.innerHTML = `<option value="new">+ إنشاء حزمة جديدة...</option>`;
    for (const skin of gameSkins) {
      const opt = document.createElement('option');
      opt.value = skin.id;
      const statusText = skin.status === 'published' ? '🟢 منشورة' : '⚪ مسودة';
      opt.textContent = `${skin.name} (${statusText} - ${skin.price} نقطة)`;
      bundleSelect.appendChild(opt);
    }

    // Set value if already selected
    if (currentBundleId && currentBundleId !== 'new') {
      bundleSelect.value = currentBundleId;
    } else {
      bundleSelect.value = 'new';
    }
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
}

// Load a specific bundle
async function loadBundle(bundleId) {
  if (!bundleId || bundleId === 'new') {
    currentBundleId = 'new';
    bundleData = {
      id: '',
      gameType: currentGame,
      name: '',
      description: '',
      price: 25,
      status: 'draft',
      assets: {}
    };
    bundleNameInput.value = '';
    bundleDescInput.value = '';
    bundlePriceInput.value = '25';
    statusBadge.textContent = 'مسودة جديدة (New Draft)';
    statusBadge.className = 'badge';
    btnDeleteBundle.style.display = 'none';
    renderCategoryTabs();
    renderAssetsGrid();
    updateProgressUI();
    return;
  }

  try {
    currentBundleId = bundleId;
    const res = await fetch(`/api/admin/bundles/${encodeURIComponent(bundleId)}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('فشل تحميل بيانات الحزمة');
    const data = await res.json();
    const bundle = data.bundle;

    bundleData = {
      id: bundle.id,
      gameType: bundle.gameType,
      name: bundle.name,
      description: bundle.description || '',
      price: bundle.price || 0,
      status: bundle.status || 'draft',
      assets: bundle.assets || {}
    };

    currentGame = bundle.gameType;
    gameSelect.value = currentGame;
    bundleNameInput.value = bundleData.name;
    bundleDescInput.value = bundleData.description;
    bundlePriceInput.value = bundleData.price;

    if (bundleData.status === 'published') {
      statusBadge.textContent = '🟢 منشورة بالمتجر (Published)';
      statusBadge.className = 'badge badge-success';
    } else {
      statusBadge.textContent = '⚪ مسودة (Draft)';
      statusBadge.className = 'badge';
    }

    btnDeleteBundle.style.display = 'inline-flex';
    renderCategoryTabs();
    renderAssetsGrid();
    updateProgressUI();
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
}

// Save Current Bundle (Draft or Update)
async function saveBundle(status = 'draft') {
  const name = bundleNameInput.value.trim();
  if (!name) {
    showToast('يرجى كتابة اسم الحزمة أولاً', 'error');
    bundleNameInput.focus();
    return null;
  }

  const price = Math.max(0, parseInt(bundlePriceInput.value, 10) || 0);
  const description = bundleDescInput.value.trim();

  // If new bundle, generate an ID
  let id = bundleData.id;
  const isNew = !id || currentBundleId === 'new';
  if (isNew) {
    id = `${currentGame}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  try {
    let res;
    if (isNew) {
      res = await fetch('/api/admin/skins', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          id,
          gameType: currentGame,
          name,
          description,
          price,
          status,
          assets: bundleData.assets
        })
      });
    } else {
      res = await fetch(`/api/admin/skins/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          name,
          description,
          price,
          status
        })
      });
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.errorAr || data.error || 'فشل حفظ الحزمة');
    }

    bundleData.id = id;
    bundleData.name = name;
    bundleData.price = price;
    bundleData.description = description;
    bundleData.status = status;
    currentBundleId = id;

    if (status === 'published') {
      statusBadge.textContent = '🟢 منشورة بالمتجر (Published)';
      statusBadge.className = 'badge badge-success';
    } else {
      statusBadge.textContent = '⚪ مسودة (Draft)';
      statusBadge.className = 'badge';
    }

    btnDeleteBundle.style.display = 'inline-flex';
    await loadBundlesList();
    bundleSelect.value = id;

    showToast(status === 'published' ? 'تم نشر الحزمة في المتجر بنجاح! 🚀' : 'تم حفظ الحزمة كمسودة بنجاح! 💾', 'success');
    return id;
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
    return null;
  }
}

// Render Categories Bar dynamically based on game spec
function renderCategoryTabs() {
  const spec = GAME_ASSETS_SPEC[currentGame];
  if (!spec) return;

  // Update Game hint
  gameItemsHint.textContent = `${spec.items.length} عنصراً مدعوماً بالكامل`;

  categoryTabsContainer.innerHTML = '';

  // "All" tab
  const allBtn = document.createElement('button');
  allBtn.className = `cat-tab-btn ${filterCategory === 'all' ? 'active' : ''}`;
  allBtn.textContent = 'الكل (All)';
  allBtn.addEventListener('click', () => {
    filterCategory = 'all';
    renderCategoryTabs();
    renderAssetsGrid();
  });
  categoryTabsContainer.appendChild(allBtn);

  // Game categories
  for (const cat of spec.categories) {
    const btn = document.createElement('button');
    btn.className = `cat-tab-btn ${filterCategory === cat.key ? 'active' : ''}`;
    btn.textContent = `${cat.nameAr} (${cat.nameEn})`;
    btn.addEventListener('click', () => {
      filterCategory = cat.key;
      renderCategoryTabs();
      renderAssetsGrid();
    });
    categoryTabsContainer.appendChild(btn);
  }
}

// Render Assets Grid
function renderAssetsGrid() {
  const spec = GAME_ASSETS_SPEC[currentGame];
  if (!spec) return;

  const items = spec.items;
  let filtered = items;

  // Category filter
  if (filterCategory !== 'all') {
    filtered = filtered.filter(item => item.category === filterCategory);
  }

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(item =>
      item.nameAr.toLowerCase().includes(q) ||
      item.nameEn.toLowerCase().includes(q) ||
      item.key.toLowerCase().includes(q)
    );
  }

  // Status filter (completed vs missing)
  if (filterStatus === 'completed') {
    filtered = filtered.filter(item => Boolean(bundleData.assets[item.key]));
  } else if (filterStatus === 'missing') {
    filtered = filtered.filter(item => !bundleData.assets[item.key]);
  }

  assetsGridContainer.innerHTML = '';

  if (filtered.length === 0) {
    assetsGridContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted); background: var(--surface); border-radius: var(--radius-md); border: 1px dashed var(--border);">
        🔍 لا توجد عناصر تطابق معايير البحث أو التصفية المحددة.
      </div>
    `;
    return;
  }

  for (const item of filtered) {
    const card = createAssetCard(item);
    assetsGridContainer.appendChild(card);
  }
}

// Create Card DOM for a single game item
function createAssetCard(item) {
  const assetUrl = bundleData.assets[item.key] || null;
  const isCompleted = Boolean(assetUrl);

  const card = document.createElement('div');
  card.className = `asset-card ${isCompleted ? 'is-completed' : ''}`;
  card.dataset.key = item.key;

  // Preview Box
  const previewBox = document.createElement('div');
  previewBox.className = `asset-preview-box ${isCompleted ? 'has-image' : ''}`;
  previewBox.title = isCompleted ? 'انقر لاستبدال الصورة' : 'انقر لرفع صورة الورقة/القطعة';

  if (isCompleted) {
    previewBox.innerHTML = `
      <img src="${assetUrl}" class="asset-image-render" alt="${item.nameAr}">
      <span class="asset-status-badge status-badge-complete">🟢 مكتملة</span>
    `;
  } else {
    previewBox.innerHTML = `
      <div class="asset-placeholder">
        <span class="asset-placeholder-symbol">${item.symbol || '🎴'}</span>
        <span>+ رفع صورة</span>
      </div>
      <span class="asset-status-badge status-badge-missing">⚪ ناقصة</span>
    `;
  }

  // Click on preview triggers file upload
  previewBox.addEventListener('click', () => triggerUpload(item.key));

  // Drag & Drop handlers
  previewBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    card.classList.add('is-drag-over');
  });
  previewBox.addEventListener('dragleave', () => card.classList.remove('is-drag-over'));
  previewBox.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('is-drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(item.key, e.dataTransfer.files[0]);
    }
  });

  // Metadata
  const meta = document.createElement('div');
  meta.className = 'asset-meta';
  meta.innerHTML = `
    <div class="asset-name-ar" title="${item.nameAr}">${escapeHtml(item.nameAr)}</div>
    <div class="asset-key-tag">${escapeHtml(item.key)}</div>
  `;

  // Actions
  const actions = document.createElement('div');
  actions.className = 'asset-actions';

  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'btn btn-outline btn-upload-asset';
  uploadBtn.innerHTML = isCompleted ? '🔄 استبدال' : '📤 رفع';
  uploadBtn.addEventListener('click', () => triggerUpload(item.key));
  actions.appendChild(uploadBtn);

  if (isCompleted) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-outline btn-delete-asset';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'حذف الصورة';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteAsset(item.key);
    });
    actions.appendChild(deleteBtn);
  }

  card.appendChild(previewBox);
  card.appendChild(meta);
  card.appendChild(actions);

  return card;
}

// Trigger File Picker for itemKey
function triggerUpload(itemKey) {
  activeUploadKey = itemKey;
  hiddenFileInput.value = '';
  hiddenFileInput.click();
}

// Handle File Input Selection
hiddenFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0] && activeUploadKey) {
    handleFileUpload(activeUploadKey, e.target.files[0]);
  }
});

// Upload Asset Implementation
async function handleFileUpload(itemKey, file) {
  // Validate MIME
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!allowed.includes(file.type)) {
    showToast('صيغة غير مدعومة. يرجى اختيار PNG أو JPG أو WebP أو SVG', 'error');
    return;
  }

  // Validate size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('حجم الملف يتجاوز الحد المسموح (5 ميجابايت)', 'error');
    return;
  }

  // If bundle is brand new and not saved yet, save it as draft first!
  if (!bundleData.id || currentBundleId === 'new') {
    const newId = await saveBundle('draft');
    if (!newId) return;
  }

  // Convert to base64
  const reader = new FileReader();
  reader.onload = async () => {
    const base64Data = reader.result;
    try {
      showToast(`جاري رفع صورة ${itemKey}...`, 'info');
      const res = await fetch(`/api/admin/bundles/${encodeURIComponent(bundleData.id)}/asset`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          itemKey,
          mimeType: file.type,
          imageBase64: base64Data
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.errorAr || data.error || 'فشل رفع الصورة');
      }

      // Update state
      bundleData.assets[itemKey] = data.assetUrl;
      skinAssets.getAsset(bundleData.id, itemKey); // Refresh cache
      showToast(`تم رفع صورة "${itemKey}" بنجاح!`, 'success');

      updateProgressUI();
      renderAssetsGrid();
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

// Delete Asset Implementation
async function handleDeleteAsset(itemKey) {
  if (!confirm(`هل أنت متأكد من حذف صورة "${itemKey}"؟`)) return;

  try {
    const res = await fetch(`/api/admin/bundles/${encodeURIComponent(bundleData.id)}/asset/${encodeURIComponent(itemKey)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.errorAr || data.error || 'فشل حذف الصورة');
    }

    delete bundleData.assets[itemKey];
    showToast(`تم حذف صورة "${itemKey}" بنجاح.`, 'info');

    updateProgressUI();
    renderAssetsGrid();
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
}

// Update Progress UI & Counters
function updateProgressUI() {
  const spec = GAME_ASSETS_SPEC[currentGame];
  if (!spec) return;

  const total = spec.items.length;
  const assets = bundleData.assets || {};
  const completed = Object.keys(assets).length;
  const missing = Math.max(0, total - completed);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  progressCountsText.textContent = `${completed} / ${total} مكتمل (${percent}%)`;
  progressBarFill.style.width = `${percent}%`;

  countAllBadge.textContent = total;
  countCompletedBadge.textContent = completed;
  countMissingBadge.textContent = missing;
}

// Show Preview Modal
function openPreviewModal() {
  const spec = GAME_ASSETS_SPEC[currentGame];
  if (!spec) return;

  document.getElementById('preview-game-badge').textContent = currentGame.toUpperCase();
  document.getElementById('preview-bundle-name-display').textContent = bundleNameInput.value.trim() || 'حزمة بدون اسم';
  document.getElementById('preview-bundle-desc-display').textContent = bundleDescInput.value.trim() || 'لا يوجد وصف مضاف بعد';
  document.getElementById('preview-bundle-price-display').textContent = bundlePriceInput.value || '25';

  const total = spec.items.length;
  const completed = Object.keys(bundleData.assets || {}).length;
  const isComplete = completed >= total;

  const summary = document.getElementById('preview-status-summary');
  if (isComplete) {
    summary.className = 'preview-status-summary complete';
    summary.innerHTML = `✅ <strong>الحزمة مكتملة بالكامل (${completed} / ${total}) ومؤهلة للنشر في المتجر.</strong>`;
  } else {
    summary.className = 'preview-status-summary incomplete';
    summary.innerHTML = `⚠️ <strong>الحزمة تحتوي على صور ناقصة (${completed} من أصل ${total}). يفضل إكمالها قبل النشر.</strong>`;
  }

  const grid = document.getElementById('preview-showcase-grid');
  grid.innerHTML = '';

  for (const item of spec.items) {
    const assetUrl = bundleData.assets?.[item.key];
    const el = document.createElement('div');
    el.className = `preview-showcase-item ${assetUrl ? '' : 'missing'}`;
    el.innerHTML = `
      ${assetUrl ? `<img src="${assetUrl}" alt="${item.nameAr}">` : `<div style="font-size: 1.8rem;">${item.symbol || '🎴'}</div>`}
      <span style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(item.nameAr)}</span>
    `;
    grid.appendChild(el);
  }

  previewModal.style.display = 'flex';
}

function closePreviewModal() {
  previewModal.style.display = 'none';
}

// Event Listeners
gameSelect.addEventListener('change', () => {
  currentGame = gameSelect.value;
  filterCategory = 'all';
  loadBundlesList();
  loadBundle('new');
});

bundleSelect.addEventListener('change', () => {
  loadBundle(bundleSelect.value);
});

btnRefreshBundles.addEventListener('click', () => {
  loadBundlesList();
  showToast('تم تحديث قائمة الحزم', 'info');
});

btnSaveDraft.addEventListener('click', () => saveBundle('draft'));

btnPublishBundle.addEventListener('click', () => {
  const spec = GAME_ASSETS_SPEC[currentGame];
  const completed = Object.keys(bundleData.assets || {}).length;
  const total = spec?.items?.length || 0;

  if (completed < total) {
    if (!confirm(`تنبيه: الحزمة غير مكتملة بعد (${completed} من أصل ${total}). هل ترغب في نشرها بالمتجر الآن رغم النقص؟`)) {
      return;
    }
  }
  saveBundle('published');
});

btnDeleteBundle.addEventListener('click', async () => {
  if (!bundleData.id) return;
  if (!confirm(`تحذير: هل أنت متأكد من حذف الحزمة "${bundleData.name}" نهائياً وجميع أصولها؟`)) return;

  try {
    const res = await fetch(`/api/admin/skins/${encodeURIComponent(bundleData.id)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('فشل حذف الحزمة');

    showToast('تم حذف الحزمة بنجاح', 'info');
    loadBundlesList();
    loadBundle('new');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

btnPreviewBundle.addEventListener('click', openPreviewModal);
btnClosePreview.addEventListener('click', closePreviewModal);
btnPreviewCloseFooter.addEventListener('click', closePreviewModal);
btnPreviewPublishAction.addEventListener('click', () => {
  closePreviewModal();
  saveBundle('published');
});

// Search & Filter Listeners
assetSearchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  renderAssetsGrid();
});

filterAllBtn.addEventListener('click', () => {
  filterStatus = 'all';
  [filterAllBtn, filterCompletedBtn, filterMissingBtn].forEach(b => b.classList.remove('active'));
  filterAllBtn.classList.add('active');
  renderAssetsGrid();
});

filterCompletedBtn.addEventListener('click', () => {
  filterStatus = 'completed';
  [filterAllBtn, filterCompletedBtn, filterMissingBtn].forEach(b => b.classList.remove('active'));
  filterCompletedBtn.classList.add('active');
  renderAssetsGrid();
});

filterMissingBtn.addEventListener('click', () => {
  filterStatus = 'missing';
  [filterAllBtn, filterCompletedBtn, filterMissingBtn].forEach(b => b.classList.remove('active'));
  filterMissingBtn.classList.add('active');
  renderAssetsGrid();
});

// Initial Load
(async () => {
  const authed = await checkAuth();
  if (!authed) return;

  // Check URL params (e.g. ?id=xxx or ?game=uno)
  const params = new URLSearchParams(window.location.search);
  const paramGame = params.get('game');
  const paramId = params.get('id');

  if (paramGame && ['uno', 'chess', 'domino'].includes(paramGame.toLowerCase())) {
    currentGame = paramGame.toLowerCase();
    gameSelect.value = currentGame;
  }

  await loadBundlesList();

  if (paramId) {
    await loadBundle(paramId);
  } else {
    await loadBundle('new');
  }
})();
