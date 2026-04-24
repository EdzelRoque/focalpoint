# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FocalPoint is an AI-powered focus assistant split across three deployables in a single repo:

- **`backend/`** — Node/Express API (ES modules). Deployed to Render at `https://focalpoint-q8r5.onrender.com`.
- **`frontend/`** — Vite + React + TypeScript + shadcn/ui + Tailwind. Deployed to Vercel (see `frontend/vercel.json`).
- **`extension/`** — Chrome MV3 extension (plain JS, no build step). Published to the Chrome Web Store.

All three pieces talk to the same backend. The extension and frontend both hardcode the Render URL — there is no build-time env substitution.

## Commands

### Backend (`backend/`)
```
npm start          # node app.js — reads PORT (default 3000), MONGO_URI, REDIS_URL, JWT_SECRET, ANTHROPIC_API_KEY from env
npm test           # vitest run (node environment, tests under routes/ and data/)
npm run test:watch
```
No linter configured.

### Frontend (`frontend/`)
```
npm run dev        # Vite dev server on port 8080
npm run build      # production build
npm run lint       # eslint .
npm test           # vitest run (jsdom, tests under src/**/*.{test,spec}.{ts,tsx})
npm run test:watch
```
Path alias: `@/` → `frontend/src/`.

### Extension (`extension/`)
No build step for the runtime code itself — load unpacked in `chrome://extensions` pointed at the `extension/` directory and hit the reload icon after edits. The test harness adds its own `package.json`:
```
npm install                      # one-time: installs @playwright/test
npx playwright install chromium  # one-time: downloads the headed Chromium build
npm test                         # playwright test — runs the spec suite in extension/tests/
```

## Architecture

### Data flow (the core loop)
1. User starts a session from the **extension popup** (`popup.js`). This POSTs `/api/sessions` with `{ sessionGoal, durationInMinutes }` and stores the returned session (with `_id`, `blockSensitivity`, `strictMode`) in `chrome.storage.local` as `activeSession`.
2. `content.js` runs on every page (`<all_urls>`, `document_idle`), scrapes `url` + `pageTitle` + `pageSnippet`, and messages `background.js` with `classify_page`.
3. `background.js` (service worker, MV3) forwards to `POST /api/classify` with the JWT from `chrome.storage.local.token`.
4. Backend `data/classification.js` checks Redis for a cached decision keyed on `md5(url:sessionGoal:blockSensitivity)` (24h TTL). On miss, it calls Anthropic (`claude-haiku-4-5`) with sensitivity-specific system rules (`lenient` / `standard` / `strict`) and expects a strict JSON `{decision, reason}` reply. On any parse/API failure, it defaults to `ALLOW`.
5. If `BLOCK`, background.js hits `POST /api/sessions/:id/block` to increment the counter, then tells the content script to render the block overlay. On override, it hits `POST /api/sessions/:id/override`, which also calls `clearClassificationCache` — this *overwrites* the cache entry with an `ALLOW` so the user isn't re-blocked on the same URL.
6. Tab switches (`chrome.tabs.onActivated`) and SPA URL changes (`chrome.tabs.onUpdated` with `changeInfo.url`) re-trigger classification via `tab_change` / `spa_change` messages. The SPA path exists specifically because sites like YouTube don't fire a full navigation.

### Backend layout
- `app.js` — Express app with CORS allowlist, env-var startup guard, and rate limiting. Mounts routes via `routes/index.js`.
- `middleware/corsConfig.js` — CORS options object; allowlist contains the Vercel frontend origin and a regex matching any `chrome-extension://` origin.
- `middleware/limiters.js` — `createLimiters({ store, ...overrides })` factory. Returns `{ global, auth, classify }` limiters (60 / 10 / 100 req/min). Accepts option overrides so tests can pass `{ max: 2 }` for fast 429 assertions without touching `vi.resetModules()`.
- `routes/` — `/auth/*` (userRoutes), `/api/sessions*` (sessionRoutes), `/api/classify` (classificationRoutes). All 404s handled by a catch-all.
- `data/` — thin data-access layer re-exported through `data/index.js` as `userData`, `sessionData`, `classificationData`. Routes import *only* from `data/index.js`.
- `middleware/auth.js` — `Bearer` JWT verification, attaches `req.user.userId`. Token signed with `JWT_SECRET`, 7-day expiry.
- `validation.js` — single module containing all input validators (`validateURL`, `validateSessionGoal`, `validateBlockSensitivity`, etc.). Both routes and data-layer functions call these; don't duplicate validation logic elsewhere.
- `config/mongoCollections.js` — memoized collection getters for `users` and `sessions` in the `FocalPoint` DB.
- `config/redisConnection.js` — single ioredis client.

