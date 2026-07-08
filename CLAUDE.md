# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo

FocalPoint is an AI-powered focus assistant. User declares a goal + duration in the Chrome extension; the backend classifies every page they visit against that goal using `claude-haiku-4-5`; off-topic pages get a block overlay with an override.

Three independent deployables, each with its own `package.json` — no root workspace, run `npm install` per subdirectory:

- [backend/](backend/) — Node + Express + MongoDB + Redis + Anthropic SDK (ES modules). Deployed to Render.
- [frontend/](frontend/) — Vite + React 18 + TypeScript + shadcn/ui + Tailwind. Deployed to Vercel. Path alias `@/` → `frontend/src/`. Dev server on port 8080.
- [extension/](extension/) — Chrome MV3, plain JS service worker + content script (no build step).

## Commands

**Backend** (`backend/`) — needs `MONGO_URI`, `REDIS_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY` in `.env`; `PORT` defaults to 3000.

```bash
npm start                                          # node app.js
npm test                                           # vitest + supertest
npx vitest run path/to/file.test.js -t "name"      # single test
```

**Frontend** (`frontend/`):

```bash
npm run dev      # Vite on :8080
npm run build
npm run lint     # eslint
npm test         # vitest under jsdom
```

**Extension** (`extension/`) — load unpacked from `chrome://extensions` (Developer mode → Load unpacked → point at `extension/`); reload after edits. Tests use real headed Chromium (MV3 can't run headless); CI uses xvfb.

```bash
npm run test:unit                # vitest + jsdom: lib/*.test.js units + root *.test.js contract tests
npx playwright install chromium
npm test                         # Playwright journeys (tests/*.spec.js per playwright.config.js)
```

There is no monorepo runner — CI runs backend vitest and extension vitest + Playwright separately.

If CI `npm ci` fails with missing packages, the Windows-generated lockfile dropped Linux-only optional deps — regenerate with a clean install (delete `node_modules` + lockfile).

## Architecture

### Backend ([backend/](backend/))

ES modules (`"type": "module"`). Three layers:

- [routes/](backend/routes/) — Express routers. [routes/index.js](backend/routes/index.js) mounts `/auth` (users), `/api` (sessions + classification), and a catch-all 404.
- [data/](backend/data/) — All Mongo + Redis + Anthropic access. Routes call into here; no DB code lives in routes.
- [middleware/](backend/middleware/) — `auth.js` (JWT), `corsConfig.js`, `limiters.js`.

Key things to know:

- **Rate limiters are a factory.** [middleware/limiters.js](backend/middleware/limiters.js) exports `createLimiters({ store })` — pass an injected `MemoryStore` in tests so state doesn't leak across cases. Per-route limits: global 60/min, auth 10/min, classify 100/min.
- **Classification flow** ([data/classification.js](backend/data/classification.js)): cache key is `sha256(url:goal:sensitivity)` with 24h TTL in Redis. Sensitivity (`lenient` / `standard` / `strict`) swaps the system prompt block. Model is `claude-haiku-4-5`, `max_tokens: 100`. **Fails open** — any Anthropic error, malformed JSON, or unknown decision returns `{decision: 'ALLOW', ...}` rather than blocking the user, and the fail-open result is **NOT** cached so a transient failure can be retried. `clearClassificationCache` is called on user override and **rewrites** the entry to `ALLOW` (not just delete) so the user isn't immediately re-blocked on the same page.
- **Route HTTP-status conventions.** Resource-creating POSTs return **201**. User-facing conflicts return **409** by mapping the data layer's thrown string in the route's `catch` (e.g. `'Username is already taken'`, `'You already have an active session'`, `'Session is already ended'`). Data-layer `'... not found'` throws map to **404**. Don't let user-facing errors fall through to **500** — 500 is reserved for genuinely unexpected failures.

### Frontend ([frontend/](frontend/))

The frontend hardcodes the Render backend URL — there is no build-time env substitution.

### Extension ([extension/](extension/))

- **`chrome.storage.local` is the source of truth** for `activeSession`. [background.js](extension/background.js) keeps a lazy in-memory cache and uses `chrome.storage.onChanged` to stay in sync. Do **not** pre-warm the cache at SW startup — it races with cold-wake events (see the commented-out `init()` and the comment explaining why).
- The backend URL is hardcoded in both [background.js](extension/background.js) and [manifest.json](extension/manifest.json) `host_permissions`.
- **Pure helpers live in [extension/lib/](extension/lib/)** as classic scripts (no `export` — content scripts can't be ESM) publishing `fpContentHelpers` / `fpPopupHelpers` on `globalThis`; the manifest and popup.html load them before `content.js` / `popup.js`. In content scripts, call through the namespace — destructuring into same-named top-level consts is a redeclaration SyntaxError in the shared scope.
- jsdom lacks `innerText`; [extension/test/setup.js](extension/test/setup.js) shims it to `textContent`. Real innerText semantics are the Playwright layer's job.

## Test suite status

The old test suite was deleted on 2026-05-16 (unclear, mock-heavy). **Do not resurrect deleted tests.** The new suite so far: backend vitest (routes + data layer + validation), extension unit tests (`extension/lib/*.test.js`), and extension contract tests (`extension/*.test.js`, colocated with the entry scripts; shared `chrome.*` fake in `extension/test/chrome-fake.js`). Extension Playwright journeys and frontend tests don't exist yet — their absence is not a regression.

`docs/planning/` holds planning prompts, finalized specs, and deferred-problem docs (goal-quality, classify-retry-livelock, extraction-research) — check it before re-diagnosing or fixing known-deferred issues.

## TDD Workflow

For every testable change, follow this sequence strictly — no skipping steps:

1. **Write the failing test first.** Show the test and confirm it fails before touching implementation.
2. **Show the failure output.** Paste the actual error so we both know the test is failing for the right reason.
3. **Write the minimum implementation to make it pass.** No extra changes.
4. **Show the passing output.** Confirm the test goes green.

Red-first applies to agreed behavior changes. Tests that pin existing behavior arrive green — verify with a brief mutation check (break the line, see the test fail, revert) instead of forcing red. A pinning test that is unexpectedly red is a spec/code disagreement — surface it before changing code.

## Testing rules

When proposing a test plan or writing tests, apply these rules and **surface the analysis in the response** — don't just follow them silently.

**Test file location (backend):** colocate `*.test.js` next to the source file it tests (e.g., `data/classification.js` → `data/classification.test.js`). Extension Playwright tests stay in their existing structure.

**Backend Mongo test harness:** data-layer tests run against `mongodb-memory-server` started in [backend/test/globalSetup.js](backend/test/globalSetup.js); [backend/vitest.config.js](backend/vitest.config.js) sets `fileParallelism: false` because all test files share that one in-memory DB. Don't add per-test Mongo mocks, and don't re-enable file parallelism — both cause cross-test DB collisions.

**Backend route test harness:** use [backend/test/buildTestApp.js](backend/test/buildTestApp.js) (`buildTestApp()` mounts `configRoutes` on a bare express app — no `listen`, no rate limiters) for supertest. Use [backend/test/authHelpers.js](backend/test/authHelpers.js) (`registerAndSign({ username?, email?, password? })` → `{ user, token }`) to get a JWT for authed routes. Do **not** import `backend/app.js` in tests — it calls `app.listen` at module load and asserts on env vars.

**Seeding sessions in tests:** `createSession` rejects when the user already has an active session, so tests that need multiple sessions per user, an inactive session, or specific `startTime` values must seed directly via `(await sessions()).insertOne({...})` rather than going through the data layer.

**How to write tests**

- One assertion per concept. Many small focused tests beat one giant test.
- Arrange / Act / Assert. Keep the three parts visually separated.
- Test names describe behavior, not implementation.
  - Good: `"returns 400 when email is missing"`
  - Bad: `"test validateEmail2"`
- Tests must be independent. Each test sets up its own world.
- Don't test the framework. Test our logic.
- **Prefer real over mocked.** Only mock genuinely external services (Mongo, Redis, Anthropic API, network calls). Never mock our own code. For pure middleware or pure function tests, use **zero mocks**.
- For rate limiters specifically, inject a fresh `new MemoryStore()` via `createLimiters({ store })`. Do not use `vi.resetModules()` as a workaround.
- If you can't explain in one sentence what a test would catch if it broke, don't write it. When proposing tests, state in one sentence what regression each test catches. If two tests catch the same regression, flag the redundancy.
- If a test is hard to write, flag the code as a refactor candidate rather than complicating the test.
- If a behavior genuinely cannot be unit tested (e.g. a startup crash guard), show a diff and explain why rather than forcing a test.
- Coverage is a guide, not a goal. Focus on behavior that matters.

**How to work with the user on tests**

- When expected behavior is ambiguous, **ask before guessing.** List unclear cases as questions.
- Before writing tests for a function, **restate in plain English** what you think it does and wait for confirmation.
- Flag anything that looks like a bug or unintended behavior rather than encoding it as "correct" in a test.

## Git Workflow

- **Trivial, non-app changes** (docs, CLAUDE.md, README, config files, skill files): commit directly on `main` and push. No branch, no PR.
- **Anything touching application code, tests, routes, data layer, frontend, or extension**: full branch → commit → PR → review → merge flow.

## Skill Usage

- Use the `git-commit` skill (via the Skill tool) for commits — do not run `git commit` directly.
- Use the `pr-review` skill for PR reviews — do not improvise a review.
- Use the `update-claudemd` skill for CLAUDE.md updates — keep it lean; skip anything already communicated by code comments, .gitignore, or skills.

## Planning Rules

- Before starting any task, read all relevant files first. Resolve ambiguity by reading the code. Only ask clarifying questions if the answer cannot be found in the codebase or CLAUDE.md — and **batch questions into one message**.
- **Confidence threshold:** before proceeding on an assumption, be at least ~95% confident the task can be completed successfully. If not, ask — don't guess. A single batched clarification is cheaper than building on a wrong assumption.
- For every plan, state what it covers, what it deliberately leaves out, and what risks remain. Do not self-evaluate the plan — give the user the tradeoffs and let them decide.
- For tasks Claude judges too big to complete in one session without burning excessive tokens, propose a chunked plan before starting; otherwise just start working. Don't chunk for token-budget reasons that don't actually exist.
- For chunked plans: write a high-level overview of all chunks first. Expand each chunk into a detailed step-by-step **just-in-time** — right before executing that chunk, not all upfront. The detail will go stale otherwise.
- Execute chunks sequentially: open PR → review (via `pr-review`) → merge → start the next chunk. Do not stack multiple chunk PRs simultaneously.
