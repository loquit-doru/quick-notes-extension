/**
 * Extension popup E2E (Playwright).
 *
 * Limitation: opening chrome-extension://…/popup/popup.html directly is NOT the same as
 * toolbar click or Ctrl+Shift+Q. activeTab page context and real toolbar UX require manual QA
 * (see docs/QA_CHECKLIST.md — Manual-only tests).
 */
import {
  attachConsoleMonitor,
  assertNoCriticalErrors
} from '../helpers/console-monitor.js';
import {
  test,
  expect,
  createNoteViaUi,
  openNoteMenu,
  clickNoteMenuAction,
  seedNotes,
  REVIEW_STATUS,
  popupUrl,
  preparePopupPage
} from '../helpers/extension-playwright.js';

test.describe.configure({ mode: 'serial' });

test.describe('A. Popup basics', () => {
  test('loads popup with core controls and trust UI', async ({ popupPage }) => {
    await expect(popupPage.getByRole('button', { name: /New Note/i })).toBeVisible();
    await expect(popupPage.locator('#searchInput')).toBeVisible();
    await expect(popupPage.locator('.folder-pill[data-folder-id="all"]')).toBeVisible();
    await expect(popupPage.locator('.folder-pill[data-folder-id="personal"]')).toBeVisible();
    await expect(popupPage.locator('.folder-pill[data-folder-id="work"]')).toBeVisible();

    await popupPage.locator('#settingsBtn').click();
    await expect(popupPage.locator('#settingsModal')).toBeVisible();
    await expect(popupPage.getByRole('heading', { name: /Privacy & Trust/i })).toBeVisible();
    await popupPage.locator('#closeSettingsBtn').click();
    await expect(popupPage.locator('#settingsModal')).toBeHidden();
  });
});

test.describe('B. Create note', () => {
  test('creates a note and persists after reload', async ({ popupPage, extensionId }) => {
    await createNoteViaUi(popupPage, {
      title: 'E2E Persist Note',
      body: 'Body text for persistence'
    });

    await popupPage.reload({ waitUntil: 'domcontentloaded' });
    await popupPage.locator('#newNoteBtn').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(popupPage.locator('.note-card', { hasText: 'E2E Persist Note' })).toBeVisible();
    await expect(popupPage).toHaveURL(popupUrl(extensionId));
  });
});

test.describe('C. Search', () => {
  test('filters list by search query', async ({ popupPage }) => {
    await createNoteViaUi(popupPage, { title: 'Alpha Search Target' });
    await createNoteViaUi(popupPage, { title: 'Beta Other Note' });
    await createNoteViaUi(popupPage, { title: 'Gamma Third' });

    await popupPage.locator('#searchInput').fill('Alpha Search');
    await popupPage.waitForTimeout(300);

    await expect(popupPage.locator('.note-card', { hasText: 'Alpha Search Target' })).toBeVisible();
    await expect(popupPage.locator('.note-card', { hasText: 'Beta Other Note' })).toHaveCount(0);
    await expect(popupPage.locator('.note-card', { hasText: 'Gamma Third' })).toHaveCount(0);
  });
});

test.describe('D. Personal / Work filters', () => {
  test('shows folder-specific notes', async ({ popupPage }) => {
    await createNoteViaUi(popupPage, { title: 'Personal Only', folderId: 'personal' });
    await createNoteViaUi(popupPage, { title: 'Work Only', folderId: 'work' });

    await popupPage.locator('.folder-pill[data-folder-id="personal"]').click();
    await expect(popupPage.locator('.note-card', { hasText: 'Personal Only' })).toBeVisible();
    await expect(popupPage.locator('.note-card', { hasText: 'Work Only' })).toHaveCount(0);

    await popupPage.locator('.folder-pill[data-folder-id="work"]').click();
    await expect(popupPage.locator('.note-card', { hasText: 'Work Only' })).toBeVisible();
    await expect(popupPage.locator('.note-card', { hasText: 'Personal Only' })).toHaveCount(0);
  });
});

