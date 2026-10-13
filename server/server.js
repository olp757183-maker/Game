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
import { setupSocketServer, broadcastLobbyRoomCreated, broadcastLobbyRoomUpdated, broadcastRoomState, disconnectBannedUser } from './socket.js';
import { GAME_INFO, GAME_TYPES } from '../shared/constants.js';
import { validateUsername, validateEmail, validatePassword, validateRoomCode, validateGameType } from '../shared/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const SHARED_DIR = path.join(__dirname, '..', 'shared');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Setup Socket.IO
const io = setupSocketServer(server);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*') {
      const allowed = process.env.CORS_ORIGIN.split(',').map(s => s.trim());
      if (allowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    }
    // Allow any origin reflecting it back for credentials support
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

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
    const { username, avatar, preferences } = req.body;
    const updated = users.updateProfile(req.user.id, { username, avatar, preferences });
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

// Idempotent room creation cache (requestId -> { room: roomInfo, timestamp })
const processedRoomRequests = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of processedRoomRequests.entries()) {
    if (now - val.timestamp > 60000) {
      processedRoomRequests.delete(key);
    }
  }
}, 30000);

// Create Room
app.post('/api/rooms', auth.middleware, (req, res) => {
  const startTime = Date.now();
  const requestId = req.body.requestId || ('req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));

  try {
    const { gameType, maxPlayers, privacy, rules } = req.body;
    console.log(`[CREATE_ROOM_RECEIVED] requestId=${requestId} user=${req.user.username} (${req.user.id}) gameType=${gameType} maxPlayers=${maxPlayers} privacy=${privacy || 'public'}`);

    // Check idempotent deduplication for rapid re-sends
    if (requestId && processedRoomRequests.has(requestId)) {
      const cached = processedRoomRequests.get(requestId);
      const existing = rooms.getRoomById(cached.room.id);
      if (existing) {
        console.log(`[CREATE_ROOM_IDEMPOTENT_HIT] requestId=${requestId} roomId=${cached.room.id}`);
        return res.status(200).json({ success: true, room: existing.getPublicRoomInfo(), requestId });
      }
    }

    const gVal = validateGameType(gameType);
    if (!gVal.valid) {
      console.warn(`[CREATE_ROOM_ERROR] requestId=${requestId} validationError=${gVal.errorEn}`);
      return res.status(400).json({ error: gVal.errorEn, errorAr: gVal.errorAr, requestId });
    }

    const room = rooms.createRoom({
      hostUser: req.user,
      gameType: gVal.value,
      maxPlayers: Number(maxPlayers),
      privacy: privacy || 'public',
      rules: rules || {}
    });

    const roomInfo = room.getPublicRoomInfo();
    processedRoomRequests.set(requestId, { room: roomInfo, timestamp: Date.now() });

    broadcastLobbyRoomCreated(room);
    console.log(`[CREATE_ROOM_SUCCESS] requestId=${requestId} roomId=${room.id} code=${room.code} duration=${Date.now() - startTime}ms`);

    res.status(201).json({ success: true, room: roomInfo, requestId });
  } catch (err) {
    console.error(`[CREATE_ROOM_ERROR] requestId=${requestId} error=${err.message} duration=${Date.now() - startTime}ms`);
    res.status(400).json({ error: err.message, errorAr: err.message, requestId });
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
    broadcastRoomState(room);
    broadcastLobbyRoomUpdated(room);
    res.json({ success: true, room: room.getPublicRoomInfo(), player });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// ADMIN API ROUTES
// ==========================================

// Get users list (search, role, banned status)
app.get('/api/admin/users', auth.requirePermission('users.view'), (req, res) => {
  try {
    const { search = '', role = '', isBanned, limit = 100, offset = 0 } = req.query;
    const bannedVal = isBanned === 'true' ? true : isBanned === 'false' ? false : null;
    const userList = database.getAllUsers({ search, role, isBanned: bannedVal, limit: parseInt(limit, 10) || 100, offset: parseInt(offset, 10) || 0 });
    const enriched = userList.map(u => ({
      ...u,
      totalPoints: database.getUserTotalScore(u.id),
      permissions: u.role === 'sub_admin' ? database.getAdminPermissions(u.id) : (u.role === 'super_admin' ? ['*'] : [])
    }));
    res.json({ users: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ban user
app.post('/api/admin/users/:id/ban', auth.requirePermission('users.ban'), (req, res) => {
  try {
    const targetId = req.params.id;
    const targetUser = database.findUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.role === 'super_admin') {
      return res.status(403).json({ error: 'Cannot ban Super Admin', errorAr: 'لا يمكن حظر المدير الرئيسي' });
    }
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Cannot ban yourself', errorAr: 'لا يمكنك حظر نفسك' });
    }
    if (req.user.role === 'sub_admin' && (targetUser.role === 'sub_admin' || targetUser.role === 'super_admin')) {
      return res.status(403).json({ error: 'Sub-admins cannot ban other admins', errorAr: 'المدير الفرعي لا يملك صلاحية حظر مديرين آخرين' });
    }

    const { reason = 'Violation of platform rules' } = req.body;
    database.banUser(targetId, { reason, bannedBy: req.user.username });
    auth.destroyUserSessions(targetId);
    disconnectBannedUser(targetId, reason);

    database.recordAdminAudit({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'ban_user',
      targetType: 'user',
      targetId,
      details: { reason, targetUsername: targetUser.username }
    });

    res.json({ success: true, message: 'User banned successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unban user
app.post('/api/admin/users/:id/unban', auth.requirePermission('users.unban'), (req, res) => {
  try {
    const targetId = req.params.id;
    const targetUser = database.findUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    database.unbanUser(targetId);
    database.recordAdminAudit({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'unban_user',
      targetType: 'user',
      targetId,
      details: { targetUsername: targetUser.username }
    });

    res.json({ success: true, message: 'User unbanned successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user
app.delete('/api/admin/users/:id', auth.requirePermission('users.delete'), (req, res) => {
  try {
    const targetId = req.params.id;
    const targetUser = database.findUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.role === 'super_admin') {
      return res.status(403).json({ error: 'Cannot delete Super Admin', errorAr: 'لا يمكن حذف المدير الرئيسي' });
    }
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself', errorAr: 'لا يمكنك حذف حسابك بنفسك' });
    }
    if (req.user.role === 'sub_admin' && (targetUser.role === 'sub_admin' || targetUser.role === 'super_admin')) {
      return res.status(403).json({ error: 'Sub-admins cannot delete other admins', errorAr: 'المدير الفرعي لا يملك صلاحية حذف مديرين آخرين' });
    }

    auth.destroyUserSessions(targetId);
    disconnectBannedUser(targetId, 'Account deleted');
    database.deleteUser(targetId);

    database.recordAdminAudit({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'delete_user',
      targetType: 'user',
      targetId,
      details: { deletedUsername: targetUser.username, deletedRole: targetUser.role }
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sub-admins Management (Super Admin Exclusive)
app.get('/api/admin/sub-admins', auth.requireSuperAdmin, (req, res) => {
  try {
    const subAdmins = database.getAllUsers({ role: 'sub_admin' }).map(u => ({
      ...u,
      permissions: database.getAdminPermissions(u.id)
    }));
    res.json({ subAdmins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/sub-admins/:id/promote', auth.requireSuperAdmin, (req, res) => {
  try {
    const targetId = req.params.id;
    const targetUser = database.findUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.role === 'super_admin') return res.status(400).json({ error: 'Already super admin' });

    database.updateUserRole(targetId, 'sub_admin');
    const { permissions = [] } = req.body;
    database.setAdminPermissions(targetId, permissions, req.user.username);

    database.recordAdminAudit({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'promote_sub_admin',
      targetType: 'user',
      targetId,
      details: { username: targetUser.username, initialPermissions: permissions }
    });

    res.json({ success: true, user: database.findUserById(targetId), permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/sub-admins/:id/permissions', auth.requireSuperAdmin, (req, res) => {
  try {
    const targetId = req.params.id;
    const targetUser = database.findUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.role !== 'sub_admin') {
      return res.status(400).json({ error: 'Target is not a sub admin' });
    }

    const { permissions = [] } = req.body;
    const updated = database.setAdminPermissions(targetId, permissions, req.user.username);

    database.recordAdminAudit({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'update_permissions',
      targetType: 'user',
      targetId,
      details: { username: targetUser.username, permissions }
    });

    res.json({ success: true, permissions: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/sub-admins/:id/demote', auth.requireSuperAdmin, (req, res) => {
  try {
    const targetId = req.params.id;
    const targetUser = database.findUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    database.updateUserRole(targetId, 'user');
    database.setAdminPermissions(targetId, [], req.user.username);

    database.recordAdminAudit({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'demote_sub_admin',
      targetType: 'user',
      targetId,
      details: { username: targetUser.username }
    });

    res.json({ success: true, message: 'Sub admin revoked to regular user' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Logs
app.get('/api/admin/audit-logs', auth.requirePermission('audit.view'), (req, res) => {
  try {
    const logs = database.getAdminAuditLogs({ limit: parseInt(req.query.limit, 10) || 100, offset: parseInt(req.query.offset, 10) || 0 });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Skins Management
app.get('/api/admin/skins', auth.requirePermission('skins.view'), (req, res) => {
  try {
    const skins = database.getAllSkins();
    res.json({ skins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/skins', auth.requirePermission('skins.create'), (req, res) => {
  try {
    const { id, gameType, name, description, price, status = 'published', previewUrl, configJson } = req.body;
    if (!gameType || !name) {
      return res.status(400).json({ error: 'Game type and name are required', errorAr: 'نوع اللعبة واسم السكن مطلوبان' });
    }
    if (!GAME_TYPES[gameType.toUpperCase()]) {
      return res.status(400).json({ error: 'Invalid game type', errorAr: 'نوع اللعبة غير مدعوم' });
    }

    const skin = database.createSkin({
      id,
      gameType,
      name,
      description,
      price: Math.max(0, parseInt(price, 10) || 0),
      status,
      previewUrl,
      configJson,
      createdBy: req.user.username
    });

    database.recordAdminAudit({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'create_skin',
      targetType: 'skin',
      targetId: skin.id,
      details: { name: skin.name, gameType: skin.gameType, price: skin.price }
    });

    res.status(201).json({ success: true, skin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/skins/:id', auth.requireAdmin, (req, res) => {
  try {
    const skinId = req.params.id;
    const skin = database.getSkinById(skinId);
    if (!skin) return res.status(404).json({ error: 'Skin not found' });

    // Check specific permissions if sub-admin
    if (req.user.role === 'sub_admin') {
      if (req.body.price !== undefined && !database.hasPermission(req.user.id, 'skins.set_price')) {
        return res.status(403).json({ error: 'Forbidden: Missing skins.set_price permission' });
      }
      if (req.body.status !== undefined) {
        if (req.body.status === 'published' && !database.hasPermission(req.user.id, 'skins.publish')) {
          return res.status(403).json({ error: 'Forbidden: Missing skins.publish permission' });
        }
        if (req.body.status === 'draft' && !database.hasPermission(req.user.id, 'skins.unpublish')) {
          return res.status(403).json({ error: 'Forbidden: Missing skins.unpublish permission' });
        }
      }
      if ((req.body.name || req.body.description || req.body.previewUrl) && !database.hasPermission(req.user.id, 'skins.edit')) {
        return res.status(403).json({ error: 'Forbidden: Missing skins.edit permission' });
      }
    }

    const updated = database.updateSkin(skinId, req.body);
    database.recordAdminAudit({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'update_skin',
      targetType: 'skin',
      targetId: skinId,
      details: req.body
    });

    res.json({ success: true, skin: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/skins/:id', auth.requirePermission('skins.delete'), (req, res) => {
  try {
    const skinId = req.params.id;
    const skin = database.getSkinById(skinId);
    if (!skin) return res.status(404).json({ error: 'Skin not found' });

    database.deleteSkin(skinId);
    database.recordAdminAudit({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'delete_skin',
      targetType: 'skin',
      targetId: skinId,
      details: { name: skin.name, gameType: skin.gameType }
    });

    res.json({ success: true, message: 'Skin deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// STORE & SKINS API ROUTES
// ==========================================

// List published skins in store
app.get('/api/store/skins', auth.optionalMiddleware, (req, res) => {
  try {
    const { gameType } = req.query;
    const allSkins = database.getAllSkins({ gameType: gameType || null, status: 'published' });
    let ownedSkinIds = new Set();
    let currentPrefs = {};

    if (req.user) {
      const owned = database.getUserOwnedSkins(req.user.id);
      ownedSkinIds = new Set(owned.map(s => s.id));
      currentPrefs = req.user.preferences?.gameSkins || {};
    }

    const skins = allSkins.map(s => ({
      ...s,
      isOwned: ownedSkinIds.has(s.id),
      isEquipped: currentPrefs[s.gameType] === s.id
    }));

    res.json({ skins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user owned skins
app.get('/api/store/my-skins', auth.middleware, (req, res) => {
  try {
    const { gameType } = req.query;
    const owned = database.getUserOwnedSkins(req.user.id, gameType || null);
    const currentPrefs = req.user.preferences?.gameSkins || {};
    res.json({
      skins: owned.map(s => ({
        ...s,
        isEquipped: currentPrefs[s.gameType] === s.id
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buy skin
app.post('/api/store/buy/:id', auth.middleware, (req, res) => {
  try {
    const skinId = req.params.id;
    const result = database.purchaseSkin(req.user.id, skinId);
    res.json({
      success: true,
      messageEn: 'Skin purchased successfully!',
      messageAr: 'تم شراء السكن بنجاح!',
      skin: result.skin,
      newBalance: result.balanceAfter,
      transactionId: result.transactionId
    });
  } catch (err) {
    res.status(400).json({ error: err.message, errorAr: err.message.includes('Insufficient') ? 'رصيد النقاط غير كافٍ للشراء' : err.message });
  }
});

// Equip skin
app.post('/api/store/equip', auth.middleware, (req, res) => {
  try {
    const { gameType, skinId } = req.body;
    if (!gameType || !skinId) {
      return res.status(400).json({ error: 'gameType and skinId required' });
    }

    if (skinId !== 'default' && !database.hasUserSkin(req.user.id, skinId)) {
      return res.status(403).json({ error: 'You do not own this skin', errorAr: 'أنت لا تملك هذا السكن' });
    }

    const profile = users.getUserProfile(req.user.id);
    const prefs = profile.preferences || {};
    prefs.gameSkins = prefs.gameSkins || {};
    prefs.gameSkins[gameType] = skinId;
    users.updateProfile(req.user.id, { preferences: prefs });

    res.json({ success: true, gameSkins: prefs.gameSkins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Point transactions history
app.get('/api/store/transactions', auth.middleware, (req, res) => {
  try {
    const transactions = database.getUserPointTransactions(req.user.id, parseInt(req.query.limit, 10) || 50);
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback to client SPA / direct HTML
app.get('/store', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'store.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'admin.html'));
});

app.get('/room/:idOrCode', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'room.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// Start Server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
server.listen(PORT, '0.0.0.0', async () => {
  try {
    await users.initSuperAdmin();
    database.seedDefaultSkins();
  } catch (e) {
    console.error('Boot initialization error:', e);
  }
  console.log(`[Classic Games Server] Running on 0.0.0.0:${PORT}`);
});

export { app, server };
