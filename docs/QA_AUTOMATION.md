# Quick Notes — QA Automation

## Why Playwright?

Playwright is an **optional** dev dependency for checks that need a real browser:

- Landing page **390px** layout (horizontal overflow)
- Rendered **title** and **href** values after Next.js build
- **Unpacked extension** load in Chromium (popup DOM smoke)

Static scripts (`validate-extension.js`, `check-js.js`) cover manifest, permissions, and ZIP structure without Playwright.

## Commands

| Script | What it does |
|--------|----------------|
| `npm run check:js` | `node --check` on all extension JS under `background/`, `popup/`, `storage/`, `shared/`, `lib/` |
| `npm run check:manifest` | Validates manifest, icons, service worker, popup, release-tree hygiene |
| `npm run check:zip -- <file.zip>` | Validates store ZIP layout and embedded manifest |
| `npm run test:landing:static` | Reads `landing/lib/site.ts` (+ built HTML if present) |
| `npm run test:landing` | Playwright landing tests (starts `landing` on port 3456) |
| `npm run test:extension` | Playwright extension smoke (no landing server) |
| `npm run test:extension:e2e` | Playwright extension popup E2E (flows A–I; see checklist manual-only section) |
| `npm run test:logic` | Unit-style tests (`node:test`) for url-utils and note-filters |
| `npm run qa` | Runs check:js, test:logic, check:manifest, check:zip, test:landing:static |

## Setup

```bash
npm install
npm run setup:playwright   # installs Chromium into node_modules (once)
```

`pretest:landing` and `pretest:extension` run the browser install automatically if needed. Landing `npm install` runs automatically before `test:landing` when `landing/node_modules` is missing.

To skip browser download (CI image with preinstalled browsers): `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

## Extension test limitations

- Requires Chromium and writable profile dirs: `tests/.pw-extension-profile/` (smoke), `tests/.pw-extension-e2e-profile/` (E2E).
- Headless extension loading can be flaky; tests **skip** if the service worker never registers.
- Opening `chrome-extension://…/popup/popup.html` is **not** the same as toolbar or Ctrl+Shift+Q — see **Manual-only tests** in `docs/QA_CHECKLIST.md`.
- Page Memory URL matching is covered by `npm run test:logic`; live `activeTab` banner requires manual QA.
- ExtensionPay E2E only asserts checkout URL opens; no real payment.

## Source maps

Set `ALLOW_SOURCE_MAPS=1` to allow `.map` files in release/ZIP validation (default: fail).