test.describe('E. Inbox workflow', () => {
  test('Done, Inbox count, All Notes, archive, and restore', async ({ popupPage }) => {
    await createNoteViaUi(popupPage, { title: 'Inbox A' });
    await createNoteViaUi(popupPage, { title: 'Inbox B' });
    await createNoteViaUi(popupPage, { title: 'Inbox C' });

    // Inbox moved from a filter pill into the bottom tab bar.
    const inboxTab = popupPage.locator('#tab-inbox');
    await expect(inboxTab).toContainText('Inbox');
    await expect(popupPage.locator('#tabBadge-inbox')).toHaveText('3');

    await inboxTab.click();
    await expect(popupPage.locator('.note-card')).toHaveCount(3);

    const cardA = popupPage.locator('.note-card').filter({ hasText: 'Inbox A' }).first();
    await cardA.locator('.btn-note-done').click();
    await popupPage.waitForTimeout(400);

    await expect(popupPage.locator('#tabBadge-inbox')).toHaveText('2');
    await expect(popupPage.locator('.note-card')).toHaveCount(2);
    await expect(popupPage.locator('.note-card', { hasText: 'Inbox A' })).toHaveCount(0);

    await popupPage.locator('.folder-pill[data-folder-id="all"]').click();
    await expect(popupPage.locator('.note-card')).toHaveCount(3);
    await expect(popupPage.locator('.note-card', { hasText: 'Inbox A' })).toBeVisible();

    await openNoteMenu(popupPage, 'Inbox B');
    await clickNoteMenuAction(popupPage, 'archive');
    await expect(popupPage.locator('.note-card', { hasText: 'Inbox B' })).toHaveCount(0);
    await expect(popupPage.locator('.note-card')).toHaveCount(2);

    await popupPage.locator('#manageFoldersBtn').click();
    await popupPage.locator('[data-overflow-action="archived"]').click();
    await expect(popupPage.locator('.note-card', { hasText: 'Inbox B' })).toBeVisible();

    await openNoteMenu(popupPage, 'Inbox B');
    await clickNoteMenuAction(popupPage, 'restore');

    await popupPage.locator('.folder-pill[data-folder-id="all"]').click();
    await expect(popupPage.locator('.note-card', { hasText: 'Inbox B' })).toBeVisible();
  });
});

test.describe('F. Archive / Restore', () => {
  test('archives and restores from Archived view', async ({ popupPage }) => {
    await createNoteViaUi(popupPage, { title: 'Archive Target' });

    await openNoteMenu(popupPage, 'Archive Target');
    await clickNoteMenuAction(popupPage, 'archive');
    await expect(popupPage.locator('.note-card', { hasText: 'Archive Target' })).toHaveCount(0);

    await popupPage.locator('#manageFoldersBtn').click();
    await popupPage.locator('[data-overflow-action="archived"]').click();
    await expect(popupPage.locator('.note-card', { hasText: 'Archive Target' })).toBeVisible();

    await openNoteMenu(popupPage, 'Archive Target');
    await clickNoteMenuAction(popupPage, 'restore');

    await expect(popupPage.locator('.note-card', { hasText: 'Archive Target' })).toBeVisible();
  });
});

