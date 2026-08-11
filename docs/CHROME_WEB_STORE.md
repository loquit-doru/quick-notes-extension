# Browser store release checklist (Chrome Web Store & Microsoft Edge Add-ons)

Quick Notes v**1.7.2** (see `manifest.json`). Worker API: `https://quick-notes-pro.apiworkersdev.workers.dev` (not bundled in the zip).

**Build the ZIP with `npm run build:zip`** — it packs an explicit include list and refuses to overwrite an existing version. Then `npm run check:zip` to validate it. To prove the packaged artifact actually runs (not just the working tree), extract it and point the E2E suite at it:

```powershell
Expand-Archive quick-notes-v1.7.2.zip -DestinationPath $env:TEMP\qn-check -Force
$env:QN_EXTENSION_PATH = "$env:TEMP\qn-check"; npm run test:extension:e2e
```

**Same package for both stores:** Chrome and Edge use the **identical MV3 zip** built from this repo. Upload the same `quick-notes-v{version}.zip` to each partner dashboard.

**Already published?** Skip first-time submission steps — use [Update existing listing](#update-existing-listing) below.

## How to verify (maintainer)

1. `manifest.json` → `version` is **1.7.1**, no `homepage_url` (optional; use GitHub Pages `index.html` if hosted).
2. Build zip (below) → load unpacked from extracted folder OR upload zip in [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Privacy policy URL returns **200** over HTTPS (see [Privacy policy URL](#privacy-policy-url)).
4. Worker: `STRIPE_ALLOWLIST=""` in `workers/wrangler.toml` and `wrangler secret put STRIPE_SECRET_KEY` set → `cd workers && wrangler deploy`.

---

## Update existing listing

Use this when Quick Notes is **already live** on the Chrome Web Store. You are publishing an **update**, not a new item.

### Version bump

| File | Field | Value |
|------|--------|--------|
| `manifest.json` | `version` | **1.7.0** (was 1.6.1) |
| `package.json` | `version` | **1.7.0** (keep in sync) |

**Why 1.7.0 (minor)?** This release adds user-facing features (multi-line notes, restore purchase, backup, update notifications) plus bug fixes. Use **1.6.2** only if you ship fixes-only with no new features.

Manifest `version` must be **strictly higher** than the version currently published in the dashboard.

### Worker (separate from the zip)

The Cloudflare Worker is **not** in the extension zip. Deploy it before or right after users get the update if restore/Stripe API changed:

```powershell
cd c:\Users\quit\Desktop\quick-notes\workers
wrangler deploy
```

See `docs/STRIPE_RESTORE.md` for secrets and smoke-testing **Restore purchase**.

### Build upload zip

Same contents and exclusions as [§2 Build upload zip](#2-build-upload-zip). Output filename should match the version, e.g. `quick-notes-v1.7.0.zip`.

### Upload in Developer Dashboard

1. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Select the existing **Quick Notes** item (do **not** create a new listing).
3. Go to **Package** (or **Build** → **Upload new package**, depending on UI).
4. **Upload** `quick-notes-v1.7.0.zip`.
5. In **What's new**, paste the English text from [`RELEASE_NOTES.md`](../RELEASE_NOTES.md) (v1.7.0 block).
6. **Privacy policy:** change the URL only if collection/sharing practices changed; otherwise leave as-is.
7. **Permissions:** if `manifest.json` permissions did not change, justification text usually stays the same; Google may still re-review host/content scripts.
8. Submit for review.

### What you do *not* need for an update

- **No new $5 developer registration fee** — that applies to the first account/item only.
- **No new store listing** unless you want to change description, screenshots, or category.
- **No zip of `workers/`** — API is deployed with Wrangler, not CWS.

### Review expectations

- Updates are often reviewed faster than first submissions, but timing is not guaranteed.
- If permissions or `content_scripts` changed, expect extra scrutiny — compare with [§6 Permission justifications](#6-permission-justifications).

### Pre-upload checklist (update)

- [ ] `manifest.json` / `package.json` version = **1.7.0**
- [ ] Worker deployed if restore/API changed (`wrangler deploy`)
- [ ] Zip built; no `node_modules`, `.env`, `wrangler.toml`, or secrets inside
- [ ] Smoke test on clean profile (restore, backup download, multi-line note, reminder)
- [ ] **What's new** copied from `RELEASE_NOTES.md`
- [ ] Privacy policy URL still returns 200 (only update listing field if `privacy.html` / practices changed)

---

## 1. Production worker (before public launch)

| Step | Command / action |
|------|------------------|
| Clear dev allowlist | `STRIPE_ALLOWLIST = ""` in `workers/wrangler.toml` (already set in repo) |
| Stripe secret | `cd workers && wrangler secret put STRIPE_SECRET_KEY` (`sk_live_...`) |
| Deploy | `cd workers && wrangler deploy` |
| Smoke restore | Pro modal → **Restore purchase** with a real payer email (see `docs/STRIPE_RESTORE.md`) |

Do **not** ship with a non-empty allowlist unless it is an intentional emergency bypass.

---

## 2. Build upload zip

The store package is the **extension root only** — not the Cloudflare Worker.

### Include

- `manifest.json`, `background/`, `popup/`, `storage/`, `lib/`, `icons/`, `shared/`, `privacy.html`
- Any other paths referenced in `manifest.json`

### Exclude

- `.git/`, `.github/`, `.claude/`
- `workers/`, `node_modules/`, `scripts/` (dev tooling)
- `docs/`, `STORE_LISTING.md`, `PRIVACY.md`, `RELEASE_NOTES.md` (markdown is for you; `privacy.html` is in the zip)
- `screenshots/` (local only; upload separately in dashboard)
- `*.zip`, `*.log`, `.env*`, secrets

### PowerShell (from repo root)

```powershell
$version = "1.7.1"
$root = "c:\Users\quit\Desktop\quick-notes"
$staging = Join-Path $env:TEMP "quick-notes-cws-pack"
$zip = Join-Path $root "quick-notes-v$version.zip"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

$include = @(
  "manifest.json", "privacy.html", "package.json",
  "background", "popup", "storage", "lib", "icons", "shared"
)
foreach ($item in $include) {
  Copy-Item (Join-Path $root $item) -Destination $staging -Recurse -Force
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$staging\*" -DestinationPath $zip
Write-Host "Created: $zip"
```

Reload unpacked from `$staging` or upload `$zip` in the developer dashboard.

---

## 3. Required assets (dashboard)

| Asset | Spec |
|-------|------|
| **Icon** | 128×128 PNG — `icons/icon128.png` (also 16/32/48 in manifest) |
| **Screenshots** | At least 1; recommend 3–5 at **1280×800** or **640×400** (store UI). Capture: main list, editor, folders (Pro), settings backup, Pro upgrade. Store locally in `screenshots/` (gitignored). |
| **Promo tile** | Optional 440×280 |
| **Marquee** | Optional 1400×560 |

Copy for short/long description: `STORE_LISTING.md`.

For **updates**, new screenshots are optional unless the UI changed significantly.

---

## 4. Privacy policy URL

Chrome Web Store requires a **public HTTPS** privacy policy.

**Suggested (GitHub Pages):**

1. Enable Pages on the repo (branch `main`, folder `/` or `/docs` if you add a `docs/index` redirect).
2. Host `privacy.html` at e.g. `https://<user>.github.io/quick-notes/privacy.html`
3. Enter that URL in the dashboard **Privacy policy** field.

Bundled `privacy.html` is also available via `chrome-extension://<id>/privacy.html` but reviewers expect a normal HTTPS link.

**Updates:** only change the dashboard privacy URL or republish hosted `privacy.html` if data practices changed.

---

## 5. Single purpose

**Single purpose:** Fast local note-taking in the browser toolbar popup — capture, organize, and remind without a cloud account.

The extension does not modify web pages except the ExtensionPay checkout domain (`extensionpay.com`) for card payments.

---

## 6. Permission justifications (dashboard form)

| Permission | Justification |
|------------|---------------|
| **storage** | Save notes metadata, settings, trial state, PIN hash, reminder schedules, and local backup snapshots in `chrome.storage.local`. |
| **activeTab** | When the user enables “Include page context”, read the active tab’s URL, title, and favicon once to attach to a new note (popup only, after user opens the extension). |
| **alarms** | Schedule note reminders at user-chosen date/time. |
| **notifications** | Display reminder notifications when alarms fire; notify when an extension update is ready or applied. |

**Host permissions:** None in manifest (license API called via `fetch` from extension pages).

**Content script:** `https://extensionpay.com/*` only — ExtensionPay payment flow for card checkout.

---

## 7. Pre-submission smoke test

Run on a **clean Chrome profile** (or incognito guest with only this extension):

### Install & core

- [ ] Load unpacked / install zip — no errors on `chrome://extensions`
- [ ] Popup opens (toolbar + **Ctrl+Shift+Q**)
- [ ] Create, edit, save, delete note; trash shows correct retention hint (24h free / 7d Pro)
- [ ] Multi-line note: Enter adds new lines; list preview shows line breaks
- [ ] 7-day trial: Pro features visible; after trial simulation, 5-note / 500-char limits apply

### Pro & payments (staging)

- [ ] ExtensionPay test purchase OR dev grant — Pro unlocks
- [ ] **Restore purchase** (card email) works with production worker + Stripe secret

### Backup & data

- [ ] Settings → **Download full backup (JSON)** downloads file
- [ ] Export JSON / MD / TXT works (free)
- [ ] Import JSON restores notes
- [ ] Pro: auto-backup status line updates after edits

### Reminders & updates

- [ ] Set reminder 2–3 min ahead → notification appears
- [ ] Click notification → opens popup to note
- [ ] After installing a newer build over an older one, update notification or applied toast appears (service worker)

### Privacy & policy

- [ ] Settings footer shows version **1.7.0** (matches manifest)
- [ ] Privacy link opens `privacy.html`
- [ ] Dashboard privacy URL matches hosted policy

### Package hygiene

- [ ] Zip contains no `.env`, `wrangler.toml`, `node_modules`, or API keys
- [ ] Version in manifest matches store listing draft

---

## 8. Store listing alignment

Features to mention (see `STORE_LISTING.md`):

- Local-first notes (IndexedDB)
- Multi-line notes in editor
- Folders, PIN, search — **Pro**
- Card checkout + restore purchase flow (ExtensionPay/Stripe)
- **Restore purchase** (Stripe email / ExtensionPay)
- **Backup & export** (JSON); Pro auto-backup on device
- Reminders (alarms + notifications)
- Update notifications when a new version is available

---

## 9. Related docs

- [`RELEASE_NOTES.md`](../RELEASE_NOTES.md) — copy-paste **What's new** for dashboard
- `docs/STRIPE_RESTORE.md` — worker secrets and restore verification
- `STORE_LISTING.md` — copy-paste descriptions
- `PRIVACY.md` / `privacy.html` — policy text
