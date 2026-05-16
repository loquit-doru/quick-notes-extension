/**
 * Quick Notes Pro license API (Cloudflare Worker)
 *
 * Routes:
 *   GET  /check?id=<extensionId>
 *   POST /activate                 { extensionId, email }  — crypto restore
 *   POST /activate-stripe          { extensionId, email }  — card/Stripe restore
 *   POST /register-stripe-license  { extensionId, email }  — pre-link after payment
 *   POST /verify                   { extensionId, email, txHash }
 *   POST /webhook/stripe           (stub — future auto-register on payment)
 *   POST /admin/clear-rate-limit   { email } + Authorization: Bearer <ADMIN_DEV_TOKEN>
 *
 * Deploy: cd workers && npx wrangler deploy
 * Secrets: wrangler secret put STRIPE_SECRET_KEY
 * Dev only: STRIPE_ALLOWLIST in wrangler.toml [vars]
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_DEVICES_DEFAULT = 3;
const QUICK_NOTES_PRICE_CENTS = 299;
const STRIPE_RATE_LIMIT = 10;
const STRIPE_RATE_WINDOW_SEC = 3600;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    try {
      if (request.method === 'GET' && path === '/check') {
        return json(await handleCheck(url.searchParams.get('id'), env));
      }
      if (request.method === 'POST' && path === '/activate') {
        return json(await handleActivate(await request.json(), env, 'crypto'));
      }
      if (request.method === 'POST' && path === '/activate-stripe') {
        return json(
          await handleActivateStripe(await request.json(), env, { countRateLimit: true })
        );
      }
      if (request.method === 'POST' && path === '/register-stripe-license') {
        return json(
          await handleActivateStripe(await request.json(), env, { countRateLimit: false })
        );
      }
      if (request.method === 'POST' && path === '/verify') {
        return json(await handleVerify(await request.json(), env));
      }
      if (request.method === 'POST' && path === '/webhook/stripe') {
        return json(await handleStripeWebhook(request, env));
      }
      if (request.method === 'POST' && path === '/admin/clear-rate-limit') {
        return json(await handleAdminClearRateLimit(await request.json(), request, env));
      }
      return json({ success: false, error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ success: false, error: 'Server error' }, 500);
    }
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function maxDevices(env) {
  const n = parseInt(env.MAX_DEVICES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : MAX_DEVICES_DEFAULT;
}

async function handleCheck(extensionId, env) {
  if (!extensionId) return { isPro: false };
  const license = await getLicense(env, extensionId);
  return { isPro: !!license };
}

async function handleActivate(body, env, method) {
  const extensionId = body?.extensionId;
  const email = normalizeEmail(body?.email);
  if (!extensionId || !email) {
    return { success: false, error: 'Missing extensionId or email' };
  }

  const emailKey = `email:${email}`;
  const existingId = await env.LICENSES.get(emailKey);
  if (!existingId) {
    return { success: false, error: 'No crypto license found for this email' };
  }

  return bindExtensionToEmail(env, extensionId, email, method || 'crypto');
}

async function handleAdminClearRateLimit(body, request, env) {
  const token = (env.ADMIN_DEV_TOKEN || '').trim();
  if (!token) {
    return { success: false, error: 'Admin endpoint not configured (set ADMIN_DEV_TOKEN secret)' };
  }
  const auth = request.headers.get('Authorization') || '';
  const provided = auth.startsWith('Bearer ')
    ? auth.slice(7).trim()
    : (request.headers.get('X-Admin-Token') || '').trim();
  if (!provided || provided !== token) {
    return { success: false, error: 'Unauthorized' };
  }
  const email = normalizeEmail(body?.email);
  if (!email) return { success: false, error: 'Missing email' };
  const key = stripeRateLimitKey(email);
  await env.LICENSES.delete(key);
  return { success: true, cleared: key };
}

async function handleActivateStripe(body, env, { countRateLimit = true } = {}) {
  const extensionId = body?.extensionId;
  const email = normalizeEmail(body?.email);
  if (!extensionId || !email) {
    return { success: false, error: 'Missing extensionId or email' };
  }

  const allowlist = parseAllowlist(env);
  const allowlistBypass = allowlist.includes(email);

  if (countRateLimit && !allowlistBypass && (await isStripeRateLimited(env, email))) {
    return {
      success: false,
      code: 'rate_limited',
      error: 'Too many restore attempts for this email. Try again in about an hour.',
    };
  }

  const allowed = await isStripeEmailAllowed(email, env, extensionId);
  if (!allowed) {
    return {
      success: false,
      error:
        'No Stripe purchase found for this email. Use the email on your Stripe receipt or contact support.',
    };
  }

  await recordStripeLicenseByEmail(env, email, extensionId);
  const result = await bindExtensionToEmail(env, extensionId, email, 'stripe');
  if (countRateLimit && result.success) {
    await incrementStripeRateLimit(env, email);
  }
  return result;
}

async function handleVerify(body, env) {
  const extensionId = body?.extensionId;
  const email = normalizeEmail(body?.email);
  const txHash = (body?.txHash || '').trim();
  if (!extensionId || !email || !txHash) {
    return { success: false, error: 'Missing extensionId, email, or txHash' };
  }

  const txKey = `tx:${txHash.toLowerCase()}`;
  const seen = await env.LICENSES.get(txKey);
  if (seen) {
    return { success: false, error: 'Transaction already used' };
  }

  await env.LICENSES.put(txKey, extensionId);
  await env.LICENSES.put(`email:${email}`, extensionId);
  return bindExtensionToEmail(env, extensionId, email, 'crypto');
}

/** Stub for future Stripe webhook → auto-register on checkout.session.completed */
async function handleStripeWebhook(request, env) {
  const hasSecret = !!env.STRIPE_WEBHOOK_SECRET;
  if (!hasSecret) {
    return {
      received: true,
      processed: false,
      message:
        'Webhook stub. Set STRIPE_WEBHOOK_SECRET and implement signature verification before production use.',
    };
  }
  // TODO: verify Stripe-Signature, handle checkout.session.completed
  await request.text();
  return { received: true, processed: false, message: 'Not implemented yet' };
}

