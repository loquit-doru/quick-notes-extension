# Stripe / card Pro restore (automatic)

Card buyers restore Pro **without a manual email allowlist** when the license Worker has **`STRIPE_SECRET_KEY`** set. The extension tries ExtensionPay, the license server, and Stripe email restore automatically.

**Production API:** `https://quick-notes-pro.apiworkersdev.workers.dev`

## How to verify (developer)

1. `cd workers && wrangler secret put STRIPE_SECRET_KEY` (live Stripe secret, not in repo).
2. `wrangler deploy` with KV namespace `LICENSES` bound (see `workers/wrangler.toml`).
3. Reload the extension; open Pro → **Restore purchase** with a paying customer’s Stripe receipt email.
4. Or: `curl -s -X POST "$PRO_API/activate-stripe" -H "Content-Type: application/json" -d '{"extensionId":"qn_test","email":"buyer@example.com"}'` → expect `{ "success": true }` for a real payer.

`STRIPE_ALLOWLIST` in `[vars]` is **dev / emergency only** (comma-separated emails). **Production must leave it empty** and rely on `STRIPE_SECRET_KEY`. The allowlist was a temporary bypass while the Stripe secret was missing or invalid — it is not a customer restore path.

## Production setup (Cloudflare)

```bash
cd workers
wrangler kv:namespace create LICENSES
# Put namespace id in wrangler.toml [[kv_namespaces]] id = "..."

wrangler secret put STRIPE_SECRET_KEY   # sk_live_... or sk_test_...
wrangler deploy
```

### wrangler.toml `[vars]` (non-secret)

| Variable | Purpose |
|----------|---------|
| `MAX_DEVICES` | Devices per email (default `3`) |
| `STRIPE_ALLOWLIST` | **Dev / emergency only** — leave `""` in production; comma-separated emails bypass Stripe API |
| `CORS_ALLOW_ORIGINS` | Optional comma-separated HTTPS origins for frontend calls; `chrome-extension://*` is allowed automatically |

### Secrets (never commit)

| Secret | Command |
|--------|---------|
| `STRIPE_SECRET_KEY` | `wrangler secret put STRIPE_SECRET_KEY` |
| `STRIPE_WEBHOOK_SECRET` | Required for `POST /webhook/stripe` signature verification |

## ExtensionPay slug

`EXTPAY_EXTENSION_ID` in `popup/pro.js` and `shared/extpay-config.js` must match the ExtensionPay dashboard slug where Stripe checkouts are created (`quick-notes-new` today). Mismatch: Stripe charge exists but ExtensionPay login says email not on file.

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/check?id=<extensionId>` | Is this install licensed? |
| POST | `/activate-stripe` | Restore by Stripe receipt email (rate-limited) |
| POST | `/register-stripe-license` | Pre-link after payment (no rate limit) |
| POST | `/webhook/stripe` | Signature-verified Stripe webhook; records paid emails and links known extension IDs |
| POST | `/admin/clear-rate-limit` | Dev: clear rate limit for one email (`Authorization: Bearer` + `ADMIN_DEV_TOKEN` secret, + basic per-IP rate limit) |

### Stripe verification (`/activate-stripe`)

1. Normalize email lowercase.
2. Rate limit: **10 successful restores / email / hour** (KV key `rate:stripe-activate:{email}`). Failed attempts (no Stripe match, wrong email) do **not** increment the counter.
3. If `STRIPE_SECRET_KEY` set (your Stripe account — must be the account that received the charge):
   - `charges.search` and `payment_intents.search` by receipt email
   - `checkout/sessions.search` by `customer_email` / `customer_details.email`
   - Fallback: `customers.list` by email → that customer’s intents/charges
   - Match Quick Notes if description contains `quick notes` or `browser extension` (case-insensitive), **or** metadata `extensionId`, **or** amount **299** USD cents
4. If no secret: only `STRIPE_ALLOWLIST` + existing KV `stripe-email:` / `stripe-license:` entries.
5. On success: KV `stripe-license:{email}`, bind `license:{extensionId}`, device cap.

### ExtensionPay path (card on ExtensionPay’s Stripe)

Most card checkouts use **ExtensionPay** (`ExtPay('quick-notes-new')` in `popup/pro.js`). ExtensionPay runs Stripe on **their** account. Your Worker’s `STRIPE_SECRET_KEY` (from **your** Stripe Dashboard → Developers → API keys) **cannot** see those charges.

**Automatic restore (no developer Stripe secret):**

1. Same Chrome profile where the user paid → `extpay.getUser()` on popup open (`checkProStatus` in `popup/pro.js`).
2. If `user.paid === true`, Pro unlocks locally — **no** call to `/activate-stripe`.
3. **Restore purchase** runs `restoreExtensionPay()` first (ExtensionPay login link if needed), then server `/check`, then Stripe email.

**Not** restored via your `STRIPE_SECRET_KEY` unless you add a Stripe webhook from ExtensionPay (not implemented; `POST /webhook/stripe` is a stub).

### ExtensionPay vs your Stripe account

| Paid via | Restore path |
|----------|----------------|
| Your Stripe (direct Checkout / Payment Link) | `/activate-stripe` with receipt email + valid `STRIPE_SECRET_KEY` on the **same** Stripe account |
| ExtensionPay hosted checkout | **Restore purchase** / same-profile `getUser()` — **not** developer `STRIPE_SECRET_KEY` |
| Support / dev only | Empty allowlist in prod; temporary `STRIPE_ALLOWLIST` or `node scripts/grant-pro.js` |

If Stripe Dashboard (your account) shows nothing but the customer has an ExtensionPay receipt, use ExtensionPay restore — `/activate-stripe` will correctly return “No Stripe purchase found”.

```http
POST /activate-stripe
Content-Type: application/json

