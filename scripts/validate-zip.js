#!/usr/bin/env node
/**
 * Validate a store upload ZIP for Quick Notes.
 * Usage: node scripts/validate-zip.js <path-to.zip>
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  ALLOWED_PERMISSIONS,
  FORBIDDEN_ZIP_PATH_PARTS,
  FORBIDDEN_ZIP_SUFFIXES
} from './lib/qa-shared.js';
import { listZipEntries } from './lib/zip-entries.js';

const zipArg = process.argv[2];
if (!zipArg) {
  console.error('Usage: node scripts/validate-zip.js <path-to.zip>');
  process.exit(2);
}

const zipPath = resolve(zipArg);
if (!existsSync(zipPath)) {
  console.error(`ZIP not found: ${zipPath}`);
  process.exit(2);
}

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

console.log(`Validating ZIP: ${zipPath}\n`);

let entries;
try {
  entries = listZipEntries(zipPath);
} catch (e) {
  console.error(`Cannot read ZIP: ${e.message}`);
  process.exit(2);
}

const normalized = entries.map((e) => e.replace(/\\/g, '/'));
const entrySet = new Set(normalized);

// Nested root folder (e.g. quick-notes/manifest.json)
const hasRootManifest = entrySet.has('manifest.json');
const nestedManifests = normalized.filter(
  (e) => e.endsWith('/manifest.json') && e !== 'manifest.json'
);
if (!hasRootManifest) {
  if (nestedManifests.length) {
    fail(
      `manifest.json is not at ZIP root (nested: ${nestedManifests.join(', ')}). ` +
        'Pack files at the top level, not inside a subfolder.'
    );
  } else {
    fail('manifest.json is missing from ZIP');
  }
} else {
  ok('manifest.json is at ZIP root');
}

// Forbidden paths / suffixes
for (const entry of normalized) {
  const lower = entry.toLowerCase();
  const base = basename(entry);
  for (const suffix of FORBIDDEN_ZIP_SUFFIXES) {
    if (lower.endsWith(suffix) || base.includes(suffix)) {
      fail(`Forbidden file in ZIP: ${entry}`);
    }
  }
  for (const part of FORBIDDEN_ZIP_PATH_PARTS) {
    if (lower.includes(part)) {
      fail(`Development-only path in ZIP: ${entry}`);
    }
  }
  if (/\.env/i.test(entry)) {
    fail(`Env file in ZIP: ${entry}`);
  }
  if (entry.endsWith('.map') && process.env.ALLOW_SOURCE_MAPS !== '1') {
    fail(`Source map in ZIP: ${entry}`);
  }
}

if (!errors.some((e) => e.includes('Forbidden') || e.includes('Development'))) {
  ok('No .bak, .env, temp, or dev-only paths detected');
}

// Parse manifest from ZIP (read via temp extract of manifest only — read from disk if co-located)
// We need manifest JSON from inside zip — use PowerShell/python extract single file or parse from buffer
let manifestJson = null;
try {
  manifestJson = extractManifestFromZip(zipPath);
} catch (e) {
  fail(`Could not read manifest from ZIP: ${e.message}`);
}

if (manifestJson) {
  const manifest = JSON.parse(manifestJson);
  const perms = manifest.permissions || [];
  if (perms.includes('tabs')) {
    fail('ZIP manifest includes forbidden tabs permission');
  } else {
    ok('ZIP manifest has no tabs permission');
  }
  for (const p of perms) {
    if (!ALLOWED_PERMISSIONS.has(p)) {
      fail(`ZIP manifest unexpected permission: ${p}`);
    }
  }
  const host = manifest.host_permissions;
  if (host && Array.isArray(host) && host.length > 0) {
    fail(`ZIP manifest has host_permissions: ${JSON.stringify(host)}`);
  } else {
    ok('ZIP manifest has no host_permissions');
  }

  if (manifest.icons) {
    for (const [, rel] of Object.entries(manifest.icons)) {
      const norm = rel.replace(/\\/g, '/');
      if (!entrySet.has(norm)) {
        fail(`ZIP missing manifest icon: ${norm}`);
      }
    }
    ok('Manifest icons present in ZIP');
  }
}

// Required extension paths
const requiredPrefixes = [
  'background/',
  'popup/',
  'storage/',
  'lib/',
  'icons/',
  'shared/'
];
for (const prefix of requiredPrefixes) {
  const found = normalized.some((e) => e.startsWith(prefix) || e === prefix.slice(0, -1));
  if (!found) {
    fail(`ZIP missing required directory: ${prefix}`);
  } else {
    ok(`ZIP contains ${prefix}`);
  }
}

for (const item of ['privacy.html', 'popup/popup.html', 'popup/popup.js']) {
  if (!entrySet.has(item)) {
    fail(`ZIP missing required file: ${item}`);
  } else {
    ok(`ZIP contains ${item}`);
  }
}

// package.json is included in store build but not strictly required by browser
if (!entrySet.has('package.json')) {
  warn('package.json not in ZIP (optional for runtime)');
}

console.log('\n--- Summary ---');
for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.log(`FAIL: ${e}`);

if (errors.length) {
  console.error(`\nZIP validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`\nZIP validation passed (${entries.length} entries, ${warnings.length} warning(s)).`);
process.exit(0);

function extractManifestFromZip(zipPath) {
  if (process.platform === 'win32') {
    const abs = resolve(zipPath).replace(/'/g, "''");
    const ps = [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$z = [System.IO.Compression.ZipFile]::OpenRead('${abs}')`,
      "$e = $z.GetEntry('manifest.json')",
      'if (-not $e) { $z.Dispose(); exit 2 }',
      '$r = New-Object System.IO.StreamReader($e.Open())',
      '$r.ReadToEnd()',
      '$r.Close()',
      '$z.Dispose()'
    ].join('; ');
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || 'manifest.json not in zip');
    return r.stdout;
  }
  const r = spawnSync(
    'python',
    [
      '-c',
      `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.read("manifest.json").decode()); z.close()`,
      zipPath
    ],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) throw new Error(r.stderr || 'python zip read failed');
  return r.stdout;
}