/** KV key: rate:stripe-activate:{normalizedEmail} — only successful restores increment count */
async function isStripeRateLimited(env, email) {
  const entry = await readStripeRateEntry(env, email);
  return entry.count >= STRIPE_RATE_LIMIT;
}

async function incrementStripeRateLimit(env, email) {
  const key = stripeRateLimitKey(email);
  const entry = await readStripeRateEntry(env, email);
  entry.count += 1;
  await env.LICENSES.put(key, JSON.stringify(entry), {
    expirationTtl: STRIPE_RATE_WINDOW_SEC,
  });
}

function stripeRateLimitKey(email) {
  return `rate:stripe-activate:${email}`;
}

async function readStripeRateEntry(env, email) {
  const key = stripeRateLimitKey(email);
  const raw = await env.LICENSES.get(key);
  const now = Date.now();
  let entry = { count: 0, windowStart: now };
  if (raw) {
    try {
      entry = JSON.parse(raw);
    } catch {
      entry = { count: 0, windowStart: now };
    }
  }
  if (now - entry.windowStart > STRIPE_RATE_WINDOW_SEC * 1000) {
    entry = { count: 0, windowStart: now };
  }
  return entry;
}

async function recordStripeLicenseByEmail(env, email, extensionId) {
  const key = `stripe-license:${email}`;
  let license = { extensionIds: [], paidAt: null, source: 'stripe' };
  const raw = await env.LICENSES.get(key);
  if (raw) {
    try {
      license = { ...license, ...JSON.parse(raw) };
    } catch {
      /* keep defaults */
    }
  }
  if (!license.paidAt) license.paidAt = new Date().toISOString();
  license.source = 'stripe';
  const ids = Array.isArray(license.extensionIds) ? license.extensionIds : [];
  if (!ids.includes(extensionId)) ids.push(extensionId);
  license.extensionIds = ids;
  await env.LICENSES.put(key, JSON.stringify(license));
  await env.LICENSES.put(`stripe-email:${email}`, '1');
}

async function bindExtensionToEmail(env, extensionId, email, method) {
  const max = maxDevices(env);
  const emailKey = `email:${email}`;
  let primaryId = await env.LICENSES.get(emailKey);
  if (!primaryId) {
    primaryId = extensionId;
    await env.LICENSES.put(emailKey, primaryId);
  }

  const devicesKey = `devices:${email}`;
  let devices = [];
  try {
    devices = JSON.parse((await env.LICENSES.get(devicesKey)) || '[]');
  } catch {
    devices = [];
  }
  if (!devices.includes(extensionId)) {
    if (devices.length >= max && !devices.includes(extensionId)) {
      return {
        success: false,
        error: `Device limit reached (${max}). Remove a device or contact support.`,
        devicesUsed: devices.length,
        maxDevices: max,
      };
    }
    devices.push(extensionId);
    await env.LICENSES.put(devicesKey, JSON.stringify(devices));
  }

  const license = {
    email,
    method,
    activatedAt: new Date().toISOString(),
    primaryExtensionId: primaryId,
  };
  await env.LICENSES.put(`license:${extensionId}`, JSON.stringify(license));

  return {
    success: true,
    devicesUsed: devices.length,
    maxDevices: max,
  };
}

