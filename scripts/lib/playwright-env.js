/**
 * Force Playwright to use browsers installed under this repo (not sandbox/global cache).
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './qa-shared.js';

export const PLAYWRIGHT_LOCAL_BROWSERS = join(
  REPO_ROOT,
  'node_modules',
  'playwright-core',
  '.local-browsers'
);

/** Call before spawning Playwright CLI or tests. */
export function applyPlaywrightBrowserPath() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = PLAYWRIGHT_LOCAL_BROWSERS;
}

export function localChromiumInstalled() {
  const base = PLAYWRIGHT_LOCAL_BROWSERS;
  if (!existsSync(base)) return false;
  return readdirSync(base).some((d) => d.startsWith('chromium'));
}
