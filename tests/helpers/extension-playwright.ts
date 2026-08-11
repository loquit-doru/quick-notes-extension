import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import {
  assertNoCriticalErrors,
  attachConsoleMonitor,
  type ConsoleMonitor
} from './console-monitor.js';

export const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Defaults to the working tree. Point QN_EXTENSION_PATH at an extracted store ZIP
 * to run the same suite against the artifact that actually ships — the repo can
 * pass while the package is missing a file the include list forgot.
 */
export const extensionPath = process.env.QN_EXTENSION_PATH || repoRoot;
export const e2eProfileDir = path.join(repoRoot, 'tests', '.pw-extension-e2e-profile');

/**
 * Mirrors DEFAULT_FOLDERS in storage/db.js, which seeds them only from
 * onupgradeneeded. Anything that empties the folders store must put them back,
 * otherwise the popup renders with no folder pills at all.
 */
export const DEFAULT_FOLDERS: Array<{ id: string; name: string; isSystem: boolean }> = [
  { id: 'all', name: '📋 All Notes', isSystem: true },
  { id: 'personal', name: '👤 Personal', isSystem: false },
  { id: 'work', name: '💼 Work', isSystem: false }
];

/** Local calendar day as YYYY-MM-DD — mirrors localDayKey() in shared/trial.js. */
export function localDayKey(timestamp: number = Date.now()): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const REVIEW_STATUS = {
  NEW: 'new',
  REVIEWED: 'reviewed',
  ARCHIVED: 'archived'
} as const;

export type SeedNote = {
  id: string;
  title: string;
  content?: string;
  folderId?: string | null;
  reviewStatus?: string;
  contextUrl?: string | null;
  contextTitle?: string | null;
  contextFavicon?: string | null;
  reminder?: { time: number; notified: boolean } | null;
  pinned?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

type ExtensionWorkerFixtures = {
  extensionContext: BrowserContext;
  extensionId: string;
};

type ExtensionTestFixtures = {
  popupPage: Page;
};

async function resolveExtensionId(context: BrowserContext): Promise<string | null> {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context
      .waitForEvent('serviceworker', { timeout: 30_000 })
      .catch(() => null);
  }
  if (!serviceWorker) return null;
  return serviceWorker.url().split('/')[2] ?? null;
}

export function popupUrl(extensionId: string): string {
  return `chrome-extension://${extensionId}/popup/popup.html`;
}

/**
 * Reset chrome.storage and empty every QuickNotesDB object store.
 *
 * This used to call deleteDatabase() and resolve on `onblocked`/`onerror` alike.
 * deleteDatabase() blocks for as long as any other context — the service worker,
 * another popup page — still holds a connection, so a blocked delete left the old
 * notes in place while reporting success, and they leaked into the next test.
 * Clearing the stores in place needs no exclusive access, and failures now throw.
 */
