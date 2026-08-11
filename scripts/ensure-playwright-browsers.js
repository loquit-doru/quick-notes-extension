#!/usr/bin/env node
/**
 * Install Playwright Chromium into the project (node_modules) so tests work
 * without relying on a global/sandbox browser cache. Idempotent.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyPlaywrightBrowserPath, PLAYWRIGHT_LOCAL_BROWSERS } from './lib/playwright-env.js';
import { REPO_ROOT } from './lib/qa-shared.js';

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1') {
  console.log('SKIP: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1');
  process.exit(0);
}

applyPlaywrightBrowserPath();
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: PLAYWRIGHT_LOCAL_BROWSERS };

const cli = join(REPO_ROOT, 'node_modules', 'playwright', 'cli.js');
if (!existsSync(cli)) {
  console.error('Playwright not installed. Run: npm install');
  process.exit(1);
}

console.log('Ensuring Playwright Chromium is installed (project-local)...\n');

const install = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  cwd: REPO_ROOT,
  env,
  stdio: 'inherit'
});

if (install.status !== 0) {
  console.error('\nFailed to install Playwright Chromium.');
  process.exit(install.status ?? 1);
}

console.log('\nPlaywright Chromium is ready.\n');
