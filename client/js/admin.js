/**
 * Admin Dashboard Controller
 * Authoritative client-side manager for Users, Sub-Admins, Granular Permissions, Skins & Audit Logs.
 */

import api from './api.js';
import ui from './ui.js';
import { showToast, sfx, escapeHtml } from './utils.js';

const AVAILABLE_PERMISSIONS = [
  { id: 'users.view', label: 'عرض الحسابات والبحث', category: 'users' },
  { id: 'users.ban', label: 'حظر المستخدمين', category: 'users' },
  { id: 'users.unban', label: 'فك حظر المستخدمين', category: 'users' },
  { id: 'users.delete', label: 'حذف الحسابات', category: 'users' },
  { id: 'skins.view', label: 'عرض وإدارة السكنات', category: 'skins' },
  { id: 'skins.create', label: 'إنشاء سكن جديد', category: 'skins' },
  { id: 'skins.edit', label: 'تعديل السكنات', category: 'skins' },
  { id: 'skins.publish', label: 'نشر السكن في المتجر', category: 'skins' },
  { id: 'skins.unpublish', label: 'إخفاء السكن من المتجر', category: 'skins' },
  { id: 'skins.set_price', label: 'تحديد وتعديل سعر السكن', category: 'skins' },
  { id: 'skins.delete', label: 'حذف السكنات', category: 'skins' },
  { id: 'audit.view', label: 'عرض سجل التدقيق', category: 'audit' }
];

let currentUser = null;
let currentUsersList = [];
let targetActionUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
  ui.setupGlobalNav();

  // 1. Authenticate admin access
  const token = api.getToken();
  if (!token) {
    window.location.href = '/login.html?redirect=/admin.html';
    return;
  }

  try {
    const res = await api.request('/me');
    currentUser = res.user;
    if (!currentUser || (currentUser.role !== 'super_admin' && currentUser.role !== 'sub_admin')) {
      showToast('غير مصرح: هذا القسم مخصص للإدارة فقط', 'error');
      setTimeout(() => { window.location.href = '/lobby.html'; }, 1000);
      return;
    }
  } catch (err) {
    api.logout();
    return;
  }

  // 2. Setup Admin Profile in Sidebar
  setupAdminSidebar();

  // 3. Setup Navigation Tabs
  setupTabNavigation();

  // 4. Setup Modals
  setupModals();

  // 5. Initial Data Load
  loadOverviewStats();
  loadUsers();
  if (currentUser.role === 'super_admin') {
    loadSubAdmins();
  }
  loadSkins();
  loadAuditLogs();
});

function hasPermission(perm) {
  if (!currentUser) return false;
  if (currentUser.role === 'super_admin') return true;
  if (currentUser.role === 'sub_admin' && currentUser.permissions) {
    return currentUser.permissions.includes(perm);
  }
  return false;
}

function setupAdminSidebar() {
  const avatarEl = document.getElementById('admin-sidebar-avatar');
  const usernameEl = document.getElementById('admin-sidebar-username');
  const roleEl = document.getElementById('admin-sidebar-role');

  if (avatarEl) avatarEl.className = `admin-profile-avatar ${currentUser.avatar || 'avatar1'}`;
  if (usernameEl) usernameEl.textContent = currentUser.username;
  if (roleEl) {
    if (currentUser.role === 'super_admin') {
      roleEl.textContent = '👑 Super Admin';
      roleEl.className = 'admin-role-badge admin-role-super';
    } else {
      roleEl.textContent = '🛡️ Sub Admin';
      roleEl.className = 'admin-role-badge admin-role-sub';
    }
  }

  // Hide sub-admins management tab if not Super Admin
  const subAdminsTab = document.getElementById('tab-subadmins');
  if (subAdminsTab && currentUser.role !== 'super_admin') {
    subAdminsTab.style.display = 'none';
  }

  // Hide tabs according to permissions
  if (!hasPermission('users.view')) {
    const t = document.getElementById('tab-users');
    if (t) t.style.display = 'none';
  }
  if (!hasPermission('skins.view')) {
    const t = document.getElementById('tab-skins');
    if (t) t.style.display = 'none';
  }
  if (!hasPermission('audit.view')) {
    const t = document.getElementById('tab-audit');
    if (t) t.style.display = 'none';
  }
}

