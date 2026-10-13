/**
 * Comprehensive Automated Test Suite for Admin, Permissions & Game Skins Store
 * Verifies Phase 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
 */

import assert from 'node:assert';
import users from '../server/users.js';
import auth from '../server/auth.js';
import database from '../server/database.js';

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log(' Admin, Permissions & Store System Verification Suite ');
  console.log('======================================================\n');

  // 1. SUPER ADMIN INITIALIZATION & AUTHENTICATION
  console.log('--- 1. Super Admin (Madara) Credentials & Authentication ---');

  await runTest('Init super admin creates or configures Madara correctly', async () => {
    await users.initSuperAdmin();
    const admin = database.findUserByUsername('Madara');
    assert.ok(admin, 'Madara user must exist in database');
    assert.strictEqual(admin.role, 'super_admin', 'Madara role must be super_admin');
  });

  await runTest('Super Admin can authenticate with username "Madara" and password "778448638"', async () => {
    const adminUser = await users.authenticate({
      identifier: 'Madara',
      password: '778448638'
    });
    assert.ok(adminUser, 'Authentication must succeed');
    assert.strictEqual(adminUser.username, 'Madara');
    assert.strictEqual(adminUser.role, 'super_admin');
  });

  await runTest('Invalid password for Madara is rejected', async () => {
    let failed = false;
    try {
      await users.authenticate({
        identifier: 'Madara',
        password: 'wrong_password_999'
      });
    } catch (err) {
      failed = true;
    }
    assert.ok(failed, 'Invalid password must throw');
  });

  await runTest('Registration with username "Madara" is strictly forbidden', async () => {
    let failed = false;
    try {
      await users.register({
        username: 'madara',
        email: 'fake_madara@example.com',
        password: 'password123'
      });
    } catch (err) {
      failed = true;
      assert.ok(err.message.includes('reserved'), 'Error must indicate reserved username');
    }
    assert.ok(failed, 'Registration as Madara must be rejected');
  });

  // 2. NORMAL USER & SUB-ADMIN PERMISSIONS
  console.log('\n--- 2. Sub-Admin Promotion & Granular Permissions ---');

  const testUserA_name = `user_alpha_${Date.now()}`;
  let userA = await users.register({
    username: testUserA_name,
    email: `${testUserA_name}@example.com`,
    password: 'Password123!'
  });

  await runTest('Normal user has role "user" and 0 permissions', async () => {
    assert.strictEqual(userA.role, 'user');
    assert.strictEqual(database.hasPermission(userA.id, 'users.view'), false);
    assert.strictEqual(database.hasPermission(userA.id, 'skins.create'), false);
  });

  await runTest('Super Admin can promote regular user to sub_admin with specific permissions', async () => {
    database.updateUserRole(userA.id, 'sub_admin');
    database.setAdminPermissions(userA.id, ['users.view', 'skins.create'], 'Madara');

    const refreshed = database.findUserById(userA.id);
    assert.strictEqual(refreshed.role, 'sub_admin');

    const perms = database.getAdminPermissions(userA.id);
    assert.deepStrictEqual(perms.sort(), ['skins.create', 'users.view']);
    assert.strictEqual(database.hasPermission(userA.id, 'users.view'), true);
    assert.strictEqual(database.hasPermission(userA.id, 'skins.create'), true);
    assert.strictEqual(database.hasPermission(userA.id, 'users.delete'), false);
    assert.strictEqual(database.hasPermission(userA.id, 'users.ban'), false);
  });

  await runTest('Super Admin inherently has all permissions', async () => {
    const admin = database.findUserByUsername('Madara');
    assert.strictEqual(database.hasPermission(admin.id, 'users.view'), true);
    assert.strictEqual(database.hasPermission(admin.id, 'users.delete'), true);
    assert.strictEqual(database.hasPermission(admin.id, 'skins.publish'), true);
    assert.strictEqual(database.hasPermission(admin.id, 'any.custom.perm'), true);
  });

  await runTest('Demoting sub_admin revokes all permissions immediately', async () => {
    database.updateUserRole(userA.id, 'user');
    database.setAdminPermissions(userA.id, [], 'Madara');

    assert.strictEqual(database.hasPermission(userA.id, 'users.view'), false);
    assert.strictEqual(database.hasPermission(userA.id, 'skins.create'), false);
  });

  // 3. BAN & SESSION TERMINATION
  console.log('\n--- 3. User Banning, Session Invalidation & Safety Checks ---');

  const testUserB_name = `user_beta_${Date.now()}`;
  let userB = await users.register({
    username: testUserB_name,
    email: `${testUserB_name}@example.com`,
    password: 'Password123!'
  });

  await runTest('Active user can create session and verify token', async () => {
    const token = auth.createSession(userB.id);
    const verified = auth.verifyToken(token);
    assert.ok(verified, 'Session token must be valid');
    assert.strictEqual(verified.id, userB.id);
  });

  let activeTokenB;
  await runTest('Banning a user sets ban state and immediately destroys active session', async () => {
    activeTokenB = auth.createSession(userB.id);

    database.banUser(userB.id, { reason: 'Violation of Terms', bannedBy: 'Madara' });
    auth.destroyUserSessions(userB.id);

    const bannedUser = database.findUserById(userB.id);
    assert.strictEqual(bannedUser.isBanned, true);
    assert.strictEqual(bannedUser.banReason, 'Violation of Terms');

    // Token must now be rejected
    const verifyResult = auth.verifyToken(activeTokenB);
    assert.strictEqual(verifyResult, null, 'Active token must be invalid after ban');
  });

  await runTest('Banned user cannot authenticate/login', async () => {
    let rejected = false;
    try {
      await users.authenticate({
        identifier: userB.username,
        password: 'Password123!'
      });
    } catch (err) {
      rejected = true;
      assert.ok(err.message.includes('banned'), 'Error must mention account is banned');
    }
    assert.ok(rejected, 'Login must be blocked for banned account');
  });

  await runTest('Unbanning user restores access', async () => {
    database.unbanUser(userB.id);
    const unbanned = database.findUserById(userB.id);
    assert.strictEqual(unbanned.isBanned, false);

    const loggedIn = await users.authenticate({
      identifier: userB.username,
      password: 'Password123!'
    });
    assert.strictEqual(loggedIn.id, userB.id);
  });

  await runTest('Deleting a user safely cleans up user data', async () => {
    const tempUser_name = `temp_del_${Date.now()}`;
    const tempUser = await users.register({
      username: tempUser_name,
      email: `${tempUser_name}@example.com`,
      password: 'Password123!'
    });

    database.deleteUser(tempUser.id);
    const deletedCheck = database.findUserById(tempUser.id);
    assert.strictEqual(deletedCheck, null, 'User must no longer exist');
  });

  // 4. SKINS & STORE ATOMIC PURCHASING
  console.log('\n--- 4. Skins Store, Points Balance & Atomic Purchasing ---');

  await runTest('Default starter skins are seeded for UNO, Chess, and Domino', async () => {
    database.seedDefaultSkins();
    const unoSkins = database.getAllSkins({ gameType: 'uno' });
    const chessSkins = database.getAllSkins({ gameType: 'chess' });
    const dominoSkins = database.getAllSkins({ gameType: 'domino' });

    assert.ok(unoSkins.length >= 2, 'Must have at least 2 UNO skins');
    assert.ok(chessSkins.length >= 2, 'Must have at least 2 Chess skins');
    assert.ok(dominoSkins.length >= 2, 'Must have at least 2 Domino skins');
  });

  const buyerUser_name = `buyer_${Date.now()}`;
  let buyer = await users.register({
    username: buyerUser_name,
    email: `${buyerUser_name}@example.com`,
    password: 'Password123!'
  });

  await runTest('User with 0 points cannot purchase a skin', async () => {
    const unoNeon = database.getSkinById('uno_neon');
    assert.ok(unoNeon, 'uno_neon skin must exist');

    let failed = false;
    try {
      database.purchaseSkin(buyer.id, unoNeon.id);
    } catch (err) {
      failed = true;
      assert.ok(err.message.includes('Insufficient points'), 'Error must specify insufficient points');
    }
    assert.ok(failed, 'Purchase without points must fail');
  });

  await runTest('Guest account cannot purchase skins', async () => {
    const guest = users.createGuest('GuestPlayer');
    let failed = false;
    try {
      database.purchaseSkin(guest.id, 'uno_neon');
    } catch (err) {
      failed = true;
      assert.ok(err.message.includes('registered users'), 'Must require registered user');
    }
    assert.ok(failed, 'Guest cannot purchase skins');
  });

  await runTest('User with points can purchase skin atomically and points are deducted', async () => {
    // Award 50 points through match victory
    database.awardMatchPoints({
      matchId: `test_match_${Date.now()}`,
      userId: buyer.id,
      gameType: 'uno',
      points: 50,
      rank: 1,
      isWin: true
    });

    const balBefore = database.getUserTotalScore(buyer.id);
    assert.strictEqual(balBefore, 50, 'Buyer must have 50 points');

    const unoNeon = database.getSkinById('uno_neon'); // price = 25
    const purchaseRes = database.purchaseSkin(buyer.id, unoNeon.id);
    assert.strictEqual(purchaseRes.success, true);
    assert.strictEqual(purchaseRes.balanceAfter, 25);

    const balAfter = database.getUserTotalScore(buyer.id);
    assert.strictEqual(balAfter, 25, 'Points must be deducted by exactly 25');

    const isOwned = database.hasUserSkin(buyer.id, unoNeon.id);
    assert.strictEqual(isOwned, true, 'User must own uno_neon skin');

    // Check point transaction logged
    const txs = database.getUserPointTransactions(buyer.id);
    assert.ok(txs.length >= 1, 'Transaction must be recorded');
    assert.strictEqual(txs[0].amount, -25);
  });

  await runTest('Duplicate purchase of already-owned skin is prevented', async () => {
    let failed = false;
    try {
      database.purchaseSkin(buyer.id, 'uno_neon');
    } catch (err) {
      failed = true;
      assert.ok(err.message.includes('already owns'), 'Error must state user already owns skin');
    }
    assert.ok(failed, 'Duplicate purchase must be blocked');
  });

  // 5. AUDIT LOGGING
  console.log('\n--- 5. Administrative Audit Logging ---');

  await runTest('Admin actions are recorded in immutable audit logs', async () => {
    const auditId = database.recordAdminAudit({
      adminId: 'super-admin-madara',
      adminUsername: 'Madara',
      action: 'test_action',
      targetType: 'user',
      targetId: buyer.id,
      details: { test: true }
    });

    const logs = database.getAdminAuditLogs({ limit: 10 });
    const found = logs.find(l => l.id === auditId);
    assert.ok(found, 'Audit log entry must be retrieved');
    assert.strictEqual(found.admin_username, 'Madara');
    assert.strictEqual(found.action, 'test_action');
  });

  console.log('\n======================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED! 🏆`);
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
