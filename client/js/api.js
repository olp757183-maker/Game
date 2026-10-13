/**
 * REST API Client
 */

class ApiService {
  constructor() {
    this.baseUrl = '/api';
  }

  getToken() {
    return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
  }

  setToken(token, sessionOnly = false) {
    if (token) {
      sessionStorage.setItem('auth_token', token);
      if (!sessionOnly) {
        localStorage.setItem('auth_token', token);
      }
    } else {
      sessionStorage.removeItem('auth_token');
      localStorage.removeItem('auth_token');
    }
  }

  getUser() {
    const raw = sessionStorage.getItem('auth_user') || localStorage.getItem('auth_user');
    return raw ? JSON.parse(raw) : null;
  }

  setUser(user, sessionOnly = false) {
    if (user) {
      sessionStorage.setItem('auth_user', JSON.stringify(user));
      if (!sessionOnly) {
        localStorage.setItem('auth_user', JSON.stringify(user));
      }
    } else {
      sessionStorage.removeItem('auth_user');
      localStorage.removeItem('auth_user');
    }
  }

  logout() {
    this.setToken(null);
    this.setUser(null);
    window.location.href = '/login.html';
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutMs = options.timeout || 12000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.errorAr || data.error || 'فشل الطلب من الخادم';
        const err = new Error(errorMsg);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('استغرقت العملية وقتًا طويلاً، يرجى المحاولة مرة أخرى');
        timeoutErr.status = 408;
        throw timeoutErr;
      }
      throw err;
    }
  }

  async register({ username, email, password, confirmPassword, avatar }) {
    const res = await this.request('/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, confirmPassword, avatar })
    });
    this.setToken(res.token);
    this.setUser(res.user);
    return res;
  }

  async login({ identifier, password }) {
    const res = await this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password })
    });
    this.setToken(res.token);
    this.setUser(res.user);
    return res;
  }

  async guest(nickname) {
    const res = await this.request('/guest', {
      method: 'POST',
      body: JSON.stringify({ nickname })
    });
    this.setToken(res.token, true);
    this.setUser(res.user, true);
    return res;
  }

  async getMe() {
    const res = await this.request('/me');
    this.setUser(res.user);
    return res.user;
  }

  async updateProfile({ username, avatar, preferences }) {
    const res = await this.request('/profile', {
      method: 'PUT',
      body: JSON.stringify({ username, avatar, preferences })
    });
    this.setUser(res.user);
    return res.user;
  }

  async getGames() {
    const res = await this.request('/games');
    return res.games;
  }

  async getRooms() {
    const res = await this.request('/rooms');
    return res.rooms;
  }

  async createRoom({ gameType, maxPlayers, privacy, rules, requestId }) {
    return this.request('/rooms', {
      method: 'POST',
      body: JSON.stringify({ gameType, maxPlayers, privacy, rules, requestId }),
      timeout: 12000
    });
  }

  async getRoom(idOrCode) {
    return this.request(`/rooms/${idOrCode}`);
  }

  async joinRoom(idOrCode) {
    return this.request(`/rooms/${idOrCode}/join`, {
      method: 'POST'
    });
  }

  // ==========================================
  // Store Client Methods
  // ==========================================
  async getStoreSkins(gameType = null) {
    const q = gameType ? `?gameType=${encodeURIComponent(gameType)}` : '';
    const res = await this.request(`/store/skins${q}`);
    return res.skins;
  }

  async getMySkins(gameType = null) {
    const q = gameType ? `?gameType=${encodeURIComponent(gameType)}` : '';
    const res = await this.request(`/store/my-skins${q}`);
    return res.skins;
  }

  async buySkin(skinId) {
    return this.request(`/store/buy/${skinId}`, {
      method: 'POST'
    });
  }

  async equipSkin(gameType, skinId) {
    return this.request('/store/equip', {
      method: 'POST',
      body: JSON.stringify({ gameType, skinId })
    });
  }

  async getTransactions(limit = 50) {
    const res = await this.request(`/store/transactions?limit=${limit}`);
    return res.transactions;
  }

  // ==========================================
  // Admin Client Methods
  // ==========================================
  async getAdminUsers({ search = '', role = '', isBanned = '', limit = 100, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (role) params.append('role', role);
    if (isBanned !== '') params.append('isBanned', isBanned);
    params.append('limit', limit);
    params.append('offset', offset);
    return this.request(`/admin/users?${params.toString()}`);
  }

  async banUser(userId, reason) {
    return this.request(`/admin/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async unbanUser(userId) {
    return this.request(`/admin/users/${userId}/unban`, {
      method: 'POST'
    });
  }

  async deleteUser(userId) {
    return this.request(`/admin/users/${userId}`, {
      method: 'DELETE'
    });
  }

  async getSubAdmins() {
    return this.request('/admin/sub-admins');
  }

  async promoteSubAdmin(userId, permissions = []) {
    return this.request(`/admin/sub-admins/${userId}/promote`, {
      method: 'POST',
      body: JSON.stringify({ permissions })
    });
  }

  async updateSubAdminPermissions(userId, permissions = []) {
    return this.request(`/admin/sub-admins/${userId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions })
    });
  }

  async demoteSubAdmin(userId) {
    return this.request(`/admin/sub-admins/${userId}/demote`, {
      method: 'POST'
    });
  }

  async getAdminAuditLogs({ limit = 100, offset = 0 } = {}) {
    return this.request(`/admin/audit-logs?limit=${limit}&offset=${offset}`);
  }

  async getAdminSkins() {
    const res = await this.request('/admin/skins');
    return res.skins;
  }

  async createAdminSkin(data) {
    return this.request('/admin/skins', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateAdminSkin(skinId, data) {
    return this.request(`/admin/skins/${skinId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteAdminSkin(skinId) {
    return this.request(`/admin/skins/${skinId}`, {
      method: 'DELETE'
    });
  }
}

export const api = new ApiService();
export default api;