test.describe('G. Page Memory UI', () => {
  test('banner stays hidden without real activeTab context (direct popup)', async ({
    popupPage,
    extensionId
  }) => {
    await seedNotes(popupPage, [
      {
        id: 'pm-page',
        title: 'Page exact',
        reviewStatus: REVIEW_STATUS.REVIEWED,
        contextUrl: 'https://example.com/docs/page',
        contextTitle: 'Example doc'
      },
      {
        id: 'pm-site',
        title: 'Same site',
        reviewStatus: REVIEW_STATUS.REVIEWED,
        contextUrl: 'https://example.com/other',
        contextTitle: 'Other page'
      },
      {
        id: 'pm-other',
        title: 'Other domain',
        reviewStatus: REVIEW_STATUS.REVIEWED,
        contextUrl: 'https://other.test/x',
        contextTitle: 'Elsewhere'
      }
    ]);

    await popupPage.reload({ waitUntil: 'domcontentloaded' });
    await popupPage.locator('#newNoteBtn').waitFor({ state: 'visible', timeout: 30_000 });

    await expect(popupPage.locator('#pageMemorySection')).toBeHidden();

    // URL/page/domain matching logic is covered by npm run test:logic (url-utils).
    // Real Page Memory banner + activeTab capture: manual-only (toolbar / shortcut).
    await expect(popupPage).toHaveURL(popupUrl(extensionId));
  });
});

