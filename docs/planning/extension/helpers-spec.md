# Extension Pure Helpers — Unit Test Spec (finalized after review)

Spec produced from the planning prompt in [helpers.md](helpers.md), reviewed and
finalized with the user on 2026-07-07. The specs below encode **agreed intended
behavior**, which the current code does not fully match — per TDD, tests get
written red against this spec first, then minimal code changes make them green.

## Structural finding that affects every candidate

**Nothing in the extension is importable as-is.** Each file has a blocker:

- `content.js` — plain (non-module) content script; executes `init()` and registers `chrome.runtime.onMessage` listeners at top level.
- `popup.js` — loaded via plain `<script src="popup.js">` (popup.html:130); grabs ~20 DOM elements at top level and calls `chrome.storage` on load.
- `background.js` — module SW, but contains **no pure helpers**.

Every candidate below is a **refactor candidate** (extraction into an importable file). Extraction mechanics are decided in the implementation chunk, not here.

## Resolved decisions (from user review)

1. **Infra:** add `vitest` + `jsdom` devDependencies to `extension/`, with a vitest config whose include glob is disjoint from Playwright's (exact naming decided at implementation time).
2. **jsdom `innerText` gap:** jsdom doesn't implement `innerText`. Shim it in the vitest setup file (`Element.prototype.innerText` getter delegating to `textContent`) — patches the environment, not our code. Accepted caveat: unit tests won't catch innerText-vs-textContent divergence; the Playwright layer covers real Chrome.
3. **`formatElapsed`:** negative/NaN elapsed clamps to `"00:00"` (intended behavior; current code prints garbage).
4. **`validateSessionInput`:** duration must be **digits only** (`/^\d+$/` after trim) — no letters, no decimal points, no exponent notation — then range-checked 1–480. `"1e2"` and `"2.5"` are invalid (current code coerces/truncates them).
5. **`injectBlockOverlay`:** included, with 5 injection-only tests + 1 proceed-click test using a stubbed global `chrome` (genuinely external boundary — allowed by the mocking rules).
6. **`getPageSnippet`:** tiered fallback kept; spec adds (a) explicit container priority `main` → `article` → `[role="main"]` → `#content` (sequential tries, not one combined document-order query), (b) whitespace normalization (collapse `\s+` → single space, trim) applied **before** the >20-char gate and the 500-char slice, (c) non-empty guarantee: final fallback `document.title`, then `window.location.hostname`. Snippet stays at 500 chars.
7. **Goal-quality inconsistency** (broad vs. specific session goals → inconsistent blocking): real issue, but out of scope for this unit layer — tracked separately as a backend classification-prompt/sensitivity concern.

---

## The spec

