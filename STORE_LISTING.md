# Quick Notes — Browser Store Listing (Chrome & Edge)

## Store title (75 chars max, comes from manifest `name`)

Currently shipped:

    Quick Notes: Offline Notepad & Note Taking, No Account

Alternatives — swap the manifest `name` string, nothing else depends on it:

    Quick Notes: Browser Notepad, Fast Note Taking, Works Offline
    Quick Notes: Private Notepad & Note Taking — No Sign-Up

Rationale: the title carries the most ranking weight, and people search the
problem ("notepad", "note taking", "offline notes"), not the brand. Deliberately
**not** using "sticky notes" — this is a toolbar popup, it does not attach notes
to web pages, and the listing should not promise otherwise. `short_name` keeps
"Quick Notes" for the browser UI.

## Short Description (132 chars max)
Fast notepad for any tab. No account, no cloud, no tracking. Free core plan plus an optional one-time Pro unlock.

## Store description — paste-ready (plain text, both stores)

Store dashboards do not render Markdown. Paste the block below as-is.

```text
Quick Notes is a fast notepad that lives in your browser toolbar. Open it from any tab with Ctrl+Shift+Q, write, and get back to what you were doing.

No account. No cloud sync. No tracking. Your notes are stored locally in your browser and work offline.

WHAT YOU GET FREE
• Up to 10 notes, any length
• Instant popup from any tab, auto-save as you type
• Pin notes to the top
• Optional page URL and title saved with each note
• Reminders with browser notifications
• Export to JSON, Markdown, or plain text
• Dark and light themes

PRO — $2.99 ONE-TIME, NO SUBSCRIPTION
• Unlimited notes
• Full-text search
• Folders
• PIN lock for shared devices
• 7-day trash recovery (24 hours on the free plan)
• Automatic local backup snapshots

Every install starts with 7 days of full Pro access, and only the days you actually open Quick Notes are counted — put it down for a month and the trial waits for you. When it ends, Quick Notes keeps working on the free plan: nothing is deleted, and your existing notes stay editable at any length.

PRIVACY
Your notes never leave your browser unless you export them. We do not collect note content. Payment and license restore send an email address to our payment provider only.

Shortcuts: Ctrl+Shift+Q to open, Ctrl+N for a new note, Esc to go back.
```

**Why this replaces the live Chrome text:** the published Chrome description lists
"Search notes quickly" and the Personal/Work filters as plain features, but both
are Pro-gated once the trial ends, and it never mentions Pro, the price, or the
free note cap. That is the single fastest way to earn 1-star reviews, and paid
features have to be disclosed.

## Full Description (internal reference)

**Quick Notes** helps knowledge workers capture ideas without leaving their current tab. It works in Chromium-based browsers including **Google Chrome** and **Microsoft Edge**.

### Why Quick Notes?

- **No context switch** — capture ideas without opening a full notes app
- **Keyboard-friendly** — Ctrl+Shift+Q to open, Ctrl+N for new note, `/` to search (Pro)
- **No account** — start immediately
- **Local-first privacy** — notes stored in browser IndexedDB
- **Context capture** — optional URL and page title on new notes
- **Page Memory** — see notes tied to the page or site you are on (local matching only)
- **Inbox** — new notes land in Inbox; tap Done or archive when finished
- **Reminders** — schedule alerts via browser alarms and notifications

### Pricing model

Quick Notes starts with **7 days of full Pro access**, then continues as a free core plan unless the user upgrades.

The seven days are **days of use, not calendar days** — the counter only moves on a day the popup is actually opened. Someone who installs, looks once and returns a fortnight later still has their trial, instead of having lost it to a clock they never watched.

### Free (after trial)

- Up to 10 notes (core quick-capture flow stays usable)
- No length limit — notes of any size always save
- Pin notes, themes, export
- 24-hour trash recovery
- Reminders and notifications

### Why pay for Pro ($2.99 one-time)

- Remove the free note cap for heavier daily use (unlimited notes)
- Find old notes quickly with search
- Organize large note sets with folders
- Add a PIN lock on shared devices
- Keep deleted notes longer (7-day trash recovery)
- Get on-device auto-backup snapshots (survive extension updates, not uninstall)

### Backup & restore

- **Export** JSON, Markdown, or plain text (free — Settings → Backup & export)
- **Full backup** JSON download before uninstalling
- **Import** JSON to restore notes
- **Restore purchase** — card buyers: use Stripe receipt email or ExtensionPay login
- Notes are **not** synced to our servers by default

### Privacy

Notes stay in your browser unless you export them. We do not collect or transmit your note content. Payment or license restore may send email and license identifiers to third-party providers only. **Privacy & Trust** in Settings explains permissions and data control. See `privacy.html` or PRIVACY.md.

### Keyboard shortcuts

- Ctrl+Shift+Q — Open Quick Notes
- Ctrl+N — New note
- / — Search (Pro)
- Esc — Back

### Payment

- Card (ExtensionPay / Stripe)

---

## How to verify (store reviewers & users)

1. **Load time:** Install unpacked → open popup → read the **ms badge** in the header (varies by machine; not a fixed guarantee).
2. **Free note limit:** After trial, add notes past 10 — the new-note control shows an upgrade prompt. Existing notes stay editable at any length.
3. **Trash retention:** Delete a note → open Trash — footer says **24 hours** (free) or **7 days** (Pro).
4. **Folders:** After trial, tap **+** folders — upgrade prompt unless Pro/trial.
5. **Reminders:** Set a reminder → check extension details — **alarms** and **notifications** permissions are required.
6. **Backup:** Settings → **Download full backup (JSON)** → file downloads.
7. **Folders (Pro):** After trial or with Pro, create a folder from the sidebar **+** control.

## Category

Productivity

## Tags

notes, quick notes, fast notes, productivity, keyboard, privacy, offline, no account, folders, pin lock, reminders
