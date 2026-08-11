#!/usr/bin/env node
/**
 * Ensure landing/ has node_modules before Playwright starts the Next server.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/qa-shared.js';

const landingDir = join(REPO_ROOT, 'landing');
const nm = join(landingDir, 'node_modules');

if (existsSync(nm)) {
  console.log('OK: landing dependencies present');
  process.exit(0);
}

console.log('Installing landing dependencies...\n');
const r = spawnSync('npm', ['install'], {
  cwd: landingDir,
  stdio: 'inherit',
  shell: true
});
process.exit(r.status ?? 1);
