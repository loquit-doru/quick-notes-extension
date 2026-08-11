#!/usr/bin/env node
/**
 * Admin: list/delete legacy crypto KV keys in LICENSES (Cloudflare).
 *
 * Targets only crypto-specific prefixes (default: tx:*). Does NOT touch Stripe,
 * license, email, devices, or rate-limit keys.
 *
 * Dry-run by default. Deletions require --execute.
 *
 * Usage (from repo root or workers/):
 *   node workers/scripts/kv-cleanup-legacy-crypto.mjs
 *   node workers/scripts/kv-cleanup-legacy-crypto.mjs --remote
 *   node workers/scripts/kv-cleanup-legacy-crypto.mjs --execute --remote
 *   node workers/scripts/kv-cleanup-legacy-crypto.mjs --local
 *   node workers/scripts/kv-cleanup-legacy-crypto.mjs --prefix=tx: --execute --remote
 *
 * Requires: wrangler CLI, Cloudflare auth, workers/wrangler.toml LICENSES binding.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKERS_DIR = join(SCRIPT_DIR, '..');

/** KV prefixes created only by removed crypto /verify flow (safe to delete). */
const LEGACY_CRYPTO_PREFIXES = ['tx:'];

/** Never delete keys matching these prefixes (Stripe + active license data). */
const PROTECTED_KV_PREFIXES = [
  'license:',
  'stripe-email:',
  'stripe-license:',
  'stripe-webhook:',
  'devices:',
  'email:',
  'rate:',
];

function printHelp() {
  console.log(`kv-cleanup-legacy-crypto — remove legacy crypto KV keys (dry-run default)

Options:
  --execute       Actually delete keys (default: list only)
  --remote        Use remote KV (production). Default when --local omitted.
  --local         Use local KV (wrangler dev persistence)
  --prefix=tx:    Only process this prefix (must be in legacy allowlist)
  --help          Show this help

Legacy prefixes (always scanned unless --prefix overrides list):
  ${LEGACY_CRYPTO_PREFIXES.join(', ')}

Protected (never deleted): ${PROTECTED_KV_PREFIXES.join(', ')}
`);
}

function parseArgs(argv) {
  const opts = {
    execute: false,
    local: false,
    remote: false,
    prefix: null,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--execute') opts.execute = true;
    else if (arg === '--local') opts.local = true;
    else if (arg === '--remote') opts.remote = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--prefix=')) opts.prefix = arg.slice('--prefix='.length);
    else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }
  if (!opts.local && !opts.remote) opts.remote = true;
  if (opts.local && opts.remote) {
    console.error('Use either --local or --remote, not both.');
    process.exit(1);
  }
  return opts;
}

function isProtectedKey(name) {
  return PROTECTED_KV_PREFIXES.some((p) => name.startsWith(p));
}

function isLegacyCryptoKey(name, allowedPrefixes) {
  if (isProtectedKey(name)) return false;
  return allowedPrefixes.some((p) => name.startsWith(p));
}

function wrangler(args, { json = false, exitOnError = true } = {}) {
  const full = ['wrangler', ...args];
  const r = spawnSync('npx', full, {
    cwd: WORKERS_DIR,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (r.error) {
    if (exitOnError) {
      console.error('Failed to run wrangler:', r.error.message);
      process.exit(1);
    }
    return { ok: false, stdout: '', stderr: r.error.message, status: 1 };
  }
  const stdout = (r.stdout || '').trim();
  const stderr = (r.stderr || '').trim();
  if (r.status !== 0) {
    if (exitOnError) {
      console.error(stderr || stdout || `wrangler exited ${r.status}`);
      process.exit(r.status || 1);
    }
    return { ok: false, stdout, stderr, status: r.status || 1 };
  }
  if (!json) return { ok: true, stdout, stderr, status: 0 };
  if (!stdout) return { ok: true, data: [], stdout, stderr, status: 0 };
  try {
    return { ok: true, data: JSON.parse(stdout), stdout, stderr, status: 0 };
  } catch {
    if (exitOnError) {
      console.error('Expected JSON from wrangler, got:', stdout.slice(0, 500));
      process.exit(1);
    }
    return { ok: false, stdout, stderr: 'invalid JSON', status: 1 };
  }
}

function listKeys(prefix, target) {
  const args = ['kv', 'key', 'list', '--binding=LICENSES', `--prefix=${prefix}`];
  if (target.remote) args.push('--remote');
  if (target.local) args.push('--local');
  const result = wrangler(args, { json: true });
  const rows = result.data || [];
  return rows.map((row) => (typeof row === 'string' ? row : row.name)).filter(Boolean);
}

function deleteKey(name, target) {
  const args = ['kv', 'key', 'delete', name, '--binding=LICENSES'];
  if (target.remote) args.push('--remote');
  if (target.local) args.push('--local');
  const result = wrangler(args, { exitOnError: false });
  if (!result.ok) {
    console.error(result.stderr || result.stdout || `delete failed for ${name}`);
  }
  return result.ok;
}

function resolvePrefixes(cliPrefix) {
  if (cliPrefix) {
    const allowed = LEGACY_CRYPTO_PREFIXES.some(
      (p) => cliPrefix === p || cliPrefix.startsWith(p)
    );
    if (!allowed) {
      console.error(
        `--prefix=${cliPrefix} is not allowed. Use one of: ${LEGACY_CRYPTO_PREFIXES.join(', ')}`
      );
      process.exit(1);
    }
    return [cliPrefix];
  }
  return [...LEGACY_CRYPTO_PREFIXES];
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const target = { remote: opts.remote, local: opts.local };
  const prefixes = resolvePrefixes(opts.prefix);
  const mode = opts.execute ? 'EXECUTE' : 'DRY-RUN';
  const targetLabel = opts.local ? 'local' : 'remote';

  console.log(`[${mode}] LICENSES KV (${targetLabel}) — legacy crypto cleanup`);
  console.log(`Scan prefixes: ${prefixes.join(', ')}`);
  if (!opts.execute) {
    console.log('No keys will be deleted. Pass --execute to delete.\n');
  } else {
    console.log('Keys matching legacy prefixes will be DELETED.\n');
  }

  const toDelete = [];
  const skipped = [];

  for (const prefix of prefixes) {
    const keys = listKeys(prefix, target);
    console.log(`Prefix "${prefix}": ${keys.length} key(s) listed`);
    for (const name of keys) {
      if (isProtectedKey(name)) {
        skipped.push({ name, reason: 'protected prefix' });
        console.log(`  SKIP (protected): ${name}`);
        continue;
      }
      if (!isLegacyCryptoKey(name, LEGACY_CRYPTO_PREFIXES)) {
        skipped.push({ name, reason: 'not legacy crypto' });
        console.log(`  SKIP (not legacy): ${name}`);
        continue;
      }
      toDelete.push(name);
      console.log(`  ${opts.execute ? 'DELETE' : 'would delete'}: ${name}`);
    }
  }

  console.log(`\nSummary: ${toDelete.length} to ${opts.execute ? 'delete' : 'delete (dry-run)'}, ${skipped.length} skipped`);

  if (!opts.execute) {
    if (toDelete.length > 0) {
      console.log('\nRe-run with --execute --remote to delete remote keys.');
    }
    process.exit(0);
  }

  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    process.exit(0);
  }

  let deleted = 0;
  let failed = 0;
  for (const name of toDelete) {
    if (deleteKey(name, target)) {
      deleted += 1;
      console.log(`Deleted: ${name}`);
    } else {
      failed += 1;
    }
  }

  console.log(`\nDone. deleted=${deleted} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
