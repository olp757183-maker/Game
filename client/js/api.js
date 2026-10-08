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

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Server request failed');
    }

    return data;
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

  async createRoom({ gameType, maxPlayers, privacy, rules }) {
    return this.request('/rooms', {
      method: 'POST',
      body: JSON.stringify({ gameType, maxPlayers, privacy, rules })
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
}

export const api = new ApiService();
export default api;
