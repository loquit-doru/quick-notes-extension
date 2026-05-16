// Local note backup (chrome.storage.local) — survives extension updates, NOT uninstall.
import * as db from './db.js';

const BACKUP_STORAGE_KEY = 'notesBackupSnapshot';
const BACKUP_META_KEY = 'notesBackupMeta';
const MAX_BACKUP_BYTES = 4 * 1024 * 1024;

let backupTimer = null;

export async function hasLocalBackup() {
  const result = await chrome.storage.local.get([BACKUP_STORAGE_KEY]);
  return Boolean(result[BACKUP_STORAGE_KEY]);
}

export async function getBackupMeta() {
  const result = await chrome.storage.local.get([BACKUP_META_KEY]);
  return result[BACKUP_META_KEY] || null;
}

export function scheduleAutoBackup(isPro) {
  if (!isPro) return;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    runAutoBackup().catch((err) => console.error('Auto backup failed:', err));
  }, 3000);
}

export async function runAutoBackup() {
  const notes = await db.getAllNotes();
  const folders = await db.getFolders();
  const payload = {
    version: 1,
    savedAt: Date.now(),
    notes,
    folders: folders.filter((f) => !f.isSystem)
  };
  const json = JSON.stringify(payload);

  if (json.length > MAX_BACKUP_BYTES) {
    await chrome.storage.local.set({
      [BACKUP_META_KEY]: {
        savedAt: Date.now(),
        tooLarge: true,
        noteCount: notes.length,
        bytes: json.length
      }
    });
    await chrome.storage.local.remove([BACKUP_STORAGE_KEY]);
    return { saved: false, tooLarge: true };
  }

  await chrome.storage.local.set({
    [BACKUP_STORAGE_KEY]: json,
    [BACKUP_META_KEY]: {
      savedAt: Date.now(),
      tooLarge: false,
      noteCount: notes.length,
      folderCount: payload.folders.length,
      bytes: json.length
    }
  });
  return { saved: true };
}

export async function restoreFromLocalBackup() {
  const result = await chrome.storage.local.get([BACKUP_STORAGE_KEY]);
  const raw = result[BACKUP_STORAGE_KEY];
  if (!raw) {
    return { success: false, error: 'No auto-backup found on this device.' };
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: 'Backup file is corrupted.' };
  }

  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  const folders = Array.isArray(payload?.folders) ? payload.folders : [];

  if (notes.length === 0) {
    return { success: false, error: 'Backup contains no notes.' };
  }

  const existingFolders = await db.getFolders();
  for (const folder of folders) {
    if (!folder?.id || folder.isSystem) continue;
    if (existingFolders.some((f) => f.id === folder.id)) continue;
    try {
      await db.putFolder({
        id: folder.id,
        name: folder.name || 'Folder',
        isSystem: false,
        createdAt: folder.createdAt || Date.now()
      });
    } catch {
      // Non-fatal if folder cannot be restored
    }
  }

  const count = await db.importNotes(JSON.stringify(notes));
  return { success: true, count, savedAt: payload.savedAt || null };
}

export function formatBackupTime(timestamp) {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString();
}
