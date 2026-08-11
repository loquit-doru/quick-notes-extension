# Codex Configuration for quick-notes

## Project Overview
quick-notes — Chrome extension for fast note-taking. Speed-optimized, IndexedDB storage.

## Available Commands
- **/retrospective** - Analyze conversation, extract learnings

## Vault Sync
After significant changes (new features, storage changes, UI changes, manifest updates), update:
- **Snapshot**: `C:\Users\quit\Desktop\dev-vault\projects\quick-notes.md` — create if missing
- **Wiki**: no wiki folder yet — create `C:\Users\quit\Desktop\dev-vault\wiki\quick-notes\_index.md` if changes are substantial

## Project Conventions
- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks)
- `chrome.storage.local` for notes data (IndexedDB for large data)
- Speed is the primary UX goal — minimize UI latency

## Key Files
- `manifest.json` — Extension configuration
- `popup/popup.js` — Main UI logic
- `background/service-worker.js` — Background service worker
