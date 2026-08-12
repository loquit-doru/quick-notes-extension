# Quick Notes — Marketing Landing Page

Marketing landing page for the Quick Notes browser extension. Built with **Next.js**, **TypeScript**, and **Tailwind CSS**. Deployable to **Vercel**.

## Prerequisites

- Node.js 20+
- npm

## Environment variables

Copy `.env.example` to `.env.local` and set your URLs:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CHROME_WEB_STORE_URL` | Full Chrome Web Store listing URL |
| `NEXT_PUBLIC_EDGE_ADDONS_URL` | Full Microsoft Edge Add-ons listing URL |
| `NEXT_PUBLIC_PRIVACY_POLICY_URL` | Public HTTPS privacy policy URL |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Support email (e.g. `quicknotes.extension@gmail.com`) |
| `NEXT_PUBLIC_SITE_URL` | Optional — canonical site URL for Open Graph (e.g. `https://quicknotes.app`) |

Until these are set, store buttons use placeholder anchors (`#install`).

## Run locally

```bash
cd landing
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm run start
```

## Deploy to Vercel

> **Deploy with `npm run deploy:landing` from the repo root, not `vercel --prod`.**
>
> `getquicknotes.vercel.app`, `quicknotesbrowser.vercel.app` and
> `tryquicknotes.vercel.app` were assigned by hand, so they are aliases rather
> than project production domains. A plain production deploy moves the project's
> own domains and leaves these three on the previous build — the main address
> then serves stale content with no error anywhere. `deploy:landing` deploys and
> repoints all three.
>
> To retire the script: add those three names under **Project Settings → Domains**
> in Vercel. Once they are production domains they follow every deploy, and
> `vercel --prod` becomes safe again.


### Option A — Vercel Dashboard

1. Import the **quick-notes** Git repository on [vercel.com](https://vercel.com).
2. Set **Root Directory** to `landing`.
3. Framework Preset: **Next.js** (auto-detected).
4. Add environment variables from `.env.example` under **Project → Settings → Environment Variables**.
5. Deploy.

### Option B — Vercel CLI

```bash
cd landing
npx vercel
```

Follow prompts; set root to `landing` if deploying from repo root:

```bash
npx vercel --cwd landing
```

## Assets

Product assets live in `public/assets/quick-notes/`:

| File | Source |
|------|--------|
| `icon.png` | Extension `icons/icon128.png` |
| `screenshot-1.png` … `screenshot-5.png` | `screenshots/quick_notes_screenshot_*_1280x800.png` |

To refresh screenshots after UI changes, copy new PNGs into `public/assets/quick-notes/` with the same names.

## Where to replace store links

1. **`.env.local`** (recommended) — `NEXT_PUBLIC_CHROME_WEB_STORE_URL` and `NEXT_PUBLIC_EDGE_ADDONS_URL`
2. Or edit defaults in `lib/site.ts` (not recommended for production)

Footer and all CTAs read from the same env variables.

## Extension repo

This folder is isolated from the MV3 extension at the repo root. Changing the landing page does not affect the extension build or store ZIP.
