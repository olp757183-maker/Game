/**
 * Authentication & Session Management
 */

import crypto from 'node:crypto';
import users from './users.js';
import database from './database.js';

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

    // Immediately reject banned accounts
    if (user.isBanned) {
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

  destroyUserSessions(userId) {
    if (!userId) return;
    for (const [token, session] of sessions.entries()) {
      if (session.userId === userId) {
        sessions.delete(token);
      }
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

  // Admin middleware: super_admin or sub_admin
  requireAdmin(req, res, next) {
    auth.middleware(req, res, () => {
      if (!req.user || (req.user.role !== 'super_admin' && req.user.role !== 'sub_admin')) {
        return res.status(403).json({ error: 'Forbidden: Admin access required', errorAr: 'غير مصرح: صلاحيات الإدارة مطلوبة' });
      }
      next();
    });
  },

  // Super Admin only middleware
  requireSuperAdmin(req, res, next) {
    auth.middleware(req, res, () => {
      if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Super Admin access required', errorAr: 'غير مصرح: هذه العملية خاصة بالمدير الرئيسي فقط' });
      }
      next();
    });
  },

  // Granular Permission middleware
  requirePermission(permission) {
    return (req, res, next) => {
      auth.middleware(req, res, () => {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (req.user.role === 'super_admin') {
          return next();
        }
        if (req.user.role === 'sub_admin') {
          const has = database.hasPermission(req.user.id, permission);
          if (has) {
            return next();
          }
        }
        return res.status(403).json({
          error: `Forbidden: Missing required permission '${permission}'`,
          errorAr: `ليس لديك الصلاحية المطلوبة (${permission})`
        });
      });
    };
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
