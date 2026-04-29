# FocalPoint

An AI-powered focus assistant that helps you stay on task. You declare a goal and a duration, then a Chrome extension classifies every page you visit against that goal and blocks anything off-topic — with an override you can use when you really do need to step away.

Live deployments:
- **Backend:** https://focalpoint-q8r5.onrender.com (Render)
- **Frontend:** Vercel (see [frontend/vercel.json](frontend/vercel.json))
- **Extension:** Chrome Web Store

## How it works

1. You start a session from the extension popup with a goal (e.g. *"finish the auth migration"*), a duration, and a sensitivity level (`lenient`, `standard`, or `strict`).
2. As you browse, a content script scrapes the URL, page title, and a snippet of the page and sends it to the backend.
3. The backend classifies the page against your stated goal using Anthropic's `claude-haiku-4-5`. Decisions are cached in Redis (24h TTL, keyed on URL + goal + sensitivity) so repeat visits are instant.
4. If the page is off-topic, the extension renders a block overlay. You can override — that bumps the override counter and rewrites the cache so you don't get re-blocked on the same page.
5. The web dashboard shows your session history, block/override stats, and lets you manage settings.

The classifier fails open: if Anthropic is unreachable or returns malformed output, the page is allowed. We'd rather miss a block than break your browsing.

## Repo layout

This is a single repo with three deployables:

```
focalpoint/
├── backend/      Node + Express API (ES modules, MongoDB, Redis, Anthropic)
├── frontend/     Vite + React + TypeScript + shadcn/ui + Tailwind
└── extension/    Chrome MV3 extension (plain JS, no build step)
```

All three pieces talk to the same backend. The extension and frontend hardcode the Render URL — there is no build-time env substitution.

## Running locally

### Backend

Required env vars: `MONGO_URI`, `REDIS_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`. `PORT` defaults to `3000`.

```bash
cd backend
npm install
npm start
```

Tests (vitest + supertest):

```bash
npm test
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # Vite on port 8080
npm run build
npm run lint
npm test         # vitest under jsdom
```

Path alias: `@/` → `frontend/src/`.

### Extension

There's no build step for the runtime code — load it unpacked:

1. Open `chrome://extensions`.
2. Enable *Developer mode*.
3. *Load unpacked* and point it at the [extension/](extension/) directory.
4. Reload the extension after edits.

End-to-end tests use Playwright with a real headed Chromium (MV3 doesn't run headless):

```bash
cd extension
npm install
npx playwright install chromium
npm test
```

## Tech stack

| Layer     | Stack                                                                |
| --------- | -------------------------------------------------------------------- |
| Backend   | Node, Express, MongoDB, Redis (ioredis), JWT, Anthropic SDK, vitest  |
| Frontend  | Vite, React, TypeScript, shadcn/ui, Tailwind, axios, recharts        |
| Extension | Chrome MV3, plain JS service worker + content script, Playwright     |
| CI        | GitHub Actions — backend vitest + extension Playwright (xvfb headed) |

## License

See repository for license details.
