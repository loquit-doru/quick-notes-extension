# Quick Notes - Chrome Web Store Listing

## Short Description (132 chars max)
Fast notes in your browser. Keyboard shortcuts, local storage, reminders. No account. Privacy-first.

## Full Description

**Quick Notes** — capture thoughts without leaving your tab.

### Why Quick Notes?

- **Fast popup** — opens quickly from the toolbar (see speed badge in the popup)
- **Keyboard-first** — Ctrl+Shift+Q to open, Ctrl+N for new note, `/` to search (Pro)
- **No account** — start immediately
- **Privacy-first** — notes stored locally in IndexedDB
- **Context capture** — optional URL and page title on new notes
- **Reminders** — schedule alerts via browser alarms and notifications

### 7-day free trial

Full Pro access for 7 days after install.

### Free (after trial)

- Up to 5 notes
- 500 characters per note (enforced in the editor)
- Pin notes, themes, export
- 24-hour trash recovery
- Reminders and notifications

### Pro ($2.99 one-time)

- Unlimited notes and characters
- Full-text search
- Folders
- PIN lock
- 7-day trash recovery
- Auto-backup snapshot on this device (Settings; survives extension updates, not uninstall)

### Backup & restore

- **Export** JSON, Markdown, or plain text (free — Settings → Backup & export)
- **Full backup** JSON download before uninstalling
- **Import** JSON to restore notes
- **Restore purchase** — card buyers: email used at checkout; crypto: verify transaction in Pro modal
- Notes are **not** synced to our servers by default

### Privacy

Notes stay in your browser unless you export them. License checks may send email or transaction hash only. See bundled `privacy.html` or PRIVACY.md.

### Keyboard shortcuts

- Ctrl+Shift+Q — Open Quick Notes
- Ctrl+N — New note
- / — Search (Pro)
- Esc — Back

### Payment

- Card (ExtensionPay / Stripe)
- Crypto (ETH/USDC on Base) + license verification API

---

## How to verify (store reviewers & users)

1. **Load time:** Install unpacked → open popup → read the **ms badge** in the header (varies by machine; not a fixed guarantee).
2. **500 char limit:** After trial, create a note and type past 500 characters — save is blocked with an upgrade prompt.
3. **Trash retention:** Delete a note → open Trash — footer says **24 hours** (free) or **7 days** (Pro).
4. **Folders:** After trial, tap **+** folders — upgrade prompt unless Pro/trial.
5. **Reminders:** Set a reminder → check `chrome://extensions` → Quick Notes has **alarms** and **notifications** permissions.
6. **Backup:** Settings → **Download full backup (JSON)** → file downloads.
7. **Folders (Pro):** After trial or with Pro, create a folder from the sidebar **+** control.

## Category

Productivity

## Tags

notes, quick notes, fast notes, productivity, keyboard, privacy, offline, no account, folders, pin lock, reminders
