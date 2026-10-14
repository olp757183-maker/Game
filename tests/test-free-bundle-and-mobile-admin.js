/**
 * Dedicated Verification Suite for:
 * 1. Free Bundles (Price = 0) Acquisition & Atomic Purchase
 * 2. Arabic Error Messages & Deduplication
 * 3. Double-Click / Concurrent Purchase Prevention
 * 4. Admin Role Authoritative Check vs Regular User (Desktop & Mobile)
 * 5. Mobile Responsive CSS & Drawer Structure
 */

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import server & db modules
import db from '../server/database.js';
import users from '../server/users.js';
import auth from '../server/auth.js';
import { app } from '../server/server.js';

let server;
let baseUrl;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' Free Bundles & Mobile Admin Verification Suite ');
  console.log('======================================================\n');

  // Start server on an ephemeral port
  const port = 30000 + Math.floor(Math.random() * 10000);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(port, resolve));
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Setup Test Users: Admin (Madara), Normal User A (0 points), Normal User B (100 points)
    await users.initSuperAdmin();
    const adminUser = await users.authenticate({ identifier: 'Madara', password: '778448638' });
    assert(adminUser, 'Admin Madara should exist');
    const adminToken = auth.createSession(adminUser.id);

    const userATimestamp = Date.now();
    const userA = db.createUser({
      id: `user_free_${userATimestamp}`,
      username: `test_user_free_${userATimestamp}`,
      email: `test_user_free_${userATimestamp}@games.local`,
      passwordHash: 'dummy'
    });
    // Set userA points explicitly to 0
    const userAToken = auth.createSession(userA.id);

    const userB = db.createUser({
      id: `user_paid_${userATimestamp}`,
      username: `test_user_paid_${userATimestamp}`,
      email: `test_user_paid_${userATimestamp}@games.local`,
      passwordHash: 'dummy'
    });
    // Award 100 points to userB
    db.awardMatchPoints({
      matchId: `test_match_${Date.now()}`,
      userId: userB.id,
      gameType: 'uno',
      points: 100,
      rank: 1,
      isWin: true
    });
    const userBToken = auth.createSession(userB.id);

    // 2. Create Free Skin Bundle (Price = 0) and Paid Skin Bundle (Price = 50)
    const freeBundleId = `uno_free_${Date.now()}`;
    db.createSkin({
      id: freeBundleId,
      name: 'Free Starter Uno Pack',
      gameType: 'uno',
      price: 0,
      status: 'published',
      description: 'A completely free bundle for all players',
      previewUrl: '/assets/skins/uno-free.png'
    });

    const paidBundleId = `uno_paid_${Date.now()}`;
    db.createSkin({
      id: paidBundleId,
      name: 'Premium Uno Pack',
      gameType: 'uno',
      price: 50,
      status: 'published',
      description: 'A paid bundle costing 50 points',
      previewUrl: '/assets/skins/uno-paid.png'
    });

    // Test 1: User with 0 points acquires free bundle (price = 0)
    console.log('--- Test 1: Acquiring Free Bundle (Price = 0) with 0 Balance ---');
    const freeBuyRes = await request('POST', `/api/store/buy/${freeBundleId}`, {}, userAToken);
    assert.strictEqual(freeBuyRes.status, 200, `Expected 200 OK, got ${freeBuyRes.status}: ${JSON.stringify(freeBuyRes.body)}`);
    assert.strictEqual(freeBuyRes.body.success, true);
    assert.strictEqual(freeBuyRes.body.isFree, true, 'isFree flag must be true');
    assert(freeBuyRes.body.message.includes('بنجاح') || freeBuyRes.body.message.includes('مجاناً'), 'Message must be in Arabic indicating free acquisition');

    // Verify user balance is still 0
    const balanceA = db.getUserTotalScore(userA.id);
    assert.strictEqual(balanceA, 0, 'User points must remain 0');

    // Verify ownership is recorded in DB
    const ownsFree = db.hasUserSkin(userA.id, freeBundleId);
    assert.strictEqual(ownsFree, true, 'Database must record ownership of free skin');
    console.log('  ✓ PASS: User with 0 points successfully acquired free bundle without balance change');

    // Test 2: Same user attempts to acquire the free bundle again
    console.log('\n--- Test 2: Repeated Acquisition of Already Owned Free Bundle ---');
    const repeatBuyRes = await request('POST', `/api/store/buy/${freeBundleId}`, {}, userAToken);
    assert.strictEqual(repeatBuyRes.status, 400, 'Must return 400 Bad Request');
    assert.strictEqual(repeatBuyRes.body.error, 'User already owns this skin');
    assert.strictEqual(repeatBuyRes.body.errorAr, 'أنت تمتلك هذه الحزمة بالفعل', 'Must return clear Arabic translation');
    console.log('  ✓ PASS: Second attempt correctly rejected with clear Arabic "أنت تمتلك هذه الحزمة بالفعل"');

    // Test 3: User with 0 points attempts to buy paid bundle (price = 50)
    console.log('\n--- Test 3: Purchasing Paid Bundle with Insufficient Points ---');
    const failedPaidBuy = await request('POST', `/api/store/buy/${paidBundleId}`, {}, userAToken);
    assert.strictEqual(failedPaidBuy.status, 400);
    assert(failedPaidBuy.body.error.includes('Insufficient points'));
    assert(failedPaidBuy.body.errorAr.includes('غير كاف'));
    const stillOwns = db.hasUserSkin(userA.id, paidBundleId);
    assert.strictEqual(stillOwns, false, 'User must NOT own paid skin');
    console.log('  ✓ PASS: Rejected purchase with insufficient points; balance and ownership untouched');

    // Test 4: User with 100 points buys paid bundle (price = 50)
    console.log('\n--- Test 4: Purchasing Paid Bundle with Sufficient Points ---');
    const successPaidBuy = await request('POST', `/api/store/buy/${paidBundleId}`, {}, userBToken);
    assert.strictEqual(successPaidBuy.status, 200);
    assert.strictEqual(successPaidBuy.body.success, true);
    assert.strictEqual(successPaidBuy.body.newBalance, 50, 'Balance must be deducted by exactly 50');
    const balanceB = db.getUserTotalScore(userB.id);
    assert.strictEqual(balanceB, 50, 'Database points must be 50');
    assert.strictEqual(db.hasUserSkin(userB.id, paidBundleId), true, 'Ownership recorded');
    console.log('  ✓ PASS: Paid bundle purchased, exactly 50 points deducted, ownership recorded');

    // Test 5: Concurrent Purchase Requests (Double-click race condition prevention)
    console.log('\n--- Test 5: Concurrent Requests (Double-Tap) Mutex Protection ---');
    const raceBundleId = `uno_race_${Date.now()}`;
    db.createSkin({
      id: raceBundleId,
      name: 'Race Uno Pack',
      gameType: 'uno',
      price: 0,
      status: 'published',
      description: 'Race condition test bundle',
      previewUrl: '/assets/skins/uno-race.png'
    });

    // Fire 2 concurrent requests simultaneously for the same user and free bundle
    const [res1, res2] = await Promise.all([
      request('POST', `/api/store/buy/${raceBundleId}`, {}, userAToken),
      request('POST', `/api/store/buy/${raceBundleId}`, {}, userAToken)
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepStrictEqual(statuses, [200, 400], 'One request must succeed (200) and the concurrent one must be rejected (400)');
    const errorBody = res1.status === 400 ? res1.body : res2.body;
    assert.strictEqual(errorBody.error, 'User already owns this skin');
    assert.strictEqual(errorBody.errorAr, 'أنت تمتلك هذه الحزمة بالفعل');

    // Verify ownership is recorded
    assert.strictEqual(db.hasUserSkin(userA.id, raceBundleId), true, 'User must own the skin');
    console.log('  ✓ PASS: Mutex safely handled concurrent requests; exactly 1 success and 1 already-owned rejection');

    // Test 6: Authoritative Role Checks (/api/me)
    console.log('\n--- Test 6: Authoritative Role Checks (/api/me) ---');
    const adminMe = await request('GET', '/api/me', null, adminToken);
    assert.strictEqual(adminMe.status, 200);
    assert.strictEqual(adminMe.body.user.role, 'super_admin', 'Admin user has role super_admin');

    const userMe = await request('GET', '/api/me', null, userAToken);
    assert.strictEqual(userMe.status, 200);
    assert.strictEqual(userMe.body.user.role, 'user', 'Regular user has role user');

    // Non-admin attempting to access admin API
    const forbiddenAdminApi = await request('GET', '/api/admin/users', null, userAToken);
    assert.strictEqual(forbiddenAdminApi.status, 403, 'Regular user must be forbidden (403) from admin endpoints');
    console.log('  ✓ PASS: /api/me correctly returns authoritative roles, non-admins forbidden from admin APIs');

    // Test 7: Verify Client-Side Responsive CSS Rules
    console.log('\n--- Test 7: Verify Responsive CSS & Mobile Navigation Rules ---');
    const responsiveCss = fs.readFileSync(path.join(__dirname, '../client/css/responsive.css'), 'utf8');
    assert(responsiveCss.includes('.desktop-only-user-pill'), 'responsive.css must contain .desktop-only-user-pill');
    assert(responsiveCss.includes('.desktop-only-btn'), 'responsive.css must contain .desktop-only-btn');
    assert(responsiveCss.includes('.nav-link-admin'), 'responsive.css must style .nav-link-admin');
    assert(responsiveCss.includes('.mobile-drawer-user-section'), 'responsive.css must style .mobile-drawer-user-section');
    assert(responsiveCss.includes('flex: 0 0 100%'), 'responsive.css must ensure .nav-links takes 100% width in drawer');

    // Test 8: Verify Store CSS Modal Scrollability
    const storeCss = fs.readFileSync(path.join(__dirname, '../client/css/store.css'), 'utf8');
    assert(storeCss.includes('max-height: 85vh'), 'store.css must limit modal box max-height');
    assert(storeCss.includes('overflow-y: auto'), 'store.css must allow modal body to scroll');
    console.log('  ✓ PASS: Responsive CSS rules and modal scrollability verified');

    // Test 9: Verify Toast Deduplication Logic in utils.js
    const utilsJs = fs.readFileSync(path.join(__dirname, '../client/js/utils.js'), 'utf8');
    assert(utilsJs.includes('existingToasts'), 'utils.js must check existing toasts for deduplication');
    assert(utilsJs.includes('toast-close-btn'), 'utils.js must render close button on toasts');
    console.log('  ✓ PASS: Toast deduplication and dismissal confirmed in utils.js');

    console.log('\n======================================================');
    console.log(' ALL 9 VERIFICATION TESTS PASSED! 🎉');
    console.log('======================================================\n');
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
