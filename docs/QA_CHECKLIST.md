# Quick Notes — Manual QA Checklist

Use this after automated checks (`npm run qa`). Mark each item **Pass / Fail / N/A** before a store submission.

## Automated prerequisites

```bash
npm install
npm run qa
npm run test:landing    # optional — requires: cd landing && npm install
npm run test:extension  # optional — npx playwright install chromium
```

---

## Install paths

| Scenario | Steps | Pass criteria |
|----------|--------|---------------|
| **Chrome Web Store** | Install from production listing | Extension loads; popup opens; no install errors |
| **Edge Add-ons** | Install from Edge listing | Same as Chrome |
| **Unpacked (dev)** | `chrome://extensions` → Load unpacked → repo root | MV3 loads; service worker active |
| **Fresh install** | New browser profile or first install | Welcome flow (if enabled); no crash |
| **Update** | Install older build, then load new unpacked over it | Notes persist; migration does not flood Inbox |

---

## Core notes

| Test | Steps | Expected |
|------|--------|----------|
| Create note | Toolbar → New Note | Note saves locally |
| Edit note | Open note → change title/body | Saves; date updates |
| Delete note | Delete → Trash | Note in trash; retention label correct (24h free / 7d Pro) |
| Search | `/` or search box (Pro/trial) | Finds by title/content |
| Filters | All Notes / Personal / Work (Pro/trial) | Correct subset |
| Page Memory | Note with page context on matching site | Banner + page/site filters when matches exist |
| Inbox | New note → Inbox | Done removes from Inbox; archive / restore works |
| Shortcuts | Ctrl+Shift+Q, Ctrl+N, Esc, Ctrl+Enter | Documented behavior |

---

## Reminders & notifications

| Test | Expected |
|------|----------|
| Set reminder | Alarm scheduled; bar shows in editor |
| Fire reminder | OS notification (permission granted) |
| Remove reminder | Alarm cleared |

---

## Security & Pro

| Test | Expected |
|------|----------|
| PIN lock (Pro) | Lock screen; unlock with PIN |
| Export JSON/MD/TXT | File downloads; contains local notes only |
| Import JSON | Notes restore |
| Pro / payment | ExtensionPay checkout opens; restore flow documented |
| Trust Center | Settings → Privacy & Trust accurate |

---

## Privacy & links

| Test | Expected |
|------|----------|
| `privacy.html` | Opens from extension; matches behavior |
| Landing Chrome link | `https://chromewebstore.google.com/detail/quick-notes/nompejhpnnehhnedkgklfgpdgcfhkfem` |
| Landing Edge link | `https://microsoftedge.microsoft.com/addons/detail/quick-notes/bpflnjinelkgbnbbjjddggnahdjhmadn` |
| Contact | `mailto:quicknotes.extension@gmail.com` |

---

## Restricted pages

| Page | Expected |
|------|----------|
| `chrome://extensions` | Popup opens; page context not captured (or empty) |
| Chrome Web Store listing | Same; no crash |
| `chrome://newtab` | Graceful (no context if restricted) |
| ExtensionPay checkout host | Content script only on `extensionpay.com` |

---

## Uninstall / reinstall

| Test | Expected |
|------|----------|
| Uninstall without backup | Local notes removed |
| Reinstall | Clean state unless backup imported |
| Pro auto-backup restore | Pro snapshot restore offer if applicable |

---

## Browsers

- [ ] Google Chrome (latest stable)
- [ ] Microsoft Edge (latest stable)

---

## Automated extension E2E (Playwright)

```bash
npm run test:extension:e2e
```

Covers popup load, create/search/folders, review queue, archive/restore, reminder storage/alarms, ExtensionPay checkout URL (no payment), and trust UI. Does **not** replace toolbar or OS-level checks below.

---

## Bottom tab bar (1.8.0)

The tabs are driven by state the E2E suite already covers, so these check the
parts that only appear in a real popup.

| Test | Expected |
|------|----------|
| Tab bar sits at the bottom of the popup | Not floating mid-window; the popup sizes to its content |
| Notes / Inbox / Page / Trash all switch the list | Selected tab is highlighted, others are not |
| Badges show real counts | Inbox = unreviewed notes, Trash = deleted notes. Page carries no badge: its count is context, not a task, and it would change on every navigation |
| **Page tab with a live tab open** | Opened from the toolbar on a site you have notes for, the Page tab lists them. This is the one the suite cannot reach — a directly opened popup has no activeTab context |
| Opening a note hides the tab bar | Editor owns the popup; Back restores the bar and the Notes tab |
| Keyboard shortcuts still work | The footer that listed them is gone: `/`, `Ctrl+N` and `Esc` must still function, and are documented in Settings |
| Settings shows "Rate Quick Notes" | Present, and opens the right store for the browser you are in |

---

## Manual-only tests

These cannot be faithfully automated with Playwright opening `popup.html` directly. Mark **Pass / Fail** manually before release.

| Test | Why manual |
|------|------------|
| **Popup from toolbar icon** | User gesture + `activeTab` grant differ from direct extension URL |
| **Popup from Ctrl+Shift+Q** | Global shortcut + browser command surface |
| **activeTab page context capture** | Real tab URL/title/favicon when opened from toolbar, not `chrome-extension://` page |
| **Page Memory banner with live tab** | Needs toolbar-open popup + matching site; E2E only seeds IndexedDB and asserts banner hidden without tab context |
| **OS notification delivery** | Depends on OS notification settings; E2E verifies alarm/storage only |
| **Real Edge Add-ons install** | Store packaging and Edge-specific install |
| **Real Chrome Web Store install** | Production listing install |
| **ExtensionPay real redirect/login** | Login, payment, and provider session (E2E only opens ExtensionPay URL) |

---

## Known automation gaps

- **Extension popup via Playwright** may skip if the service worker does not register in headless CI.
- **Store payments** and **notification delivery** remain manual (see table above).

---

## Sign-off

| Field | Value |
|-------|--------|
| Version tested | |
| Build ZIP | |
| Tester | |
| Date | |
| Result | Pass / Fail |
