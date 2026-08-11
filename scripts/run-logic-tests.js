#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/qa-shared.js';

const tests = [
  'tests/logic/url-utils.test.js',
  'tests/logic/note-filters.test.js',
  'tests/logic/license-devices.test.js',
  'tests/logic/store-review-url.test.js',
  'tests/logic/trial.test.js',
];
const r = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: REPO_ROOT,
  stdio: 'inherit'
});
process.exit(r.status ?? 1);
