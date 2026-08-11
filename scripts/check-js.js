#!/usr/bin/env node
/**
 * Syntax-check all extension JavaScript (excludes landing, workers, scripts tooling).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO_ROOT } from './lib/qa-shared.js';

const EXTENSION_JS_ROOTS = [
  'background',
  'popup',
  'storage',
  'shared',
  'lib'
];

function collectJsFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectJsFiles(full, out);
    } else if (name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const root of EXTENSION_JS_ROOTS) {
  collectJsFiles(join(REPO_ROOT, root), files);
}

if (files.length === 0) {
  console.error('No extension JS files found.');
  process.exit(1);
}

let failed = 0;
for (const file of files.sort()) {
  const rel = relative(REPO_ROOT, file);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.error(`FAIL ${rel}`);
    if (r.stderr) console.error(r.stderr.trim());
  } else {
    console.log(`OK   ${rel}`);
  }
}

console.log(`\nChecked ${files.length} file(s), ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
