/**
 * Quick Notes Pro license API (Cloudflare Worker)
 *
 * Routes:
 *   GET  /check?id=<extensionId>
 *   POST /activate-stripe          { extensionId, email }  — card/Stripe restore
 *   POST /register-stripe-license  { extensionId, email }  — pre-link after payment
 *   POST /webhook/stripe           (signature-verified Stripe webhook)
 *   POST /admin/clear-rate-limit   { email } + Authorization: Bearer <ADMIN_DEV_TOKEN>
 *   POST /admin/clear-devices      { email } + Authorization: Bearer <ADMIN_DEV_TOKEN>
 *
 * Deploy: cd workers && npx wrangler deploy
 * Secrets: wrangler secret put STRIPE_SECRET_KEY
 * Dev only: STRIPE_ALLOWLIST in wrangler.toml [vars]
 */

import {
  bindDeviceSlot,
  deviceIdLogPrefix,
  licenseDebugLog,
  maxDevicesFromEnv,
  normalizeEmail,
  parseDevicesList,
  resolveDeviceId,
} from './license-devices.js';

const QUICK_NOTES_PRICE_CENTS = 299;
const STRIPE_RATE_LIMIT = 10;
const STRIPE_RATE_WINDOW_SEC = 3600;
const ADMIN_RATE_LIMIT = 20;
const ADMIN_RATE_WINDOW_SEC = 60;
const WEBHOOK_EVENT_TTL_SEC = 60 * 60 * 24 * 14;
const STRIPE_SIGNATURE_TOLERANCE_SEC = 300;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.body = { success: false, error: message };
  }
}

function parseAllowedOrigins(env) {
  return String(env.CORS_ALLOW_ORIGINS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function buildCorsContext(request, env) {
  const origin = (request.headers.get('Origin') || '').trim();
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  };
  if (!origin) return { allowed: true, headers };

  const normalized = origin.toLowerCase();
  const allowlist = parseAllowedOrigins(env);
  const isAllowed =
    normalized.startsWith('chrome-extension://') || allowlist.includes(normalized);

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return { allowed: isAllowed, headers };
}

async function readJsonBody(request) {
  const contentType = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new RequestError(415, 'Content-Type must be application/json');
  }
  try {
    return await request.json();
  } catch {
    throw new RequestError(400, 'Invalid JSON body');
  }
}

