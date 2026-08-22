#!/usr/bin/env node
/**
 * Render the store images from HTML via project-local Chromium: five 1280x800
 * screenshots, plus the small and marquee promotional tiles.
 *
 * Three rules this set exists to enforce, all of which the hand-made originals broke:
 *   1. Never show an empty product. Shots 1, 3 and 5 previously showed two
 *      "Untitled / No content" notes — the developer's own test data.
 *   2. Never present a Pro feature as if it were free. Search and folders are
 *      Pro-gated after the trial, so every surface that shows them is badged.
 *   3. Never name a browser. The old tiles read "for Chrome" and "inside Chrome",
 *      which is wrong on the Edge listing where the same file gets uploaded.
 *
 * Usage: node scripts/gen-screenshots.mjs
 */

import path from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { applyPlaywrightBrowserPath, PLAYWRIGHT_LOCAL_BROWSERS } from './lib/playwright-env.js';
import { REPO_ROOT } from './lib/qa-shared.js';

applyPlaywrightBrowserPath();
process.env.PLAYWRIGHT_BROWSERS_PATH = PLAYWRIGHT_LOCAL_BROWSERS;

const WIDTH = 1280;
const HEIGHT = 800;
const OUT_DIR = path.join(REPO_ROOT, 'screenshots');

/**
 * Store screenshots are a composition: a real capture of the running popup,
 * placed on a designed background with the headline copy.
 *
 * Earlier versions redrew the interface in HTML, which is how three of them came
 * to show "Untitled / No content" long after the product had moved on. A picture
 * of the actual extension cannot drift from it.
 */
const SHOTS = [
  {
    index: 1,
    state: 'notes',
    headTop: 'Capture ideas',
    headBottom: 'instantly',
    sub: 'Open Quick Notes from any tab, write, and get back to what you were doing.',
    chips: [
      { icon: '⚡', label: 'Fast' },
      { icon: '✨', label: 'No account' },
      { icon: '⌨️', label: 'Keyboard-friendly' }
    ]
  },
  {
    index: 2,
    state: 'search',
    headTop: 'Find any note',
    headBottom: 'in seconds',
    sub: 'Full-text search across everything you have written.',
    proNote: 'Pro feature — $2.99 one-time',
    chips: [
      { icon: '🔍', label: 'Search' },
      { icon: '⚡', label: 'Instant results' },
      { icon: '🗂️', label: 'Folders' }
    ]
  },
  {
    index: 3,
    state: 'inbox',
    headTop: 'Everything',
    headBottom: 'one tap away',
    sub: 'Notes, Inbox, this page and Trash each get their own tab.',
    chips: [
      { icon: '📥', label: 'Inbox' },
      { icon: '🔗', label: 'This page' },
      { icon: '🗑️', label: 'Trash' }
    ]
  },
  {
    index: 4,
    state: 'work',
    headTop: 'Keep work and',
    headBottom: 'personal apart',
    sub: 'Switch between All Notes, Personal and Work in a single click.',
    proNote: 'Pro feature — $2.99 one-time',
    chips: [
      { icon: '🗂️', label: 'Folders' },
      { icon: '📥', label: 'Inbox' },
      { icon: '📌', label: 'Pin to top' }
    ]
  },
  {
    index: 5,
    state: 'notes',
    headTop: 'Your notes stay',
    headBottom: 'on your machine',
    sub: 'No account, no cloud sync, no tracking. Everything works offline.',
    chips: [
      { icon: '🔒', label: 'Local-first' },
      { icon: '📴', label: 'Works offline' },
      { icon: '🚫', label: 'No tracking' }
    ]
  }
];

