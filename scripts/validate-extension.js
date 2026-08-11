#!/usr/bin/env node
/**
 * Static validation for the Quick Notes extension release tree.
 * Usage: node scripts/validate-extension.js [--root <path>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  ALLOWED_PERMISSIONS,
  CHROME_ONLY_DESCRIPTION_PATTERNS,
  FORBIDDEN_RELEASE_PATTERNS,
  RELEASE_INCLUDE,
  RISKY_OPTIONAL_PERMISSIONS,
  listReleaseFiles,
  resolveReleaseRoot
} from './lib/qa-shared.js';

const args = process.argv.slice(2);
let root = resolveReleaseRoot();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) {
    root = resolveReleaseRoot(args[++i]);
  }
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

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`${path}: invalid JSON — ${e.message}`);
    return null;
  }
}

function fileExists(rel) {
  const full = join(root, rel);
  if (!existsSync(full)) {
    fail(`Missing required file: ${rel}`);
    return false;
  }
  return true;
}

console.log(`Validating extension at: ${root}\n`);

// --- manifest.json ---
const manifestPath = join(root, 'manifest.json');
if (!existsSync(manifestPath)) {
  fail('manifest.json does not exist');
} else {
  ok('manifest.json exists');
  const manifest = readJson(manifestPath);
  if (manifest) {
    if (manifest.manifest_version !== 3) {
      fail(`manifest_version must be 3 (got ${manifest.manifest_version})`);
    } else {
      ok('manifest_version is 3');
    }

    // Store title is keyword-bearing, but must stay branded and within the
    // Chrome Web Store limit of 75 characters.
    if (!(manifest.name || '').startsWith('Quick Notes')) {
      fail(`name must start with "Quick Notes" (got "${manifest.name}")`);
    } else if (manifest.name.length > 75) {
      fail(`name must be 75 characters or fewer (got ${manifest.name.length})`);
    } else {
      ok(`name is "${manifest.name}" (${manifest.name.length}/75)`);
    }

    // short_name keeps the browser UI clean; 12 characters is the recommended max.
    if (!manifest.short_name) {
      fail('short_name is missing (browser UI falls back to a truncated name)');
    } else if (manifest.short_name.length > 12) {
      fail(`short_name should be 12 characters or fewer (got ${manifest.short_name.length})`);
    } else {
      ok(`short_name is "${manifest.short_name}"`);
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
      fail('version must be a non-empty string');
    } else {
      ok(`version is ${manifest.version}`);
    }

    const desc = manifest.description || '';
    if (!desc.trim()) {
      fail('description is missing');
    } else {
      for (const pattern of CHROME_ONLY_DESCRIPTION_PATTERNS) {
        if (pattern.test(desc)) {
          fail(`description is not browser-neutral: matches ${pattern}`);
        }
      }
      if (!errors.some((e) => e.includes('description'))) {
        ok('description is browser-neutral');
      }
    }

    const perms = manifest.permissions || [];
    if (!Array.isArray(perms)) {
      fail('permissions must be an array');
    } else {
      for (const p of perms) {
        if (!ALLOWED_PERMISSIONS.has(p)) {
          fail(`Unexpected permission: ${p}`);
        }
      }
      if (perms.includes('tabs')) {
        fail('Forbidden permission present: tabs');
      } else {
        ok('tabs permission is not present');
      }
      const extra = perms.filter((p) => !ALLOWED_PERMISSIONS.has(p));
      if (extra.length === 0 && perms.length > 0) {
        ok(`permissions are limited to: ${perms.join(', ')}`);
      }
      const missing = [...ALLOWED_PERMISSIONS].filter((p) => !perms.includes(p));
      if (missing.length) {
        warn(`Expected permissions missing (may be intentional): ${missing.join(', ')}`);
      }
    }

    const hostPerms = manifest.host_permissions;
    if (hostPerms === undefined) {
      ok('host_permissions is not present');
    } else if (Array.isArray(hostPerms) && hostPerms.length === 0) {
      ok('host_permissions is empty');
    } else {
      fail(`host_permissions must be absent or empty (got ${JSON.stringify(hostPerms)})`);
    }

    const optional = manifest.optional_permissions || [];
    if (!Array.isArray(optional)) {
      fail('optional_permissions must be an array if present');
    } else {
      for (const p of optional) {
        if (RISKY_OPTIONAL_PERMISSIONS.has(p)) {
          fail(`Risky optional_permission: ${p}`);
        }
      }
      if (optional.length === 0) {
        ok('optional_permissions is empty or absent');
      } else {
        ok(`optional_permissions checked (${optional.length})`);
      }
    }

    const iconSizes = new Set();
    if (manifest.icons) {
      for (const [size, rel] of Object.entries(manifest.icons)) {
        iconSizes.add(String(size));
        if (!fileExists(rel)) {
          fail(`Manifest icon missing: ${rel}`);
        }
      }
      ok(`manifest icons: ${[...iconSizes].join(', ')}`);
    } else {
      fail('manifest.icons is missing');
    }

    if (manifest.action?.default_icon) {
      for (const [, rel] of Object.entries(manifest.action.default_icon)) {
        fileExists(rel);
      }
    }

    const sw = manifest.background?.service_worker;
    if (!sw) {
      fail('background.service_worker is missing');
    } else if (!fileExists(sw)) {
      fail(`Service worker file missing: ${sw}`);
    } else {
      ok(`service worker exists: ${sw}`);
    }

    const popup = manifest.action?.default_popup;
    if (!popup) {
      fail('action.default_popup is missing');
    } else if (!fileExists(popup)) {
      fail(`Popup file missing: ${popup}`);
    } else {
      ok(`popup exists: ${popup}`);
    }

    if (fileExists('privacy.html')) {
      ok('privacy.html exists');
    } else {
      warn('privacy.html not found (recommended for store)');
    }
  }
}

// --- Release tree hygiene ---
console.log('\nRelease folder hygiene:');
for (const item of RELEASE_INCLUDE) {
  const full = join(root, item);
  if (!existsSync(full)) {
    fail(`Release include path missing: ${item}`);
  }
}

const releaseFiles = listReleaseFiles(root);
let forbiddenHits = 0;
for (const file of releaseFiles) {
  const rel = relative(root, file).replace(/\\/g, '/');
  for (const pattern of FORBIDDEN_RELEASE_PATTERNS) {
    if (pattern.test(rel)) {
      fail(`Forbidden file in release tree: ${rel}`);
      forbiddenHits++;
    }
  }
}
if (forbiddenHits === 0) {
  ok('No .env, .bak, .map, or node_modules in release paths');
}

// Source maps: warn only unless ALLOW_SOURCE_MAPS=1
const mapFiles = releaseFiles.filter((f) => f.endsWith('.map'));
if (mapFiles.length) {
  if (process.env.ALLOW_SOURCE_MAPS === '1') {
    warn(`${mapFiles.length} source map(s) present (ALLOW_SOURCE_MAPS=1)`);
  } else {
    fail(`Source maps in release tree: ${mapFiles.map((f) => relative(root, f)).join(', ')}`);
  }
}

// Dev-only folders inside release includes (should not happen)
for (const file of releaseFiles) {
  const rel = relative(root, file).replace(/\\/g, '/');
  if (rel.includes('node_modules/')) {
    fail(`node_modules inside release: ${rel}`);
  }
}

console.log('\n--- Summary ---');
for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.log(`FAIL: ${e}`);

if (errors.length) {
  console.error(`\nValidation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`\nValidation passed (${warnings.length} warning(s)).`);
process.exit(0);
