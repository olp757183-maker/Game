/**
 * Database Layer for Classic Games Online
 * Uses SQLite (via Node.js built-in node:sqlite DatabaseSync)
 * Schema structured to easily migrate to PostgreSQL in production.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'classic_games.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT,
    avatar TEXT,
    is_guest INTEGER DEFAULT 0,
    preferences_json TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_stats (
    user_id TEXT NOT NULL,
    game TEXT NOT NULL,
    matches_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, game),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    host_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    status TEXT NOT NULL,
    max_players INTEGER NOT NULL,
    privacy TEXT NOT NULL,
    settings_json TEXT,
    rules_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS room_players (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    seat INTEGER NOT NULL,
    is_host INTEGER DEFAULT 0,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    state_json TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS game_results (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    winner_id TEXT,
    scores_json TEXT,
    finished_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS match_points (
    match_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    points INTEGER NOT NULL,
    rank INTEGER,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (match_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin_permissions (
    user_id TEXT NOT NULL,
    permission TEXT NOT NULL,
    granted_by TEXT NOT NULL,
    granted_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, permission),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS skins (
    id TEXT PRIMARY KEY,
    game_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    preview_url TEXT,
    config_json TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_skins (
    user_id TEXT NOT NULL,
    skin_id TEXT NOT NULL,
    acquired_at INTEGER NOT NULL,
    price_paid INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, skin_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skin_id) REFERENCES skins(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS point_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    admin_username TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details_json TEXT,
    created_at INTEGER NOT NULL
  );
`);

// Safe migration for existing databases
try { db.exec('ALTER TABLE users ADD COLUMN preferences_json TEXT;'); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';"); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN ban_reason TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN banned_at INTEGER;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN banned_by TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE skins ADD COLUMN assets_json TEXT;'); } catch (e) {}

function formatUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    passwordHash: user.password_hash,
    avatar: user.avatar,
    isGuest: Boolean(user.is_guest),
    role: user.role || 'user',
    isBanned: Boolean(user.is_banned),
    banReason: user.ban_reason || null,
    bannedAt: user.banned_at || null,
    bannedBy: user.banned_by || null,
    preferences: user.preferences_json ? JSON.parse(user.preferences_json) : {},
    createdAt: user.created_at
  };
}

export const database = {
  // Users
  createUser({ id, username, email, passwordHash, avatar, isGuest = false, preferences = {}, role = 'user' }) {
    const stmt = db.prepare(`
      INSERT INTO users (id, username, email, password_hash, avatar, is_guest, preferences_json, role, is_banned, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);
    stmt.run(id, username, email || null, passwordHash || null, avatar || 'avatar1', isGuest ? 1 : 0, JSON.stringify(preferences), role || 'user', Date.now());
    return this.findUserById(id);
  },

  findUserById(id) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(id);
    return formatUser(user);
  },

  findUserByUsername(username) {
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');
    const user = stmt.get(username);
    return formatUser(user);
  },

  findUserByEmail(email) {
    if (!email) return null;
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)');
    const user = stmt.get(email);
    return formatUser(user);
  },

  updateUserProfile(id, { username, avatar, preferences }) {
    const updates = [];
    const values = [];
    if (username) {
      updates.push('username = ?');
      values.push(username);
    }
    if (avatar) {
      updates.push('avatar = ?');
      values.push(avatar);
    }
    if (preferences) {
      updates.push('preferences_json = ?');
      values.push(JSON.stringify(preferences));
    }
    if (updates.length === 0) return this.findUserById(id);
    values.push(id);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...values);
    return this.findUserById(id);
  },

  // User Stats
  getUserStats(userId) {
    const stmt = db.prepare('SELECT * FROM user_stats WHERE user_id = ?');
    return stmt.all(userId).map(row => ({
      game: row.game,
      matchesPlayed: row.matches_played,
      wins: row.wins,
      losses: row.losses,
      score: row.score
    }));
  },

  recordGameStat(userId, game, won, points = 0) {
    const existing = db.prepare('SELECT * FROM user_stats WHERE user_id = ? AND game = ?').get(userId, game);
    if (existing) {
      db.prepare(`
        UPDATE user_stats
        SET matches_played = matches_played + 1,
            wins = wins + ?,
            losses = losses + ?,
            score = score + ?
        WHERE user_id = ? AND game = ?
      `).run(won ? 1 : 0, won ? 0 : 1, points, userId, game);
    } else {
      db.prepare(`
        INSERT INTO user_stats (user_id, game, matches_played, wins, losses, score)
        VALUES (?, ?, 1, ?, ?, ?)
      `).run(userId, game, won ? 1 : 0, won ? 0 : 1, points);
    }
  },

  // Authoritative match points awarding with duplicate prevention
  awardMatchPoints({ matchId, userId, gameType, points = 0, rank = null, isWin = false, isLoss = false, isDraw = false }) {
    // 1. Authoritative check: registered user only!
    const user = this.findUserById(userId);
    if (!user || user.isGuest) {
      return { awarded: false, reason: 'GUEST_OR_UNKNOWN', points: 0 };
    }

    // 2. Atomic duplicate prevention check via match_points primary key
    try {
      const stmt = db.prepare(`
        INSERT INTO match_points (match_id, user_id, game_type, points, rank, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(matchId, userId, gameType, points, rank, Date.now());
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('PRIMARY KEY'))) {
        return { awarded: false, reason: 'ALREADY_AWARDED', points: 0 };
      }
      throw err;
    }

    // 3. Atomically update permanent user_stats
    const winInc = isWin ? 1 : 0;
    const lossInc = isLoss ? 1 : 0;
    const existing = db.prepare('SELECT * FROM user_stats WHERE user_id = ? AND game = ?').get(userId, gameType);
    if (existing) {
      db.prepare(`
        UPDATE user_stats
        SET matches_played = matches_played + 1,
            wins = wins + ?,
            losses = losses + ?,
            score = score + ?
        WHERE user_id = ? AND game = ?
      `).run(winInc, lossInc, points, userId, gameType);
    } else {
      db.prepare(`
        INSERT INTO user_stats (user_id, game, matches_played, wins, losses, score)
        VALUES (?, ?, 1, ?, ?, ?)
      `).run(userId, gameType, winInc, lossInc, points);
    }

    return { awarded: true, points, rank };
  },

  getMatchPoints(matchId, userId) {
    const stmt = db.prepare('SELECT * FROM match_points WHERE match_id = ? AND user_id = ?');
    return stmt.get(matchId, userId);
  },

  getUserTotalScore(userId) {
    const stmt = db.prepare('SELECT SUM(score) as total_score FROM user_stats WHERE user_id = ?');
    const row = stmt.get(userId);
    return row?.total_score || 0;
  },

  // Match Results & History
  recordMatchResult({ id, gameId, roomId, gameType, winnerId, scores, finishedAt = Date.now() }) {
    const stmt = db.prepare(`
      INSERT INTO game_results (id, game_id, room_id, game_type, winner_id, scores_json, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id || `res_${Date.now()}_${Math.random()}`,
      gameId,
      roomId,
      gameType,
      winnerId || null,
      JSON.stringify(scores || {}),
      finishedAt
    );
  },

  getMatchHistory(limit = 20) {
    const stmt = db.prepare(`
      SELECT * FROM game_results ORDER BY finished_at DESC LIMIT ?
    `);
    return stmt.all(limit).map(r => ({
      ...r,
      scores: JSON.parse(r.scores_json || '{}')
    }));
  },

  // Rooms
  saveRoom({ id, code, hostId, gameType, status, maxPlayers, privacy, settings, rules }) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO rooms (id, code, host_id, game_type, status, max_players, privacy, settings_json, rules_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      code,
      hostId,
      gameType,
      status,
      maxPlayers,
      privacy,
      JSON.stringify(settings || {}),
      JSON.stringify(rules || {}),
      Date.now()
    );
  },

  getRoom(id) {
    const stmt = db.prepare('SELECT * FROM rooms WHERE id = ?');
    return stmt.get(id);
  },

  getRoomByCode(code) {
    const stmt = db.prepare('SELECT * FROM rooms WHERE UPPER(code) = UPPER(?)');
    return stmt.get(code);
  },

  updateRoomStatus(id, status) {
    db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, id);
  },

  updateRoomHost(id, newHostId) {
    db.prepare('UPDATE rooms SET host_id = ? WHERE id = ?').run(newHostId, id);
  },

  deleteRoom(id) {
    db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
  },

  // Chat
  saveChatMessage({ id, roomId, userId, username, message, timestamp = Date.now() }) {
    db.prepare(`
      INSERT INTO chat_messages (id, room_id, user_id, username, message, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, roomId, userId, username, message, timestamp);
  },

  getRecentChatMessages(roomId, limit = 50) {
    const stmt = db.prepare(`
      SELECT * FROM chat_messages WHERE room_id = ? ORDER BY timestamp ASC LIMIT ?
    `);
    return stmt.all(roomId, limit);
  },

  // ==========================================
  // Admin & User Management
  // ==========================================
  getAllUsers({ search = '', role = '', isBanned = null, limit = 100, offset = 0 } = {}) {
    let sql = 'SELECT * FROM users WHERE is_guest = 0';
    const params = [];

    if (search) {
      sql += ' AND (LOWER(username) LIKE LOWER(?) OR LOWER(COALESCE(email, "")) LIKE LOWER(?) OR id = ?)';
      params.push(`%${search}%`, `%${search}%`, search);
    }
    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (isBanned !== null) {
      sql += ' AND is_banned = ?';
      params.push(isBanned ? 1 : 0);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(formatUser);
  },

  updateUserRole(userId, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    return this.findUserById(userId);
  },

  setUserPasswordHash(userId, passwordHash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  },

  banUser(userId, { reason = '', bannedBy = 'system' } = {}) {
    db.prepare(`
      UPDATE users
      SET is_banned = 1, ban_reason = ?, banned_at = ?, banned_by = ?
      WHERE id = ?
    `).run(reason, Date.now(), bannedBy, userId);
    return this.findUserById(userId);
  },

  unbanUser(userId) {
    db.prepare(`
      UPDATE users
      SET is_banned = 0, ban_reason = NULL, banned_at = NULL, banned_by = NULL
      WHERE id = ?
    `).run(userId);
    return this.findUserById(userId);
  },

  deleteUser(userId) {
    db.prepare('DELETE FROM admin_permissions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_skins WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM point_transactions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_stats WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM match_points WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  },

  // Admin Permissions
  getAdminPermissions(userId) {
    const stmt = db.prepare('SELECT permission FROM admin_permissions WHERE user_id = ?');
    const rows = stmt.all(userId);
    return rows.map(r => r.permission);
  },

  setAdminPermissions(userId, permissions = [], grantedBy = 'system') {
    db.prepare('DELETE FROM admin_permissions WHERE user_id = ?').run(userId);
    const stmt = db.prepare(`
      INSERT INTO admin_permissions (user_id, permission, granted_by, granted_at)
      VALUES (?, ?, ?, ?)
    `);
    const now = Date.now();
    for (const perm of permissions) {
      stmt.run(userId, perm, grantedBy, now);
    }
    return this.getAdminPermissions(userId);
  },

  hasPermission(userId, permission) {
    const user = this.findUserById(userId);
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role !== 'sub_admin') return false;

    const row = db.prepare('SELECT 1 FROM admin_permissions WHERE user_id = ? AND permission = ?').get(userId, permission);
    return Boolean(row);
  },

  // Audit Logs
  recordAdminAudit({ adminId, adminUsername, action, targetType = null, targetId = null, details = {} }) {
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const stmt = db.prepare(`
      INSERT INTO admin_audit_logs (id, admin_id, admin_username, action, target_type, target_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      adminId,
      adminUsername,
      action,
      targetType,
      targetId,
      typeof details === 'string' ? details : JSON.stringify(details),
      Date.now()
    );
    return id;
  },

  getAdminAuditLogs({ limit = 100, offset = 0 } = {}) {
    const stmt = db.prepare('SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?');
    const rows = stmt.all(limit, offset);
    return rows.map(r => ({
      ...r,
      details: r.details_json ? JSON.parse(r.details_json) : {}
    }));
  },

  // ==========================================
  // Skins & Store Management
  // ==========================================
  createSkin({ id, gameType, name, description = '', price = 0, status = 'published', previewUrl = '', configJson = '{}', assetsJson = '{}', createdBy = 'admin' }) {
    const now = Date.now();
    const skinId = id || `skin_${gameType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const stmt = db.prepare(`
      INSERT INTO skins (id, game_type, name, description, price, status, preview_url, config_json, assets_json, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      skinId,
      gameType,
      name,
      description,
      Math.max(0, parseInt(price, 10) || 0),
      status,
      previewUrl,
      typeof configJson === 'string' ? configJson : JSON.stringify(configJson),
      typeof assetsJson === 'string' ? assetsJson : JSON.stringify(assetsJson),
      createdBy,
      now,
      now
    );
    return this.getSkinById(skinId);
  },

  updateSkin(id, updates) {
    const existing = this.getSkinById(id);
    if (!existing) return null;

    const fields = [];
    const values = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.price !== undefined) { fields.push('price = ?'); values.push(Math.max(0, parseInt(updates.price, 10) || 0)); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.previewUrl !== undefined) { fields.push('preview_url = ?'); values.push(updates.previewUrl); }
    if (updates.configJson !== undefined || updates.config !== undefined) {
      const cVal = updates.configJson !== undefined ? updates.configJson : updates.config;
      fields.push('config_json = ?');
      values.push(typeof cVal === 'string' ? cVal : JSON.stringify(cVal));
    }
    if (updates.assetsJson !== undefined || updates.assets !== undefined) {
      const aVal = updates.assetsJson !== undefined ? updates.assetsJson : updates.assets;
      fields.push('assets_json = ?');
      values.push(typeof aVal === 'string' ? aVal : JSON.stringify(aVal));
    }

    fields.push('updated_at = ?');
    values.push(Date.now());

    values.push(id);
    db.prepare(`UPDATE skins SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getSkinById(id);
  },

  setSkinAsset(skinId, itemKey, assetUrl) {
    const skin = this.getSkinById(skinId);
    if (!skin) return null;
    const currentAssets = skin.assets || {};
    currentAssets[itemKey] = assetUrl;
    return this.updateSkin(skinId, { assetsJson: currentAssets });
  },

  deleteSkinAsset(skinId, itemKey) {
    const skin = this.getSkinById(skinId);
    if (!skin) return null;
    const currentAssets = skin.assets || {};
    delete currentAssets[itemKey];
    return this.updateSkin(skinId, { assetsJson: currentAssets });
  },

  deleteSkin(id) {
    db.prepare('DELETE FROM user_skins WHERE skin_id = ?').run(id);
    db.prepare('DELETE FROM skins WHERE id = ?').run(id);
  },

  getSkinById(id) {
    const stmt = db.prepare('SELECT * FROM skins WHERE id = ?');
    const r = stmt.get(id);
    if (!r) return null;
    return {
      id: r.id,
      gameType: r.game_type,
      name: r.name,
      description: r.description,
      price: r.price,
      status: r.status,
      previewUrl: r.preview_url,
      config: r.config_json ? JSON.parse(r.config_json) : {},
      assets: r.assets_json ? JSON.parse(r.assets_json) : {},
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  },

  getAllSkins({ gameType = null, status = null } = {}) {
    let sql = 'SELECT * FROM skins WHERE 1=1';
    const params = [];
    if (gameType) {
      sql += ' AND game_type = ?';
      params.push(gameType);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at ASC';
    const rows = db.prepare(sql).all(...params);
    return rows.map(r => ({
      id: r.id,
      gameType: r.game_type,
      name: r.name,
      description: r.description,
      price: r.price,
      status: r.status,
      previewUrl: r.preview_url,
      config: r.config_json ? JSON.parse(r.config_json) : {},
      assets: r.assets_json ? JSON.parse(r.assets_json) : {},
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  },

  getUserOwnedSkins(userId, gameType = null) {
    let sql = `
      SELECT s.*, us.acquired_at, us.price_paid
      FROM user_skins us
      JOIN skins s ON us.skin_id = s.id
      WHERE us.user_id = ?
    `;
    const params = [userId];
    if (gameType) {
      sql += ' AND s.game_type = ?';
      params.push(gameType);
    }
    const rows = db.prepare(sql).all(...params);
    return rows.map(r => ({
      id: r.id,
      gameType: r.game_type,
      name: r.name,
      description: r.description,
      price: r.price,
      status: r.status,
      previewUrl: r.preview_url,
      config: r.config_json ? JSON.parse(r.config_json) : {},
      assets: r.assets_json ? JSON.parse(r.assets_json) : {},
      acquiredAt: r.acquired_at,
      pricePaid: r.price_paid
    }));
  },

  hasUserSkin(userId, skinId) {
    if (!skinId || skinId === 'default') return true;
    const row = db.prepare('SELECT 1 FROM user_skins WHERE user_id = ? AND skin_id = ?').get(userId, skinId);
    return Boolean(row);
  },

  purchaseSkin(userId, skinId) {
    const user = this.findUserById(userId);
    if (!user || user.isGuest) {
      throw new Error('Only registered users can purchase skins');
    }
    const skin = this.getSkinById(skinId);
    if (!skin) {
      throw new Error('Skin not found');
    }
    if (skin.status !== 'published') {
      throw new Error('Skin is not available for purchase');
    }

    if (skin.price < 0 || isNaN(skin.price)) {
      throw new Error('Invalid skin price');
    }

    if (this.hasUserSkin(userId, skinId)) {
      throw new Error('User already owns this skin');
    }

    const currentBalance = this.getUserTotalScore(userId);
    if (skin.price > 0 && currentBalance < skin.price) {
      throw new Error(`Insufficient points. Price: ${skin.price}, Balance: ${currentBalance}`);
    }

    // Atomic transaction
    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // Re-verify under lock
      const checkOwned = db.prepare('SELECT 1 FROM user_skins WHERE user_id = ? AND skin_id = ?').get(userId, skinId);
      if (checkOwned) {
        db.exec('ROLLBACK;');
        throw new Error('User already owns this skin');
      }

      // Deduct points only if price > 0
      let needed = skin.price;
      if (needed > 0) {
        const statsRows = db.prepare('SELECT game, score FROM user_stats WHERE user_id = ? AND score > 0 ORDER BY score DESC').all(userId);
        for (const row of statsRows) {
          if (needed <= 0) break;
          const deduct = Math.min(row.score, needed);
          db.prepare('UPDATE user_stats SET score = score - ? WHERE user_id = ? AND game = ?').run(deduct, userId, row.game);
          needed -= deduct;
        }
      }

      const balanceAfter = this.getUserTotalScore(userId);

      // Record transaction
      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const txType = skin.price === 0 ? 'skin_acquisition_free' : 'skin_purchase';
      const txReason = skin.price === 0 ? `Free Bundle: ${skin.name}` : `Purchase: ${skin.name}`;

      db.prepare(`
        INSERT INTO point_transactions (id, user_id, type, amount, balance_after, reason, reference_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(txId, userId, txType, -skin.price, balanceAfter, txReason, skinId, Date.now());

      // Add to user_skins
      db.prepare(`
        INSERT INTO user_skins (user_id, skin_id, acquired_at, price_paid)
        VALUES (?, ?, ?, ?)
      `).run(userId, skinId, Date.now(), skin.price);

      db.exec('COMMIT;');

      return {
        success: true,
        skin,
        balanceAfter,
        isFree: skin.price === 0,
        transactionId: txId
      };
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch (e) {}
      throw err;
    }
  },

  getUserPointTransactions(userId, limit = 50) {
    const stmt = db.prepare('SELECT * FROM point_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?');
    return stmt.all(userId, limit);
  },

  seedDefaultSkins() {
    const defaultSkins = [
      // UNO
      {
        id: 'uno_neon',
        gameType: 'uno',
        name: 'نيون متوهج (Neon Glow)',
        description: 'بطاقات أونو عصرية بإضاءة نيون ملونة وحدود متوهجة.',
        price: 25,
        status: 'published',
        previewUrl: '/assets/skins/uno-neon.png',
        configJson: JSON.stringify({ theme: 'neon', glow: true }),
        createdBy: 'system'
      },
      {
        id: 'uno_dark',
        gameType: 'uno',
        name: 'الليلي الفاخر (Midnight Dark)',
        description: 'تصميم داكن أنيق بألوان عميقة ومريحة للعين.',
        price: 15,
        status: 'published',
        previewUrl: '/assets/skins/uno-dark.png',
        configJson: JSON.stringify({ theme: 'dark' }),
        createdBy: 'system'
      },
      // Chess
      {
        id: 'chess_royal_wood',
        gameType: 'chess',
        name: 'الخشب الملكي (Royal Wood)',
        description: 'رقعة خشبية كلاسيكية مع قطع محفورة بلون الماهوجني والعاج.',
        price: 30,
        status: 'published',
        previewUrl: '/assets/skins/chess-wood.png',
        configJson: JSON.stringify({ theme: 'wood', boardTexture: 'wood' }),
        createdBy: 'system'
      },
      {
        id: 'chess_cyber_neon',
        gameType: 'chess',
        name: 'سايبر نيون (Cyber Neon)',
        description: 'رقعة شطرنج مستقبلية بظلال زرقاء وقطع كوانتم متوهجة.',
        price: 40,
        status: 'published',
        previewUrl: '/assets/skins/chess-cyber.png',
        configJson: JSON.stringify({ theme: 'cyber', glow: true }),
        createdBy: 'system'
      },
      // Domino
      {
        id: 'domino_golden_ivory',
        gameType: 'domino',
        name: 'العاج الذهبي (Golden Ivory)',
        description: 'أحجار دومينو عاجية بنقاط ذهبية عتيقة وإطار مصقول.',
        price: 20,
        status: 'published',
        previewUrl: '/assets/skins/domino-gold.png',
        configJson: JSON.stringify({ theme: 'gold', pipColor: 'gold' }),
        createdBy: 'system'
      },
      {
        id: 'domino_obsidian_blue',
        gameType: 'domino',
        name: 'حجر الأوبسيديان (Obsidian Blue)',
        description: 'أحجار سوداء لامعة من حجر الأوبسيديان مع نقاط ساطعة باللون الأزرق الفيروزي.',
        price: 35,
        status: 'published',
        previewUrl: '/assets/skins/domino-obsidian.png',
        configJson: JSON.stringify({ theme: 'obsidian', pipColor: 'cyan' }),
        createdBy: 'system'
      }
    ];

    for (const skin of defaultSkins) {
      const existing = this.getSkinById(skin.id);
      if (!existing) {
        this.createSkin(skin);
      }
    }
  }
};

export default database;
