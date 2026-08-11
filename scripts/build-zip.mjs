#!/usr/bin/env node
/**
 * Build the store upload ZIP for the version in manifest.json.
 *
 * Works from an explicit include list rather than excluding dev files: a denylist
 * silently ships whatever nobody remembered to add to it, and this archive goes to
 * two public stores. Anything not named here does not travel.
 *
 * Usage: node scripts/build-zip.mjs
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/qa-shared.js';

/** Everything the extension needs at runtime, and nothing else. */
const INCLUDE = [
  'manifest.json',
  'privacy.html',
  'package.json',
  'background',
  'popup',
  'storage',
  'shared',
  'lib',
  'icons'
];

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
if (!version) {
  console.error('manifest.json has no version.');
  process.exit(1);
}

const zipName = `quick-notes-v${version}.zip`;
const zipPath = join(REPO_ROOT, zipName);

const missing = INCLUDE.filter((rel) => !existsSync(join(REPO_ROOT, rel)));
if (missing.length) {
  console.error(`Missing required paths: ${missing.join(', ')}`);
  process.exit(1);
}

if (existsSync(zipPath)) {
  console.error(
    `${zipName} already exists.\n` +
      'Store versions are immutable — bump the version in manifest.json and package.json,\n' +
      'or delete the file yourself if you are deliberately rebuilding the same version.'
  );
  process.exit(1);
}

const staging = mkdtempSync(join(tmpdir(), 'quick-notes-zip-'));
try {
  for (const rel of INCLUDE) {
    cpSync(join(REPO_ROOT, rel), join(staging, rel), { recursive: true });
  }

  // -Path <dir>\* keeps entries at the archive root; passing the directory itself
  // would nest everything one level down and the manifest would not be found.
  const ps = `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Optimal`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('Compress-Archive failed.');
    process.exit(r.status ?? 1);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}

const sizeKb = Math.round(statSync(zipPath).size / 1024);
console.log(`\nBuilt ${zipName} (${sizeKb} KB)`);
console.log(`Next: node scripts/validate-zip.js ${zipName}\n`);
