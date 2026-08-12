#!/usr/bin/env node
/**
 * Deploy the landing site to production and repoint every custom alias at it.
 *
 * Why this exists: getquicknotes.vercel.app and its siblings were assigned to a
 * deployment by hand, so they are aliases rather than project production domains.
 * A production deploy moves the project's own domains and leaves these behind —
 * the main address then serves the previous build, silently. That has already
 * bitten twice, once nearly costing a Google Search Console verification when the
 * verification file appeared to vanish from the live site.
 *
 * The real fix is to add these as production domains in the Vercel project
 * settings, after which this script becomes redundant and `vercel --prod` is
 * enough. Until then, deploy through here rather than calling vercel directly.
 *
 * Usage: node scripts/deploy-landing.mjs
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/qa-shared.js';

/** Custom aliases that do NOT follow a production deploy on their own. */
const ALIASES = [
  'getquicknotes.vercel.app',
  'quicknotesbrowser.vercel.app',
  'tryquicknotes.vercel.app'
];

const LANDING = join(REPO_ROOT, 'landing');

function vercel(args, { capture = false } = {}) {
  return execFileSync('npx', ['--yes', 'vercel', ...args], {
    cwd: LANDING,
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    shell: process.platform === 'win32'
  });
}

console.log('Deploying landing to production...\n');

// `vercel deploy` prints progress on stderr and the deployment URL on stdout,
// so capturing stdout alone gives a clean URL to alias against.
const stdout = vercel(['deploy', '--prod', '--yes'], { capture: true });
const deploymentUrl = stdout.trim().split(/\s+/).pop() || '';
const deployment = deploymentUrl.replace(/^https?:\/\//, '');

if (!deployment) {
  console.error('\nCould not read the deployment URL from vercel output.');
  process.exit(1);
}

console.log(`\nDeployed: ${deployment}\n`);
console.log('Repointing aliases:\n');

let failed = 0;
for (const alias of ALIASES) {
  try {
    vercel(['alias', 'set', deployment, alias]);
    console.log(`  ok   ${alias}`);
  } catch {
    console.error(`  FAIL ${alias}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} alias(es) still point at an older build. Fix before announcing.`);
  process.exit(1);
}

console.log('\nAll aliases point at the new deployment.');
console.log('Verify: https://getquicknotes.vercel.app\n');
