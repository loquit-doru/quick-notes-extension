# Copilot Instructions (Quick Notes)

## Communication
- Discuss in Romanian.
- Keep code, identifiers, and user-facing strings in English (match existing repo style).

## Big Picture
- **Project**: Quick Notes — the fastest notes Chrome extension. Instant capture, zero friction.
- **Stack**: Vanilla JavaScript, Chrome Extension Manifest V3, IndexedDB, ExtPay + crypto payments.
- **Key Features**: Notes with folders, PIN lock, reminders, trash with retention, keyboard-first UX, pro/free model.

## Architecture

| Component | Purpose |
|-----------|---------|
| `manifest.json` | Extension configuration (Manifest V3) |
| `background/service-worker.js` | Global shortcuts, context capture, reminders |
| `popup/popup.js` | Main popup UI (~2154 lines) |
| `popup/pro.js` | Pro feature handling, ExtPay + crypto payments |
| `storage/db.js` | IndexedDB storage layer (~515 lines) |
| `lib/ExtPay.js` | ExtensionPay payment library |
| `worker/` | Cloudflare Worker backend |

## Implementation Guidelines
- Follow Manifest V3 patterns (service workers, not background pages).
- Use `chrome.storage.local` for settings, IndexedDB (via `storage/db.js`) for notes data.
- Handle pro/free feature gating via ExtPay + crypto (Base network).
- Keep `popup.js` modular and keyboard-first.
- Performance is critical — track load times from start.

## Key Patterns

### Code Audit Checklist
Before considering a feature "done", verify the full chain:
1. **Definition** — Does the code exist?
2. **Import** — Is it imported where needed?
3. **Call Site** — Is it actually called?
4. **Integration** — Is it connected to the event/trigger?

### IndexedDB Storage
- Database: `QuickNotesDB`, version 4.
- Stores: `notes`, `trash`, `folders`.
- Notes indexed by `updatedAt`, `pinned`, `folderId`.
- Default folders: All Notes, Personal, Work.
- IDs generated: `Date.now().toString(36) + Math.random().toString(36).substr(2)`.

### Pro/Free Model
```javascript
// ExtPay + crypto dual payment
const extpay = ExtPay('quick-notes-new');

async function isPro() {
  const { proUnlocked } = await chrome.storage.sync.get(['proUnlocked']);
  if (proUnlocked === true) return true;
  // Fallback to ExtensionPay check
  const user = await extpay.getUser();
  return user.paid;
}
```
- **Trial**: 7 days full access, tracked via `trialStartDate` in `chrome.storage.local`.
- **Trash retention**: FREE = 1 day, PRO = 7 days.
- **Crypto**: Base network, 0.001 ETH or 3 USDC.

### Reminders
- Use `chrome.alarms` API for scheduling.
- Reschedule all on install/update and Chrome startup.
- Background checker runs periodically.

### State Management
- `chrome.storage.local`: Settings (theme, quickAddMode, includeContext, fastMode).
- IndexedDB: Notes, folders, trash — accessed via `storage/db.js` exports.
- State variables in `popup.js`: `currentNote`, `notes`, `folders`, `currentFolderId`, `isPro`.

## Testing
- Load unpacked extension in Chrome.
- Test keyboard shortcuts (Ctrl+Shift+Q).
- Test both free and pro user flows.
- Test PIN lock, reminders, folder organization.
- Verify IndexedDB migrations work on version bumps.

## Publishing
- Update `STORE_LISTING.md` for Chrome Web Store copy.
- Ensure `PRIVACY.md` / `privacy.html` are current.