function renderHtml(shot, popupDataUri) {
  const proLine = shot.proNote ? '<div class="pro-note">' + shot.proNote + '</div>' : '';
  const chips = shot.chips
    .map((c) => '<div class="chip"><span>' + c.icon + '</span>' + c.label + '</div>')
    .join('');

  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    '* { margin: 0; padding: 0; box-sizing: border-box; }',
    'body { width: ' + WIDTH + 'px; height: ' + HEIGHT + 'px; overflow: hidden;',
    '  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;',
    '  background: #060a1c; -webkit-font-smoothing: antialiased; }',
    '.stage { position: relative; width: 100%; height: 100%;',
    '  display: grid; grid-template-columns: 1fr 480px;',
    '  align-items: center; gap: 40px; padding: 0 48px;',
    '  background: radial-gradient(120% 90% at 100% 0%, rgba(124,58,237,0.55) 0%, rgba(124,58,237,0) 55%),',
    '    radial-gradient(90% 80% at 0% 100%, rgba(29,78,216,0.35) 0%, rgba(29,78,216,0) 60%),',
    '    linear-gradient(135deg, #070c22 0%, #0b1338 45%, #1a1153 100%); }',
    '.copy { height: 100%; display: grid; grid-template-rows: auto 1fr auto; padding: 62px 0 104px; }',
    '.copy-mid { align-self: center; }',
    '.brand { display: flex; align-items: center; gap: 14px; }',
    '.brand .bolt { font-size: 34px; line-height: 1; }',
    '.brand .name { font-size: 31px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }',
    'h1 { font-size: 58px; line-height: 1.05; font-weight: 800; letter-spacing: -2px; color: #fff; }',
    'h1 .accent { background: linear-gradient(90deg, #a78bfa 0%, #60a5fa 100%);',
    '  -webkit-background-clip: text; -webkit-text-fill-color: transparent; }',
    '.sub { margin-top: 24px; font-size: 21px; line-height: 1.5; color: #b6c0e0; max-width: 470px; }',
    '.pro-note { margin-top: 14px; display: inline-block; font-size: 15px; font-weight: 600;',
    '  color: #fbbf24; border: 1px solid rgba(251,191,36,0.35); background: rgba(251,191,36,0.1);',
    '  padding: 6px 12px; border-radius: 8px; }',
    '.chips { display: flex; gap: 14px; flex-wrap: wrap; align-self: end; }',
    '.chip { display: flex; align-items: center; gap: 9px; padding: 14px 20px; border-radius: 13px;',
    '  font-size: 16px; font-weight: 600; color: #eef2ff;',
    '  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.11); }',
    '/* The popup at its true proportions, captured from the running extension. */',
    '.device { justify-self: center; border-radius: 18px; overflow: hidden;',
    '  border: 1px solid rgba(255,255,255,0.09); box-shadow: 0 40px 90px rgba(0,0,0,0.55); }',
    '.device img { display: block; width: 418px; height: auto; }',
    '</style></head><body>',
    '<div class="stage">',
    '  <div class="copy">',
    '    <div class="brand"><span class="bolt">⚡</span><span class="name">Quick Notes</span></div>',
    '    <div class="copy-mid">',
    '      <h1>' + shot.headTop + '<br><span class="accent">' + shot.headBottom + '</span></h1>',
    '      <div class="sub">' + shot.sub + '</div>',
    '      ' + proLine,
    '    </div>',
    '    <div class="chips">' + chips + '</div>',
    '  </div>',
    '  <div class="device"><img src="' + popupDataUri + '" alt=""></div>',
    '</div></body></html>'
  ].join('\n');
}

/** Demo notes seeded into the running extension — realistic, never blank. */
const DEMO_NOTES = [
  ['Project roadmap ideas', 'Landing page redesign, user onboarding flow, and pricing page updates.', 'work', 'reviewed', true],
  ['Quote from the article', 'Saved straight from the tab I was reading, with the source link attached.', 'personal', 'new', false],
  ['Daily stand-up notes', 'Discussed Q1 goals, sprint progress, and blockers. Action items assigned.', 'work', 'new', false],
  ['Book recommendations', 'Atomic Habits, Deep Work, The Almanack. Notes from each are in Personal.', 'personal', 'new', false],
  ['Weeknight pasta recipe', 'Garlic, chilli, good olive oil. Salt the water properly. 9 minutes.', 'personal', 'reviewed', false]
];

/** Drive the real popup into each state and return a PNG data URI per state. */
async function capturePopupStates(browser) {
  const sw =
    browser.serviceWorkers()[0] ||
    (await browser.waitForEvent('serviceworker', { timeout: 30000 }));
  const extId = sw.url().split('/')[2];

  const page = await browser.newPage();
  await page.setViewportSize({ width: 380, height: 620 });
  await page.goto('chrome-extension://' + extId + '/popup/popup.html', {
    waitUntil: 'domcontentloaded'
  });

  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      hasLaunched: true,
      proUnlocked: true,
      trialStartDate: Date.now(),
      // Suppresses the backup tip: it is honest UI, but not what these shots show.
      lastManualBackupAt: Date.now()
    });
  });

  // Let the extension create QuickNotesDB with its own schema before seeding:
  // opening it here first would create an empty database with no object stores.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#newNoteBtn').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(500);

  await page.evaluate(async (notes) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('QuickNotesDB', 4);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');
    notes.forEach((n, i) => {
      store.put({
        id: 'demo-' + i,
        title: n[0],
        content: n[1],
        folderId: n[2],
        reviewStatus: n[3],
        pinned: n[4],
        createdAt: Date.now() - i * 86400000,
        updatedAt: Date.now() - i * 86400000,
        contextUrl: i === 1 ? 'https://www.nytimes.com/article' : null,
        contextTitle: null,
        contextFavicon: null,
        reminder: null
      });
    });
    await new Promise((res) => {
      tx.oncomplete = res;
    });
    db.close();
  }, DEMO_NOTES);

  const reload = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#newNoteBtn').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(700);
  };
  const snap = async () =>
    'data:image/png;base64,' +
    (await page.locator('body').screenshot()).toString('base64');

  const states = {};
  await reload();
  states.notes = await snap();

  await page.locator('#tab-inbox').click();
  await page.waitForTimeout(400);
  states.inbox = await snap();

  await page.locator('#tab-notes').click();
  await page.locator('.folder-pill[data-folder-id="work"]').click();
  await page.waitForTimeout(400);
  states.work = await snap();

  await page.locator('.folder-pill[data-folder-id="all"]').click();
  await page.locator('#searchInput').fill('notes');
  await page.waitForTimeout(600);
  states.search = await snap();

  await page.close();
  return states;
}


