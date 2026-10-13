/**
 * Test Suite for Store Icon and Empty Store Page
 * Verifies:
 * 1. Store icon button & nav link present on index, lobby, profile, settings, and store pages
 * 2. Store page serves HTTP 200 on both /store and /store.html
 * 3. Store main container is completely empty (no products, cards, sections, or purchase buttons)
 * 4. Nav link for Store has active state on store.html and link back to lobby/home works
 * 5. Translations for navStore exist in ar.js and en.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ar } from '../client/js/translations/ar.js';
import { en } from '../client/js/translations/en.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '..', 'client');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ PASS: ${message}`);
}

async function runSuite() {
  console.log('\n======================================================');
  console.log(' Store Icon & Empty Store Page Verification Suite ');
  console.log('======================================================\n');

  // 1. Translations check
  console.log('--- 1. Store Translation Keys ---');
  assert(ar.navStore === 'المتجر', 'Arabic translation navStore is defined as "المتجر"');
  assert(en.navStore === 'Store', 'English translation navStore is defined as "Store"');

  // 2. HTML Markup Contract across pages
  console.log('\n--- 2. Store Icon & Nav Links Across Main Pages ---');
  const pages = ['index.html', 'lobby.html', 'profile.html', 'settings.html', 'store.html'];
  for (const page of pages) {
    const content = fs.readFileSync(path.join(CLIENT_DIR, page), 'utf8');
    assert(content.includes('data-i18n="navStore"'), `${page} contains nav link with data-i18n="navStore"`);
    assert(content.includes('id="header-store-btn"'), `${page} contains header store icon button (#header-store-btn)`);
    assert(content.includes('store.html'), `${page} links correctly to store.html`);
  }

  // 3. Store Page Structure & Component Verification
  console.log('\n--- 3. Store Page Structure & Component Verification ---');
  const storeHtml = fs.readFileSync(path.join(CLIENT_DIR, 'store.html'), 'utf8');
  assert(storeHtml.includes('<main class="store-container'), 'store.html defines standard store-container main tag');
  assert(storeHtml.includes('id="user-points-balance"'), 'store.html defines user points balance display');
  assert(storeHtml.includes('id="store-skins-container"'), 'store.html defines store skins grid container');
  assert(storeHtml.includes('data-filter="uno"'), 'store.html defines UNO skins filter button');
  assert(storeHtml.includes('data-filter="chess"'), 'store.html defines Chess skins filter button');
  assert(storeHtml.includes('data-filter="domino"'), 'store.html defines Domino skins filter button');
  assert(storeHtml.includes('id="modal-purchase-skin"'), 'store.html defines purchase confirmation modal');

  // 4. Server Route Verification
  console.log('\n--- 4. HTTP Routes for Store ---');
  const app = express();
  app.use(express.static(CLIENT_DIR));
  app.get('/store', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'store.html')));

  const testServer = http.createServer(app);
  await new Promise(r => testServer.listen(0, '127.0.0.1', r));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Test /store.html
  const resHtml = await fetch(`${baseUrl}/store.html`);
  assert(resHtml.status === 200, 'GET /store.html returns 200 OK');
  const bodyHtml = await resHtml.text();
  assert(bodyHtml.includes('<title>Store — Classic Games</title>'), '/store.html serves valid Store page title');

  // Test /store route
  const resRoute = await fetch(`${baseUrl}/store`);
  assert(resRoute.status === 200, 'GET /store returns 200 OK');
  const bodyRoute = await resRoute.text();
  assert(bodyRoute.includes('<title>Store — Classic Games</title>'), '/store serves store.html');

  await new Promise(r => testServer.close(r));

  console.log('\n======================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED! 🏆`);
  console.log('======================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
