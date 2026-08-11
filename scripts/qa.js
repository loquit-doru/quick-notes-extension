#!/usr/bin/env node
/**
 * Run all safe automated QA checks (no Playwright — use npm run test:landing separately).
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/qa-shared.js';

const steps = [
  ['check:js', join(REPO_ROOT, 'scripts', 'check-js.js')],
  ['test:logic', join(REPO_ROOT, 'scripts', 'run-logic-tests.js')],
  ['check:manifest', join(REPO_ROOT, 'scripts', 'validate-extension.js')],
  ['check:zip', join(REPO_ROOT, 'scripts', 'qa-run-zip.js')],
  ['test:landing:static', join(REPO_ROOT, 'scripts', 'test-landing-static.mjs')]
];

let failed = 0;
for (const [name, script] of steps) {
  console.log(`\n========== ${name} ==========\n`);
  const r = spawnSync(process.execPath, [script], { stdio: 'inherit', cwd: REPO_ROOT });
  if (r.status !== 0) {
    failed++;
    console.error(`\n${name} failed (exit ${r.status})\n`);
  }
}

if (failed) {
  console.error(`QA failed: ${failed} step(s).`);
  process.exit(1);
}
console.log('\nAll automated QA steps passed.');
console.log('Optional: npm run test:landing  |  npm run test:extension');
process.exit(0);