function setupTabNavigation() {
  const navItems = document.querySelectorAll('.admin-nav-item');
  const sections = document.querySelectorAll('.admin-section');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      navItems.forEach(n => n.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      item.classList.add('active');
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.classList.add('active');
      }
      sfx.click();
    });
  });

  // Refresh buttons
  document.getElementById('btn-refresh-users')?.addEventListener('click', loadUsers);
  document.getElementById('btn-refresh-audit')?.addEventListener('click', loadAuditLogs);

  // Filters
  document.getElementById('user-search-input')?.addEventListener('input', debounce(loadUsers, 300));
  document.getElementById('user-role-filter')?.addEventListener('change', loadUsers);
  document.getElementById('user-ban-filter')?.addEventListener('change', loadUsers);
  document.getElementById('skin-game-filter')?.addEventListener('change', loadSkins);
}

// ==========================================
// Overview Section
// ==========================================
async function loadOverviewStats() {
  try {
    const usersRes = await api.getAdminUsers({ limit: 1000 }).catch(() => ({ users: [] }));
    const allUsers = usersRes.users || [];
    const skins = await api.getAdminSkins().catch(() => []);

    const totalUsers = allUsers.length;
    const bannedUsers = allUsers.filter(u => u.isBanned).length;
    const subAdmins = allUsers.filter(u => u.role === 'sub_admin').length;

    const elTotal = document.getElementById('stat-total-users');
    const elBanned = document.getElementById('stat-banned-users');
    const elSub = document.getElementById('stat-subadmins');
    const elSkins = document.getElementById('stat-total-skins');

    if (elTotal) elTotal.textContent = totalUsers;
    if (elBanned) elBanned.textContent = bannedUsers;
    if (elSub) elSub.textContent = subAdmins;
    if (elSkins) elSkins.textContent = skins.length;
  } catch (err) {
    console.error('Failed to load stats', err);
  }
}

