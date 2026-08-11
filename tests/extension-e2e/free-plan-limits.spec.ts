/**
 * Free-plan (post-trial) limits.
 *
 * Every other extension E2E spec runs with `proUnlocked: true` seeded by
 * preparePopupPage(), so the free branch of getCurrentLimits() is never reached.
 * These tests expire the trial first, then assert the two behaviours that
 * actually gate a free user:
 *
 *   K — note length is NOT capped (a 500-char cap used to abort the autosave and
 *       silently discard everything the user had typed)
 *   L — the note count IS capped at 10, and hitting it opens the upgrade prompt
 */
import {
  test,
  expect,
  createNoteViaUi,
  expireTrial,
  readStoredNoteByTitle,
  seedNotes,
  waitForPopupReady,
  type SeedNote
} from '../helpers/extension-playwright.js';

test.describe.configure({ mode: 'serial' });

const LONG_BODY = 'Free plan note body. '.repeat(80); // ~1680 chars, well past the old cap

function makeNotes(count: number, prefix: string): SeedNote[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    title: `${prefix} ${i + 1}`,
    content: 'seeded'
  }));
}

test.describe('K. Free plan — note length', () => {
  test('saves and persists a note far longer than the removed 500-char cap', async ({
    popupPage
  }) => {
    await expireTrial(popupPage);

    await createNoteViaUi(popupPage, { title: 'Long Free Note', body: LONG_BODY });

    await popupPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPopupReady(popupPage, { foldersVisible: false });

    const stored = await readStoredNoteByTitle(popupPage, 'Long Free Note');
    expect(stored, 'note should exist after reload').not.toBeNull();

    const plainText = (stored!.content || '').replace(/<[^>]*>/g, '');
    expect(plainText.length).toBeGreaterThan(1000);
  });
});

test.describe('L. Free plan — note cap', () => {
  test('allows the 10th note and blocks the 11th with the upgrade prompt', async ({
    popupPage
  }) => {
    await expireTrial(popupPage);

    await seedNotes(popupPage, makeNotes(9, 'Seeded'));
    await popupPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPopupReady(popupPage, { foldersVisible: false });
    await expect(popupPage.locator('.note-card')).toHaveCount(9);

    // 10th note is still within the free cap.
    await createNoteViaUi(popupPage, { title: 'Tenth Note' });
    await expect(popupPage.locator('#proModal')).toBeHidden();

    // 11th trips the limit and surfaces the paywall instead of creating a note.
    await popupPage.locator('#newNoteBtn').click();
    await expect(popupPage.locator('#proModal')).toBeVisible({ timeout: 10_000 });
    await expect(popupPage.locator('.note-card')).toHaveCount(10);
  });
});
