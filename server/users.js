/**
 * User Model and Operations
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import database from './database.js';

export const users = {
  async register({ username, email, password, avatar = 'avatar1' }) {
    if (username.trim().toLowerCase() === 'madara') {
      throw new Error('This username is reserved');
    }

    // Check if username already exists
    const existingUsername = database.findUserByUsername(username);
    if (existingUsername) {
      throw new Error('Username is already taken');
    }

    if (email) {
      const existingEmail = database.findUserByEmail(email);
      if (existingEmail) {
        throw new Error('Email is already registered');
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const id = crypto.randomUUID();

    return database.createUser({
      id,
      username,
      email,
      passwordHash,
      avatar,
      isGuest: false,
      role: 'user'
    });
  },

  async authenticate({ identifier, password }) {
    if (!identifier || !password) {
      throw new Error('Identifier and password are required');
    }

    // Check by email or username
    const user = identifier.includes('@')
      ? database.findUserByEmail(identifier)
      : database.findUserByUsername(identifier);

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (user.isBanned) {
      throw new Error(`Account is banned: ${user.banReason || 'Banned by admin'}`);
    }

    if (!user.passwordHash) {
      throw new Error('Guest accounts cannot login with password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    return user;
  },

  async initSuperAdmin() {
    const superAdminUsername = 'Madara';
    const superAdminPassword = '778448638';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(superAdminPassword, salt);

    let adminUser = database.findUserByUsername(superAdminUsername);
    if (!adminUser) {
      const id = 'super-admin-madara';
      database.createUser({
        id,
        username: superAdminUsername,
        email: null,
        passwordHash,
        avatar: 'avatar1',
        isGuest: false,
        role: 'super_admin'
      });
      console.log('✓ Super Admin Madara initialized successfully.');
    } else {
      database.updateUserRole(adminUser.id, 'super_admin');
      database.setUserPasswordHash(adminUser.id, passwordHash);
    }
  },

  createGuest(nickname) {
    const randomSuffix = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
    const username = nickname ? `${nickname.trim().slice(0, 10)}_${randomSuffix}` : `Guest_${randomSuffix}`;
    const id = crypto.randomUUID();

    return database.createUser({
      id,
      username,
      email: null,
      passwordHash: null,
      avatar: 'avatar' + ((randomSuffix % 6) + 1),
      isGuest: true,
      role: 'user'
    });
  },

  getUserById(id) {
    return database.findUserById(id);
  },

  getUserProfile(id) {
    const user = database.findUserById(id);
    if (!user) return null;
    const stats = database.getUserStats(id);
    const totalPoints = database.getUserTotalScore(id);
    let permissions = [];
    if (user.role === 'super_admin') {
      permissions = ['*'];
    } else if (user.role === 'sub_admin') {
      permissions = database.getAdminPermissions(id);
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      isGuest: user.isGuest,
      role: user.role || 'user',
      isBanned: Boolean(user.isBanned),
      banReason: user.banReason,
      bannedAt: user.bannedAt,
      bannedBy: user.bannedBy,
      preferences: user.preferences || {},
      createdAt: user.createdAt,
      stats,
      totalPoints,
      permissions
    };
  },

  updateProfile(id, updates) {
    return database.updateUserProfile(id, updates);
  }
};

export default users;