// ==========================================
// Users Management
// ==========================================
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody || !hasPermission('users.view')) return;

  const search = document.getElementById('user-search-input')?.value.trim() || '';
  const role = document.getElementById('user-role-filter')?.value || '';
  const isBanned = document.getElementById('user-ban-filter')?.value || '';

  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">جاري تحميل الحسابات...</td></tr>';

  try {
    const res = await api.getAdminUsers({ search, role, isBanned });
    currentUsersList = res.users || [];

    if (currentUsersList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد حسابات مطابقة للبحث</td></tr>';
      return;
    }

    tbody.innerHTML = currentUsersList.map(u => {
      const isSuper = u.role === 'super_admin';
      const isSub = u.role === 'sub_admin';
      const isSelf = u.id === currentUser.id;

      let roleBadge = '<span class="badge" style="background: rgba(255,255,255,0.1);">مستخدم عادي</span>';
      if (isSuper) {
        roleBadge = '<span class="badge admin-role-super">👑 Super Admin</span>';
      } else if (isSub) {
        roleBadge = '<span class="badge admin-role-sub">🛡️ Sub Admin</span>';
      }

      const statusBadge = u.isBanned
        ? `<span class="status-badge status-banned" title="${escapeHtml(u.banReason || 'محظور')}">🚫 محظور</span>`
        : '<span class="status-badge status-active">🟢 نشط</span>';

      const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '--';

      // Action buttons
      let actionButtons = '';
      if (!isSuper && !isSelf) {
        // Ban / Unban
        if (u.isBanned) {
          if (hasPermission('users.unban')) {
            actionButtons += `<button class="btn btn-sm btn-outline unban-user-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}">فك الحظر</button>`;
          }
        } else {
          if (hasPermission('users.ban')) {
            actionButtons += `<button class="btn btn-sm btn-danger ban-user-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}">حظر</button>`;
          }
        }

        // Delete user
        if (hasPermission('users.delete')) {
          actionButtons += `<button class="btn btn-sm btn-outline delete-user-btn" style="color: var(--danger); border-color: var(--danger);" data-id="${u.id}" data-username="${escapeHtml(u.username)}">حذف</button>`;
        }
      }

      return `
        <tr>
          <td>
            <div class="user-cell">
              <div class="avatar-badge ${u.avatar || 'avatar1'}" style="width: 32px; height: 32px;"></div>
              <div>
                <strong>${escapeHtml(u.username)}</strong>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(u.email || 'بدون بريد')}</div>
              </div>
            </div>
          </td>
          <td>${roleBadge}</td>
          <td><strong style="color: var(--warning);">${u.totalPoints || 0}</strong></td>
          <td>${statusBadge}</td>
          <td style="color: var(--text-muted); font-size: 0.85rem;">${dateStr}</td>
          <td>
            <div class="action-btns-group">
              ${actionButtons || '<span style="color: var(--text-muted); font-size: 0.8rem;">محمي</span>'}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach event listeners for user actions
    tbody.querySelectorAll('.ban-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const username = btn.getAttribute('data-username');
        openBanModal(id, username);
      });
    });

    tbody.querySelectorAll('.unban-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const username = btn.getAttribute('data-username');
        if (confirm(`هل تريد فك الحظر عن الحساب ${username}؟`)) {
          try {
            await api.unbanUser(id);
            showToast(`تم فك الحظر عن ${username} بنجاح`, 'success');
            loadUsers();
            loadOverviewStats();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });

    tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const username = btn.getAttribute('data-username');
        openDeleteModal(id, username);
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 2rem;">خطأ في تحميل الحسابات: ${err.message}</td></tr>`;
  }
}

// ==========================================
// Sub-Admins Management
// ==========================================
async function loadSubAdmins() {
  const container = document.getElementById('subadmins-container');
  if (!container || currentUser.role !== 'super_admin') return;

  container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">جاري تحميل المديرين الفرعيين...</div>';

  try {
    const res = await api.getSubAdmins();
    const subAdmins = res.subAdmins || [];

    if (subAdmins.length === 0) {
      container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">لا يوجد أي مدير فرعي حالياً. يمكنك ترقية مستخدم بالضغط على زر الترقية أعلاه.</div>';
      return;
    }

    container.innerHTML = subAdmins.map(admin => {
      const activePerms = admin.permissions || [];
      const permCheckboxes = AVAILABLE_PERMISSIONS.map(p => {
        const isChecked = activePerms.includes(p.id) ? 'checked' : '';
        return `
          <label class="perm-checkbox-item">
            <input type="checkbox" class="subadmin-perm-toggle" data-user="${admin.id}" data-perm="${p.id}" ${isChecked}>
            <span>${p.label} <code style="font-size: 0.75rem; color: var(--text-muted);">(${p.id})</code></span>
          </label>
        `;
      }).join('');

      return `
        <div class="subadmin-card" id="subadmin-card-${admin.id}">
          <div class="subadmin-card-header">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div class="avatar-badge ${admin.avatar || 'avatar1'}" style="width: 40px; height: 40px;"></div>
              <div>
                <strong>${escapeHtml(admin.username)}</strong>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(admin.email || 'بدون بريد')}</div>
              </div>
            </div>
            <span class="badge admin-role-sub">مدير فرعي</span>
          </div>

          <div>
            <div style="font-size: 0.85rem; font-weight: 700; margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
              <span>الصلاحيات الممنوحة:</span>
              <span style="color: var(--accent);"><span class="active-perms-count-${admin.id}">${activePerms.length}</span> / ${AVAILABLE_PERMISSIONS.length}</span>
            </div>
            <div class="permissions-checklist">
              ${permCheckboxes}
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; gap: 0.5rem; margin-top: auto; padding-top: 0.75rem; border-top: 1px solid var(--border);">
            <button class="btn btn-sm btn-outline demote-subadmin-btn" data-id="${admin.id}" data-username="${escapeHtml(admin.username)}" style="color: var(--danger); border-color: var(--danger);">
              سحب الرتبة بالكامل
            </button>
            <button class="btn btn-sm btn-primary save-subadmin-perms-btn" data-id="${admin.id}">
              حفظ التعديلات
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach handlers
    container.querySelectorAll('.save-subadmin-perms-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const card = document.getElementById(`subadmin-card-${id}`);
        if (!card) return;

        const checkedBoxes = card.querySelectorAll('.subadmin-perm-toggle:checked');
        const selectedPerms = Array.from(checkedBoxes).map(cb => cb.getAttribute('data-perm'));

        try {
          await api.updateSubAdminPermissions(id, selectedPerms);
          showToast('تم تحديث صلاحيات المدير الفرعي بنجاح', 'success');
          const countEl = card.querySelector(`.active-perms-count-${id}`);
          if (countEl) countEl.textContent = selectedPerms.length;
          loadOverviewStats();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.demote-subadmin-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const username = btn.getAttribute('data-username');
        if (confirm(`هل تريد بالتأكيد سحب كافة الصلاحيات الإدارية من ${username} وإعادته كمستخدم عادي؟`)) {
          try {
            await api.demoteSubAdmin(id);
            showToast(`تم تخفيض ${username} لمستخدم عادي بنجاح`, 'success');
            loadSubAdmins();
            loadUsers();
            loadOverviewStats();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--danger); padding: 2rem;">خطأ في تحميل المديرين: ${err.message}</div>`;
  }
}

// ==========================================
// Game Skins Management
// ==========================================
async function loadSkins() {
  const container = document.getElementById('skins-admin-container');
  if (!container || !hasPermission('skins.view')) return;

  const gameFilter = document.getElementById('skin-game-filter')?.value || '';

  container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">جاري تحميل السكنات...</div>';

  try {
    const allSkins = await api.getAdminSkins();
    const filtered = gameFilter ? allSkins.filter(s => s.gameType === gameFilter) : allSkins;

    if (filtered.length === 0) {
      container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد سكنات مضافة. يمكنك إنشاء سكن جديد الآن.</div>';
      return;
    }

    container.innerHTML = filtered.map(skin => {
      const isPublished = skin.status === 'published';
      const statusBadge = isPublished
        ? '<span class="status-badge status-active">منشور بالمتجر</span>'
        : '<span class="status-badge status-banned" style="color: var(--warning); border-color: var(--warning);">مسودة مخفية</span>';

      const gameNames = { uno: '🃏 أونو (UNO)', chess: '♟️ شطرنج (Chess)', domino: '🁢 دومينو (Domino)' };
      const gameLabel = gameNames[skin.gameType] || skin.gameType;

      return `
        <div class="skin-admin-card">
          <div class="skin-preview-banner">
            <span class="badge badge-info" style="position: absolute; top: 8px; right: 8px;">${gameLabel}</span>
            <div class="skin-preview-sample">
              <span style="font-size: 2.2rem;">${skin.gameType === 'chess' ? '♚' : (skin.gameType === 'domino' ? '🁢' : '🎴')}</span>
            </div>
          </div>
          <div class="skin-admin-body">
            <div class="skin-admin-title">${escapeHtml(skin.name)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; min-height: 2.4rem;">
              ${escapeHtml(skin.description || 'لا يوجد وصف')}
            </div>
            <div class="skin-admin-meta">
              <div class="skin-admin-price">⭐ ${skin.price} نقطة</div>
              <div>${statusBadge}</div>
            </div>
          </div>
          <div class="skin-admin-footer">
            <button class="btn btn-sm btn-outline edit-skin-btn"
                    data-id="${skin.id}"
                    data-game="${skin.gameType}"
                    data-name="${escapeHtml(skin.name)}"
                    data-desc="${escapeHtml(skin.description || '')}"
                    data-price="${skin.price}"
                    data-status="${skin.status}">
              تعديل
            </button>
            ${hasPermission('skins.delete') ? `<button class="btn btn-sm btn-outline delete-skin-btn" style="color: var(--danger); border-color: var(--danger);" data-id="${skin.id}" data-name="${escapeHtml(skin.name)}">حذف</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.edit-skin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openSkinModal({
          id: btn.getAttribute('data-id'),
          gameType: btn.getAttribute('data-game'),
          name: btn.getAttribute('data-name'),
          description: btn.getAttribute('data-desc'),
          price: btn.getAttribute('data-price'),
          status: btn.getAttribute('data-status')
        });
      });
    });

    container.querySelectorAll('.delete-skin-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        if (confirm(`هل تريد بالتأكيد حذف السكن "${name}"؟`)) {
          try {
            await api.deleteAdminSkin(id);
            showToast('تم حذف السكن بنجاح', 'success');
            loadSkins();
            loadOverviewStats();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--danger); padding: 2rem;">خطأ في تحميل السكنات: ${err.message}</div>`;
  }
}

// ==========================================
// Audit Logs
// ==========================================
async function loadAuditLogs() {
  const tbody = document.getElementById('audit-tbody');
  if (!tbody || !hasPermission('audit.view')) return;

  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">جاري تحميل سجل التدقيق...</td></tr>';

  try {
    const res = await api.getAdminAuditLogs({ limit: 100 });
    const logs = res.logs || [];

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">سجل التدقيق فارغ حالياً</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const dateStr = l.created_at ? new Date(l.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'medium' }) : '--';
      let detailsSummary = '';
      if (l.details && typeof l.details === 'object') {
        detailsSummary = Object.entries(l.details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ');
      }

      return `
        <tr>
          <td style="white-space: nowrap; font-size: 0.85rem; color: var(--text-muted);">${dateStr}</td>
          <td><strong>${escapeHtml(l.admin_username)}</strong></td>
          <td><span class="badge badge-info">${escapeHtml(l.action)}</span></td>
          <td style="font-size: 0.85rem;">${escapeHtml(l.target_type || '-')}: <code>${escapeHtml(l.target_id || '-')}</code></td>
          <td style="font-size: 0.85rem; color: var(--text-muted); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(detailsSummary)}">
            ${escapeHtml(detailsSummary || '-')}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger); padding: 2rem;">خطأ في تحميل السجل: ${err.message}</td></tr>`;
  }
}

// ==========================================
// Modals Handlers
// ==========================================
function setupModals() {
  // Ban User Modal
  const banModal = document.getElementById('modal-ban-user');
  document.getElementById('close-ban-modal')?.addEventListener('click', () => banModal?.classList.remove('active'));
  document.getElementById('cancel-ban-btn')?.addEventListener('click', () => banModal?.classList.remove('active'));
  document.getElementById('confirm-ban-btn')?.addEventListener('click', async () => {
    if (!targetActionUserId) return;
    const reason = document.getElementById('ban-reason-input')?.value.trim() || 'Violation of platform rules';
    try {
      await api.banUser(targetActionUserId, reason);
      showToast('تم حظر المستخدم وإبطال جلساته فورياً', 'success');
      banModal?.classList.remove('active');
      loadUsers();
      loadOverviewStats();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Delete User Modal
  const deleteModal = document.getElementById('modal-delete-user');
  document.getElementById('close-delete-modal')?.addEventListener('click', () => deleteModal?.classList.remove('active'));
  document.getElementById('cancel-delete-btn')?.addEventListener('click', () => deleteModal?.classList.remove('active'));
  document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
    if (!targetActionUserId) return;
    try {
      await api.deleteUser(targetActionUserId);
      showToast('تم حذف الحساب نهائياً', 'success');
      deleteModal?.classList.remove('active');
      loadUsers();
      loadOverviewStats();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Skin Editor Modal
  const skinModal = document.getElementById('modal-skin-editor');
  document.getElementById('btn-open-skin-modal')?.addEventListener('click', () => {
    openSkinModal();
  });
  document.getElementById('close-skin-modal')?.addEventListener('click', () => skinModal?.classList.remove('active'));
  document.getElementById('cancel-skin-btn')?.addEventListener('click', () => skinModal?.classList.remove('active'));
  document.getElementById('save-skin-btn')?.addEventListener('click', async () => {
    const skinId = document.getElementById('skin-id-input')?.value;
    const gameType = document.getElementById('skin-game-input')?.value;
    const name = document.getElementById('skin-name-input')?.value.trim();
    const description = document.getElementById('skin-desc-input')?.value.trim();
    const price = parseInt(document.getElementById('skin-price-input')?.value, 10) || 0;
    const status = document.getElementById('skin-status-input')?.value || 'published';

    if (!name) {
      showToast('اسم السكن مطلوب', 'error');
      return;
    }

    try {
      if (skinId) {
        await api.updateAdminSkin(skinId, { gameType, name, description, price, status });
        showToast('تم تحديث السكن بنجاح', 'success');
      } else {
        await api.createAdminSkin({ gameType, name, description, price, status });
        showToast('تم إنشاء السكن وإضافته للمتجر', 'success');
      }
      skinModal?.classList.remove('active');
      loadSkins();
      loadOverviewStats();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Promote Sub-Admin Modal
  const promoteModal = document.getElementById('modal-promote-admin');
  document.getElementById('btn-open-promote-modal')?.addEventListener('click', openPromoteModal);
  document.getElementById('close-promote-modal')?.addEventListener('click', () => promoteModal?.classList.remove('active'));
  document.getElementById('cancel-promote-btn')?.addEventListener('click', () => promoteModal?.classList.remove('active'));
  document.getElementById('save-promote-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('promote-user-select');
    const userId = select?.value;
    if (!userId) {
      showToast('يرجى اختيار مستخدم للترقية', 'error');
      return;
    }

    const checkedBoxes = document.querySelectorAll('#promote-permissions-list input[type="checkbox"]:checked');
    const selectedPerms = Array.from(checkedBoxes).map(cb => cb.getAttribute('data-perm'));

    try {
      await api.promoteSubAdmin(userId, selectedPerms);
      showToast('تم ترقية المستخدم لمدير فرعي بنجاح', 'success');
      promoteModal?.classList.remove('active');
      loadSubAdmins();
      loadUsers();
      loadOverviewStats();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openBanModal(userId, username) {
  targetActionUserId = userId;
  const usernameSpan = document.getElementById('ban-target-username');
  if (usernameSpan) usernameSpan.textContent = username;
  const reasonInput = document.getElementById('ban-reason-input');
  if (reasonInput) reasonInput.value = '';
  document.getElementById('modal-ban-user')?.classList.add('active');
}

function openDeleteModal(userId, username) {
  targetActionUserId = userId;
  const usernameSpan = document.getElementById('delete-target-username');
  if (usernameSpan) usernameSpan.textContent = username;
  document.getElementById('modal-delete-user')?.classList.add('active');
}

function openSkinModal(skin = null) {
  const modal = document.getElementById('modal-skin-editor');
  const title = document.getElementById('skin-modal-title');
  const idInput = document.getElementById('skin-id-input');
  const gameInput = document.getElementById('skin-game-input');
  const nameInput = document.getElementById('skin-name-input');
  const descInput = document.getElementById('skin-desc-input');
  const priceInput = document.getElementById('skin-price-input');
  const statusInput = document.getElementById('skin-status-input');

  if (skin) {
    if (title) title.textContent = '🎨 تعديل السكن';
    if (idInput) idInput.value = skin.id;
    if (gameInput) gameInput.value = skin.gameType;
    if (nameInput) nameInput.value = skin.name;
    if (descInput) descInput.value = skin.description || '';
    if (priceInput) priceInput.value = skin.price || 0;
    if (statusInput) statusInput.value = skin.status || 'published';
  } else {
    if (title) title.textContent = '🎨 إضافة سكن جديد';
    if (idInput) idInput.value = '';
    if (gameInput) gameInput.value = 'uno';
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (priceInput) priceInput.value = '25';
    if (statusInput) statusInput.value = 'published';
  }

  modal?.classList.add('active');
}

async function openPromoteModal() {
  const modal = document.getElementById('modal-promote-admin');
  const select = document.getElementById('promote-user-select');
  const list = document.getElementById('promote-permissions-list');

  if (!modal || !select || !list) return;

  select.innerHTML = '<option value="">جاري تحميل المستخدمين...</option>';
  list.innerHTML = AVAILABLE_PERMISSIONS.map(p => `
    <label class="perm-checkbox-item">
      <input type="checkbox" data-perm="${p.id}">
      <span>${p.label} <code style="font-size: 0.75rem; color: var(--text-muted);">(${p.id})</code></span>
    </label>
  `).join('');

  modal.classList.add('active');

  try {
    const res = await api.getAdminUsers({ role: 'user', limit: 200 });
    const eligibleUsers = (res.users || []).filter(u => u.role === 'user' && !u.isBanned);

    if (eligibleUsers.length === 0) {
      select.innerHTML = '<option value="">لا يوجد مستخدمين عاديين متاحين للترقية</option>';
      return;
    }

    select.innerHTML = '<option value="">-- اختر مستخدم مسجل --</option>' + eligibleUsers.map(u => `
      <option value="${u.id}">${escapeHtml(u.username)} (${escapeHtml(u.email || 'بدون بريد')})</option>
    `).join('');
  } catch (err) {
    select.innerHTML = `<option value="">خطأ في التحميل: ${err.message}</option>`;
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