---
### getPageSnippet()
**Location:** extension/content.js:7
**Status:** inline — refactor candidate (standalone function, but the file can't be imported without executing top-level `chrome.*` side effects)

**What it should do (agreed spec):** Return up to 500 chars of whitespace-normalized page text for classification: try containers in priority order `main` → `article` → `[role="main"]` → `#content` (first whose normalized text exceeds 20 chars wins); else concatenated `p/h1/h2/h3` text in document order; else the meta description; else `document.title`; else `window.location.hostname`. **Never returns an empty string.**

**Happy path:**
- input: DOM with `<main>` containing 600 chars of text full of newlines/indentation → returns: first 500 chars of the whitespace-normalized text

**Edge cases:**
- input: `<article>` (short but >20 chars) appearing *before* a content-rich `<main>` → returns: the `<main>` text (explicit priority beats document order — this catches the combined-selector regression)
- input: `main` with ≤20 chars of normalized text, real paragraphs present → returns: paragraph text (too-short tier falls through)
- input: no containers; paragraphs + headings totalling >500 chars → returns: concatenated `p/h1-h3` text capped at 500
- input: no containers, no paragraph text >20 chars, `<meta name="description">` with >20 chars → returns: trimmed meta content

**Invalid inputs:**
- input: completely empty page, empty `document.title` → returns: `window.location.hostname` (non-empty guarantee — this is the fix for the silent-skip bug where `""` made background.js:64 reject the payload and the page was never classified)

**🚩 Flagged behavior:** current code returns `""` on empty pages (bug, fixed by this spec), uses document-order container matching (fixed by this spec), doesn't normalize whitespace (fixed by this spec), and doesn't trim the meta branch (fixed by normalization). The `document.title` fallback tier is exercised implicitly but has no dedicated case — 6-case limit; hostname case is the regression-richer one.

**❓ Questions for you:** none — resolved in review.
---

---
### formatElapsed(elapsedSeconds) — currently inline math in `startElapsedTimer`'s `update()`
**Location:** extension/popup.js:59-68
**Status:** inline — refactor candidate (pure `elapsed → string` math tangled with `Date.now()`, `setInterval`, and a DOM write)

**What it should do (agreed spec):** Convert elapsed whole seconds to zero-padded `"MM:SS"` under one hour, `"HH:MM:SS"` at one hour or more; negative or NaN input clamps to `"00:00"`.

**Happy path:**
- input: `125` → returns: `"02:05"`

**Edge cases:**
- input: `3599` → returns: `"59:59"` (last second before format switch)
- input: `3600` → returns: `"01:00:00"` (boundary flips to HH:MM:SS)
- input: `90000` (25h) → returns: `"25:00:00"` (hours field grows past 2 digits, no wrap)

**Invalid inputs:**
- input: `-5` (startTime in the future — clock skew / bad server timestamp) → returns: `"00:00"` (clamp; current code prints `"-1:-5"`)
- input: `NaN` (unparseable `session.startTime`) → returns: `"00:00"` (clamp; current code prints `"NaN:NaN"`)

**🚩 Flagged behavior:** clamping is agreed intended behavior; the two invalid-input tests will be red against current code.

**❓ Questions for you:** none — resolved in review.
---

---
### validateLoginFields(email, password) — currently inline in the login submit handler
**Location:** extension/popup.js:121-128
**Status:** inline — refactor candidate

**What it should do (agreed spec):** After trimming, both email and password must be non-empty; otherwise invalid ("Please fill in all fields.") and no request is sent. No email-format check — deliberate; backend validates format, popup only guards empty submissions.

**Happy path:**
- input: `("a@b.com", "hunter22")` → returns: valid

**Edge cases:**
- input: `("a@b.com", "   ")` (whitespace-only password) → returns: invalid (trim happens before the check)

**Invalid inputs:**
- input: `("", "")` → returns: invalid

**🚩 Flagged behavior:** none. Deliberately thin — 3 cases, no padding.

**❓ Questions for you:** none — approved as-is.
---

---
### validateSessionInput(goal, duration) — currently inline in the session-start submit handler
**Location:** extension/popup.js:164-179
**Status:** inline — refactor candidate

**What it should do (agreed spec):** Goal is required (trimmed non-empty). Duration is optional (empty → session created with `null` duration); if provided, it must be **digits only** (`/^\d+$/` after trim — no letters, decimal points, or exponent notation) and between 1 and 480 inclusive.

**Happy path:**
- input: `("write essay", "25")` → returns: valid, duration `25`
- input: `("write essay", "")` → returns: valid, duration `null` (optional)

**Edge cases:**
- input: `("write essay", "1")` and `("write essay", "480")` → returns: valid (inclusive bounds)
- input: `("write essay", "0")` / `("write essay", "481")` → returns: invalid (out of range)

**Invalid inputs:**
- input: `("   ", "25")` (whitespace-only goal) → returns: invalid ("Please enter a goal…")
- input: `("write essay", "1e2")` / `("write essay", "2.5")` → returns: invalid (digits-only rule; current code accepts these and silently sends `parseInt` truncations — 1 and 2 respectively — these tests will be red)

**🚩 Flagged behavior:** the digits-only rule is agreed intended behavior replacing the current `isNaN` + `parseInt` coercion. Goal-quality validation (broad vs. specific goals) is **out of scope** — tracked separately as a backend classification concern (resolved decision 7).

**❓ Questions for you:** none — resolved in review.
---

---
### injectBlockOverlay(reason, strictMode)
**Location:** extension/content.js:40
**Status:** inline — refactor candidate. Near-pure: injection is pure DOM; `chrome.runtime.sendMessage` appears only inside the proceed button's click handler. **Included by user decision** — it carries the XSS guard, the highest-value jsdom target in the extension.

**What it should do (agreed spec):** Append a full-screen block overlay showing the block reason as plain text, with a "Go back" button and — unless strictMode — a "Proceed anyway" button; do nothing if an overlay already exists. Clicking proceed sends the `override_page` message with the current URL and removes the overlay.

**Happy path:**
- input: `("Off-topic: social media", false)` → `#focalpoint-overlay` exists in `document.body`, `#fp-reason` textContent is the reason, both `#fp-go-back` and `#fp-proceed` present

**Edge cases:**
- input: `(undefined, false)` → `#fp-reason` shows the default message ("This page does not appear to be related…")
- input: `("reason", true)` (strict mode) → no `#fp-proceed` button
- input: called twice in a row → exactly one `#focalpoint-overlay` in the DOM (dedupe guard)
- action: click `#fp-proceed` (with stubbed global `chrome`) → `chrome.runtime.sendMessage` called with `{ action: 'override_page', payload: { url: <current url> } }` and the overlay is removed from the DOM

**Invalid inputs:**
- input: `('<img src=x onerror=alert(1)>', false)` (hostile model output as reason) → rendered as literal text via `textContent`, **not** parsed as HTML (regression guard for content.js:117-119)

**🚩 Flagged behavior:** none — the `textContent` assignment is correct today; these tests keep it that way. Go-back click (`history.back()`) deliberately untested — that would test the browser.

**❓ Questions for you:** none — resolved in review (injection + proceed-click).
---

## Considered and excluded (not padded into the list)

- `showError` / `hideError` (popup.js:33-41) — pure, but two-line DOM setters; a test would restate the implementation.
- `showView` (popup.js:43-51) — reads module-level DOM globals captured at script load; not a function of its inputs. Playwright territory.
- `stopElapsedTimer` / `startElapsedTimer` shell (popup.js:54-80) — interval lifecycle; the pure part is `formatElapsed`.
- All of `background.js` — `chrome.storage` cache + fetch orchestration. Integration territory.
- `classify_page` and stale-response guards (content.js:139-180) — `chrome.runtime` messaging + timers throughout.

**Total: 27 test cases across 5 helpers** (getPageSnippet 6, formatElapsed 6, validateLoginFields 3, validateSessionInput 6, injectBlockOverlay 6 — each within the 6-case limit).

## Scope and risks

- **Covers:** the complete pure-helper inventory of all 3 extension source files; agreed intended-behavior specs (several deliberately red against current code: snippet non-empty guarantee + container priority + normalization, elapsed clamp, digits-only duration).
- **Leaves out (deliberately):** refactor/extraction design (implementation-chunk decision), test code itself, the Playwright/E2E layer, background.js, and the goal-quality classification concern (tracked separately, backend-side).
- **Risks:** extraction for content scripts is nontrivial (MV3 content scripts aren't ES modules) — if it turns out ugly, some cases may migrate to the Playwright layer; the innerText shim means unit tests assert shimmed behavior, with real-Chrome divergence left to Playwright.

## Implementation plan (separate branch/PR)

For each helper — failing vitest run shown first (red, failing for the right reason), minimal extraction/implementation, passing run shown (green), per the CLAUDE.md TDD sequence. Full `vitest` + existing Playwright suite must both pass before PR.