test.describe('H. Reminder UI / storage', () => {
  test('stores reminder on note and schedules chrome alarm', async ({ popupPage }) => {
    await createNoteViaUi(popupPage, { title: 'Reminder Note' });
    const card = popupPage.locator('.note-card', { hasText: 'Reminder Note' }).first();
    const noteId = await card.getAttribute('data-id');
    expect(noteId).toBeTruthy();

    await card.click();
    await popupPage.locator('#reminderBtn').click();
    await expect(popupPage.locator('#reminderModal')).toBeVisible();

    await popupPage.locator('.reminder-quick-btn[data-minutes="15"]').click();
    const futureLocal = await popupPage.evaluate(() => {
      const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
    await popupPage.locator('#reminderDateTime').fill(futureLocal);
    await popupPage.locator('#setReminderBtn').click();
    await expect(popupPage.locator('#reminderModal')).toBeHidden({ timeout: 10_000 });

    await expect
      .poll(
        async () =>
          popupPage.evaluate(async (id) => {
            const { reminders } = await chrome.storage.local.get(['reminders']);
            return reminders?.[id as string]?.time as number | undefined;
          }, noteId!),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(Date.now());

    const noteReminder = await popupPage.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('QuickNotesDB', 4);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const note = await new Promise<{ reminder?: { time: number } } | undefined>(
        (resolve, reject) => {
          const tx = db.transaction('notes', 'readonly');
          const req = tx.objectStore('notes').get(id as string);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }
      );
      db.close();
      return note?.reminder?.time;
    }, noteId);

    expect(noteReminder).toBeGreaterThan(Date.now());

    const alarm = await popupPage.evaluate(async (id) => {
      const alarms = await chrome.alarms.getAll();
      return alarms.find((a) => a.name === `reminder_${id}`);
    }, noteId);

    expect(alarm?.scheduledTime).toBeGreaterThan(Date.now());
  });
});

test.describe('J. Primary filter exclusivity', () => {
  test('Inbox and folder filters are mutually exclusive', async ({ popupPage }) => {
    await seedNotes(popupPage, [
      {
        id: 'rev-personal',
        title: 'Review Personal',
        folderId: 'personal',
        reviewStatus: REVIEW_STATUS.NEW
      },
      {
        id: 'rev-work',
        title: 'Review Work',
        folderId: 'work',
        reviewStatus: REVIEW_STATUS.NEW
      },
      {
        id: 'rev-general',
        title: 'Review General',
        folderId: null,
        reviewStatus: REVIEW_STATUS.NEW
      }
    ]);

    await popupPage.reload({ waitUntil: 'domcontentloaded' });
    await popupPage.locator('.folder-pill[data-folder-id="all"]').waitFor({ state: 'visible', timeout: 30_000 });

    const inboxTab = popupPage.locator('#tab-inbox');
    const personalPill = popupPage.locator('.folder-pill[data-folder-id="personal"]');
    const workPill = popupPage.locator('.folder-pill[data-folder-id="work"]');
    const allPill = popupPage.locator('.folder-pill[data-folder-id="all"]');

    await personalPill.click();
    await expect(popupPage.locator('.note-card')).toHaveCount(1);
    await expect(popupPage.locator('.note-card', { hasText: 'Review Personal' })).toBeVisible();

    await inboxTab.click();
    await expect(inboxTab).toHaveAttribute('aria-selected', 'true');
    await expect(popupPage.locator('#tabBadge-inbox')).toHaveText('3');
    await expect(popupPage.locator('.note-card')).toHaveCount(3);

    await workPill.click();
    await expect(workPill).toHaveClass(/active/);
    await expect(inboxTab).toHaveAttribute('aria-selected', 'false');
    await expect(popupPage.locator('.note-card')).toHaveCount(1);
    await expect(popupPage.locator('.note-card', { hasText: 'Review Work' })).toBeVisible();

    await inboxTab.click();
    await expect(inboxTab).toHaveAttribute('aria-selected', 'true');
    await expect(popupPage.locator('.note-card')).toHaveCount(3);

    await personalPill.click();
    await expect(personalPill).toHaveClass(/active/);
    await expect(inboxTab).toHaveAttribute('aria-selected', 'false');
    await expect(popupPage.locator('.note-card')).toHaveCount(1);

    await inboxTab.click();
    await expect(popupPage.locator('.note-card')).toHaveCount(3);

    await allPill.click();
    await expect(allPill).toHaveClass(/active/);
    await expect(inboxTab).toHaveAttribute('aria-selected', 'false');
    await expect(popupPage.locator('.note-card')).toHaveCount(3);

    await inboxTab.click();
    await popupPage.locator('#searchInput').fill('Work');
    await popupPage.waitForTimeout(300);
    await expect(popupPage.locator('.note-card')).toHaveCount(1);
    await expect(popupPage.locator('.note-card', { hasText: 'Review Work' })).toBeVisible();

    await popupPage.locator('#searchInput').fill('');
    await popupPage.waitForTimeout(300);
    await expect(popupPage.locator('.note-card')).toHaveCount(3);
  });
});

test.describe('I. ExtensionPay checkout', () => {
  test('upgrade opens ExtensionPay (no payment)', async (
    { extensionContext, extensionId },
    testInfo
  ) => {
    const page = await extensionContext.newPage();
    const monitor = attachConsoleMonitor(page);
    await preparePopupPage(page, extensionId);

    await page.waitForFunction(
      () => typeof (window as Window & { QuickNotesPro?: { openPaymentPage?: () => void } }).QuickNotesPro?.openPaymentPage === 'function',
      { timeout: 30_000 }
    );

    const triggerCheckout = async () => {
      await page.locator('#proHeaderBtn').click();
      const upgradeVisible = await page
        .locator('#upgradeBtn')
        .isVisible()
        .catch(() => false);
      if (upgradeVisible) {
        await page.locator('#upgradeBtn').click();
      } else {
        await page.evaluate(() => {
          (window as Window & { QuickNotesPro: { openPaymentPage: () => void } }).QuickNotesPro.openPaymentPage();
        });
      }
    };

    const paymentPagePromise = extensionContext.waitForEvent('page', {
      timeout: 20_000,
      predicate: (p) => /extensionpay\.com/i.test(p.url())
    });

    await triggerCheckout();

    let opened = false;
    const paymentPage = await paymentPagePromise.catch(() => null);
    if (paymentPage) {
      expect(paymentPage.url()).toMatch(/extensionpay\.com/i);
      opened = true;
      await paymentPage.close();
    }

    if (!opened) {
      const extPayPages = extensionContext.pages().filter((p) => /extensionpay\.com/i.test(p.url()));
      expect(extPayPages.length, 'ExtensionPay checkout should open extensionpay.com').toBeGreaterThan(0);
      for (const p of extPayPages) {
        if (p !== page) await p.close();
      }
      opened = true;
    }

    expect(opened).toBe(true);
    await assertNoCriticalErrors(monitor, page, testInfo.title);
    await page.close();
  });
});
