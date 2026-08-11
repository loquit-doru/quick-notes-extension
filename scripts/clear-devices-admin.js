#!/usr/bin/env node
/**
 * Clear device activations for an email (support / dev).
 * Requires Worker secret ADMIN_DEV_TOKEN and deployed /admin/clear-devices.
 *
 * Usage:
 *   ADMIN_DEV_TOKEN=your-token node scripts/clear-devices-admin.js buyer@example.com
 */
const PRO_API = 'https://quick-notes-pro.apiworkersdev.workers.dev';

const email = (process.argv[2] || '').trim().toLowerCase();
const token = (process.env.ADMIN_DEV_TOKEN || '').trim();

if (!email) {
  console.error('Usage: ADMIN_DEV_TOKEN=... node scripts/clear-devices-admin.js <email>');
  process.exit(1);
}
if (!token) {
  console.error('Set ADMIN_DEV_TOKEN to your Worker admin secret.');
  process.exit(1);
}

const res = await fetch(`${PRO_API}/admin/clear-devices`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ email }),
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));
process.exit(data.success ? 0 : 1);
