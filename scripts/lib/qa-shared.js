/**
 * Shared QA constants for Quick Notes extension validation.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dirname, '../..');

/** Paths that ship in the store ZIP (see docs/CHROME_WEB_STORE.md). */
export const RELEASE_INCLUDE = [
  'manifest.json',
  'privacy.html',
  'package.json',
  'background',
  'popup',
  'storage',
  'lib',
  'icons',
  'shared'
];

export const ALLOWED_PERMISSIONS = new Set([
  'storage',
  'activeTab',
  'alarms',
  'notifications'
]);

/** Optional permissions that must not appear without review. */
export const RISKY_OPTIONAL_PERMISSIONS = new Set([
  'tabs',
  'history',
  'bookmarks',
  'webRequest',
  'webRequestBlocking',
  'cookies',
  'management',
  'nativeMessaging',
  'sidePanel',
  'contextMenus',
  'scripting',
  'declarativeNetRequest',
  'geolocation',
  'clipboardRead'
]);

export const FORBIDDEN_RELEASE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /\.bak$/i,
  /\.map$/,
  /node_modules/
];

export const FORBIDDEN_ZIP_SUFFIXES = ['.env', '.bak', '.log', '.map', '.git'];

export const FORBIDDEN_ZIP_PATH_PARTS = [
  'node_modules/',
  '.git/',
  '.github/',
  'workers/',
  'landing/',
  'docs/',
  'screenshots/',
  '__MACOSX/'
];

export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/quick-notes/nompejhpnnehhnedkgklfgpdgcfhkfem';

export const EDGE_STORE_URL =
  'https://microsoftedge.microsoft.com/addons/detail/quick-notes/bpflnjinelkgbnbbjjddggnahdjhmadn';

export const CONTACT_MAILTO = 'mailto:quicknotes.extension@gmail.com';

export const CHROME_ONLY_DESCRIPTION_PATTERNS = [
  /chrome\s+only/i,
  /only\s+for\s+google\s+chrome/i,
  /google\s+chrome\s+exclusive/i,
  /not\s+available\s+on\s+edge/i,
  /chrome\s+exclusive/i
];

export function resolveReleaseRoot(rootArg) {
  return resolve(rootArg || REPO_ROOT);
}

export function collectFilesSync(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectFilesSync(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

export function listReleaseFiles(root) {
  const files = [];
  for (const item of RELEASE_INCLUDE) {
    const full = join(root, item);
    if (!existsSync(full)) continue;
    if (statSync(full).isDirectory()) {
      collectFilesSync(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}
