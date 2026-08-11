/**
 * The trial is spent in days of use, not days on the calendar.
 *
 * Under the old rule the countdown started at first open and ran on wall-clock
 * time, so someone who installed, glanced once and came back a fortnight later had
 * already lost the trial without ever seeing what Pro does. These tests pin the
 * new behaviour, including the carry-over for people mid-trial when it changed.
 */
import {
  test,
  expect,
  localDayKey,
  seedChromeStorage,
  waitForPopupReady
} from '../helpers/extension-playwright.js';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Seed trial storage and reload, confirming the write landed before reloading.
 * `expired` matters because folders are Pro-gated: once the trial ends the folder
 * pills are hidden, so readiness must not be waited on through them.
 */
async function seedTrial(
  page: Page,
  values: Record<string, unknown>,
  { expired = false }: { expired?: boolean } = {}
): Promise<void> {
  // Legacy-path cases must prove the new key is absent rather than assume it:
  // seedChromeStorage merges, so a leftover trialUsage would skip the migration.
  if (!('trialUsage' in values)) {
    await page.evaluate(async () => {
      await chrome.storage.local.remove('trialUsage');
    });
  }
  await seedChromeStorage(page, { proUnlocked: false, ...values });
  await page.evaluate(async () => {
    await chrome.storage.local.get(['trialUsage', 'trialStartDate']);
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForPopupReady(page, { foldersVisible: !expired });
}

test.describe('P. Trial counts use, not calendar time', () => {
  test('a month-old trial opened only once still has almost all of it left', async ({
    popupPage
  }) => {
    await seedTrial(popupPage, {
      trialUsage: { activeDays: 1, lastActiveDay: localDayKey(Date.now() - 30 * DAY_MS) }
    });

    // Opening today counts as the second active day, so six remain.
    await expect(popupPage.locator('#trialBanner')).toHaveClass(/active/);
    await expect(popupPage.locator('#trialDays')).toHaveText('6 trial days left');
    // Pro features stay unlocked while the trial runs.
    await expect(popupPage.locator('.folder-pill[data-folder-id="personal"]')).toBeVisible();
  });

  test('reopening on the same day does not burn another day', async ({ popupPage }) => {
    await seedTrial(popupPage, {
      trialUsage: { activeDays: 3, lastActiveDay: localDayKey() }
    });
    await expect(popupPage.locator('#trialDays')).toHaveText('5 trial days left');

    await popupPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPopupReady(popupPage);
    await expect(popupPage.locator('#trialDays')).toHaveText('5 trial days left');

    const stored = await popupPage.evaluate(async () => {
      const { trialUsage } = await chrome.storage.local.get(['trialUsage']);
      return trialUsage as { activeDays: number };
    });
    expect(stored.activeDays).toBe(3);
  });

  test('the seventh active day is announced as the last', async ({ popupPage }) => {
    await seedTrial(popupPage, {
      trialUsage: { activeDays: 7, lastActiveDay: localDayKey() }
    });
    await expect(popupPage.locator('#trialDays')).toHaveText('Last trial day');
    await expect(popupPage.locator('#trialBanner')).toHaveClass(/active/);
  });

  test('an eighth active day ends it', async ({ popupPage }) => {
    await seedTrial(
      popupPage,
      { trialUsage: { activeDays: 8, lastActiveDay: localDayKey() } },
      { expired: true }
    );
    await expect(popupPage.locator('#trialBanner')).toHaveClass(/expired/);
    // Folders go back behind the paywall when the trial ends.
    await expect(popupPage.locator('.folder-pill[data-folder-id="personal"]')).toBeHidden();
  });
});

test.describe('Q. Trial carry-over from the old wall-clock rule', () => {
  test('a legacy trial three days in keeps four days', async ({ popupPage }) => {
    await seedTrial(popupPage, {
      trialStartDate: Date.now() - 3 * DAY_MS
    });
    await expect(popupPage.locator('#trialDays')).toHaveText('4 trial days left');
  });

  test('a legacy trial long past its end stays ended', async ({ popupPage }) => {
    await seedTrial(
      popupPage,
      { trialStartDate: Date.now() - 40 * DAY_MS },
      { expired: true }
    );
    await expect(popupPage.locator('#trialBanner')).toHaveClass(/expired/);
  });
});
