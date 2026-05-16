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
npx playwright install chromium
npm test
```

There is no monorepo runner — CI runs backend vitest and extension Playwright separately.

## Architecture

### Backend ([backend/](backend/))

ES modules (`"type": "module"`). Three layers:

- [routes/](backend/routes/) — Express routers. [routes/index.js](backend/routes/index.js) mounts `/auth` (users), `/api` (sessions + classification), and a catch-all 404.
- [data/](backend/data/) — All Mongo + Redis + Anthropic access. Routes call into here; no DB code lives in routes.
- [middleware/](backend/middleware/) — `auth.js` (JWT), `corsConfig.js`, `limiters.js`.

Key things to know:

- **Rate limiters are a factory.** [middleware/limiters.js](backend/middleware/limiters.js) exports `createLimiters({ store })` — pass an injected `MemoryStore` in tests so state doesn't leak across cases. Per-route limits: global 60/min, auth 10/min, classify 100/min.
- **Classification flow** ([data/classification.js](backend/data/classification.js)): cache key is `sha256(url:goal:sensitivity)` with 24h TTL in Redis. Sensitivity (`lenient` / `standard` / `strict`) swaps the system prompt block. Model is `claude-haiku-4-5`, `max_tokens: 100`. **Fails open** — any Anthropic error, malformed JSON, or unknown decision returns `{decision: 'ALLOW', ...}` rather than blocking the user. `clearClassificationCache` is called on user override and **rewrites** the entry to `ALLOW` (not just delete) so the user isn't immediately re-blocked on the same page.

### Frontend ([frontend/](frontend/))

The frontend hardcodes the Render backend URL — there is no build-time env substitution.

### Extension ([extension/](extension/))

- **`chrome.storage.local` is the source of truth** for `activeSession`. [background.js](extension/background.js) keeps a lazy in-memory cache and uses `chrome.storage.onChanged` to stay in sync. Do **not** pre-warm the cache at SW startup — it races with cold-wake events (see the commented-out `init()` and the comment explaining why).
- The backend URL is hardcoded in both [background.js](extension/background.js) and [manifest.json](extension/manifest.json) `host_permissions`.

## Test suite status

The old test suite was deleted on 2026-05-16 (commits `chore: delete entire test suite…` and `chore(ci): pass when no test files exist`). It was unclear, mock-heavy, and the user wasn't confident in what it covered. CI passes when no test files exist, so absence of tests is **not** a regression — it's the starting state.

A new suite is being built from scratch under the rules below. Do not resurrect deleted tests.

## TDD Workflow

For every testable change, follow this sequence strictly — no skipping steps:

1. **Write the failing test first.** Show the test and confirm it fails before touching implementation.
2. **Show the failure output.** Paste the actual error so we both know the test is failing for the right reason.
3. **Write the minimum implementation to make it pass.** No extra changes.
4. **Show the passing output.** Confirm the test goes green.

## Testing rules

When proposing a test plan or writing tests, apply these rules and **surface the analysis in the response** — don't just follow them silently.

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

## Planning Rules

- Before starting any task, read all relevant files first. Resolve ambiguity by reading the code. Only ask clarifying questions if the answer cannot be found in the codebase or CLAUDE.md — and **batch questions into one message**.
- **Confidence threshold:** before proceeding on an assumption, be at least ~95% confident the task can be completed successfully. If not, ask — don't guess. A single batched clarification is cheaper than building on a wrong assumption.
- For every plan, state what it covers, what it deliberately leaves out, and what risks remain. Do not self-evaluate the plan — give the user the tradeoffs and let them decide.
- If a task involves changes to **4+ files or 3+ distinct areas** of the codebase, propose a chunked plan before starting. Group chunks by shared files, testing patterns, or area of the codebase. Explain why items belong together. Otherwise, just start working.
- For chunked plans: write a high-level overview of all chunks first. Expand each chunk into a detailed step-by-step **just-in-time** — right before executing that chunk, not all upfront. The detail will go stale otherwise.
- Execute chunks sequentially: open PR → review (via `pr-review`) → merge → start the next chunk. Do not stack multiple chunk PRs simultaneously.