export async function clearExtensionStorage(page: Page): Promise<void> {
  await page.evaluate(async (defaultFolders) => {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear().catch(() => {});

    // Do not resurrect the database on a fresh profile: only open what exists.
    const databases = (await indexedDB.databases?.()) ?? [];
    if (!databases.some((info) => info.name === 'QuickNotesDB')) return;

    // No version argument — opens at the current version, so no upgrade is triggered
    // and the test helper never invents a schema.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('QuickNotesDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const storeNames = Array.from(db.objectStoreNames);
    if (storeNames.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeNames, 'readwrite');
        storeNames.forEach((name) => tx.objectStore(name).clear());
        // Restore the fresh-install folder set the app itself only writes on upgrade.
        if (storeNames.includes('folders')) {
          const folders = tx.objectStore('folders');
          defaultFolders.forEach((folder) => folders.put({ ...folder, createdAt: Date.now() }));
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    db.close();
  }, DEFAULT_FOLDERS);
  await page.waitForTimeout(150);
}

export async function seedChromeStorage(
  page: Page,
  values: Record<string, unknown>
): Promise<void> {
  await page.evaluate(async (data) => {
    await chrome.storage.local.set(data);
  }, values);
}

export async function seedNotes(page: Page, notes: SeedNote[]): Promise<void> {
  const now = Date.now();
  await page.evaluate(async ({ notesData, defaultFolders }) => {
    const DB_NAME = 'QuickNotesDB';
    const DB_VERSION = 4;
    const STORE = 'notes';
    const FOLDERS = 'folders';

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains(STORE)) {
          const store = database.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('pinned', 'pinned', { unique: false });
          store.createIndex('folderId', 'folderId', { unique: false });
        }
        if (!database.objectStoreNames.contains('trash')) {
          database.createObjectStore('trash', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(FOLDERS)) {
          const foldersStore = database.createObjectStore(FOLDERS, { keyPath: 'id' });
          defaultFolders.forEach((folder) => {
            foldersStore.add({ ...folder, createdAt: Date.now() });
          });
        }
      };
    });

    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const raw of notesData as Array<Record<string, unknown>>) {
      const note = {
        id: raw.id,
        title: raw.title,
        content: raw.content ?? '',
        pinned: raw.pinned ?? false,
        folderId: raw.folderId ?? null,
        createdAt: raw.createdAt ?? Date.now(),
        updatedAt: raw.updatedAt ?? Date.now(),
        contextUrl: raw.contextUrl ?? null,
        contextTitle: raw.contextTitle ?? null,
        contextFavicon: raw.contextFavicon ?? null,
        reminder: raw.reminder ?? null,
        reviewStatus: raw.reviewStatus ?? 'new'
      };
      store.put(note);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, {
    notesData: notes.map((n) => ({ ...n, createdAt: n.createdAt ?? now, updatedAt: n.updatedAt ?? now })),
    defaultFolders: DEFAULT_FOLDERS
  });
}

export async function waitForPopupReady(
  page: Page,
  options: { foldersVisible?: boolean } = {}
): Promise<void> {
  // Folders are Pro-gated: updateFolderAccessUI() hides #folderFilter entirely on
  // the free plan, so free-plan tests must not wait for the folder pills.
  const { foldersVisible = true } = options;
  await page.locator('#newNoteBtn').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#proCheckLoading').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  if (foldersVisible) {
    await page.locator('.folder-pill[data-folder-id="all"]').waitFor({ state: 'visible', timeout: 30_000 });
  }
  await page.waitForFunction(
    () => document.getElementById('newNoteBtn')?.getAttribute('disabled') !== 'true',
    { timeout: 30_000 }
  );
  const welcome = page.locator('#welcomeModal');
  if (await welcome.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => {});
    await welcome.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

export async function preparePopupPage(page: Page, extensionId: string): Promise<void> {
  // chrome.* APIs exist only on extension origins — navigate before storage helpers.
  await page.goto(popupUrl(extensionId), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await clearExtensionStorage(page);
  await seedChromeStorage(page, {
    hasLaunched: true,
    proUnlocked: true,
    trialStartDate: Date.now()
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForPopupReady(page);
}

/**
 * Re-seed an already-prepared popup as a post-trial FREE user, then reload.
 *
 * preparePopupPage() seeds `proUnlocked: true`, so every other spec exercises the
 * fully unlocked product and never reaches the free-plan branch of
 * getCurrentLimits(). Call this first in any test that asserts free limits.
 */
export async function expireTrial(page: Page): Promise<void> {
  // The trial counts active days, not elapsed ones: burn one more than the allowance
  // and stamp today as already counted, so opening the popup cannot add another.
  const spentTrial = { activeDays: 8, lastActiveDay: localDayKey() };

  // A plain set()+reload() is racy: the reload can start a fresh page context
  // before the write is visible to it, and initTrialSystem() then reads the old
  // state. Confirm the write, then wait for the popup to actually render the
  // expired-trial banner before handing control back to the test.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await seedChromeStorage(page, {
      proUnlocked: false,
      trialUsage: spentTrial
    });
    const persisted = await page.evaluate(async () => {
      const { trialUsage, proUnlocked } = await chrome.storage.local.get([
        'trialUsage',
        'proUnlocked'
      ]);
      return { trialUsage, proUnlocked };
    });
    if (persisted.trialUsage?.activeDays !== spentTrial.activeDays || persisted.proUnlocked !== false) {
      continue;
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPopupReady(page, { foldersVisible: false });

    const expired = await page
      .locator('#trialBanner.expired')
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (expired) return;
  }

  throw new Error('expireTrial: popup still reports an active trial after 3 attempts');
}

/** Read a stored note back out of IndexedDB by title (null when absent). */
export async function readStoredNoteByTitle(
  page: Page,
  title: string
): Promise<{ title: string; content: string } | null> {
  return page.evaluate(async (wanted) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('QuickNotesDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const notes = await new Promise<Array<{ title: string; content: string }>>(
      (resolve, reject) => {
        const tx = db.transaction('notes', 'readonly');
        const req = tx.objectStore('notes').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }
    );
    db.close();
    return notes.find((n) => n.title === wanted) ?? null;
  }, title);
}

