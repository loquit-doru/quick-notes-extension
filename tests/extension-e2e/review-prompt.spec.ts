/**
 * Review prompt gating.
 *
 * The whole point of this banner is restraint: a rating asked for too early costs
 * a bad one, and ratings feed store ranking. These tests pin the conditions so a
 * future change cannot quietly turn it into an install-time nag.
 */
import {
  test,
  expect,
  seedChromeStorage,
  seedNotes,
  waitForPopupReady,
  type SeedNote
} from '../helpers/extension-playwright.js';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const DAY_MS = 24 * 60 * 60 * 1000;

function makeNotes(count: number): SeedNote[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `review-note-${i + 1}`,
    title: `Review note ${i + 1}`,
    content: 'seeded'
  }));
}

/** Put the popup into a state where the prompt is eligible, then reload. */
async function primeReviewPrompt(
  page: Page,
  { days = 15, notes = 6, extra = {} }: { days?: number; notes?: number; extra?: Record<string, unknown> } = {}
): Promise<void> {
  await seedNotes(page, makeNotes(notes));
  await seedChromeStorage(page, { firstUseAt: Date.now() - days * DAY_MS, ...extra });
  // Round-trip the read so the write is committed before the reload starts.
  await page.evaluate(async () => {
    await chrome.storage.local.get(['firstUseAt']);
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForPopupReady(page);
}

test.describe('M. Review prompt — not on install', () => {
  test('stays hidden for a fresh profile with no history', async ({ popupPage }) => {
    await expect(popupPage.locator('#reviewBanner')).toBeHidden();
  });

  test('stays hidden after two weeks when barely any notes exist', async ({ popupPage }) => {
    await primeReviewPrompt(popupPage, { days: 30, notes: 2 });
    await expect(popupPage.locator('#reviewBanner')).toBeHidden();
  });

  test('stays hidden with plenty of notes on the first day', async ({ popupPage }) => {
    await primeReviewPrompt(popupPage, { days: 0, notes: 12 });
    await expect(popupPage.locator('#reviewBanner')).toBeHidden();
  });
});

test.describe('N. Review prompt — once earned', () => {
  test('appears after sustained use and takes precedence over the backup tip', async ({
    popupPage
  }) => {
    await primeReviewPrompt(popupPage);

    await expect(popupPage.locator('#reviewBanner')).toBeVisible();
    await expect(popupPage.getByRole('button', { name: /Leave a review/i })).toBeVisible();
    // Both nudges qualify here; only one may show, and the once-ever ask wins.
    await expect(popupPage.locator('#backupSafetyBanner')).toBeHidden();
  });

  test('"Not now" hides it and it stays away on the next open', async ({ popupPage }) => {
    await primeReviewPrompt(popupPage);
    await expect(popupPage.locator('#reviewBanner')).toBeVisible();

    await popupPage.getByRole('button', { name: /Not now/i }).click();
    await expect(popupPage.locator('#reviewBanner')).toBeHidden();

    await popupPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPopupReady(popupPage);
    await expect(popupPage.locator('#reviewBanner')).toBeHidden();

    const state = await popupPage.evaluate(async () => {
      const { reviewPromptState } = await chrome.storage.local.get(['reviewPromptState']);
      return reviewPromptState as { snoozes: number; snoozedUntil: number };
    });
    expect(state.snoozes).toBe(1);
    expect(state.snoozedUntil).toBeGreaterThan(Date.now());
  });
});

test.describe('O. Review prompt — never nags', () => {
  test('stops for good once the snooze allowance is used up', async ({ popupPage }) => {
    await primeReviewPrompt(popupPage, {
      extra: { reviewPromptState: { done: false, shown: true, snoozes: 2, snoozedUntil: 0 } }
    });
    await expect(popupPage.locator('#reviewBanner')).toBeHidden();
  });

  test('never returns after the review page has been opened', async ({ popupPage }) => {
    await primeReviewPrompt(popupPage, {
      extra: { reviewPromptState: { done: true, shown: true, snoozes: 0, snoozedUntil: 0 } }
    });
    await expect(popupPage.locator('#reviewBanner')).toBeHidden();
  });
});

test.describe('T. Rating from Settings — always there, never in the way', () => {
  test('Settings offers a permanent way to rate', async ({ popupPage }) => {
    await popupPage.locator('#settingsBtn').click();
    await expect(popupPage.locator('#settingsModal')).toBeVisible();
    await expect(popupPage.locator('#rateSection')).toBeVisible();
    await expect(popupPage.getByRole('button', { name: /^Rate$/ })).toBeVisible();
  });

  test('rating from Settings stops the banner from ever asking', async ({ popupPage }) => {
    // Put the prompt in a state where it would otherwise appear.
    await primeReviewPrompt(popupPage);
    await expect(popupPage.locator('#reviewBanner')).toBeVisible();

    // Keep the store tab from actually opening during the test.
    await popupPage.evaluate(() => {
      chrome.tabs.create = () => Promise.resolve({});
    });

    await popupPage.locator('#settingsBtn').click();
    await popupPage.locator('#rateExtensionBtn').click();
    await popupPage.locator('#closeSettingsBtn').click();

    await expect(popupPage.locator('#reviewBanner')).toBeHidden();

    await popupPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPopupReady(popupPage);
    await expect(popupPage.locator('#reviewBanner')).toBeHidden();

    const state = await popupPage.evaluate(async () => {
      const { reviewPromptState } = await chrome.storage.local.get(['reviewPromptState']);
      return reviewPromptState as { done: boolean };
    });
    expect(state.done).toBe(true);
  });
});

test.describe('U. Upgrading users are not sent to the back of the queue', () => {
  test('an existing user carries their real start date, not the upgrade date', async ({
    popupPage
  }) => {
    // A long-standing install: trialStartDate from months ago, and no firstUseAt
    // because that key did not exist before 1.7.2.
    await popupPage.evaluate(async () => {
      await chrome.storage.local.remove('firstUseAt');
    });
    await seedNotes(popupPage, makeNotes(6));
    await seedChromeStorage(popupPage, { trialStartDate: Date.now() - 200 * DAY_MS });
    await popupPage.evaluate(async () => {
      await chrome.storage.local.get(['trialStartDate']);
    });
    await popupPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPopupReady(popupPage);

    // Without the carry-over they would wait another fortnight to be asked.
    await expect(popupPage.locator('#reviewBanner')).toBeVisible();

    const firstUseAt = await popupPage.evaluate(async () => {
      const { firstUseAt } = await chrome.storage.local.get(['firstUseAt']);
      return firstUseAt as number;
    });
    expect(Date.now() - firstUseAt).toBeGreaterThan(100 * 24 * 60 * 60 * 1000);
  });
});
