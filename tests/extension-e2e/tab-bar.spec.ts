/**
 * Bottom tab bar.
 *
 * The tabs are a presentation of state that already existed — three of them map
 * to listViewFilter values and Trash is its own view — so the risk is not that
 * the state machine breaks, it is that the bar stops reflecting it. These tests
 * pin the reflection in both directions: tab click changes the list, and a
 * change made elsewhere updates the tab.
 */
import {
  test,
  expect,
  createNoteViaUi,
  seedNotes,
  waitForPopupReady,
  REVIEW_STATUS
} from '../helpers/extension-playwright.js';

test.describe.configure({ mode: 'serial' });

test.describe('R. Tab bar — structure', () => {
  test('shows four tabs with Notes selected on open', async ({ popupPage }) => {
    await expect(popupPage.locator('#tabBar')).toBeVisible();
    await expect(popupPage.locator('.tab-item')).toHaveCount(4);

    for (const tab of ['notes', 'inbox', 'page', 'trash']) {
      await expect(popupPage.locator(`#tab-${tab}`)).toBeVisible();
    }
    await expect(popupPage.locator('#tab-notes')).toHaveAttribute('aria-selected', 'true');
  });

  test('hides itself while a note is open so the editor owns the popup', async ({ popupPage }) => {
    await createNoteViaUi(popupPage, { title: 'Tab bar editor check' });

    await popupPage.locator('.note-card', { hasText: 'Tab bar editor check' }).first().click();
    await expect(popupPage.locator('#noteTitleInput')).toBeVisible();
    await expect(popupPage.locator('#tabBar')).toBeHidden();

    await popupPage.locator('#backBtn').click();
    await expect(popupPage.locator('#tabBar')).toBeVisible();
    await expect(popupPage.locator('#tab-notes')).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('S. Tab bar — selection follows state', () => {
  test('Inbox tab filters the list and carries the count', async ({ popupPage }) => {
    await seedNotes(popupPage, [
      { id: 'tb-new-1', title: 'Fresh one', reviewStatus: REVIEW_STATUS.NEW },
      { id: 'tb-new-2', title: 'Fresh two', reviewStatus: REVIEW_STATUS.NEW },
      { id: 'tb-old', title: 'Already seen', reviewStatus: REVIEW_STATUS.REVIEWED }
    ]);
    await popupPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPopupReady(popupPage);

    await expect(popupPage.locator('#tabBadge-inbox')).toHaveText('2');

    await popupPage.locator('#tab-inbox').click();
    await expect(popupPage.locator('#tab-inbox')).toHaveAttribute('aria-selected', 'true');
    await expect(popupPage.locator('#tab-notes')).toHaveAttribute('aria-selected', 'false');
    await expect(popupPage.locator('.note-card')).toHaveCount(2);
    await expect(popupPage.locator('.note-card', { hasText: 'Already seen' })).toHaveCount(0);
  });

  test('picking a folder pill deselects the Inbox tab', async ({ popupPage }) => {
    await seedNotes(popupPage, [
      { id: 'tb-p', title: 'Personal note', folderId: 'personal', reviewStatus: REVIEW_STATUS.NEW },
      { id: 'tb-w', title: 'Work note', folderId: 'work', reviewStatus: REVIEW_STATUS.NEW }
    ]);
    await popupPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForPopupReady(popupPage);

    await popupPage.locator('#tab-inbox').click();
    await expect(popupPage.locator('#tab-inbox')).toHaveAttribute('aria-selected', 'true');

    // The pill does not know about the tab bar; the shared render path is what
    // keeps them consistent, and that is exactly what this asserts.
    await popupPage.locator('.folder-pill[data-folder-id="work"]').click();
    await expect(popupPage.locator('#tab-inbox')).toHaveAttribute('aria-selected', 'false');
    await expect(popupPage.locator('#tab-notes')).toHaveAttribute('aria-selected', 'true');
    await expect(popupPage.locator('.note-card')).toHaveCount(1);
    await expect(popupPage.locator('.note-card', { hasText: 'Work note' })).toBeVisible();
  });

  test('Trash tab opens the trash view and returns to Notes', async ({ popupPage }) => {
    await popupPage.locator('#tab-trash').click();
    await expect(popupPage.locator('#trashView')).toBeVisible();
    await expect(popupPage.locator('#listView')).toBeHidden();
    await expect(popupPage.locator('#tab-trash')).toHaveAttribute('aria-selected', 'true');

    await popupPage.locator('#tab-notes').click();
    await expect(popupPage.locator('#listView')).toBeVisible();
    await expect(popupPage.locator('#trashView')).toBeHidden();
    await expect(popupPage.locator('#tab-trash')).toHaveAttribute('aria-selected', 'false');
  });
});
