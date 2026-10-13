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
`);

// Safe migration for existing databases
try {
  db.exec('ALTER TABLE users ADD COLUMN preferences_json TEXT;');
} catch (e) {
  // Column already exists
}

export const database = {
  // Users
  createUser({ id, username, email, passwordHash, avatar, isGuest = false, preferences = {} }) {
    const stmt = db.prepare(`
      INSERT INTO users (id, username, email, password_hash, avatar, is_guest, preferences_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, username, email || null, passwordHash || null, avatar || 'avatar1', isGuest ? 1 : 0, JSON.stringify(preferences), Date.now());
    return this.findUserById(id);
  },

  findUserById(id) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(id);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.password_hash,
      avatar: user.avatar,
      isGuest: Boolean(user.is_guest),
      preferences: user.preferences_json ? JSON.parse(user.preferences_json) : {},
      createdAt: user.created_at
    };
  },

  findUserByUsername(username) {
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');
    const user = stmt.get(username);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.password_hash,
      avatar: user.avatar,
      isGuest: Boolean(user.is_guest),
      preferences: user.preferences_json ? JSON.parse(user.preferences_json) : {},
      createdAt: user.created_at
    };
  },

  findUserByEmail(email) {
    if (!email) return null;
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)');
    const user = stmt.get(email);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.password_hash,
      avatar: user.avatar,
      isGuest: Boolean(user.is_guest),
      preferences: user.preferences_json ? JSON.parse(user.preferences_json) : {},
      createdAt: user.created_at
    };
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
  }
};

export default database;