export default {
  async fetch(request, env) {
    const cors = buildCorsContext(request, env);
    if (request.method === 'OPTIONS') {
      if (!cors.allowed) {
        return new Response(JSON.stringify({ success: false, error: 'Origin not allowed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 204, headers: cors.headers });
    }

    if (!cors.allowed) {
      return json({ success: false, error: 'Origin not allowed' }, 403, cors.headers);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    try {
      if (request.method === 'GET' && path === '/check') {
        return json(await handleCheck(url.searchParams.get('id'), env), 200, cors.headers);
      }
      if (request.method === 'POST' && path === '/activate-stripe') {
        return json(
          await handleActivateStripe(await readJsonBody(request), env, { countRateLimit: true }),
          200,
          cors.headers
        );
      }
      if (request.method === 'POST' && path === '/register-stripe-license') {
        return json(
          await handleActivateStripe(await readJsonBody(request), env, { countRateLimit: false }),
          200,
          cors.headers
        );
      }
      if (request.method === 'POST' && path === '/webhook/stripe') {
        return json(await handleStripeWebhook(request, env), 200, cors.headers);
      }
      if (request.method === 'POST' && path === '/admin/clear-rate-limit') {
        return json(
          await handleAdminClearRateLimit(await readJsonBody(request), request, env),
          200,
          cors.headers
        );
      }
      if (request.method === 'POST' && path === '/admin/clear-devices') {
        return json(
          await handleAdminClearDevices(await readJsonBody(request), request, env),
          200,
          cors.headers
        );
      }
      return json({ success: false, error: 'Not found' }, 404, cors.headers);
    } catch (err) {
      if (err instanceof RequestError) {
        return json(err.body, err.status, cors.headers);
      }
      console.error(err);
      return json({ success: false, error: 'Server error' }, 500, cors.headers);
    }
  },
};

function json(body, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function handleCheck(extensionId, env) {
  if (!extensionId) return { isPro: false };
  const license = await getLicense(env, extensionId);
  return { isPro: !!license };
}

async function handleAdminClearDevices(body, request, env) {
  const auth = requireAdminToken(request, env);
  if (!auth.ok) return auth.response;
  const limited = await checkAdminRateLimit(request, env, 'clear-devices');
  if (limited) return limited;
  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email)) return { success: false, error: 'Missing or invalid email' };
  const devicesKey = `devices:${email}`;
  await env.LICENSES.delete(devicesKey);
  licenseDebugLog(env, 'admin cleared devices', { email, devicesKey });
  return { success: true, cleared: devicesKey };
}

function requireAdminToken(request, env) {
  const token = (env.ADMIN_DEV_TOKEN || '').trim();
  if (!token) {
    return { ok: false, response: { success: false, error: 'Admin endpoint not configured (set ADMIN_DEV_TOKEN secret)' } };
  }
  const auth = request.headers.get('Authorization') || '';
  const provided = auth.startsWith('Bearer ')
    ? auth.slice(7).trim()
    : (request.headers.get('X-Admin-Token') || '').trim();
  if (!provided || !timingSafeEqual(provided, token)) {
    return { ok: false, response: { success: false, error: 'Unauthorized' } };
  }
  return { ok: true };
}

async function handleAdminClearRateLimit(body, request, env) {
  const auth = requireAdminToken(request, env);
  if (!auth.ok) return auth.response;
  const limited = await checkAdminRateLimit(request, env, 'clear-rate-limit');
  if (limited) return limited;
  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email)) return { success: false, error: 'Missing or invalid email' };
  const key = stripeRateLimitKey(email);
  await env.LICENSES.delete(key);
  return { success: true, cleared: key };
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function checkAdminRateLimit(request, env, action) {
  const ipHeader = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const ip = ipHeader.split(',')[0].trim();
  const key = `rate:admin:${action}:${ip}`;
  const raw = await env.LICENSES.get(key);
  const current = Number(raw || '0');
  if (current >= ADMIN_RATE_LIMIT) {
    return {
      success: false,
      error: `Admin rate limit exceeded. Try again in about ${ADMIN_RATE_WINDOW_SEC} seconds.`,
    };
  }
  await env.LICENSES.put(key, String(current + 1), { expirationTtl: ADMIN_RATE_WINDOW_SEC });
  return null;
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

  const deviceId = resolveDeviceId(body);
  const result = await bindExtensionToEmail(env, extensionId, email, 'stripe', deviceId);
  if (result.success) {
    await recordStripeLicenseByEmail(env, email, extensionId);
  }
  if (countRateLimit && result.success) {
    await incrementStripeRateLimit(env, email);
  }
  return result;
}

async function handleStripeWebhook(request, env) {
  const secret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return {
      received: false,
      processed: false,
      error: 'Webhook secret not configured',
    };
  }
  const payload = await request.text();
  const signature = request.headers.get('Stripe-Signature') || '';
  const validSignature = await verifyStripeWebhookSignature(payload, signature, secret);
  if (!validSignature) {
    return { received: true, processed: false, error: 'Invalid Stripe signature' };
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return { received: true, processed: false, error: 'Invalid webhook payload JSON' };
  }

  const eventId = String(event?.id || '').trim();
  const eventType = String(event?.type || '').trim();
  if (!eventId || !eventType) {
    return { received: true, processed: false, error: 'Missing event id or type' };
  }

  const eventKey = `stripe-webhook:event:${eventId}`;
  const alreadyProcessed = await env.LICENSES.get(eventKey);
  if (alreadyProcessed) {
    return { received: true, processed: true, duplicate: true, eventType };
  }

  const object = event?.data?.object || {};
  const email = normalizeEmail(extractStripeEmail(object));
  const extensionId = extractStripeExtensionId(object);

  if (email) {
    await env.LICENSES.put(`stripe-email:${email}`, '1');
  }
  if (email && extensionId) {
    await recordStripeLicenseByEmail(env, email, extensionId);
  }

  await env.LICENSES.put(
    eventKey,
    JSON.stringify({
      eventType,
      processedAt: new Date().toISOString(),
      email: email || null,
      extensionId: extensionId || null,
    }),
    { expirationTtl: WEBHOOK_EVENT_TTL_SEC }
  );

  return {
    received: true,
    processed: true,
    eventType,
    emailCaptured: Boolean(email),
    extensionLinked: Boolean(email && extensionId),
  };
}

function extractStripeEmail(stripeObject) {
  return (
    stripeObject?.customer_email ||
    stripeObject?.customer_details?.email ||
    stripeObject?.billing_details?.email ||
    stripeObject?.receipt_email ||
    stripeObject?.charges?.data?.[0]?.billing_details?.email ||
    stripeObject?.metadata?.email ||
    ''
  );
}

function extractStripeExtensionId(stripeObject) {
  const metadata = stripeObject?.metadata || {};
  const extensionId = String(metadata.extensionId || metadata.extension_id || '').trim();
  if (!extensionId) return null;
  return /^qn_[a-zA-Z0-9_-]+$/.test(extensionId) ? extensionId : null;
}

function parseStripeSignature(signatureHeader) {
  const pairs = String(signatureHeader || '')
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const parsed = { timestamp: null, signatures: [] };
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (!key || !value) continue;
    if (key === 't') parsed.timestamp = Number(value);
    if (key === 'v1') parsed.signatures.push(value);
  }
  return parsed;
}

async function hmacSha256Hex(secret, payload) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyStripeWebhookSignature(payload, signatureHeader, secret) {
  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed.timestamp || parsed.signatures.length === 0) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp);
  if (age > STRIPE_SIGNATURE_TOLERANCE_SEC) return false;

  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${payload}`);
  return parsed.signatures.some((candidate) => timingSafeEqual(candidate, expected));
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

async function bindExtensionToEmail(env, extensionId, email, method, deviceId) {
  const max = maxDevicesFromEnv(env);
  const slotDeviceId = (deviceId || extensionId || '').trim();
  if (!extensionId || !email || !slotDeviceId) {
    return { success: false, error: 'Missing extensionId, email, or deviceId' };
  }

  const emailKey = `email:${email}`;
  let primaryId = await env.LICENSES.get(emailKey);
  if (!primaryId) {
    primaryId = extensionId;
    await env.LICENSES.put(emailKey, primaryId);
  }

  const devicesKey = `devices:${email}`;
  const devices = parseDevicesList(await env.LICENSES.get(devicesKey));
  const bind = bindDeviceSlot({
    devices,
    deviceId: slotDeviceId,
    extensionId,
    max,
  });

  licenseDebugLog(env, 'bind device slot', {
    email,
    deviceIdPrefix: deviceIdLogPrefix(slotDeviceId),
    devicesUsed: bind.devicesUsed,
    maxDevices: max,
    reusedDevice: bind.reusedDevice ?? false,
    ok: bind.ok,
  });

  if (!bind.ok) {
    return {
      success: false,
      code: bind.code,
      error: bind.error,
      devicesUsed: bind.devicesUsed,
      maxDevices: bind.maxDevices,
    };
  }

  await env.LICENSES.put(devicesKey, JSON.stringify(bind.devices));

  const license = {
    email,
    method,
    deviceId: slotDeviceId,
    activatedAt: new Date().toISOString(),
    primaryExtensionId: primaryId,
  };
  await env.LICENSES.put(`license:${extensionId}`, JSON.stringify(license));

  return {
    success: true,
    devicesUsed: bind.devicesUsed,
    maxDevices: max,
    reusedDevice: bind.reusedDevice === true,
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
