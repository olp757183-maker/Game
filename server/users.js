/**
 * User Model and Operations
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import database from './database.js';

export const users = {
  async register({ username, email, password, avatar = 'avatar1' }) {
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
      isGuest: false
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

    if (!user.passwordHash) {
      throw new Error('Guest accounts cannot login with password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    return user;
  },

  createGuest(nickname) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const username = nickname ? `${nickname.trim().slice(0, 10)}_${randomSuffix}` : `Guest_${randomSuffix}`;
    const id = crypto.randomUUID();

    return database.createUser({
      id,
      username,
      email: null,
      passwordHash: null,
      avatar: 'avatar' + ((randomSuffix % 6) + 1),
      isGuest: true
    });
  },

  getUserById(id) {
    return database.findUserById(id);
  },

  getUserProfile(id) {
    const user = database.findUserById(id);
    if (!user) return null;
    const stats = database.getUserStats(id);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      isGuest: user.isGuest,
      createdAt: user.createdAt,
      stats
    };
  },

  updateProfile(id, updates) {
    return database.updateUserProfile(id, updates);
  }
};

export default users;
