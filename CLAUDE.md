# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo

FocalPoint is an AI-powered focus assistant. A user starts a session with a goal and duration in the Chrome extension, and the backend uses Claude to classify each visited page against that goal. Off-topic pages get a block overlay.

The repo holds three separate deployables, each with its own `package.json`. There is no root workspace, so run `npm install` and all commands inside each folder.

## Commands

**`backend/`** needs `MONGO_URI`, `REDIS_URL`, `JWT_SECRET`, and `ANTHROPIC_API_KEY` in `.env`. `PORT` defaults to 3000.

```bash
npm start                                       # node app.js
npm test                                        # all tests (vitest + supertest)
npx vitest run data/session.test.js -t "name"   # one file or test
```

**`frontend/`**

```bash
npm run dev      # Vite on port 8080
npm run build
npm run lint
npm test         # vitest under jsdom; no test files exist yet
```

**`extension/`** has no build step. Load it unpacked from `chrome://extensions` with Developer mode on, and reload it after edits.

```bash
npm run test:unit                   # vitest + jsdom: lib/*.test.js and root *.test.js
npx vitest run content.test.js      # one unit or contract test file
npx playwright install chromium
npm test                            # Playwright journeys in tests/*.spec.js
npx playwright test tests/session.spec.js
```

Playwright journeys need headed Chromium and Redis on `127.0.0.1:6379`, for example `docker run -d --name focalpoint-test-redis -p 6379:6379 redis:7`.

CI in `.github/workflows/test.yml` runs backend vitest, extension vitest, and Playwright. It does not run frontend tests or lint.

## Architecture

### Request flow

1. `extension/content.js` reads the page's URL, title, and text snippet, then messages `background.js`.
2. `background.js` adds the goal and sensitivity from the active session and calls `POST /api/classify`.
3. `backend/data/classification.js` checks Redis, then calls `claude-haiku-4-5` on a miss. Any Claude failure returns `ALLOW` and is not cached.
4. On `BLOCK`, `background.js` calls `/api/sessions/:id/block`, and `content.js` shows the overlay from `lib/content-helpers.js`.
5. Choosing "Proceed anyway" calls `/api/sessions/:id/override`, which increments the count and rewrites that page's cache entry to `ALLOW`.

### Backend

ES modules. `routes/` handles HTTP and validation, `data/` holds Mongo, Redis, and Anthropic access, and `middleware/` holds JWT auth, CORS, and the rate limiter factory. `validation.js` is shared by routes and the data layer.

- `app.js` calls `listen` when imported, and is where the limiters and CORS are mounted. `routes/index.js` mounts `/auth` and `/api`.
- The data layer throws plain strings. Routes compare those strings to choose a status code.
- The classification cache key is `sha256(url:goal:sensitivity)` with a 24-hour TTL.
- The `RATE_LIMIT_MAX` environment variable overrides all limits. The journey tests rely on it.

### Extension

Manifest V3, plain JavaScript.

- `chrome.storage.local` holds `token` and `activeSession`. `background.js` keeps an in-memory copy, reads storage lazily, and stays in sync through `storage.onChanged`. It deliberately doesn't load the session at service worker startup, because that raced with events on cold wake.
- `lib/` holds pure helpers as classic scripts with no `export`, because content scripts can't be ES modules. They publish `fpContentHelpers` and `fpPopupHelpers` on `globalThis`. Call them through that namespace: destructuring them into same-named consts is a redeclaration error in the shared content script scope.
- The backend URL is hardcoded in `background.js`, `popup.js`, and `manifest.json`.

### Frontend

Vite, React 18, TypeScript, shadcn/ui, and Tailwind, deployed to Vercel. `@/` maps to `frontend/src/`. Pages call the hardcoded Render backend URL directly with axios and keep the JWT in `localStorage`.

## Testing

**Backend**

- Tests sit next to their source as `*.test.js`.
- `test/globalSetup.js` starts one `mongodb-memory-server`, so `vitest.config.js` sets `fileParallelism: false`.
- Route tests use `test/buildTestApp.js`, which mounts the routes without limiters or CORS, and `test/authHelpers.js`. They can't import `app.js`, because it starts a server.
- `createSession` rejects a second active session, so tests needing several sessions insert them directly into the collection.

**Extension**

- `lib/*.test.js` tests pure helpers. Root `*.test.js` files are contract tests that use the fake `chrome` API in `test/chrome-fake.js`.
- `tests/global-setup.js` boots the real backend, Mongo, and a page server, and copies the extension with its backend URL rewritten to the local server.
- `tests/helpers/seed.js` writes decisions directly to Redis using the production cache key, so Anthropic is never called.
- `tests/helpers/backend-log.js` confirms classification ran by reading the backend's `Cached:` log line.

## Deployment

The backend runs on Render, the frontend on Vercel, and the extension is listed on the Chrome Web Store.
