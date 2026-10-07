/**
 * Authentication & Session Management
 */

import crypto from 'node:crypto';
import users from './users.js';

// In-memory token store: token -> { userId, expiresAt }
const sessions = new Map();
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const auth = {
  createSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    sessions.set(token, { userId, expiresAt });
    return token;
  },

  verifyToken(token) {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      sessions.delete(token);
      return null;
    }

    const user = users.getUserById(session.userId);
    if (!user) {
      sessions.delete(token);
      return null;
    }

    return user;
  },

  destroySession(token) {
    if (token) {
      sessions.delete(token);
    }
  },

  // Express middleware
  middleware(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const user = auth.verifyToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    req.user = user;
    req.token = token;
    next();
  },

  // Optional authentication middleware (for guest or public actions)
  optionalMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (token) {
      const user = auth.verifyToken(token);
      if (user) {
        req.user = user;
        req.token = token;
      }
    }
    next();
  }
};

export default auth;
