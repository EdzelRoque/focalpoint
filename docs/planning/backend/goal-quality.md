# Known issue: classification quality depends on how the session goal is written

**Status:** documented, deliberately deferred. Address after the extension test
suite (contracts + journeys) is done. Reported by the user during testing,
2026-07-07.

## The problem

Blocking results are inconsistent depending on how well the session goal was
written. The same page can be allowed or blocked depending only on whether the
user typed a broad goal ("work", "study") or a specific one ("write the intro
section of my history essay on the French Revolution").

- **Too broad:** almost everything is "tangentially helpful" to a goal like
  "work" — under lenient/standard rules the model lets distractions through.
- **Too specific:** genuinely useful adjacent resources (a general tutorial, a
  reference doc) can get blocked because they don't match the narrow phrasing.

## Why it happens (code-level)

In [backend/data/classification.js](../../../backend/data/classification.js):

- The goal is passed **verbatim** into the model's user message
  (`User's goal: ${sessionGoal}`). There is no reformulation, expansion, or
  quality check — the model's entire judgment anchors on the user's exact
  phrasing.
- The sensitivity rules (lenient/standard/strict) all reference "the goal"
  and assume it is well-specified. Vague goals make phrases like "remotely
  related" (lenient) or "wanders too far from the core goal" (standard)
  meaningless — there is no core to wander from.
- The model is `claude-haiku-4-5` with `max_tokens: 100` and only sees the
  goal + URL + title + a 500-char snippet — very little context to compensate
  for a vague goal.
- Side effect worth knowing: the Redis cache key is
  `sha256(url:goal:sensitivity)`, so the *same page* under differently-worded
  goals is cached separately. Consistent behavior per (goal, page) pair;
  inconsistent across wordings — which is what the user observes.

## Why this is deferred, not fixed now

1. **You can't tune a prompt you can't measure.** Any change (prompt wording,
   goal expansion, sensitivity rules) is guesswork without an evals set — a
   list of (goal, page, sensitivity, expected decision) cases to score
   against. Building that evals track is its own chunk.
2. **The journeys test layer already scopes this out by design** (see
   [../extension/journeys.md](../extension/journeys.md)): journeys seed the
   Redis cache with canned decisions and never call Anthropic. They ask "does
   the extension act correctly on a decision?", not "was the decision right?"
   Model quality is explicitly a separate evals track.
3. **No dependency either way.** The extension test suite neither blocks nor
   is blocked by this — finishing contracts + journeys first gives a safety
   net before touching classification behavior.

## Candidate fixes to evaluate later (not decided)

- **Evals first** (prerequisite for everything below): small dataset of
  goal/page/expected triples, scored on cache-bypassed `classify` calls.
- **Goal expansion at session start:** one extra model call when a session is
  created, turning the raw goal into a richer "focus profile" (topics that
  count as on-task / off-task) that classification prompts use instead of the
  raw string. Cost is once per session, not per page.
- **Prompt hardening:** instruct the classifier how to behave when the goal
  is vague (e.g. "if the goal is broad, judge by whether the page is a known
  entertainment/shopping context rather than topical match").
- **UX nudges in the popup/frontend:** minimum goal length, placeholder
  examples of good goals, or a "your goal is very broad — blocking may be
  loose" hint. (Client-side alone cannot fix this; it only improves inputs.)