async function getLicense(env, extensionId) {
  const raw = await env.LICENSES.get(`license:${extensionId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseAllowlist(env) {
  return (env.STRIPE_ALLOWLIST || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Cloudflare secret: wrangler secret put STRIPE_SECRET_KEY (sk_live_... or sk_test_...) */
function resolveStripeSecretKey(env) {
  const raw = env.STRIPE_SECRET_KEY;
  if (raw == null || typeof raw !== 'string') return null;
  const key = raw.trim();
  if (!key.startsWith('sk_')) return null;
  return key;
}

function escapeStripeSearchTerm(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function paymentDescriptionText(item) {
  const parts = [];
  if (item.description) parts.push(item.description);
  if (item.statement_descriptor) parts.push(item.statement_descriptor);
  if (item.calculated_statement_descriptor) parts.push(item.calculated_statement_descriptor);
  const meta = item.metadata || {};
  if (meta.product) parts.push(meta.product);
  if (meta.plan) parts.push(meta.plan);
  if (item.customer_details?.email) parts.push(item.customer_details.email);
  if (Array.isArray(item.line_items?.data)) {
    for (const line of item.line_items.data) {
      if (line.description) parts.push(line.description);
      if (line.price?.nickname) parts.push(line.price.nickname);
      if (line.price?.product && typeof line.price.product === 'string') {
        parts.push(line.price.product);
      }
    }
  }
  return parts.join(' ').toLowerCase();
}

function isQuickNotesStripePayment(item, extensionId) {
  const text = paymentDescriptionText(item);
  if (text.includes('quick notes') || text.includes('browser extension')) return true;

  const meta = item.metadata || {};
  if (extensionId) {
    const metaId = meta.extensionId || meta.extension_id;
    if (metaId && metaId === extensionId) return true;
  }

  const amount =
    item.amount ??
    item.amount_received ??
    item.amount_captured ??
    item.amount_total ??
    item.amount_subtotal;
  const currency = (item.currency || '').toLowerCase();
  if (amount === QUICK_NOTES_PRICE_CENTS && currency === 'usd') return true;

  return false;
}

function isSucceededStripePayment(item) {
  if (item.object === 'checkout.session') {
    return item.payment_status === 'paid' || item.status === 'complete';
  }
  if (item.object === 'payment_intent') {
    return item.status === 'succeeded';
  }
  if (item.object === 'charge') {
    return item.paid === true && item.status !== 'failed';
  }
  return item.paid === true || item.status === 'succeeded';
}

function stripeLog(message, detail) {
  if (detail !== undefined) console.log(`[stripe-verify] ${message}`, detail);
  else console.log(`[stripe-verify] ${message}`);
}

async function isStripeEmailAllowed(email, env, extensionId) {
  const allowlist = parseAllowlist(env);
  if (allowlist.length > 0) {
    stripeLog('STRIPE_ALLOWLIST is set — dev/emergency bypass only; clear for production');
    if (allowlist.includes(email)) return true;
  }
  if (await env.LICENSES.get(`stripe-email:${email}`)) return true;
  const cached = await env.LICENSES.get(`stripe-license:${email}`);
  if (cached) return true;

  const secretKey = resolveStripeSecretKey(env);
  if (secretKey) {
    return verifyStripeCustomerEmail(email, secretKey, extensionId);
  }
  if (env.STRIPE_SECRET_KEY != null && String(env.STRIPE_SECRET_KEY).trim() !== '') {
    stripeLog('STRIPE_SECRET_KEY is set but invalid — use sk_live_... or sk_test_... from wrangler secret put');
  }
  return false;
}

async function stripeApiGet(path, secretKey, query = {}) {
  const key = resolveStripeSecretKey({ STRIPE_SECRET_KEY: secretKey });
  if (!key) {
    stripeLog(`GET ${path} skipped — invalid STRIPE_SECRET_KEY`);
    return null;
  }
  const params = new URLSearchParams(query);
  const qs = params.toString();
  const url = `https://api.stripe.com/v1/${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    const errText = await res.text();
    stripeLog(`GET ${path} failed`, { status: res.status, body: errText.slice(0, 200) });
    if (res.status === 401) stripeLog('Stripe rejected API key — re-run: wrangler secret put STRIPE_SECRET_KEY');
    return null;
  }
  return res.json();
}