export async function waitForAutoSave(page: Page): Promise<void> {
  await page.waitForTimeout(700);
}

export async function createNoteViaUi(
  page: Page,
  options: { title: string; body?: string; folderId?: 'personal' | 'work' | 'all' }
): Promise<void> {
  await page.locator('#listView').waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => {
    const menu = document.getElementById('listFilterMenu');
    if (menu) menu.hidden = true;
  });

  if (options.folderId && options.folderId !== 'all') {
    await page.locator(`.folder-pill[data-folder-id="${options.folderId}"]`).click();
  }
  await page.locator('#newNoteBtn').click();
  await page.locator('#noteTitleInput').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#noteTitleInput').fill(options.title);
  if (options.body) {
    await page.locator('#noteContentEditor').click();
    await page.locator('#noteContentEditor').fill(options.body);
  }
  await waitForAutoSave(page);
  await page.locator('#backBtn').click();
  await page.locator('#listView').waitFor({ state: 'visible' });
  await page.locator('.note-card', { hasText: options.title }).first().waitFor({
    state: 'visible',
    timeout: 10_000
  });
}

export async function openNoteMenu(page: Page, noteTitle: string): Promise<void> {
  const card = page.locator('.note-card').filter({ hasText: noteTitle }).first();
  await card.locator('.btn-note-menu').click();
  await page.locator('.note-card-menu').waitFor({ state: 'visible', timeout: 5_000 });
}

export async function clickNoteMenuAction(
  page: Page,
  action: 'mark-reviewed' | 'archive' | 'restore'
): Promise<void> {
  await page.locator(`.note-card-menu button[data-action="${action}"]`).click();
  await page.waitForTimeout(400);
}

export const test = base.extend<ExtensionWorkerFixtures & ExtensionTestFixtures>({
  extensionContext: [
    async ({}, use) => {
      const context = await chromium.launchPersistentContext(e2eProfileDir, {
        headless: !!process.env.CI,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          '--no-first-run',
          '--no-default-browser-check'
        ]
      });
      await use(context);
      await context.close();
    },
    { scope: 'worker' }
  ],

  extensionId: [
    async ({ extensionContext }, use, testInfo) => {
      const extensionId = await resolveExtensionId(extensionContext);
      if (!extensionId) {
        testInfo.skip(true, 'Extension service worker did not register (environment limitation)');
      }
      await use(extensionId!);
    },
    { scope: 'worker' }
  ],

  popupPage: async ({ extensionContext, extensionId }, use, testInfo) => {
    const page = await extensionContext.newPage();
    const monitor: ConsoleMonitor = attachConsoleMonitor(page);

    await preparePopupPage(page, extensionId);
    await use(page);
    await assertNoCriticalErrors(monitor, page, testInfo.title);
    await page.close();
  }
});

export { expect } from '@playwright/test';
