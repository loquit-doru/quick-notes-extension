#!/usr/bin/env node
/**
 * Grant Pro via POST /activate-stripe (after Worker is deployed).
 *
 * Usage:
 *   node scripts/grant-pro.js buyer@example.com
 *   node scripts/grant-pro.js buyer@example.com qn_existing_extension_id
 *
 * Env:
 *   PRO_API — default https://quick-notes-pro.apiworkersdev.workers.dev
 */

const PRO_API = process.env.PRO_API || 'https://quick-notes-pro.apiworkersdev.workers.dev';

async function main() {
  const email = process.argv[2];
  let extensionId = process.argv[3];

  if (!email) {
    console.error('Usage: node scripts/grant-pro.js <email> [extensionId]');
    process.exit(1);
  }

  if (!extensionId) {
    extensionId = `qn_grant_${Date.now()}`;
    console.log('No extensionId provided; using:', extensionId);
    console.log('Customer should use restore in extension, or pass their real extensionId from chrome.storage.local');
  }

  const res = await fetch(`${PRO_API}/activate-stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extensionId, email }),
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  console.log('Status:', res.status);
  console.log(JSON.stringify(body, null, 2));

  if (!res.ok || !body.success) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
