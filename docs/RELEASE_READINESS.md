# Quick Notes — Release Readiness

Gate for Chrome Web Store and Microsoft Edge Add-ons submissions. Run automated checks first, then manual QA (`docs/QA_CHECKLIST.md`).

---

## Automated gate (required)

```bash
npm install
npm run qa
```

| Check | Command | Pass criteria |
|-------|---------|---------------|
| JS syntax | `npm run check:js` | All extension JS files pass `node --check` |
| Manifest & tree | `npm run check:manifest` | MV3, permissions, icons, no forbidden release files |
| Store ZIP | `npm run check:zip -- path/to.zip` | Root `manifest.json`, no `tabs`, no dev junk |

Optional:

```bash
npm run test:landing:static
npm run test:landing      # Playwright + landing build
npm run test:extension    # Playwright extension smoke
```

---

## Manifest

- [ ] `manifest_version`: **3**
- [ ] `name`: **Quick Notes**
- [ ] `description`: browser-neutral (Chrome + Edge)
- [ ] `version`: matches release notes (do not bump without intent)
- [ ] Permissions **only**: `storage`, `activeTab`, `alarms`, `notifications`
- [ ] **No** `tabs` permission
- [ ] **No** `host_permissions` (or empty)
- [ ] **No** risky `optional_permissions` (`tabs`, `sidePanel`, `contextMenus`, etc.)

---

## ZIP package

- [ ] Built from extension root only (see `docs/CHROME_WEB_STORE.md`)
- [ ] `manifest.json` at **ZIP root** (not nested `quick-notes/manifest.json`)
- [ ] Includes: `background/`, `popup/`, `storage/`, `lib/`, `icons/`, `shared/`, `privacy.html`
- [ ] Excludes: `workers/`, `landing/`, `docs/`, `.git/`, `node_modules/`, `*.bak`, `.env`
- [ ] `npm run check:zip -- quick-notes-vX.Y.Z.zip` passes

---

## Privacy & policy accuracy

- [ ] `PRIVACY.md` and `privacy.html` match actual behavior
- [ ] States: notes local; no note content collection; optional payment data via third parties
- [ ] Page context and review status described as local-only
- [ ] Permissions table matches manifest
- [ ] Trust Center in Settings matches policy

---

## Store listing & marketing

- [ ] `STORE_LISTING.md` claims match the build (no AI, sync, analytics, mobile app)
- [ ] Same ZIP for Chrome and Edge
- [ ] Landing store URLs correct (Chrome + Edge)
- [ ] Screenshots current and not misleading
- [ ] No fake testimonials or user counts

---

## Assets

- [ ] Icons: 16, 32, 48, 128 PNG present
- [ ] Screenshots prepared for each store dashboard
- [ ] Promotional tile / marquee if required by platform

---

## Smoke tests (manual)

- [ ] Chrome: install → popup → create/edit/delete note
- [ ] Edge: same
- [ ] Reminders + notifications
- [ ] Export / import
- [ ] Pro checkout opens (if shipping payment changes)
- [ ] Restricted pages (`chrome://`) do not crash

---

## External services (unchanged behavior)

- ExtensionPay / Stripe (optional Pro)
- License API `quick-notes-pro.apiworkersdev.workers.dev` (optional)

No new analytics, sync, or note cloud.

---

## Known issues

| ID | Issue | Severity | Block release? |
|----|--------|----------|----------------|
| | _Document open issues here_ | | |

---

## Recommendation

| Status | Meaning |
|--------|---------|
| **Ready to promote** | All automated checks pass; manual checklist complete; no blocker issues |
| **Needs fixes** | Failures in automated or manual tests; fix before submit |
| **Blocked** | Policy/permission mismatch, ZIP structure wrong, or privacy inaccuracy |

**Current automated status:** Run `npm run qa` and record output below.

```
(paste qa output here before submit)
```

---

## Version note

Do not bump `manifest.json` version unless releasing. Recommend next store version only after product changes are approved.
