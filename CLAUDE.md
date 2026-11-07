# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FocalPoint is an AI focus assistant. The user starts a session with a goal. A Chrome extension sends each page it visits to the backend, which asks Claude whether the page is relevant to that goal. Off-topic pages get a block overlay that the user can override. There are three deployables, each with its own `package.json` and no root workspace:

- `backend/`: Node + Express 5 (ES modules), MongoDB, Redis (ioredis), Anthropic SDK. Deployed on Render.
- `extension/`: Chrome MV3, plain JS, **no build step**. Not published to the Chrome Web Store yet. Load `extension/` unpacked at `chrome://extensions` and reload it after edits.
- `frontend/`: Vite + React + TS + shadcn/ui + Tailwind dashboard (history, stats, settings). Deployed on Vercel. Path alias `@/` → `frontend/src/`.

## Commands

Run each from its own package directory.

**Backend** (needs `JWT_SECRET`, `ANTHROPIC_API_KEY`, `MONGO_URI` or `app.js` throws at startup; `REDIS_URL` defaults to `redis://127.0.0.1:6379`, `PORT` to 3000):
```bash
npm start
npm test                                   # vitest run (all)
npx vitest run data/session.test.js        # single file
npx vitest run -t "name of test"           # single test by name
```
Backend tests need no external services. `test/globalSetup.js` starts `mongodb-memory-server` and sets `MONGO_URI`/`JWT_SECRET`. Redis and the Anthropic SDK are `vi.mock`ed per test file. Files run serially (`fileParallelism: false`) because they share one in-memory DB; use `test/dbHelpers.js` `clearDb()` and `test/authHelpers.js` `registerAndSign()`. Route tests use `test/buildTestApp.js`, which mounts routes without the rate limiters or CORS that `app.js` adds.

**Extension**:
```bash
npm run test:unit                          # vitest + jsdom: lib/**/*.test.js and root *.test.js
npx vitest run lib/content-helpers.test.js
npm test                                   # Playwright journey suite (tests/*.spec.js)
npx playwright test tests/blocking.spec.js
```
The Playwright suite needs `npm install` in `backend/` too, `npx playwright install chromium`, and **a real Redis on localhost:6379**. It uses db 15 and refuses db 0 because it runs FLUSHDB. One way to start Redis: `docker run -d --name focalpoint-test-redis -p 6379:6379 redis:7`. It runs headed (MV3 can't run headless; CI uses `xvfb-run`), with `workers: 1`.

**Frontend**:
```bash
npm run dev      # Vite on :8080
npm run build
npm run lint
```
`npm test` exists, but there are currently no frontend test files and no `test` block in `vite.config.ts`.

CI (`.github/workflows/test.yml`) runs backend vitest, extension vitest, and the extension Playwright suite (with a Redis service). The frontend is not covered.

## Architecture

### Request flow
1. `extension/content.js` (runs on `<all_urls>` after `lib/content-helpers.js`) builds `{url, pageTitle, pageSnippet}` and sends `classify_page` to the service worker.
2. `extension/background.js` reads `activeSession` and `token` from `chrome.storage.local`, then POSTs `/api/classify` with the session's `sessionGoal` and `blockSensitivity`. On `BLOCK` it also POSTs `/api/sessions/:id/block` and broadcasts `stats_update` to the popup.
3. `backend/data/classification.js` validates the input and checks the Redis cache. The key is `classify:` + sha256 of `url:goal:sensitivity`, with a 24h TTL. On a miss it calls `claude-haiku-4-5` with a sensitivity-specific system prompt (`lenient`/`standard`/`strict`) and expects JSON `{decision: ALLOW|BLOCK, reason}`.
4. On `BLOCK`, the content script injects `#focalpoint-overlay`. An override sends `override_page` → `/api/sessions/:id/override`, which increments `overrideCount` and **overwrites the cache entry with ALLOW** so the same page isn't blocked again. `strictMode` (copied from user preferences at session creation) changes the overlay's behavior.

### Invariants to preserve
- **Fail open, and don't cache failures.** Any Claude or parse error returns ALLOW, and that result must not be written to Redis.
- **Privacy:** only `origin + pathname` reaches Claude (query strings and fragments are stripped), and errors log only `name`/`status`, never page data or request contents. Tests check that the backend doesn't log page data; the journey harness gets classify responses from a recording proxy instead.
- **One active session per user.** `createSession` throws if one exists, and the route maps that to 409. Sessions copy `blockSensitivity`/`strictMode` from `user.preferences` when they're created.
- Data-layer functions **throw plain strings**, not `Error`s. Routes map specific strings to status codes (e.g. `'Session not found'` → 404, `'Session is already ended'` → 409), so renaming a message breaks that mapping. All input passes through the validators in `backend/validation.js`, both in routes and again in the data layer.
- Rate limits live in `middleware/limiters.js` (global 60/min, `/auth` 10/min, `/api/classify` 100/min). `RATE_LIMIT_MAX` overrides all of them and exists only for the test harness.
- CORS allows only `https://focalpoint-rho.vercel.app` and `chrome-extension://` origins.

### Backend layout
`routes/` (thin Express routers; JWT `authMiddleware` sets `req.user.userId`) → `data/` (business logic, exposed via `data/index.js` as `userData`/`sessionData`/`classificationData`) → `config/` (lazy Mongo collection getters `users()`/`sessions()`, plus a singleton Redis client). Mounts: `/auth/{register,login,settings,me}`, `/api/sessions[/:id[/block|/override]]`, `/api/classify`.

### Extension specifics
- `chrome.storage.local` is the source of truth for `activeSession` and `token`. `background.js` keeps a lazy in-memory cache that `storage.onChanged` keeps in sync, because the MV3 service worker can be killed at any time. Don't reintroduce startup pre-warming (see the comment in `background.js`).
- `lib/*-helpers.js` are **classic scripts** with no `export`. They publish `globalThis.fpContentHelpers` / `globalThis.fpPopupHelpers` so both the manifest/popup.html and vitest can load the same file. In `content.js`, use the namespace directly: destructuring into same-named consts causes a redeclaration SyntaxError in the shared content-script scope.
- SPA handling: `background.js` forwards `tabs.onActivated` → `tab_change` and `tabs.onUpdated` URL changes → `spa_change`. YouTube is handled separately through `yt-page-data-updated`. `content.js` drops stale responses using a monotonically increasing classification id and a URL re-check. It defers at most once when the snippet is still changing, so pages that never stop changing still get classified (the livelock fix covered by `tests/livelock.spec.js`).
- Journey harness (`tests/global-setup.js`): copies the extension to `tests/.tmp/ext` and rewrites the hardcoded `https://focalpoint-q8r5.onrender.com` in `background.js`/`popup.js` and the manifest to point at a local recording proxy. It then spawns the real `backend/app.js` against mongodb-memory-server, with `ANTHROPIC_BASE_URL` set to a dead port so Claude is never called. Test pages are served from `tests/pages/`, and one test user is shared through `FP_*` env vars. Tests seed classifications directly into Redis (`tests/helpers/seed.js`). If you change the prod URL or add another file that fetches, update the harness rewrite.

### Hardcoded backend URL
The extension (`background.js`, `popup.js`, `manifest.json` host_permissions) and the frontend pages (`axios` calls in `src/pages/*`) hardcode `https://focalpoint-q8r5.onrender.com`. There's no env substitution. The frontend stores `token`/`username` in `localStorage`, and the extension stores its token separately in `chrome.storage.local`.
