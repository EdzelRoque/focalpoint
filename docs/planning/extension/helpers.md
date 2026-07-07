Planning phase for EXTENSION PURE HELPERS — the unit-test layer.
Read CLAUDE.md first for my testing rules and working preferences.

A "pure helper" for the extension is a function whose behavior is fully
determined by its inputs and (optionally) the DOM it can read. No `fetch`,
no `chrome.*` calls, no `setInterval`/`setTimeout` side effects that outlive
the call. These are the equivalent of `backend/validation.js` — small,
isolated logic that can be exercised with vitest + jsdom and zero mocking
of our own code.

The extension lives in `extension/`. The candidates I already have in mind
(you should still scan the code and confirm — do not just trust this list):

- `getPageSnippet()` in `extension/content.js` — reads the DOM, returns a
  string. Pure function of DOM state, jsdom-testable.
- The elapsed-time formatting inside `startElapsedTimer` in
  `extension/popup.js` (the `elapsed → "HH:MM:SS" | "MM:SS"` math).
  Currently inline inside `update()`. Likely a refactor candidate.
- The form-validation checks inside the popup's `submit` handlers
  (login empty-field check; session goal/duration checks). Currently
  inline. Likely a refactor candidate.

If you find other pure helpers I missed, include them. If a "helper" is
inline inside a larger function and would require refactoring to test
directly, flag it as a **refactor candidate** rather than proposing a
convoluted test — per CLAUDE.md ("If a test is hard to write, flag the
code as a refactor candidate rather than complicating the test").

For each helper (or refactor candidate), output in exactly this format:

---
### functionName(param1, param2)
**Location:** path/to/file.js:lineNumber
**Status:** [exported / inline — refactor candidate / already testable as-is]

**What I think it does:** [one sentence]

**Happy path:**
- input: [example] → returns: [expected]

**Edge cases:**
- input: [example] → returns: [expected]

**Invalid inputs:**
- input: [example] → returns: [expected]

**🚩 Flagged behavior:** [possible bugs, unintended behavior, or "none"]

**❓ Questions for you:** [ambiguities I need you to resolve, or "none"]
---

Rules:
- Do NOT write any tests. Spec only.
- Do NOT propose refactors as part of this doc — just flag candidates so I
  can decide separately.
- Helpers get up to 3-6 test cases each (this is a limit, not a range).
- If the extension has fewer than ~3 genuinely pure helpers, say so.
  Don't pad the list with things that aren't pure.
