/**
 * Express & Socket.IO HTTP Application Server
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';

import auth from './auth.js';
import users from './users.js';
import rooms from './rooms.js';
import database from './database.js';
import { setupSocketServer } from './socket.js';
import { GAME_INFO, GAME_TYPES } from '../shared/constants.js';
import { validateUsername, validateEmail, validatePassword, validateRoomCode, validateGameType } from '../shared/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const SHARED_DIR = path.join(__dirname, '..', 'shared');

const app = express();
const server = http.createServer(app);

// Setup Socket.IO
const io = setupSocketServer(server);

// Middleware
app.use(cors());
app.use(express.json());

// Serve client static files & shared directory
app.use('/shared', express.static(SHARED_DIR));
app.use(express.static(CLIENT_DIR));

// ==========================================
// REST API ROUTES
// ==========================================

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword, avatar } = req.body;

    const uVal = validateUsername(username);
    if (!uVal.valid) return res.status(400).json({ error: uVal.errorEn, errorAr: uVal.errorAr });

    const eVal = validateEmail(email);
    if (!eVal.valid) return res.status(400).json({ error: eVal.errorEn, errorAr: eVal.errorAr });

    const pVal = validatePassword(password);
    if (!pVal.valid) return res.status(400).json({ error: pVal.errorEn, errorAr: pVal.errorAr });

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match', errorAr: 'كلمات المرور غير متطابقة' });
    }

    const user = await users.register({
      username: uVal.value,
      email: eVal.value,
      password: pVal.value,
      avatar: avatar || 'avatar1'
    });

    const token = auth.createSession(user.id);
    return res.status(201).json({ user: users.getUserProfile(user.id), token });
  } catch (err) {
    return res.status(400).json({ error: err.message, errorAr: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/Email and password required', errorAr: 'البريد أو اسم المستخدم وكلمة المرور مطلوبة' });
    }

    const user = await users.authenticate({ identifier, password });
    const token = auth.createSession(user.id);
    return res.json({ user: users.getUserProfile(user.id), token });
  } catch (err) {
    return res.status(401).json({ error: err.message, errorAr: 'بيانات الدخول غير صحيحة' });
  }
});

// Guest Login
app.post('/api/guest', (req, res) => {
  try {
    const { nickname } = req.body;
    const user = users.createGuest(nickname);
    const token = auth.createSession(user.id);
    return res.json({ user: users.getUserProfile(user.id), token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Current User Profile
app.get('/api/me', auth.middleware, (req, res) => {
  const profile = users.getUserProfile(req.user.id);
  res.json({ user: profile });
});

// Update Profile
app.put('/api/profile', auth.middleware, (req, res) => {
  try {
    const { username, avatar } = req.body;
    const updated = users.updateProfile(req.user.id, { username, avatar });
    res.json({ user: users.getUserProfile(updated.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Games metadata
app.get('/api/games', (req, res) => {
  res.json({ games: GAME_INFO });
});

// List Open Public Rooms
app.get('/api/rooms', (req, res) => {
  const list = rooms.listPublicRooms();
  res.json({ rooms: list });
});

// Create Room
app.post('/api/rooms', auth.middleware, (req, res) => {
  try {
    const { gameType, maxPlayers, privacy, rules } = req.body;

    const gVal = validateGameType(gameType);
    if (!gVal.valid) return res.status(400).json({ error: gVal.errorEn, errorAr: gVal.errorAr });

    const room = rooms.createRoom({
      hostUser: req.user,
      gameType: gVal.value,
      maxPlayers: Number(maxPlayers),
      privacy: privacy || 'public',
      rules: rules || {}
    });

    res.status(201).json({ room: room.getPublicRoomInfo() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get Room By ID or Code
app.get('/api/rooms/:idOrCode', auth.optionalMiddleware, (req, res) => {
  const param = req.params.idOrCode;
  let room = rooms.getRoomById(param);
  if (!room) {
    room = rooms.getRoomByCode(param);
  }

  if (!room) {
    return res.status(404).json({ error: 'Room not found', errorAr: 'الغرفة غير موجودة' });
  }

  res.json({ room: room.getPublicRoomInfo() });
});

// Join Room Check
app.post('/api/rooms/:idOrCode/join', auth.middleware, (req, res) => {
  const param = req.params.idOrCode;
  let room = rooms.getRoomById(param) || rooms.getRoomByCode(param);

  if (!room) {
    return res.status(404).json({ error: 'Room not found', errorAr: 'الغرفة غير موجودة' });
  }

  try {
    const player = room.addPlayer(req.user);
    res.json({ success: true, room: room.getPublicRoomInfo(), player });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fallback to client SPA / direct HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Classic Games Server] Running on http://localhost:${PORT}`);
});

export { app, server };
