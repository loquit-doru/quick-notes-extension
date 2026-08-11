# Quick Notes — Privacy Policy

Last updated: May 26, 2026

## Summary

Quick Notes stores your notes **locally in your browser**. By default, we do **not** receive your note text or browsing history. Optional local usage insights can store minimal funnel counters **on your device only**.

If you choose optional **Pro payment or license restore**, limited data (such as email and extension/device identifiers) may be sent to third-party payment or license services — never your note contents.

## What stays on your device

- Note text and titles — **IndexedDB** (`QuickNotesDB`)
- Folders and trash — **IndexedDB**
- Settings, trial state, reminder schedules, and a **hashed PIN** (if you enable PIN lock) — **browser extension local storage**
- Optional **page context** (URL, page title, favicon) saved **only when you create a note with “Include page context” enabled** — stored locally with that note
- **Review status** (new / reviewed / archived) for your inbox workflow — stored locally on each note

Notes do **not** leave your browser unless **you** export them (JSON, Markdown, or plain text).

**Page Memory** matches notes to the current page or site **on your device only** — no URLs or titles are sent to Quick Notes servers.

## What Quick Notes does not do

- **Does not** collect, transmit, sell, or share your note content with Quick Notes servers (we have no note cloud)
- **Does not** track your browsing history
- **Does not** send analytics, advertising trackers, or telemetry SDKs to Quick Notes servers
- **Does not** require an account to use the free product

## Permissions (Manifest V3)

| Permission | Why it is needed |
|------------|------------------|
| **storage** | Save settings, trial state, reminders, license flags, and local backup snapshots |
| **activeTab** | When you open the popup and create a note, optionally read the **current tab’s** URL, title, and favicon for note context |
| **alarms** | Schedule note reminders at times you choose |
| **notifications** | Show reminder alerts and optional extension update notices |

There is **no** broad `tabs` permission and **no** host permission to read all websites.

## Third-party services (optional — Pro / payments only)

These apply **only** if you use paid upgrade or restore features:

| Service | Purpose | Data involved |
|---------|---------|---------------|
| **ExtensionPay / Stripe** | Card checkout for Pro | Payment handled by Stripe; Quick Notes does **not** store card numbers |
| **License API** (`quick-notes-pro.apiworkersdev.workers.dev`) | Validate Stripe/ExtensionPay restore and device activation | Extension ID, device ID, email — **not** note contents |

## Optional local usage insights

If enabled in Settings, Quick Notes stores a minimal local funnel log (for example:
install, first open, first note, reminder created, paywall viewed, upgrade click,
purchase restore). This data:

- stays in `chrome.storage.local` on this device
- does **not** include note content
- is not transmitted to Quick Notes servers
- can be disabled anytime in Settings → Privacy & Trust

ExtensionPay runs a content script on `https://extensionpay.com/*` only during checkout.

## Contact

Privacy questions: **quicknotes.extension@gmail.com**

## Changes

We may update this policy. The latest version is in this file and in `privacy.html`.

## How to verify

1. Open your browser’s extension details for Quick Notes and review permissions.
2. Open DevTools on the popup → **Application** → **IndexedDB** → `QuickNotesDB` — notes are local.
3. Disconnect from the internet — notes still load (local storage).
4. Export notes from Settings — the file contains only what you saved.