`blockSensitivity` is an enum: `'lenient' | 'standard' | 'strict'`. It's part of the cache key, so changing sensitivity invalidates cached decisions automatically.

### Frontend layout
- `src/App.tsx` — all routes in one file: `/`, `/login`, `/register`, `/dashboard`, `/dashboard/sessions`, `/dashboard/settings`.
- `src/components/ui/` — shadcn/ui components (don't hand-edit without reason; regenerate via shadcn CLI).
- `src/pages/` — page-level components.
- Auth token stored in `localStorage`; axios calls target the Render URL directly.

### Extension layout
- `manifest.json` — MV3, permissions: `storage`, `tabs`, `scripting`; host permissions include `<all_urls>` and the Render backend.
- `popup.{html,js,css}` — session start/stop UI, login, stats display.
- `background.js` — service worker; owns `activeSession` state (in-memory + mirrored to `chrome.storage.local`). All backend calls go through here so the content script never holds the JWT.
- `content.js` — scrapes page, renders block/override overlay.
- `tests/` — Playwright specs and the shared `fixtures.js` harness.

## Conventions worth knowing

- Backend uses `"type": "module"` — all imports need `.js` extensions, including relative imports of `.js` files.
- Validation errors are `throw`n as raw strings (not `Error` objects) and returned as `{ error: <string> }`. Route-level try/catch patterns assume this.
- The `/api/sessions/:id/override` endpoint does double duty: it increments the override counter AND rewrites the Redis cache entry. Don't split those — the cache rewrite is what prevents re-blocking.
- The Anthropic classifier is prompted to return *only* a JSON object; the parser strips ``` fences defensively. If the model drifts, the fallback is `ALLOW` (fail-open by design — we don't want the extension to accidentally block everything on an API hiccup).
- There's no shared config for the backend URL: the extension hardcodes it in `background.js`, and the frontend hardcodes it in axios calls. Update both when the backend moves.
- Backend tests use **vitest + supertest**. Test files live next to whatever they test — `routes/foo.test.js` alongside `routes/foo.js`, `data/foo.test.js` alongside `data/foo.js`. Only mock **external** dependencies (MongoDB, Redis, Anthropic API) — their real implementations connect to live services at import time and must never be loaded in tests. Never mock your own application code. For pure middleware tests (CORS, rate limiting) use real Express + supertest with no mocks at all.
- Session-route tests mock `../data/index.js` (covering both `sessionData` and `classificationData`) and `../middleware/auth.js`. Auth is bypassed via a mock that reads `req.headers['x-test-user-id']`. Do not mock `../data/classification.js` directly from route tests — `clearClassificationCache` is exposed through `classificationData` on `data/index.js`.
- Extension tests use **`@playwright/test`** in `extension/tests/`. They launch real headed Chromium with the unpacked extension loaded — headed mode is non-negotiable, MV3 extensions do not run in Playwright's headless mode. Backend traffic is mocked via `context.route('**/focalpoint-q8r5.onrender.com/**', ...)` — never hit the real backend from specs. Use the shared `seedSession` helper in `extension/tests/fixtures.js` rather than trying to set the background service worker's in-memory state directly: `background.js` runs as an ES module, so module-scoped variables like `activeSession` cannot be assigned via `sw.evaluate()`. `seedSession` works around this by injecting a `session_started` message through `chrome.scripting.executeScript`.
- CI lives in `.github/workflows/test.yml` and runs on PR and push to `main`. Two parallel jobs: `backend-test` runs `npm install && npm test` in `backend/`; `extension-test` installs Playwright + Chromium with system deps and runs `xvfb-run npm test` in `extension/` (xvfb is required because extension specs need headed Chrome). The backend job intentionally uses `npm install` rather than `npm ci` — the lock file is generated on Windows, and `vitest@4.x` pulls in `rolldown` with platform-native bindings; Linux CI needs different `@emnapi` versions that are absent from the Windows-generated lock file, which causes `npm ci` to fail.

## Critical Rules for Claude
- Never modify code unless explicitly asked
- Always explain what you're about to do before doing it
- When writing tests, match the actual current behavior, not assumed behavior

## Planning Rules
- Before starting any task, read all relevant files first. Resolve ambiguity by reading the code. Only ask clarifying questions if the answer cannot be found in the codebase or CLAUDE.md — and batch questions into one message.
- For every plan, state what it covers, what it deliberately leaves out, and what risks remain. Do not self-evaluate the plan — give me the tradeoffs and let me decide.
- If a task involves changes to 4+ files or 3+ distinct areas of the codebase, propose a chunked plan before starting. Group chunks by shared files, testing patterns, or area of the codebase. Explain why items belong together. Otherwise, just start working.