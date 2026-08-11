#!/usr/bin/env node
/**
 * Run Playwright with project-local browsers (overrides sandbox/global cache).
 * Usage: node scripts/run-playwright.js <config-file>
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyPlaywrightBrowserPath, PLAYWRIGHT_LOCAL_BROWSERS } from './lib/playwright-env.js';
import { REPO_ROOT } from './lib/qa-shared.js';

const config = process.argv[2];
if (!config) {
  console.error('Usage: node scripts/run-playwright.js <playwright.config.ts>');
  process.exit(2);
}

applyPlaywrightBrowserPath();

const cli = join(REPO_ROOT, 'node_modules', 'playwright', 'cli.js');
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: PLAYWRIGHT_LOCAL_BROWSERS };

const r = spawnSync(
  process.execPath,
  [cli, 'test', '-c', config],
  { cwd: REPO_ROOT, env, stdio: 'inherit' }
);
process.exit(r.status ?? 1);
