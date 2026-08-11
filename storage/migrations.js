// chrome.storage.local schema migrations (notes stay in IndexedDB)

import { STORAGE_SCHEMA_VERSION } from '../shared/config.js';
import { getMigratedReviewStatus } from '../shared/note-filters.js';
import * as db from './db.js';

export async function runStorageMigrations() {
  const stored = await chrome.storage.local.get(['storageSchemaVersion']);
  let version = stored.storageSchemaVersion || 1;

  if (version < 2) {
    await migrateReviewStatusForExistingNotes();
    version = 2;
    await chrome.storage.local.set({ storageSchemaVersion: STORAGE_SCHEMA_VERSION });
  }
}

/** Existing notes default to reviewed so Needs Review is not flooded. */
async function migrateReviewStatusForExistingNotes() {
  const notes = await db.getAllNotes();
  for (const note of notes) {
    if (!note.reviewStatus) {
      await db.updateNote(
        note.id,
        { reviewStatus: getMigratedReviewStatus(note) },
        { touchUpdatedAt: false }
      );
    }
  }
}
