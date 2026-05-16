# Quick Notes - Privacy Policy

Last updated: May 16, 2026

## Overview

Quick Notes is committed to protecting your privacy. Notes stay on your device unless you export them.

## Data Collection

**We do NOT collect:**

- Personal information
- Browsing history (beyond what you choose to save as note context)
- Note contents on our servers
- Usage analytics
- Any identifiable data from your notes

## Data Storage

- Notes, folders, and trash are stored **locally** in **IndexedDB** inside your browser.
- Settings, trial dates, PIN hash, and reminder schedules are stored in **chrome.storage.local**.
- Notes never leave your browser unless you explicitly export them.
- No cloud sync — we do not receive your note text by default.

## Permissions Used

| Permission | Why |
|------------|-----|
| **storage** | Save settings, trial state, reminders, and license flags locally |
| **activeTab** | Capture page URL/title when you create a note with context |
| **tabs** | Read the active tab for context capture |
| **alarms** | Schedule note reminders while the extension is installed |
| **notifications** | Show reminder alerts at the time you set |

## Third-Party Services

- **ExtensionPay** — Card payments only. Payment details are handled by ExtensionPay/Stripe; we do not store card numbers.
- **License API** (`https://quick-notes-pro.apiworkersdev.workers.dev`) — Used only when you verify a crypto payment or restore a license. Sends your email and/or transaction hash to check activation; does not receive note contents.
- **Base Network** — Public blockchain lookup for crypto payment verification (transaction hash only).

## Contact

For privacy concerns: **quicknotes.extension@gmail.com**

## Changes

We may update this policy. Changes will be posted here and in `privacy.html`.

## How to verify

1. Open `chrome://extensions` → Quick Notes → **Details** → review permissions (storage, activeTab, tabs, alarms, notifications).
2. Open DevTools on the popup → **Application** → **IndexedDB** → `QuickNotesDB` — your notes are stored locally.
3. Disconnect from the internet and use the extension — notes still load (local storage).
4. Export notes (Settings → JSON) — file contains only what you saved; no account required.