async function stripeApiSearch(resource, query, secretKey, limit = 20) {
  const key = resolveStripeSecretKey({ STRIPE_SECRET_KEY: secretKey });
  if (!key) {
    stripeLog(`SEARCH ${resource} skipped — invalid STRIPE_SECRET_KEY`);
    return [];
  }
  const params = new URLSearchParams({
    query,
    limit: String(limit),
  });
  const res = await fetch(`https://api.stripe.com/v1/${resource}/search?${params}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    stripeLog(`SEARCH ${resource} failed`, { status: res.status, body: errText.slice(0, 200) });
    if (res.status === 401) stripeLog('Stripe rejected API key — re-run: wrangler secret put STRIPE_SECRET_KEY');
    return [];
  }
  const data = await res.json();
  return data.data || [];
}

function findQuickNotesPayment(items, extensionId, label) {
  const match = items.find(
    (item) => isSucceededStripePayment(item) && isQuickNotesStripePayment(item, extensionId)
  );
  if (match) stripeLog(`match via ${label}`, { id: match.id, object: match.object });
  return !!match;
}

async function verifyStripeCustomerEmail(email, secretKey, extensionId) {
  const safeEmail = escapeStripeSearchTerm(email);
  const key = resolveStripeSecretKey({ STRIPE_SECRET_KEY: secretKey });
  stripeLog('start', { email, keyConfigured: !!key, keyLength: key?.length || 0 });
  if (!key) {
    stripeLog('STRIPE_SECRET_KEY missing or invalid format (expected sk_live_... or sk_test_...)');
    return false;
  }

  const chargeQuery = `email:'${safeEmail}' AND status:'succeeded'`;
  const charges = await stripeApiSearch('charges', chargeQuery, key);
  stripeLog('charges.search', { count: charges.length });
  if (findQuickNotesPayment(charges, extensionId, 'charges.search')) return true;

  const piQuery = `email:'${safeEmail}' AND status:'succeeded'`;
  const intents = await stripeApiSearch('payment_intents', piQuery, key);
  stripeLog('payment_intents.search', { count: intents.length });
  if (findQuickNotesPayment(intents, extensionId, 'payment_intents.search')) return true;

  const sessionQueries = [
    `customer_email:'${safeEmail}'`,
    `customer_details.email:'${safeEmail}'`,
  ];
  for (const q of sessionQueries) {
    const sessions = await stripeApiSearch('checkout/sessions', q, key);
    stripeLog('checkout.sessions.search', { query: q, count: sessions.length });
    if (findQuickNotesPayment(sessions, extensionId, 'checkout.sessions.search')) return true;
  }

  const listedSessions = await stripeApiGet('checkout/sessions', key, {
    limit: '25',
  });
  if (listedSessions?.data) {
    const emailSessions = listedSessions.data.filter((s) => {
      const sessionEmail = (
        s.customer_email ||
        s.customer_details?.email ||
        ''
      ).toLowerCase();
      return sessionEmail === email;
    });
    stripeLog('checkout.sessions.list filtered', { count: emailSessions.length });
    if (findQuickNotesPayment(emailSessions, extensionId, 'checkout.sessions.list')) {
      return true;
    }
  }

  const customerData = await stripeApiGet('customers', key, { email, limit: '10' });
  const customers = customerData?.data || [];
  stripeLog('customers.list', { count: customers.length });
  for (const customer of customers) {
    if (await customerHasQuickNotesPayment(customer.id, key, extensionId)) {
      stripeLog('match via customers.list', { customerId: customer.id });
      return true;
    }
  }

  stripeLog('no match', { email });
  return false;
}

async function customerHasQuickNotesPayment(customerId, secretKey, extensionId) {
  const piData = await stripeApiGet('payment_intents', secretKey, {
    customer: customerId,
    limit: '20',
  });
  if (piData?.data?.length) {
    const paid = piData.data.some(
      (pi) => isSucceededStripePayment(pi) && isQuickNotesStripePayment(pi, extensionId)
    );
    if (paid) return true;
  }

  const chData = await stripeApiGet('charges', secretKey, {
    customer: customerId,
    limit: '20',
  });
  if (chData?.data?.length) {
    return chData.data.some(
      (ch) => isSucceededStripePayment(ch) && isQuickNotesStripePayment(ch, extensionId)
    );
  }

  return false;
}