const PROMOS = [
  {
    file: 'quick_notes_promo_small_440x280.png',
    width: 440,
    height: 280,
    headline: 'Fast private notes<br>in your browser',
    sub: 'No account &middot; Offline &middot; Local',
    scale: 'small'
  },
  {
    file: 'quick_notes_promo_marquee_1400x560.png',
    width: 1400,
    height: 560,
    headline: 'Fast, private, offline notes<br>in your browser',
    sub: 'Open instantly. Autosave while typing.<br>No account. No cloud. No tracking.',
    scale: 'wide'
  }
];

function renderPromoHtml(promo) {
  const wide = promo.scale === 'wide';
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${promo.width}px; height: ${promo.height}px; overflow: hidden;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(120% 100% at 100% 0%, rgba(124, 58, 237, 0.6) 0%, rgba(124, 58, 237, 0) 60%),
      linear-gradient(135deg, #070c22 0%, #0d1642 50%, #1b1157 100%);
    color: #fff;
    display: flex; align-items: center;
    padding: ${wide ? '0 72px' : '0 28px'};
  }
  .brand { display: flex; align-items: center; gap: ${wide ? '14px' : '9px'}; }
  .bolt { font-size: ${wide ? '40px' : '24px'}; line-height: 1; }
  .name { font-size: ${wide ? '38px' : '23px'}; font-weight: 700; letter-spacing: -0.4px; }
  h1 {
    margin-top: ${wide ? '22px' : '12px'};
    font-size: ${wide ? '42px' : '20px'};
    line-height: 1.2; font-weight: 700; letter-spacing: -0.6px;
    color: #dfe6ff;
  }
  .sub {
    margin-top: ${wide ? '18px' : '9px'};
    font-size: ${wide ? '19px' : '12px'};
    line-height: 1.5; color: #a9b5db;
  }
  .kbd {
    display: inline-block; margin-top: ${wide ? '26px' : '13px'};
    font-family: Consolas, monospace; font-size: ${wide ? '16px' : '11px'};
    font-weight: 600; color: #e9edff;
    background: rgba(255, 255, 255, 0.09);
    border: 1px solid rgba(255, 255, 255, 0.16);
    padding: ${wide ? '9px 15px' : '5px 9px'}; border-radius: 8px;
  }
</style></head>
<body>
  <div>
    <div class="brand"><span class="bolt">&#9889;</span><span class="name">Quick Notes</span></div>
    <h1>${promo.headline}</h1>
    <div class="sub">${promo.sub}</div>
    <div class="kbd">Ctrl + Shift + Q</div>
  </div>
</body></html>`;
}

const { chromium } = await import(
  pathToFileURL(path.join(REPO_ROOT, 'node_modules', 'playwright', 'index.mjs')).href
);

mkdirSync(OUT_DIR, { recursive: true });

// The extension is launched once and driven through each state; the composition
// pages then embed those captures. Screenshots of the product, not of a redraw.
const profileDir = path.join(REPO_ROOT, 'tests', '.pw-shot-profile');
rmSync(profileDir, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  args: [
    '--disable-extensions-except=' + REPO_ROOT,
    '--load-extension=' + REPO_ROOT,
    '--no-first-run',
    '--no-default-browser-check'
  ]
});

console.log('Capturing the running popup...\n');
const states = await capturePopupStates(browser);

const page = await browser.newPage();
await page.setViewportSize({ width: WIDTH, height: HEIGHT });

for (const shot of SHOTS) {
  const popup = states[shot.state];
  if (!popup) throw new Error('no capture for state: ' + shot.state);
  await page.setContent(renderHtml(shot, popup), { waitUntil: 'load' });
  const file = path.join(OUT_DIR, 'quick_notes_screenshot_' + shot.index + '_1280x800.png');
  await page.screenshot({ path: file });
  console.log('  ok  ' + path.relative(REPO_ROOT, file));
}

for (const promo of PROMOS) {
  await page.setViewportSize({ width: promo.width, height: promo.height });
  await page.setContent(renderPromoHtml(promo), { waitUntil: 'load' });
  const file = path.join(REPO_ROOT, promo.file);
  await page.screenshot({ path: file });
  console.log('  ok  ' + promo.file);
}

await browser.close();
rmSync(profileDir, { recursive: true, force: true });
console.log(
  '\nRendered ' + SHOTS.length + ' screenshots at ' + WIDTH + 'x' + HEIGHT +
  ' and ' + PROMOS.length + ' promo tiles.\n'
);
