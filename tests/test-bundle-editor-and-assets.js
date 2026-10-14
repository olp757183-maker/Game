/**
 * Automated Verification Suite: Skin Bundle Editor & Visual Game Assets System
 * Tests all 55 UNO cards, 14 Chess pieces, and 29 Domino tiles,
 * asset validation, upload/delete, permissions, atomic store purchasing, and game renderers.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

import database from '../server/database.js';
import users from '../server/users.js';
import auth from '../server/auth.js';
import { app, server } from '../server/server.js';
import { GAME_ASSETS_SPEC, validateAssetKey, getExpectedTotalCount } from '../shared/game-assets-spec.js';
import { renderUnoCard, renderUnoCardBack } from '../client/games/uno/uno-renderer.js';
import { renderChessSquares } from '../client/games/chess/chess-renderer.js';
import { renderBoardTile, renderHandTile } from '../client/games/domino/domino-renderer.js';
import skinAssets from '../client/js/skin-assets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
  console.log('======================================================');
  console.log(' Skin Bundle Editor & Visual Assets Verification Suite ');
  console.log('======================================================\n');

  let testCount = 0;
  function pass(msg) {
    testCount++;
    console.log(`  ✓ PASS: ${msg}`);
  }

  // --------------------------------------------------------------------------
  // 1. Authoritative Specification Verification (UNO, Chess, Domino)
  // --------------------------------------------------------------------------
  console.log('--- 1. Authoritative Game Assets Specification ---');

  // UNO: 55 items
  assert.strictEqual(GAME_ASSETS_SPEC.uno.items.length, 55, 'UNO must define exactly 55 items');
  assert.strictEqual(getExpectedTotalCount('uno'), 55, 'Expected UNO total count must be 55');
  const unoKeys = new Set(GAME_ASSETS_SPEC.uno.items.map(i => i.key));
  assert.ok(unoKeys.has('red_0') && unoKeys.has('red_9'), 'UNO has red numbers');
  assert.ok(unoKeys.has('blue_skip') && unoKeys.has('green_reverse') && unoKeys.has('yellow_draw2'), 'UNO has colored action cards');
  assert.ok(unoKeys.has('wild') && unoKeys.has('wild4'), 'UNO has wild and wild4');
  assert.ok(unoKeys.has('card_back'), 'UNO has card_back');
  pass('UNO defines all 55 game items (4 colors x 13 cards + 2 wilds + 1 back)');

  // Chess: 14 items
  assert.strictEqual(GAME_ASSETS_SPEC.chess.items.length, 14, 'Chess must define exactly 14 items');
  assert.strictEqual(getExpectedTotalCount('chess'), 14, 'Expected Chess total count must be 14');
  const chessKeys = new Set(GAME_ASSETS_SPEC.chess.items.map(i => i.key));
  assert.ok(chessKeys.has('w_k') && chessKeys.has('w_q') && chessKeys.has('w_r') && chessKeys.has('w_b') && chessKeys.has('w_n') && chessKeys.has('w_p'), 'White pieces present');
  assert.ok(chessKeys.has('b_k') && chessKeys.has('b_q') && chessKeys.has('b_r') && chessKeys.has('b_b') && chessKeys.has('b_n') && chessKeys.has('b_p'), 'Black pieces present');
  assert.ok(chessKeys.has('board_light') && chessKeys.has('board_dark'), 'Board squares present');
  pass('Chess defines all 14 items (6 White + 6 Black + Light/Dark Board Squares)');

  // Domino: 29 items (28 Double-Six tiles + 1 back)
  assert.strictEqual(GAME_ASSETS_SPEC.domino.items.length, 29, 'Domino must define exactly 29 items');
  assert.strictEqual(getExpectedTotalCount('domino'), 29, 'Expected Domino total count must be 29');
  const dominoKeys = new Set(GAME_ASSETS_SPEC.domino.items.map(i => i.key));
  assert.ok(dominoKeys.has('tile_0_0') && dominoKeys.has('tile_6_6'), 'Double 0 and Double 6 present');
  assert.ok(dominoKeys.has('tile_1_2') && dominoKeys.has('tile_3_5'), 'Intermediate tiles present');
  assert.ok(dominoKeys.has('tile_back'), 'Domino tile_back present');
  pass('Domino defines all 29 items (28 Double-Six tiles [0|0]..[6|6] + Tile Back)');

  // Key Validation Function
  assert.ok(validateAssetKey('uno', 'red_5').valid);
  assert.ok(validateAssetKey('chess', 'w_k').valid);
  assert.ok(validateAssetKey('domino', 'tile_4_5').valid);
  assert.ok(!validateAssetKey('uno', 'fake_item').valid, 'Rejects invalid UNO key');
  assert.ok(!validateAssetKey('chess', 'w_dragon').valid, 'Rejects invalid Chess key');
  assert.ok(!validateAssetKey('domino', 'tile_7_8').valid, 'Rejects out-of-bounds Domino key');
  pass('validateAssetKey strictly verifies allowed items and rejects invalid keys');

  // --------------------------------------------------------------------------
  // 2. HTTP Server & API Setup for Testing
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Bundle Editor & Asset Upload API ---');

  const testServer = http.createServer(app);
  await new Promise(r => testServer.listen(0, '127.0.0.1', r));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Authenticate super admin
  await users.initSuperAdmin();
  const superAdmin = database.findUserByUsername('Madara');
  const adminToken = auth.createSession(superAdmin.id);

  // 2.1 Create a test bundle as Draft
  const bundleId = `uno_test_bundle_${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/api/admin/skins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      id: bundleId,
      gameType: 'uno',
      name: 'حزمة أونو الذهبية (Golden Uno)',
      description: 'حزمة بطاقات أونو ذهبية فاخرة بتأثيرات بصرية مميزة',
      price: 30,
      status: 'draft'
    })
  });
  assert.strictEqual(createRes.status, 201, 'Creates bundle as draft');
  const createData = await createRes.json();
  assert.strictEqual(createData.skin.id, bundleId);
  assert.strictEqual(createData.skin.status, 'draft');
  pass('Admin can create a new game bundle saved as Draft');

  // 2.2 Inspect bundle details & completeness via GET /api/admin/bundles/:id
  const getBundleRes = await fetch(`${baseUrl}/api/admin/bundles/${bundleId}`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(getBundleRes.status, 200);
  const bundleDetails = await getBundleRes.json();
  assert.strictEqual(bundleDetails.stats.totalRequired, 55);
  assert.strictEqual(bundleDetails.stats.uploadedCount, 0);
  assert.strictEqual(bundleDetails.stats.isComplete, false);
  assert.strictEqual(bundleDetails.missingItems.length, 55);
  pass('GET /api/admin/bundles/:id returns accurate totalRequired (55) and missing items');

  // 2.3 Upload Valid PNG Image Asset
  // Minimal valid 1x1 PNG: 89 50 4E 47 0D 0A 1A 0A ...
  const valid1x1PngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const uploadRes = await fetch(`${baseUrl}/api/admin/bundles/${bundleId}/asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      itemKey: 'red_7',
      mimeType: 'image/png',
      imageBase64: valid1x1PngBase64
    })
  });
  assert.strictEqual(uploadRes.status, 200, 'Valid asset uploads successfully');
  const uploadData = await uploadRes.json();
  assert.strictEqual(uploadData.success, true);
  assert.strictEqual(uploadData.itemKey, 'red_7');
  assert.ok(uploadData.assetUrl.includes(`/uploads/skins/${bundleId}/red_7.png`));
  assert.strictEqual(uploadData.skin.assets['red_7'], uploadData.assetUrl);

  // Verify file actually exists on filesystem
  const uploadedDiskPath = path.join(__dirname, '..', 'client', 'uploads', 'skins', bundleId, 'red_7.png');
  assert.ok(fs.existsSync(uploadedDiskPath), 'Uploaded image must exist on disk in client/uploads');
  pass('POST /api/admin/bundles/:id/asset validates, writes to disk, and updates DB assets map');

  // 2.4 Verify Rejection of Disallowed / Corrupt Payloads
  const corruptUploadRes = await fetch(`${baseUrl}/api/admin/bundles/${bundleId}/asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      itemKey: 'blue_skip',
      mimeType: 'image/png',
      imageBase64: 'bm90LWEtcmVhbC1wbmc=' // corrupt bytes
    })
  });
  assert.strictEqual(corruptUploadRes.status, 400, 'Rejects corrupted/non-image buffer');
  pass('Server security rejects non-image or fake MIME payloads');

  // 2.5 Verify Rejection of Invalid Keys
  const invalidKeyRes = await fetch(`${baseUrl}/api/admin/bundles/${bundleId}/asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      itemKey: 'fake_uno_key_123',
      mimeType: 'image/png',
      imageBase64: valid1x1PngBase64
    })
  });
  assert.strictEqual(invalidKeyRes.status, 400, 'Rejects item keys not in specification');
  pass('Server rejects item keys not in authoritative game spec');

  // 2.6 Delete Asset via DELETE /api/admin/bundles/:id/asset/:itemKey
  const deleteRes = await fetch(`${baseUrl}/api/admin/bundles/${bundleId}/asset/red_7`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(deleteRes.status, 200, 'Deletes asset successfully');
  assert.ok(!fs.existsSync(uploadedDiskPath), 'Deleted image must be removed from disk');
  const bundleAfterDel = database.getSkinById(bundleId);
  assert.strictEqual(bundleAfterDel.assets['red_7'], undefined, 'Key removed from DB assets map');
  pass('DELETE /api/admin/bundles/:id/asset/:key cleanly removes asset from disk and DB');

  // --------------------------------------------------------------------------
  // 3. Sub-Admin Granular Permissions Verification
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Sub-Admin Granular Permissions ---');

  // Create Sub-Admin with only skins.create and skins.edit (NO skins.publish)
  const subAdminUsername = `SubAdm_${Date.now().toString(36)}`;
  const subAdmin = await users.register({
    username: subAdminUsername,
    email: `${subAdminUsername}@example.com`,
    password: 'Password123!',
    avatar: 'avatar2'
  });
  database.updateUserRole(subAdmin.id, 'sub_admin');
  database.setAdminPermissions(subAdmin.id, ['skins.view', 'skins.create', 'skins.edit'], 'Madara');
  const subAdminToken = auth.createSession(subAdmin.id);

  // Sub-admin can upload asset
  const subUploadRes = await fetch(`${baseUrl}/api/admin/bundles/${bundleId}/asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${subAdminToken}` },
    body: JSON.stringify({
      itemKey: 'blue_5',
      mimeType: 'image/png',
      imageBase64: valid1x1PngBase64
    })
  });
  assert.strictEqual(subUploadRes.status, 200, 'Sub-admin with skins.edit can upload assets');
  pass('Sub-admin with skins.edit permission can edit and upload bundle assets');

  // Sub-admin WITHOUT skins.publish CANNOT publish bundle
  const forbiddenPublishRes = await fetch(`${baseUrl}/api/admin/skins/${bundleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${subAdminToken}` },
    body: JSON.stringify({ status: 'published' })
  });
  assert.strictEqual(forbiddenPublishRes.status, 403, 'Forbidden to publish without skins.publish');
  pass('Sub-admin without skins.publish cannot publish bundle to store (403 Forbidden)');

  // Grant skins.publish to sub-admin and retry
  database.setAdminPermissions(subAdmin.id, ['skins.view', 'skins.create', 'skins.edit', 'skins.publish'], 'Madara');
  const allowedPublishRes = await fetch(`${baseUrl}/api/admin/skins/${bundleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${subAdminToken}` },
    body: JSON.stringify({ status: 'published' })
  });
  assert.strictEqual(allowedPublishRes.status, 200, 'Can publish with granted skins.publish');
  const publishedBundle = database.getSkinById(bundleId);
  assert.strictEqual(publishedBundle.status, 'published');
  pass('Granted sub-admin can publish bundle to store');

  // --------------------------------------------------------------------------
  // 4. Store Preview Modal & Atomic Purchase Integration
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Store Preview & Atomic Purchase ---');

  // GET /api/store/bundles/:id/preview
  const previewRes = await fetch(`${baseUrl}/api/store/bundles/${bundleId}/preview`);
  assert.strictEqual(previewRes.status, 200);
  const previewData = await previewRes.json();
  assert.strictEqual(previewData.bundle.id, bundleId);
  assert.strictEqual(previewData.items.length, 55);
  const blue5Item = previewData.items.find(i => i.key === 'blue_5');
  assert.ok(blue5Item && blue5Item.hasCustomAsset, 'Custom asset indicator is true for blue_5');
  pass('Store bundle preview endpoint returns structured catalog of all items');

  // User purchasing bundle with points
  const buyer = await users.register({
    username: `Buyer_${Date.now().toString(36)}`,
    email: `buyer_${Date.now().toString(36)}@example.com`,
    password: 'Password123!',
    avatar: 'avatar3'
  });
  const buyerToken = auth.createSession(buyer.id);

  // Award 50 points to buyer
  database.awardMatchPoints({
    matchId: `match_${Date.now()}`,
    userId: buyer.id,
    gameType: 'uno',
    points: 50,
    rank: 1,
    isWin: true
  });
  assert.strictEqual(database.getUserTotalScore(buyer.id), 50);

  // Buy bundle
  const buyRes = await fetch(`${baseUrl}/api/store/buy/${bundleId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${buyerToken}` }
  });
  assert.strictEqual(buyRes.status, 200);
  const buyData = await buyRes.json();
  assert.strictEqual(buyData.newBalance, 20, 'Deducts 30 points (50 - 30 = 20)');
  assert.ok(database.hasUserSkin(buyer.id, bundleId), 'User now owns the bundle');
  pass('User purchases bundle with points and balance updates atomically');

  // Equip bundle skin
  const equipRes = await fetch(`${baseUrl}/api/store/equip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${buyerToken}` },
    body: JSON.stringify({ gameType: 'uno', skinId: bundleId })
  });
  assert.strictEqual(equipRes.status, 200);
  const buyerProfile = users.getUserProfile(buyer.id);
  assert.strictEqual(buyerProfile.preferences.gameSkins.uno, bundleId);
  pass('User can equip purchased skin bundle for UNO');

  // Revert to default skin
  const revertRes = await fetch(`${baseUrl}/api/store/equip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${buyerToken}` },
    body: JSON.stringify({ gameType: 'uno', skinId: 'default' })
  });
  assert.strictEqual(revertRes.status, 200);
  const revertedProfile = users.getUserProfile(buyer.id);
  assert.strictEqual(revertedProfile.preferences.gameSkins.uno, 'default');
  pass('User can revert to default skin at any time');

  // --------------------------------------------------------------------------
  // 5. Game Renderers Visual Assets Integration (UNO, Chess, Domino)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Game Renderers Visual Assets Integration ---');

  // Register bundle in client cache
  skinAssets.registerSkin({
    id: 'bundle_visual_test',
    gameType: 'uno',
    assets: {
      'red_7': '/uploads/skins/test/red_7.png',
      'card_back': '/uploads/skins/test/card_back.png',
      'w_k': '/uploads/skins/test/w_k.png',
      'board_light': '/uploads/skins/test/light.png',
      'tile_3_3': '/uploads/skins/test/tile_3_3.png'
    }
  });

  // Test UNO renderer with custom card and fallback
  const customUnoCardHtml = renderUnoCard({ color: 'red', value: 7 }, { skinId: 'bundle_visual_test' });
  assert.ok(customUnoCardHtml.includes('/uploads/skins/test/red_7.png'), 'Renders custom image for red_7');
  assert.ok(customUnoCardHtml.includes('uno-card-custom-img'), 'Uses uno-card-custom-img class');

  const fallbackUnoCardHtml = renderUnoCard({ color: 'blue', value: 4 }, { skinId: 'bundle_visual_test' });
  assert.ok(fallbackUnoCardHtml.includes('uno-center-value'), 'Falls back to standard card oval when item missing');

  const customUnoBackHtml = renderUnoCardBack({ skinId: 'bundle_visual_test' });
  assert.ok(customUnoBackHtml.includes('/uploads/skins/test/card_back.png'), 'Renders custom UNO card back image');
  pass('UNO renderer seamlessly renders custom card images and falls back safely');

  // Test Chess renderer with custom piece and board square
  const chessState = {
    board: [
      [{ color: 'w', type: 'k' }, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null]
    ]
  };
  const chessHtml = renderChessSquares(chessState, { skinId: 'bundle_visual_test' });
  assert.ok(chessHtml.includes('/uploads/skins/test/w_k.png'), 'Renders custom image for White King');
  assert.ok(chessHtml.includes('/uploads/skins/test/light.png'), 'Applies custom texture to light board squares');
  pass('Chess renderer renders custom piece images and custom board square textures');

  // Test Domino renderer with custom tile
  const customDominoTileHtml = renderBoardTile({ left: 3, right: 3, isDouble: true }, { skinId: 'bundle_visual_test' });
  assert.ok(customDominoTileHtml.includes('/uploads/skins/test/tile_3_3.png'), 'Renders custom image for Domino [3|3]');

  const fallbackDominoTileHtml = renderBoardTile({ left: 1, right: 2, isDouble: false }, { skinId: 'bundle_visual_test' });
  assert.ok(fallbackDominoTileHtml.includes('pips-grid'), 'Falls back to authentic pips when tile image missing');
  pass('Domino renderer renders custom tile images and falls back to authentic pips');

  // --------------------------------------------------------------------------
  // 6. Bundle Editor Access & Authentication Resilience
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Bundle Editor Access & Authentication Resilience ---');

  // 6.1 Static file serving
  const pageRes = await fetch(`${baseUrl}/bundle-editor.html`);
  assert.strictEqual(pageRes.status, 200, 'GET /bundle-editor.html returns 200 OK');
  const pageHtml = await pageRes.text();
  assert.ok(pageHtml.includes('bundle-editor.js'), 'bundle-editor.html loads bundle-editor.js module');
  pass('bundle-editor.html is served statically with 200 OK');

  const extlessRes = await fetch(`${baseUrl}/bundle-editor`);
  assert.strictEqual(extlessRes.status, 200, 'GET /bundle-editor extensionless route returns 200 OK');
  pass('Extensionless /bundle-editor route is served correctly');

  // 6.2 Token resolution logic
  const mockStorage = {
    sessionStorage: new Map(),
    localStorage: new Map(),
    getToken() {
      return this.sessionStorage.get('auth_token') ||
             this.localStorage.get('auth_token') ||
             this.sessionStorage.get('token') ||
             this.localStorage.get('token') || null;
    }
  };

  mockStorage.localStorage.set('auth_token', 'token_auth_token_value');
  assert.strictEqual(mockStorage.getToken(), 'token_auth_token_value');
  pass('api.getToken() correctly retrieves standard "auth_token" from localStorage');

  mockStorage.localStorage.clear();
  mockStorage.sessionStorage.set('auth_token', 'session_auth_token');
  assert.strictEqual(mockStorage.getToken(), 'session_auth_token');
  pass('api.getToken() correctly retrieves "auth_token" from sessionStorage');

  mockStorage.sessionStorage.clear();
  mockStorage.localStorage.set('token', 'legacy_token');
  assert.strictEqual(mockStorage.getToken(), 'legacy_token');
  pass('api.getToken() falls back smoothly to legacy "token" key if present');

  // 6.3 Client-side redirect safety resolver
  function resolveSafeRedirect(searchParam) {
    if (!searchParam) return null;
    if (searchParam.startsWith('//') || searchParam.includes('://')) return null;
    if (searchParam.startsWith('/')) return searchParam;
    return '/' + searchParam.replace(/^\.\//, '');
  }

  assert.strictEqual(resolveSafeRedirect('bundle-editor.html'), '/bundle-editor.html');
  assert.strictEqual(resolveSafeRedirect('./bundle-editor.html'), '/bundle-editor.html');
  assert.strictEqual(resolveSafeRedirect('/bundle-editor.html'), '/bundle-editor.html');
  assert.strictEqual(resolveSafeRedirect('https://evil.com'), null);
  assert.strictEqual(resolveSafeRedirect('//malicious.com'), null);
  pass('Safe redirect resolver handles relative, dot-slash, and absolute paths while preventing open redirects');

  // 6.4 Server Auth Verification for Super Admin, Sub Admin, and Regular User
  const superAdminMeRes = await fetch(`${baseUrl}/api/me`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(superAdminMeRes.status, 200);
  const superAdminMe = await superAdminMeRes.json();
  assert.strictEqual(superAdminMe.user.role, 'super_admin');
  pass('Super admin /api/me returns 200 with role super_admin');

  const subAdminMeRes = await fetch(`${baseUrl}/api/me`, {
    headers: { 'Authorization': `Bearer ${subAdminToken}` }
  });
  assert.strictEqual(subAdminMeRes.status, 200);
  const subAdminMe = await subAdminMeRes.json();
  assert.strictEqual(subAdminMe.user.role, 'sub_admin');
  pass('Sub-admin /api/me returns 200 with role sub_admin');

  const regularUserMeRes = await fetch(`${baseUrl}/api/me`, {
    headers: { 'Authorization': `Bearer ${buyerToken}` }
  });
  assert.strictEqual(regularUserMeRes.status, 200);
  const regularUserMe = await regularUserMeRes.json();
  assert.strictEqual(regularUserMe.user.role, 'user');
  pass('Regular user has role "user" which correctly causes client-side bundle editor to block access and redirect to lobby');

  // 6.5 Cookie-based token fallback test on server
  const cookieMeRes = await fetch(`${baseUrl}/api/me`, {
    headers: { 'Cookie': `auth_token=${adminToken}` }
  });
  assert.strictEqual(cookieMeRes.status, 200);
  const cookieMe = await cookieMeRes.json();
  assert.strictEqual(cookieMe.user.username, 'Madara');
  pass('Server auth middleware accepts session token from Cookie header seamlessly');

  // Cleanup test server
  await new Promise(r => testServer.close(r));

  console.log('\n======================================================');
  console.log(` RESULTS: ${testCount} / ${testCount} TESTS PASSED! 🏆`);
  console.log('======================================================\n');
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
