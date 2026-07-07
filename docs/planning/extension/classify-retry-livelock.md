# Known bug: classification retry livelocks on pages with ever-changing text

**Status:** documented, deliberately deferred. Fix when `content.js`
orchestration gets test coverage (contracts/journeys chunks) — encode as a
failing test first per the TDD workflow, then fix. Found by the extraction
research on 2026-07-07 (see [extraction-research.md](extraction-research.md)).

## The problem, plain English

On pages whose visible text never stops changing — social feeds, live
scores, stock tickers, chat apps — the extension can get stuck in a loop
where it *forever postpones* classifying the page. The user switches to an
off-topic tab, and no overlay ever appears, with no error and nothing in
the stats. The extension silently fails at its one job on exactly the kind
of page (infinite feeds) it most needs to catch.

## Why it happens (code-level)

In [extension/content.js](../../../extension/content.js), `classify_page`
has a retry guard meant to catch slow-rendering SPAs:

```js
if (pageTitle === lastClassifiedTitle && pageSnippet !== lastClassifiedSnippet) {
  setTimeout(classify_page, 1000);
  return;
}
```

The intent: "same title but different content than last time — the page is
probably still rendering, try again in a second." The flaw: on a feed, the
snippet is *always* different on every check (new posts loaded, ticker
moved), so the condition is true every time, the function reschedules
itself every second, and the actual classification call is never reached.
The retry never settles because it's waiting for content stability that
never comes.

Trigger conditions: any `tab_change` / `spa_change` / YouTube re-entry to a
page whose title matches the last classified title while its text churns.

## The agreed long-term fix (not decided in detail)

Replace the retry hack (and the fixed 1s delays) with quiescence detection
that has a **hard cap**: watch the DOM for mutations and classify when it
goes quiet for ~300-500ms, **or after 3s regardless** — the cap guarantees
feeds get classified even though they never go quiet. Full design in
[extraction-research.md](extraction-research.md) §3 (timing architecture).

A minimal interim fix (if needed before the timing rework): bound the
retries — e.g. allow one deferral per navigation event, then classify with
whatever snippet is current. To be hashed out when specced.

## Where it gets fixed

- The `classify_page` flow (including this guard) falls under the
  **contracts** layer (`docs/planning/extension/contracts.md`) — spec the
  intended retry behavior there, write the failing test, then fix.
- The **journeys** layer should include a Tier 1/2 case: "switch to an
  already-open off-topic feed-like tab → overlay still appears", which is
  the user-visible regression this bug causes.