{ "extensionId": "qn_...", "email": "buyer@example.com" }
```

## Extension behavior

### At payment (`extpay.onPaid`)

- Unlock locally, save `payerEmail`, fire-and-forget `POST /register-stripe-license`.

### On popup open (`checkProStatus`)

1. `checkExtensionPayPro()` — same Chrome profile / ExtPay login  
2. `checkServerProStatus()` — `/check`  
3. `trySilentStripeRestore()` — stored `payerEmail` → `/activate-stripe` once  

### Manual restore UI

**Restore purchase** runs: ExtensionPay → server → Stripe email (input or stored).

## What survives reinstall

| Data | Survives reinstall? |
|------|---------------------|
| Pro license (server) | Yes — re-bind with same email or ExtPay on ≤3 devices |
| `payerEmail` / local Pro flag | No — use restore flow or ExtPay |
| Notes | No — use **Settings → Backup & restore** (`.json` file) |

## Flow (text diagram)

```
Pay (ExtensionPay/Stripe)
  → onPaid: local unlock + register-stripe-license
  → KV: stripe-license:{email}

Reinstall / new device
  → popup init: ExtPay getUser → /check → silent Stripe (payerEmail)
  → or user: "Restore purchase" (same chain + email input)

```

## Manual grant (support / dev)

```bash
node scripts/grant-pro.js buyer@example.com
```

Requires Worker deployed; uses `/activate-stripe` (needs secret or allowlist).

### ExtensionPay “email not in records”

**Cannot fix in extension code.** ExtensionPay stores buyers on **their** Stripe account under the dashboard **slug** (`quick-notes-new` in `shared/extpay-config.js`). If the slug mismatches the product the user paid for, login shows “email not in records” even though Stripe charged them.

**Support path:** grant server license (below) so Pro works via `/activate-stripe` + `/check` without ExtensionPay login.

1. Temporarily add email to `STRIPE_ALLOWLIST` in `workers/wrangler.toml`, `wrangler deploy`.
2. `node scripts/grant-pro.js buyer@example.com` → `{ "success": true }` (sets KV `stripe-email:` / `stripe-license:`).
3. Clear allowlist, redeploy. User restores once in the extension with the same email.

### Clear Stripe restore rate limit (one email)

KV namespace `LICENSES` (see `workers/wrangler.toml` `id = "..."`).

```bash
cd workers
npx wrangler kv key delete "rate:stripe-activate:buyer@example.com" --binding=LICENSES --remote
```

Email must be **lowercase** (same as `normalizeEmail` in the Worker). Re-run grant or let the user click **Restore purchase** once after clearing.

### Reset device activations (3-device limit)

Device slots are stored at `devices:{normalizedEmail}` in KV (values are stable `deviceId` strings from `chrome.storage.local`, not note data).

**Preferred (after deploy + `ADMIN_DEV_TOKEN` secret):**

```bash
ADMIN_DEV_TOKEN=your-secret node scripts/clear-devices-admin.js buyer@example.com
```

Worker route: `POST /admin/clear-devices` with `Authorization: Bearer <ADMIN_DEV_TOKEN>`.

**Manual KV (no admin token):**

```bash
cd workers
npx wrangler kv key delete "devices:buyer@example.com" --binding=LICENSES --remote
```

Then the user can **Restore purchase** once; repeat restores from the same profile do not consume extra slots (idempotent `deviceId`).

**Debug logging (Worker):** set `LOG_LICENSE_DEBUG = "1"` in `workers/wrangler.toml` [vars], deploy, tail logs — logs normalized email, `deviceId` prefix (8 chars), device count, reused vs new slot. Never enable in production long-term.

### Legacy crypto KV cleanup (`tx:*`)

Removed crypto `/verify` stored one-time keys as `tx:{txHash}` in the same `LICENSES` namespace. Stripe restore does not use them.

**Admin script (dry-run by default):**

```bash
cd workers
node scripts/kv-cleanup-legacy-crypto.mjs --remote
node scripts/kv-cleanup-legacy-crypto.mjs --execute --remote
```

Full steps, protected prefixes, and safety rules: [KV_LEGACY_CLEANUP.md](./KV_LEGACY_CLEANUP.md).

## Dev-only local unlock

Extension popup DevTools (not for customers):

```js
await QuickNotesPro.grantProLocally()
```

---

## Rezumat (Română) — pentru utilizator / dezvoltator

### Allowlist temporar

`STRIPE_ALLOWLIST` din `wrangler.toml` era **doar urgență** (când secretul Stripe lipsea sau era invalid → eroare Stripe „Invalid API Key provided: undefined”). **Nu** este calea de restore pentru clienți noi. În producție: `STRIPE_ALLOWLIST = ""` + `wrangler secret put STRIPE_SECRET_KEY` cu cheia din contul Stripe care primește plățile.

### Cele 3 căi de restore pentru clienți

| # | Cum a plătit | Ce face clientul |
|---|----------------|------------------|
| 1 | **ExtensionPay** (card în extensie) | Deschide extensia pe **același profil Chrome** sau **Restaurează achiziția** (login ExtensionPay). Automat via `getUser()` — **fără** secretul tău Stripe. |
| 2 | **Stripe-ul tău** (Payment Link / Checkout direct) | **Restaurează achiziția** + email de pe chitanța Stripe → Worker verifică cu `STRIPE_SECRET_KEY` (`/activate-stripe`). |

### Ce trebuie să facă dezvoltatorul

1. `cd workers && wrangler secret put STRIPE_SECRET_KEY` — `sk_live_...` sau `sk_test_...` din **același** cont Stripe unde apar plățile card (Dashboard → Developers → API keys).
2. `STRIPE_ALLOWLIST = ""` în `wrangler.toml`, apoi `wrangler deploy`.
3. Dacă **toate** plățile card merg prin ExtensionPay, doar calea **#1** funcționează pentru clienți; `/activate-stripe` cu secretul tău nu vede acele plăți.
4. Slug ExtensionPay = `EXTPAY_EXTENSION_ID` (`quick-notes-new`) aliniat cu dashboard-ul ExtensionPay.

### Webhook (implementat)

`POST /webhook/stripe` validează semnătura Stripe (`Stripe-Signature` + `STRIPE_WEBHOOK_SECRET`), dedupe pe `event.id`, și înregistrează `stripe-email:{email}`. Dacă metadata include `extensionId`, salvează și legătura în `stripe-license:{email}`.
