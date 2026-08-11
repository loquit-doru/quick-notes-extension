#!/usr/bin/env node
/**
 * Static landing page checks (no browser). Validates site.ts URLs and optional built HTML.
 * Usage: node scripts/test-landing-static.mjs [--html path/to/index.html]
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SITE_TS = join(REPO_ROOT, 'landing', 'lib', 'site.ts');

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/quick-notes/nompejhpnnehhnedkgklfgpdgcfhkfem';
const EDGE_STORE_URL =
  'https://microsoftedge.microsoft.com/addons/detail/quick-notes/bpflnjinelkgbnbbjjddggnahdjhmadn';
const CONTACT_MAILTO = 'mailto:quicknotes.extension@gmail.com';

const errors = [];
function fail(msg) {
  errors.push(msg);
  console.error(`FAIL: ${msg}`);
}
function ok(msg) {
  console.log(`OK: ${msg}`);
}

if (!existsSync(SITE_TS)) {
  fail('landing/lib/site.ts not found');
  process.exit(1);
}

const src = readFileSync(SITE_TS, 'utf8');

if (!src.includes(CHROME_STORE_URL)) {
  fail('site.ts missing Chrome Web Store URL');
} else {
  ok('Chrome Web Store URL in site.ts');
}

if (!src.includes(EDGE_STORE_URL)) {
  fail('site.ts missing Edge Add-ons URL');
} else {
  ok('Edge Add-ons URL in site.ts');
}

if (!src.includes('quicknotes.extension@gmail.com')) {
  fail('site.ts missing contact email');
} else {
  ok('Contact email in site.ts');
}

if (!/Quick Notes/.test(src)) {
  fail('site.ts missing "Quick Notes" branding');
} else {
  ok('Quick Notes branding in site.ts');
}

// Chrome-only positioning (allow "Add to Chrome" button label in components, not site-wide)
const badSiteWide = [/chrome\s+only/i, /only\s+for\s+chrome/i, /not\s+on\s+edge/i];
for (const pattern of badSiteWide) {
  if (pattern.test(src)) {
    fail(`site.ts contains Chrome-only phrase: ${pattern}`);
  }
}

let htmlPath = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--html' && args[i + 1]) htmlPath = resolve(args[++i]);
}

if (!htmlPath) {
  const built = join(REPO_ROOT, 'landing', '.next', 'server', 'app', 'index.html');
  if (existsSync(built)) htmlPath = built;
}

if (htmlPath && existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, 'utf8');
  if (!/<title[^>]*>[^<]*Quick Notes/i.test(html)) {
    fail('Built HTML title does not contain "Quick Notes"');
  } else {
    ok('Built HTML title contains Quick Notes');
  }
  if (!html.includes(CHROME_STORE_URL)) fail('Built HTML missing Chrome store link');
  else ok('Built HTML has Chrome store link');
  if (!html.includes(EDGE_STORE_URL)) fail('Built HTML missing Edge store link');
  else ok('Built HTML has Edge store link');
  if (!html.includes(CONTACT_MAILTO)) fail('Built HTML missing contact mailto');
  else ok('Built HTML has contact mailto');
  if (!html.includes('Add to Chrome')) fail('Built HTML missing "Add to Chrome" CTA');
  else ok('Built HTML has Add to Chrome CTA');
} else {
  console.log('SKIP: No built index.html (run `npm run build` in landing/ for HTML checks)');
}

if (errors.length) {
  console.error(`\nLanding static checks failed (${errors.length}).`);
  process.exit(1);
}
console.log('\nLanding static checks passed.');
process.exit(0);
