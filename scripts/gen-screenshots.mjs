#!/usr/bin/env node
/**
 * Render the five 1280x800 store screenshots from HTML via project-local Chromium.
 *
 * Two rules this set exists to enforce, both of which the hand-made originals broke:
 *   1. Never show an empty product. Shots 1, 3 and 5 previously showed two
 *      "Untitled / No content" notes — the developer's own test data.
 *   2. Never present a Pro feature as if it were free. Search and folders are
 *      Pro-gated after the trial, so every surface that shows them is badged.
 *
 * Usage: node scripts/gen-screenshots.mjs
 */

import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { applyPlaywrightBrowserPath, PLAYWRIGHT_LOCAL_BROWSERS } from './lib/playwright-env.js';
import { REPO_ROOT } from './lib/qa-shared.js';

applyPlaywrightBrowserPath();
process.env.PLAYWRIGHT_BROWSERS_PATH = PLAYWRIGHT_LOCAL_BROWSERS;

const WIDTH = 1280;
const HEIGHT = 800;
const OUT_DIR = path.join(REPO_ROOT, 'screenshots');

/** Demo notes — realistic, never blank. Reused so the set feels like one account. */
const NOTES = {
  roadmap: {
    title: 'Project roadmap ideas',
    body: 'Landing page redesign, user onboarding flow, and pricing page updates.',
    tag: 'Work',
    date: 'Feb 7'
  },
  standup: {
    title: 'Daily stand-up notes',
    body: 'Discussed Q1 goals, sprint progress, and blockers. Action items assigned.',
    tag: 'Work',
    date: 'Feb 6'
  },
  books: {
    title: 'Book recommendations',
    body: 'Atomic Habits, Deep Work, The Almanack of Naval Ravikant.',
    tag: 'Personal',
    date: 'Jan 30'
  },
  recipe: {
    title: 'Weeknight pasta recipe',
    body: 'Garlic, chilli, good olive oil. Salt the water properly. 9 minutes.',
    tag: 'Personal',
    date: 'Jan 28'
  },
  quote: {
    title: 'Quote from the article',
    body: 'Saved straight from the tab I was reading, with the source link attached.',
    tag: 'Personal',
    date: 'Jan 24',
    source: 'nytimes.com'
  }
};

const SHOTS = [
  {
    index: 1,
    headTop: 'Capture ideas',
    headBottom: 'instantly',
    sub: 'Open Quick Notes from any tab, write, and get back to what you were doing.',
    chips: [
      { icon: '⚡', label: 'Fast' },
      { icon: '✨', label: 'No account' },
      { icon: '⌨️', label: 'Keyboard-friendly' }
    ],
    notes: [NOTES.roadmap, NOTES.quote]
  },
  {
    index: 2,
    headTop: 'Find any note',
    headBottom: 'in seconds',
    sub: 'Full-text search across everything you have written.',
    proNote: 'Pro feature — $2.99 one-time',
    chips: [
      { icon: '🔍', label: 'Search' },
      { icon: '🗂️', label: 'Folders' },
      { icon: '⚡', label: 'Instant results' }
    ],
    notes: [NOTES.roadmap, NOTES.standup, NOTES.books],
    focus: 'search'
  },
  {
    index: 3,
    headTop: 'One click,',
    headBottom: 'one note',
    sub: 'Hit the New Note button or press Ctrl+N and start writing immediately.',
    chips: [
      { icon: '➕', label: 'New note' },
      { icon: '⌨️', label: 'Ctrl+N' },
      { icon: '💾', label: 'Auto-saved' }
    ],
    notes: [NOTES.standup, NOTES.recipe],
    focus: 'new'
  },
  {
    index: 4,
    headTop: 'Keep work and',
    headBottom: 'personal apart',
    sub: 'Switch between All Notes, Personal and Work in a single click.',
    proNote: 'Pro feature — $2.99 one-time',
    // No "Tags" chip: the app has folders and an Inbox workflow, not tagging.
    chips: [
      { icon: '🗂️', label: 'Folders' },
      { icon: '📥', label: 'Inbox' },
      { icon: '📌', label: 'Pin to top' }
    ],
    notes: [NOTES.roadmap, NOTES.books],
    focus: 'folders'
  },
  {
    index: 5,
    headTop: 'Your notes stay',
    headBottom: 'on your machine',
    sub: 'No account, no cloud sync, no tracking. Everything works offline.',
    chips: [
      { icon: '🔒', label: 'Local-first' },
      { icon: '📴', label: 'Works offline' },
      { icon: '🚫', label: 'No tracking' }
    ],
    notes: [NOTES.books, NOTES.recipe]
  }
];

