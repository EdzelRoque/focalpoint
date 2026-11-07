# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FocalPoint is an AI focus assistant for students. The student starts a session with a goal. A Chrome extension sends each page they visit to the backend, which asks Claude whether the page is relevant to that goal. Off-topic pages get a block overlay that the student can override. There are three deployables, each with its own `package.json` and no root workspace:

- `backend/`: Node + Express 5 (ES modules), MongoDB, Redis (ioredis), Anthropic SDK. Deployed on Render.
- `extension/`: Chrome MV3, plain JS, **no build step**. Not published to the Chrome Web Store yet. Load `extension/` unpacked at `chrome://extensions` and reload it after edits.
- `frontend/`: Vite + React + TS + shadcn/ui + Tailwind dashboard (history, stats, settings). Deployed on Vercel. Path alias `@/` → `frontend/src/`.

## Product rules (agreed with the owner; tests guard them)

Don't change app behavior without the owner's explicit OK. These were decided deliberately:
- **Never:** block an on-topic page (fail open, silently), leak private page data, let one user affect another, or lose session stats.
- **Timed sessions auto-end** at `expectedEndTime`. The backend closes overdue sessions lazily (`actualEndTime = expectedEndTime`). The extension stops classifying, takes overlays down in every tab (via a `chrome.alarms` alarm plus a check before each classify), and the popup returns to Start. Durations are whole minutes from 1 to 480. A missing or null duration means open-ended.
- **Overrides are per-user** (Redis key `override:<userId>:<hash>`) and never touch the shared Claude cache (`classify:<hash>`). If logging an override fails, the overlay stays up with an error. A 409 or no-session reply means the session is over, so the overlay comes down.
- **Block count** counts every block event, including re-shows after a tab switch or reload.
- **Settings** are snapshotted into each session when it starts.
- **Sensitivity:** only `standard` is released (`backend/config/features.js`). The backend coerces any other level to standard on session start, settings save and classify. The frontend slider is disabled, blurred and marked "Coming soon". The lenient/strict prompts stay in place for a future release.
- **Strict mode** (the toggle) only removes "Proceed anyway".
- **Stuck sessions:** if the backend already has an active session, the popup resumes it at login or when Start returns 409.
- **Expired login (extension):** any 401 from the backend signs the extension out (`lib/login-state.js`). It removes the token and session, sets `loginExpired`, shows a red "!" on the toolbar icon and takes overlays down. The popup then opens on login with "Your login expired. Sign in again." Signing in clears the badge and resumes any running session.
- **Expired login (dashboard):** dashboard routes are wrapped in `RequireAuth` (no token → `/login`). A 401 from the API clears the login and redirects to `/login` with the same message in amber (`src/lib/auth.ts`).
- **Usernames** are unique regardless of case (Mongo collation, strength 2) but stored as typed.

## Commands

Run each from its own package directory.

**Backend** (needs `JWT_SECRET`, `ANTHROPIC_API_KEY`, `MONGO_URI` or `app.js` throws at startup; `REDIS_URL` defaults to `redis://127.0.0.1:6379`, `PORT` to 3000):
```bash
npm start
npm test                                   # all backend tests, no services needed
npx vitest run test/sessions.test.js       # single file
npx vitest run -t "auto-end"               # tests whose name matches
npm run eval                               # OPT-IN live Claude eval (real API key, costs money, never in CI)
```

