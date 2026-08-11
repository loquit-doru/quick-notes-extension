#!/usr/bin/env node
/**
 * Run validate-zip.js on the newest quick-notes-v*.zip in the repo root, if any.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from './lib/qa-shared.js';

const zips = existsSync(REPO_ROOT)
  ? readdirSync(REPO_ROOT)
      .filter((f) => /^quick-notes-v.*\.zip$/i.test(f))
      .sort()
      .reverse()
  : [];

if (!zips.length) {
  console.log('SKIP: No quick-notes-v*.zip in repo root (build a store ZIP to enable check:zip in qa).');
  process.exit(0);
}

const zipPath = join(REPO_ROOT, zips[0]);
console.log(`Checking ZIP: ${zips[0]}\n`);

const script = join(REPO_ROOT, 'scripts', 'validate-zip.js');
const r = spawnSync(process.execPath, [script, zipPath], { stdio: 'inherit' });
process.exit(r.status ?? 1);
