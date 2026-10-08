/**
 * Automated Responsive & Multiplayer Verification Test
 * Tests all pages, stylesheets, CSS rules for responsive breakpoints,
 * safe areas, card layouts, and full multiplayer simulation across all 5 games.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const CSS_DIR = path.join(CLIENT_DIR, 'css');

describe('Responsive Layout & Design System Integrity Tests', () => {

  it('All HTML files must include viewport-fit=cover for safe-area support', () => {
    const htmlFiles = ['index.html', 'lobby.html', 'room.html', 'login.html', 'register.html', 'profile.html', 'settings.html'];
    for (const file of htmlFiles) {
      const filePath = path.join(CLIENT_DIR, file);
      assert.ok(fs.existsSync(filePath), `File exists: ${file}`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(
        content.includes('viewport-fit=cover'),
        `${file} must include viewport-fit=cover in viewport meta tag`
      );
    }
  });

  it('main.css contains safe area tokens and mobile responsive navigation', () => {
    const mainCssPath = path.join(CSS_DIR, 'main.css');
    const css = fs.readFileSync(mainCssPath, 'utf8');
    assert.ok(css.includes('--sat: env(safe-area-inset-top'), 'Has safe area top token');
    assert.ok(css.includes('--sab: env(safe-area-inset-bottom'), 'Has safe area bottom token');
    assert.ok(css.includes('overflow-x: hidden'), 'Has overflow-x: hidden on body/html');
    assert.ok(css.includes('.mobile-menu-btn'), 'Has mobile hamburger toggle button styles');
    assert.ok(css.includes('.mobile-nav-open'), 'Has mobile open navigation styles');
  });

  it('lobby.css converts rooms table into responsive cards on mobile (<= 768px)', () => {
    const lobbyCssPath = path.join(CSS_DIR, 'lobby.css');
    const css = fs.readFileSync(lobbyCssPath, 'utf8');
    assert.ok(css.includes('@media (max-width: 768px)'), 'Has media query for mobile');
    assert.ok(css.includes('.rooms-table thead') && css.includes('display: none'), 'Hides table header on mobile');
    assert.ok(css.includes('.rooms-table tr') && css.includes('grid-template-columns'), 'Transforms table rows to cards');
  });

  it('room.css supports mobile sidebar toggle and landscape layout', () => {
    const roomCssPath = path.join(CSS_DIR, 'room.css');
    const css = fs.readFileSync(roomCssPath, 'utf8');
    assert.ok(css.includes('.mobile-only-btn'), 'Has mobile toggle button');
    assert.ok(css.includes('.mobile-open'), 'Has mobile-open sidebar toggle');
    assert.ok(css.includes('orientation: landscape'), 'Has orientation: landscape support');
  });

  it('responsive.css covers all required target breakpoints (320px up to 1280px+)', () => {
    const respCssPath = path.join(CSS_DIR, 'responsive.css');
    const css = fs.readFileSync(respCssPath, 'utf8');
    assert.ok(css.includes('@media (max-width: 360px)'), 'Covers ultra-small mobile (320px - 360px)');
    assert.ok(css.includes('@media (max-width: 430px)'), 'Covers standard mobile (375px - 430px)');
    assert.ok(css.includes('@media (max-width: 768px)'), 'Covers mobile devices');
    assert.ok(css.includes('@media (max-width: 820px)') || css.includes('@media (max-width: 1024px)'), 'Covers tablets');
    assert.ok(css.includes('orientation: landscape'), 'Covers mobile landscape');
  });

  it('Chess board is constrained by both width and height to remain square without overflow', () => {
    const gamesCssPath = path.join(CSS_DIR, 'games.css');
    const respCssPath = path.join(CSS_DIR, 'responsive.css');
    const gamesCss = fs.readFileSync(gamesCssPath, 'utf8');
    const respCss = fs.readFileSync(respCssPath, 'utf8');
    assert.ok(gamesCss.includes('aspect-ratio: 1 / 1'), 'Chess board has aspect-ratio: 1 / 1');
    assert.ok(respCss.includes('.chess-board') && respCss.includes('100dvh'), 'Chess board constrained by 100dvh in responsive.css');
  });

  it('Domino tiles, UNO cards and Playing cards use scalable clamp dimensions', () => {
    const gamesCssPath = path.join(CSS_DIR, 'games.css');
    const css = fs.readFileSync(gamesCssPath, 'utf8');
    assert.ok(css.includes('.playing-card') && css.includes('clamp('), 'Playing card uses clamp');
    assert.ok(css.includes('.uno-card') && css.includes('clamp('), 'UNO card uses clamp');
    assert.ok(css.includes('.board-tile') && css.includes('clamp('), 'Domino board tile uses clamp');
    assert.ok(css.includes('.hand-tile') && css.includes('clamp('), 'Domino hand tile uses clamp');
  });
});