**Extension**:
```bash
npm run test:unit                          # vitest + jsdom (test/unit)
npx vitest run test/unit/popup.test.js
npm test                                   # Playwright journeys (test/journeys), real Chrome + real backend
npx playwright test test/journeys/expiry.spec.js
```
Journeys need `npm install` in `backend/` too, `npx playwright install chromium`, and **a real Redis on localhost:6379**. They use db 15 and refuse db 0 because they run FLUSHDB. To start one: `docker run -d --name focalpoint-test-redis -p 6379:6379 redis:7`. They run headed (MV3 can't run headless; CI uses `xvfb-run`) with `workers: 1`.

**Frontend**:
```bash
npm run dev      # Vite on :8080
npm run build
npm run lint
npm test         # vitest + Testing Library (src/**/*.test.tsx, config in vitest.config.ts)
```

CI (`.github/workflows/test.yml`) runs all of the above except the live eval.

## Test suite layout

- **Backend** (`backend/test/`): every test goes through HTTP against `createApp()`, so the real rate limits, CORS, JSON parsing and routes are exercised.
  - MongoDB is real (mongodb-memory-server, started in `test/setup/globalSetup.js`).
  - Claude is `test/support/fakeClaude.js`, an HTTP server the real Anthropic SDK reaches through `ANTHROPIC_BASE_URL`, so tests assert on the exact request sent. Script replies with `fakeClaude.reply({decision, reason} | {rawText} | {status})`.
  - Redis is `test/support/fakeRedis.js`, mocked globally in `test/setup/perFile.js`.
  - DB, Redis and fake Claude are reset before each test. `test/support/db.js` `backdateSession()` moves a session's clock for expiry tests.
  - `startup.test.js` boots `node app.js` for real, because Vitest's transform can hide errors (such as a duplicate import) that crash plain Node.
  - Files are grouped by rule: `sessions`, `classification`, `overrides`, `isolation`, `privacy`, `auth`, `platform`, `startup`.
- **Extension unit** (`extension/test/unit/`): runs the real scripts against `test/support/fakeChrome.js` (storage, runtime, tabs, alarms) and `fakeBackend.js` (fetch). Load them with `test/support/load.js`.
  - `script-scope.test.js` loads popup.html's scripts and each manifest content-script list into **one shared classic scope**, as Chrome does. Any top-level `const` declared twice across those files fails it.
- **Extension journeys** (`extension/test/journeys/`): `harness/global-setup.js` copies the shipped files to `test/.tmp/ext` and rewrites `lib/config.js` and the manifest's `host_permissions` to the local backend. It boots mongodb-memory-server, a fake Claude (BLOCKs any page whose title contains `[off-topic]`, records every request at `/__requests`), and the real `node app.js` (log at `test/.tmp/backend.log`). Test pages live in `test/journeys/pages/`.
  - Each test registers its own student with a unique goal (`harness/fixtures.js`), so cache entries never collide.
  - `setSessionEnd()` edits a session's end time directly in Mongo, so expiry runs in seconds.
- **Frontend** (`frontend/src/**/*.test.tsx`): axios is `vi.mock`ed. `src/test/render.tsx` `renderAt()` wraps a page in a MemoryRouter and shows the navigated path in `data-testid="location"`.

## Architecture

### Request flow
1. `extension/content.js` (runs on `<all_urls>` after `lib/content-helpers.js`) builds `{url, pageTitle, pageSnippet}` and sends `classify_page` to the service worker.
2. `extension/background.js` reads `activeSession` and `token` from `chrome.storage.local` (an expired session is ended first), then POSTs `/api/classify` with the session's goal and sensitivity. On `BLOCK` it POSTs `/api/sessions/:id/block` and broadcasts `stats_update` to the popup. A 409 from the block endpoint means the session is over, so the extension ends it locally.
3. `backend/data/classification.js` validates input. It checks this user's override key first, then the shared cache (`classify:` + sha256 of `url:goal:sensitivity`, 24h TTL). On a miss it calls `claude-haiku-4-5` with a sensitivity-specific system prompt and expects JSON `{decision: ALLOW|BLOCK, reason}`.
4. On `BLOCK`, the content script injects `#focalpoint-overlay`. "Proceed anyway" sends `override_page`. The background POSTs `/api/sessions/:id/override`, which increments `overrideCount` and writes the per-user override key. The overlay is removed only when the reply is `{status}` or `{sessionEnded}`.

### Invariants to preserve
- **Fail open, and don't cache failures.** Any Claude or parse error returns ALLOW, and that result is never written to Redis.
- **Privacy:** only `origin + pathname` reaches Claude, and errors log only `name`/`status`.
- **One active session per user** (409 on a second start). Overdue timed sessions are closed before that check.
- Data-layer functions **throw plain strings**. Routes map specific strings to status codes (`'Session not found'` → 404, `'Session is already ended'` → 409, `'You already have an active session'` → 409), and the extension relies on those 409s.
- Rate limits are in `middleware/limiters.js` (global 60/min, `/auth` 10/min, `/api/classify` 100/min). `RATE_LIMIT_MAX` overrides them for the journey harness only.
- CORS allows only `https://focalpoint-rho.vercel.app` and `chrome-extension://` origins.

### Backend layout
`app.js` checks env vars and listens. `createApp.js` builds the Express app (limiters → CORS → JSON → routes). `routes/` are thin routers (JWT `authMiddleware` sets `req.user.userId`) → `data/` holds the business logic, exposed via `data/index.js` → `config/` holds lazy Mongo collection getters, the Redis singleton and `features.js`. Mounts: `/auth/{register,login,settings,me}`, `/api/sessions[/:id[/block|/override]]`, `/api/classify`.

### Extension specifics
- `chrome.storage.local` is the source of truth for `activeSession` and `token`. `background.js` keeps a lazy in-memory cache that `storage.onChanged` keeps in sync (and uses to schedule the expiry alarm), because the MV3 service worker can be killed at any time.
- `lib/*.js` are **classic scripts** with no `export`. They publish globals (`fpConfig`, `fpSessionHelpers`, `fpContentHelpers`, `fpPopupHelpers`), so popup.html, the manifest, `background.js` (as side-effect imports) and Vitest can all load the same file. Always use the namespace (`fpSessionHelpers.isSessionExpired(...)`) and never destructure into same-named consts. That's a redeclaration SyntaxError in the shared scope, and `script-scope.test.js` checks for it.
- SPA handling: `background.js` forwards `tabs.onActivated` → `tab_change` and URL changes → `spa_change`. YouTube uses `yt-page-data-updated`. `content.js` drops stale responses (classification id plus a URL re-check) and defers at most once while the text is still changing, so feeds still get classified.

### Backend URL
The extension reads `https://focalpoint-q8r5.onrender.com` from `extension/lib/config.js` (also in `manifest.json` `host_permissions`). The frontend hardcodes it in `axios` calls in `src/pages/*`. The frontend stores `token`/`username` in `localStorage`; the extension stores its token separately in `chrome.storage.local`.