const PRO_BADGE = '<span class="pro-badge">Pro</span>';

function noteCard(note) {
  const source = note.source
    ? `<div class="note-source"><span class="globe">🌐</span>${note.source}</div>`
    : '';
  const tagClass = note.tag === 'Work' ? 'tag-work' : 'tag-personal';
  const tagIcon = note.tag === 'Work' ? '💼' : '👤';
  return `
    <div class="note-card">
      <div class="note-title">${note.title}</div>
      <div class="note-body">${note.body}</div>
      ${source}
      <div class="note-foot">
        <span class="note-date">${note.date}</span>
        <span class="note-tag ${tagClass}">${tagIcon} ${note.tag}</span>
      </div>
    </div>`;
}

function renderHtml(shot) {
  const focusSearch = shot.focus === 'search' ? ' is-focus' : '';
  const focusFolders = shot.focus === 'folders' ? ' is-focus' : '';
  const focusNew = shot.focus === 'new' ? ' is-focus' : '';
  const proLine = shot.proNote ? `<div class="pro-note">${shot.proNote}</div>` : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    background: #060a1c;
    -webkit-font-smoothing: antialiased;
  }
  .stage {
    position: relative; width: 100%; height: 100%;
    display: grid; grid-template-columns: 1fr 620px;
    align-items: center; gap: 40px; padding: 0 48px;
    background:
      radial-gradient(120% 90% at 100% 0%, rgba(124, 58, 237, 0.55) 0%, rgba(124, 58, 237, 0) 55%),
      radial-gradient(90% 80% at 0% 100%, rgba(29, 78, 216, 0.35) 0%, rgba(29, 78, 216, 0) 60%),
      linear-gradient(135deg, #070c22 0%, #0b1338 45%, #1a1153 100%);
  }

  /* ---------- left column ----------
     Three rows so the copy fills the frame the way the hand-made set did:
     brand pinned top, headline block centred, chips resting at the bottom. */
  .copy { height: 100%; display: grid; grid-template-rows: auto 1fr auto; padding: 62px 0 104px; }
  .copy-mid { align-self: center; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand .bolt { font-size: 34px; line-height: 1; }
  .brand .name { font-size: 31px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }

  h1 { font-size: 62px; line-height: 1.05; font-weight: 800; letter-spacing: -2px; color: #fff; }
  h1 .accent {
    background: linear-gradient(90deg, #a78bfa 0%, #60a5fa 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .sub { margin-top: 24px; font-size: 21px; line-height: 1.5; color: #b6c0e0; max-width: 480px; }
  .pro-note {
    margin-top: 14px; display: inline-block; font-size: 15px; font-weight: 600;
    color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.35);
    background: rgba(251, 191, 36, 0.1); padding: 6px 12px; border-radius: 8px;
  }
  .chips { display: flex; gap: 14px; flex-wrap: wrap; align-self: end; }
  .chip {
    display: flex; align-items: center; gap: 9px;
    padding: 14px 20px; border-radius: 13px; font-size: 16px; font-weight: 600; color: #eef2ff;
    background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.11);
  }

  /* ---------- popup mockup ---------- */
  .popup {
    width: 580px; border-radius: 18px; overflow: hidden;
    background: #0c1020; border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 40px 90px rgba(0, 0, 0, 0.55);
  }
  .pop-head {
    display: flex; align-items: center; gap: 12px;
    padding: 18px 20px; background: #070a16; border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .pop-head .name { font-size: 19px; font-weight: 700; color: #fff; flex: 1; }
  .ms { font-size: 14px; color: #8b97bd; }
  .tick { color: #facc15; font-size: 16px; }
  .sun { font-size: 16px; }

  .pop-body { padding: 16px; display: flex; flex-direction: column; gap: 13px; }

  .search {
    display: flex; align-items: center; gap: 11px;
    padding: 13px 15px; border-radius: 11px;
    background: #131a30; border: 1px solid rgba(255,255,255,0.08); color: #7f8bb0; font-size: 15px;
  }
  .search.is-focus { border-color: #7c6cf5; box-shadow: 0 0 0 3px rgba(124, 108, 245, 0.22); }
  .search .grow { flex: 1; }

  .pills { display: flex; align-items: center; gap: 9px; }
  .pill {
    display: flex; align-items: center; gap: 7px;
    padding: 9px 14px; border-radius: 999px; font-size: 14px; font-weight: 600; color: #dbe2f7;
    background: #141b33; border: 1px solid rgba(255,255,255,0.09);
  }
  .pill.active { background: linear-gradient(90deg, #7c3aed, #6366f1); color: #fff; border-color: transparent; }
  .pills.is-focus .pill { box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.32); }
  .pill.plus { margin-left: auto; padding: 9px 13px; }

  .new-note {
    display: flex; align-items: center; gap: 11px;
    padding: 16px 18px; border-radius: 12px; color: #fff; font-size: 18px; font-weight: 700;
    background: linear-gradient(90deg, #7c3aed 0%, #3b6ef5 100%);
  }
  .new-note.is-focus { box-shadow: 0 0 0 3px rgba(124, 108, 245, 0.35); }
  .new-note .kbd { margin-left: auto; font-size: 13px; font-weight: 600; opacity: 0.85; font-family: Consolas, monospace; }

  .note-card {
    padding: 15px 16px; border-radius: 12px;
    background: #121829; border: 1px solid rgba(255,255,255,0.06);
  }
  .note-title { font-size: 16px; font-weight: 700; color: #fff; }
  .note-body { margin-top: 6px; font-size: 14px; line-height: 1.45; color: #9aa6ca; }
  .note-source { margin-top: 8px; font-size: 13px; color: #7a86ab; display: flex; align-items: center; gap: 6px; }
  .note-foot { margin-top: 11px; display: flex; align-items: center; }
  .note-date { font-size: 13px; color: #78829f; flex: 1; }
  .note-tag { font-size: 12px; font-weight: 600; padding: 4px 9px; border-radius: 7px; }
  .tag-work { background: rgba(56, 130, 246, 0.16); color: #93b4fd; }
  .tag-personal { background: rgba(167, 139, 250, 0.16); color: #c4b0fd; }

  .pro-badge {
    font-size: 10px; font-weight: 800; letter-spacing: 0.9px; text-transform: uppercase;
    padding: 3px 7px; border-radius: 5px; color: #201503;
    background: linear-gradient(90deg, #fcd34d, #f59e0b);
  }

  .pop-foot {
    display: flex; align-items: center; justify-content: center; gap: 22px;
    padding: 14px; background: #070a16; border-top: 1px solid rgba(255,255,255,0.07);
    font-size: 13px; color: #8b97bd;
  }
  .pop-foot .kbd {
    font-family: Consolas, monospace; font-size: 12px; color: #cbd5f5;
    background: #182034; border: 1px solid rgba(255,255,255,0.09);
    padding: 3px 7px; border-radius: 5px; margin-right: 7px;
  }
</style></head>
<body>
  <div class="stage">
    <div class="copy">
      <div class="brand"><span class="bolt">⚡</span><span class="name">Quick Notes</span></div>
      <div class="copy-mid">
        <h1>${shot.headTop}<br><span class="accent">${shot.headBottom}</span></h1>
        <div class="sub">${shot.sub}</div>
        ${proLine}
      </div>
      <div class="chips">
        ${shot.chips.map((c) => `<div class="chip"><span>${c.icon}</span>${c.label}</div>`).join('')}
      </div>
    </div>

    <div class="popup">
      <div class="pop-head">
        <span class="bolt">⚡</span><span class="name">Quick Notes</span>
        <span class="ms">39ms</span><span class="tick">✓</span><span class="sun">☀️</span>
      </div>
      <div class="pop-body">
        <div class="search${focusSearch}">
          <span>🔍</span><span class="grow">Search notes...</span>${PRO_BADGE}
        </div>
        <div class="pills${focusFolders}">
          <div class="pill active">📋 All Notes</div>
          <div class="pill">👤 Personal</div>
          <div class="pill">💼 Work</div>
          <div class="pill plus">${PRO_BADGE}</div>
        </div>
        <div class="new-note${focusNew}">
          <span>＋</span>New Note<span class="kbd">Ctrl+N</span>
        </div>
        ${shot.notes.map(noteCard).join('')}
      </div>
      <div class="pop-foot">
        <span><span class="kbd">Ctrl+Shift+Q</span>Open</span>
        <span><span class="kbd">Ctrl+N</span>New</span>
        <span><span class="kbd">Esc</span>Back</span>
      </div>
    </div>
  </div>
</body></html>`;
}

const { chromium } = await import(`file:///${REPO_ROOT.replace(/\\/g, '/')}/node_modules/playwright/index.mjs`);

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1
});

for (const shot of SHOTS) {
  await page.setContent(renderHtml(shot), { waitUntil: 'load' });
  const file = path.join(OUT_DIR, `quick_notes_screenshot_${shot.index}_1280x800.png`);
  await page.screenshot({ path: file });
  console.log(`  ok  ${path.relative(REPO_ROOT, file)}`);
}

await browser.close();
console.log(`\nRendered ${SHOTS.length} screenshots at ${WIDTH}x${HEIGHT}.\n`);
