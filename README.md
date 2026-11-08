# FocalPoint

An AI-powered focus assistant that helps you stay on task. You declare a goal and a duration, then a Chrome extension classifies every page you visit against that goal and blocks anything off-topic — with an override you can use when you really do need to step away.

Live deployments:
- **Backend:** https://focalpoint-q8r5.onrender.com (Render)
- **Frontend:** https://focalpoint-rho.vercel.app (Vercel)
- **Extension:** not published yet; load it unpacked (see [Extension](#extension) below)

## How it works

1. You start a session from the extension popup with a goal (e.g. *"study for my organic chemistry midterm"*) and an optional duration (whole minutes, up to 8 hours). A timed session ends on its own when the time runs out.
2. As you browse, a content script scrapes the URL, page title, and a snippet of the page and sends it to the backend.
3. The backend classifies the page against your stated goal using Anthropic's `claude-haiku-4-5`. Decisions are cached in Redis (24h TTL, keyed on URL + goal + sensitivity) so repeat visits are instant. Only the `standard` sensitivity is released for now; `lenient` and `strict` show as "Coming soon" in Settings.
4. If the page is off-topic, the extension renders a block overlay. You can override it with "Proceed anyway" (unless strict mode is on). That bumps the override counter and allows that page for you, and only you, for 24 hours.
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

Required env vars: `MONGO_URI`, `JWT_SECRET`, `ANTHROPIC_API_KEY` (the server refuses to start without them). Optional: `REDIS_URL` (defaults to `redis://127.0.0.1:6379`) and `PORT` (defaults to `3000`). A `.env` file in `backend/` is loaded automatically.

```bash
cd backend
npm install
npm start
```

Tests (vitest + supertest) need no running services: MongoDB comes from `mongodb-memory-server`, Claude is a local fake server, and Redis is faked in memory.

```bash
npm test
npx vitest run test/sessions.test.js   # a single file
```

There is also an **opt-in** check against the real Claude API (`evals/`). It sends clear-cut student scenarios and fails if an on-topic page is blocked or fewer than 80% of distractions are blocked. It costs a little API money per run and never runs in CI:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run eval
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # Vite on port 8080
npm run build
npm run lint
npm test         # vitest + Testing Library
```

Path alias: `@/` → `frontend/src/`.

### Extension

There's no build step for the runtime code — load it unpacked:

1. Open `chrome://extensions`.
2. Enable *Developer mode*.
3. *Load unpacked* and point it at the [extension/](extension/) directory.
4. Reload the extension after edits.

The unpacked extension talks to the production backend on Render. The URL is set in `lib/config.js` (and `manifest.json` host permissions).

Unit tests (vitest + jsdom) run the real extension scripts against a fake `chrome` API and a fake backend:

```bash
cd extension
npm install
npm run test:unit
```

End-to-end journey tests use Playwright with a real headed Chromium (MV3 doesn't run headless). The suite starts the real backend against an in-memory MongoDB and a fake Claude, so it needs the backend's dependencies and a Redis server on `localhost:6379`. It uses db 15, which it flushes on every run.

```bash
(cd ../backend && npm install)
npx playwright install chromium
docker run -d --name focalpoint-test-redis -p 6379:6379 redis:7   # if Redis isn't already running
npm test
```

## Tech stack

| Layer     | Stack                                                                |
| --------- | -------------------------------------------------------------------- |
| Backend   | Node, Express, MongoDB, Redis (ioredis), JWT, Anthropic SDK, vitest  |
| Frontend  | Vite, React, TypeScript, shadcn/ui, Tailwind, axios, recharts        |
| Extension | Chrome MV3, plain JS service worker + content script, Playwright     |
| CI        | GitHub Actions — backend vitest, extension vitest + Playwright (xvfb headed), frontend vitest |

## License

No license file has been added yet.
