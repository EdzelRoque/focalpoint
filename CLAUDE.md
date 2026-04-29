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
- `config/mongoCollections.js` — collection getters for `users` and `sessions` in the `FocalPoint` DB. They call `db.collection(name)` per access — do not re-introduce a closure cache for the `Collection` object; on a driver reconnect a cached `Collection` stays bound to the dead client. The `MongoClient` and `_db` singletons in `mongoConnection.js` are the right (and only) memoization layer.
- `config/redisConnection.js` — single ioredis client.

`blockSensitivity` is an enum: `'lenient' | 'standard' | 'strict'`. It's part of the cache key, so changing sensitivity invalidates cached decisions automatically.

### Frontend layout
- `src/App.tsx` — all routes in one file: `/`, `/login`, `/register`, `/dashboard`, `/dashboard/sessions`, `/dashboard/settings`.
- `src/components/ui/` — shadcn/ui components (don't hand-edit without reason; regenerate via shadcn CLI).
- `src/pages/` — page-level components.
- Auth token stored in `localStorage`; axios calls target the Render URL directly.

### Extension layout
- `manifest.json` — MV3, permissions: `storage`, `tabs`; host permissions include `<all_urls>` and the Render backend.
- `popup.{html,js,css}` — session start/stop UI, login, stats display.
- `background.js` — service worker. **`chrome.storage.local` is the source of truth for `activeSession`**; the module-scoped variable is a lazy read-through cache kept in sync via a `chrome.storage.onChanged` listener. Always read through `getActiveSession()` (never the bare variable) — reading the bare variable hits a cold-wake race because the SW re-evaluates the file on every wake and event handlers can fire before any startup `await chrome.storage.local.get` resolves. All backend calls go through here so the content script never holds the JWT.
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
- User-route tests follow the same mocking shape as session-route tests EXCEPT they use the **real** `authMiddleware` — set `process.env.JWT_SECRET = 'test-secret'` in `beforeEach` and sign tokens with `jwt.sign({userId}, 'test-secret', {expiresIn: '7d'})`. Mocking auth defeats tests whose contract IS the user-binding (IDOR on `/auth/me`, mass-assignment guard on `/auth/settings`). Same principle applies to any future route test where token-derived identity is what's under test.
- Data-layer tests for `data/user.js` / `data/session.js` import the module under test directly (e.g. `await import('./user.js')`) rather than going through `data/index.js`. Importing `data/index.js` pulls in `data/classification.js`, which connects to Redis at module load. Direct imports plus a `vi.mock('../config/mongoCollections.js', ...)` keep the test isolated.
- Extension tests use **`@playwright/test`** in `extension/tests/`. They launch real headed Chromium with the unpacked extension loaded — headed mode is non-negotiable, MV3 extensions do not run in Playwright's headless mode. Backend traffic is mocked via `context.route('**/focalpoint-q8r5.onrender.com/**', ...)` — never hit the real backend from specs. Use the shared `seedSession` helper in `extension/tests/fixtures.js` rather than trying to set the background service worker's in-memory state directly: `background.js` runs as an ES module, so module-scoped variables like `activeSession` cannot be assigned via `sw.evaluate()`. `seedSession` works around this by writing to `chrome.storage.local` — `background.js` reads through `getActiveSession()` and its `chrome.storage.onChanged` listener keeps the in-memory cache in sync.
- Frontend logic that needs unit testing should be extracted to `frontend/src/lib/` and tested as a pure helper (vitest under jsdom). Avoid render tests of `frontend/src/pages/*` — recharts, framer-motion, and react-router make jsdom render tests fragile. Vitest config picks up `src/**/*.{test,spec}.{ts,tsx}`, so colocating a `.test.ts` next to the helper works.
- `frontend/ npm run lint` has pre-existing errors (mostly `@typescript-eslint/no-explicit-any` in `pages/*` and `no-require-imports` in `tailwind.config.ts`). When touching a frontend file, verify no NEW lint errors are introduced — scope the check with `npx eslint <files>` rather than reading the full repo run, which is too noisy to diff against.
- `TODO.md` and `HANDOFF.md` at the repo root are gitignored personal scratch files — never `git add` them. Other Markdown at the repo root (CLAUDE.md, README) is tracked normally.
- CI lives in `.github/workflows/test.yml` and runs on PR and push to `main`. Two parallel jobs: `backend-test` runs `npm install && npm test` in `backend/`; `extension-test` installs Playwright + Chromium with system deps and runs `xvfb-run npm test` in `extension/` (xvfb is required because extension specs need headed Chrome). The backend job intentionally uses `npm install` rather than `npm ci` — the lock file is generated on Windows, and `vitest@4.x` pulls in `rolldown` with platform-native bindings; Linux CI needs different `@emnapi` versions that are absent from the Windows-generated lock file, which causes `npm ci` to fail.

## TDD Workflow

For every testable change, follow this sequence strictly — no skipping steps:

1. **Write the failing test first.** Show the test and confirm it fails before touching implementation.
2. **Show the failure output.** Paste the actual error so we both know the test is failing for the right reason.
3. **Write the minimum implementation to make it pass.** No extra changes.
4. **Show the passing output.** Confirm the test goes green.

**When NOT to test:** Startup crash guards and behaviors that can't be meaningfully unit tested get a diff review + explanation instead. Knowing when not to test is a professional skill — don't force it.

**Mock discipline:**
- Only mock external dependencies (MongoDB, Redis, Anthropic API).
- Never mock your own application code.
- For pure middleware tests, use real Express + supertest with zero mocks.

## Test Creation / Planning Rules

When proposing a test plan or writing tests, apply these rules and surface the analysis to me — silent compliance is a failure mode.

1. **No third-party library tests.** If a proposed test would pass or fail based on whether `jsonwebtoken`, `bcrypt`, `express`, `mongodb`, etc. behaves correctly — drop it. We trust libraries; we test our wiring into them. Example: "sign a token with secret X, verify with secret Y, expect throw" tests jsonwebtoken. "Hand our middleware a wrong-secret token, expect 401" tests our wiring. If unsure which side of the line a test sits on, flag it explicitly and ask before writing it.
2. **Flag implementation-coupled tests as pins.** If an assertion is on the *shape* of a call (spy on arguments, exact key sets in an update document, exact query shape) rather than the observable outcome, label it a "pin," not a behavioral test. Propose a behavioral alternative if one exists. Only keep the pin if no behavioral alternative exists under current constraints (e.g. mock-only-externals + no real DB), and say why.
3. **Flag redundancy within a plan.** If test B's failure modes are already covered by tests A and C in the same plan, recommend dropping B. Coverage of failure modes is what matters, not coverage of lines or behaviors. Use the heuristic: "does this test catch something no other test catches?"
4. **Flag cost-vs-fidelity tradeoffs.** For each real dependency the plan uses (bcrypt, real network, real filesystem, real timers, real anything slow), state the per-test cost and propose a split: which tests need real fidelity, which can use a faster substitute (e.g. bcrypt at saltRounds=4 for ~5ms hashing in tests that only need format + roundtrip), and why. Don't fake the dependency entirely if the test's contract depends on its real behavior.
5. **Push back when warranted.** If I ask for a test or approach you'd push back on if I were a senior engineer — say so. State the concern, propose the alternative, then defer to my call. Examples worth pushing back on: testing library behavior (rule 1), implementation-coupled assertions when a behavioral one exists (rule 2), redundant tests (rule 3), pinning stylistic choices as if they were security contracts (e.g. case-sensitive `Bearer` matching).

Apply these in *both* directions: when drafting a plan, surface them up front; when reviewing my asks, raise them before writing the test.

## Critical Rules for Claude
- Never modify code unless explicitly asked
- Always explain what you're about to do before doing it
- When writing tests, match the actual current behavior, not assumed behavior

## Git Workflow Rules
- For trivial, non-app changes (docs, CLAUDE.md, README, config files, skill files) — skip the branch/PR flow. Commit directly on main and push. No PR needed.
- Use the full branch → commit → PR flow for anything that touches application code, tests, routes, data layer, frontend, or the extension.

## Skill Usage Rules
- Use the `git-commit` skill (via the Skill tool) for commits — do not run `git commit` directly.
- Use the `pr-review` skill for PR reviews — do not improvise a review.
- `gh pr create` is fine for opening PRs unless a `git-commit` skill flow covers it.

## Planning Rules
- Before starting any task, read all relevant files first. Resolve ambiguity by reading the code. Only ask clarifying questions if the answer cannot be found in the codebase or CLAUDE.md — and batch questions into one message.
- Confidence threshold: before proceeding on an assumption, be at least ~95% confident the task can be completed successfully. If not, ask — don't guess. This overrides any tendency toward minimizing questions: a single batched clarification is cheaper than building on a wrong assumption.
- For every plan, state what it covers, what it deliberately leaves out, and what risks remain. Do not self-evaluate the plan — give me the tradeoffs and let me decide.
- If a task involves changes to 4+ files or 3+ distinct areas of the codebase, propose a chunked plan before starting. Group chunks by shared files, testing patterns, or area of the codebase. Explain why items belong together. Otherwise, just start working.
- For chunked plans, write a high-level overview of all chunks first. Expand each chunk into a detailed step-by-step just-in-time — right before executing that chunk, not all upfront. The detail will go stale otherwise.
- Execute chunks sequentially: open PR → review (via the `pr-review` skill) → merge → start the next chunk. Do not stack multiple chunk PRs simultaneously.