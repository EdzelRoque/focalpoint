# Research: page-content extraction for accurate classification

**Status:** research + agreed direction, deferred. Implement as an
"extraction v2" chunk AFTER the extension test suite (contracts + journeys)
and the evals track exist. Produced by an expert research agent 2026-07-07;
recommendation reviewed and endorsed in-session.

## TL;DR recommendation (the opinion)

The current extractor is a sound v1 — keep it until the safety net exists.
Then upgrade in this order:

1. **Structured snippet instead of a text wall.** Same single `pageSnippet`
   string (no API change), but built from labeled fields:
   `H1: … | Type: VideoObject — … | Desc: … | Body: …`. H1 becomes a distinct
   field (rendered DOM → always fresh after SPA navs); head metadata
   (og:description, JSON-LD @type) is used **only when fresh** (cheap test:
   og:title roughly matches current document.title, else it's the previous
   route's metadata).
2. **URL normalization** — strip `utm_*`/`fbclid`/`gclid` before sending;
   improves Redis cache hit rate for free.
3. **Two tiny site adapters:** YouTube (h1 video title + channel name — the
   current `#content` grab mixes in recommendation-sidebar titles, which is
   exactly the off-topic bait that poisons a relevance judgment) and Reddit
   (parse subreddit + slug from the URL — dodges its shadow DOM entirely).
4. **Body text via TreeWalker, not innerText**, with skip rules
   (script/style, `[role=dialog]`, `[aria-modal]`, id/class matching
   `/cookie|consent|gdpr|paywall/i`, link-density > 0.5 blocks) and a smaller
   budget (~200-300 chars) — body text is the tie-breaker, not the star.
   Bonus: TreeWalker/textContent works natively in jsdom, removing the
   innerText shim caveat from the unit layer.
5. **Timing rework:** replace both fixed 1s delays and the title/snippet
   retry hack with quiescence detection — a `<title>` MutationObserver plus
   a body MutationObserver with 300-500ms quiet-period debounce and a **3s
   hard cap** (the cap is what fixes the livelock bug below). In the
   background SW, use `webNavigation.onHistoryStateUpdated` (fires for SPA
   pushState; needs the `webNavigation` permission, which adds **no new
   install warning** because `tabs` is already declared). Keep the YouTube
   `yt-page-data-updated` listener as a fast path with quiescence as backup
   (the yt-* events are unofficial internals).
6. **Session-local url→decision memo** so tab switches re-show a cached
   overlay without re-hitting the backend.

## 🐛 Real bug found by this research (fix in the contracts/journeys work)

The retry hack in `extension/content.js` (`pageTitle === lastClassifiedTitle
&& pageSnippet !== lastClassifiedSnippet` → re-schedule in 1s) **livelocks on
pages whose text never stops changing** (feeds, live tickers, chat): every
re-check sees a changed snippet and defers again, so the page is never
re-classified after a tab_change. Should be specced + fixed when content.js
orchestration gets test coverage; the long-term fix is the quiescence-with-
hard-cap timing above.

## Explicitly NOT worth doing (agreed overkill)

- Bundling Mozilla Readability or any article-extraction scoring pass — we
  need a topic hint, not a clean article.
- `all_frames: true` / iframe harvesting — one classification per ad iframe.
- Shadow-root piercing — Reddit is the only verified major offender and its
  URL carries the signal; closed roots are unreachable anyway.
- MAIN-world pushState/Navigation-API hooks — `webNavigation` in the SW does
  it with less footprint.
- Screenshots/OCR for canvas apps (Google Docs) — document.title is
  sufficient ("Essay draft - Google Docs") and free.
- Raising the 500-char budget — spend structure, not bytes; the classifier
  is a 100-token yes/no.

## Sequencing rationale

Extraction changes alter *what the classifier sees*, so their effect on
accuracy must be measured, not assumed — same evals prerequisite as
[goal-quality](../backend/goal-quality.md); one evals set serves both.
Contracts + journeys must land first so extraction changes can't silently
break the block/override flows. The existing `getPageSnippet` unit tests
will need spec updates in that chunk (red-first, as usual).

---

# Full research report (agent output, verbatim)

Grounded in the current code: `extension/lib/content-helpers.js`
(getPageSnippet), `extension/content.js`, `extension/background.js`,
`extension/manifest.json`.

## 1. The page landscape, and where the current extractor degrades

**Static/server-rendered pages (news, docs, blogs, MDN, Wikipedia).** Best
case. `main`/`article` priority order works; first 500 chars of `innerText`
are usually the headline + lede. No change needed.

**Client-rendered SPAs (React/Next/Vue).** `document_idle` fires at/around
DOMContentLoaded–load; on client-rendered apps the shell exists but content
may not. The current mitigations are two fixed 1s delays (spa_change
handler, and the retry hack). Two problems:

- The retry condition livelocks on any page whose text keeps changing
  (feeds auto-loading, live scores, tickers, chat) — the page is *never*
  re-classified after a `tab_change`. A real bug, not just a degradation.
- The 1s fixed delay is simultaneously too slow for fast SPAs (adds latency
  before a block) and too fast for slow ones (classifies the spinner).
  Snippet then falls through to meta description — which on SPAs is the
  *previous* page's or the app-shell's, because client-side routers update
  `document.title` but rarely rewrite `<meta>`/`og:` tags on navigation.

**Infinite feeds (X, TikTok, Instagram, Reddit home).** `main.innerText` is
a concatenation of nav labels + unrelated feed items; the first 500 chars
are arbitrary posts that don't describe "what this page is." For feeds,
topic identity is really **domain + section** (`x.com/home`,
`tiktok.com/foryou`), i.e., URL-level, and body text actively adds noise.
Perf note: `innerText` forces style+layout recalculation of the whole
subtree; on huge feed DOMs this can jank the page.

**YouTube.** Verified: `yt-navigate-start`, `yt-navigate-finish`, and
`yt-page-data-updated` are all real custom events; extensions commonly
listen to several plus a MutationObserver fallback because YouTube rebuilds
DOM during navigation. These are **unofficial internals YouTube can rename
at any time**. Bigger issue: YouTube has no `<main>`/`<article>`, but it
*does* have `div#content` (ytd-page-manager), so the extractor grabs the
whole page — video title mixed with recommendation-sidebar titles and
comments. The high-signal extraction on a watch page is `h1` (video title)
+ channel name.

**Shadow DOM.** `querySelector` and `innerText` do not pierce shadow roots.
Reddit's "shreddit" UI is the marquee heavy user among top sites. Nuance
(spec-derived, not empirically tested): slotted light-DOM children still
appear in an ancestor's `innerText`; shadow-internal text does not — so
Reddit extraction partially works but silently loses shadow-internal
content. Practical answer: the URL already carries subreddit + post slug —
parse it instead of fighting the shadow DOM.

**Iframes.** The manifest doesn't set `all_frames: true`, so the script runs
only in the top frame — correct for this use case. Cross-origin iframe
content is invisible and should stay that way. Don't add `all_frames` — it
would fire one classification per ad iframe.

**Google Docs/Sheets.** Canvas-rendered since 2021; the visible document
text is not in the DOM. `document.title` ("Essay draft - Google Docs") is
the only real signal, and it's a good one.

**Consent/paywall/age-gate overlays.** CMP banners (OneTrust, Sourcepoint,
Quantcast) are typically body-appended *outside* `main`/`article`, so the
priority-container pass usually dodges them — but the `p/h1/h2/h3` fallback
happily returns "We value your privacy…" on sites without a semantic
container. Cheap fix: skip nodes inside `[role="dialog"]`,
`[aria-modal="true"]`, and elements whose id/class matches
`/cookie|consent|gdpr/i`. Soft paywalls usually keep the lede in the DOM.

**PDFs and restricted pages.** Content scripts cannot run in the built-in
PDF viewer (documented explicitly for Firefox; Chrome matches in practice
but no official Chrome doc sentence was found), nor `chrome://`, the Chrome
Web Store, or other extensions' pages. Those pages are unclassifiable and
unblockable via content script; `tabs.sendMessage` already fails silently
there. If PDFs ever matter, the URL (filename) via the background SW is the
only signal — a v2 idea, not a v1 requirement.

## 2. Signal sources ranked by signal-per-byte for topic classification

Industry context: commercial categorizers (zvelo etc.) build primarily on
**URL, title, headings, and metadata**; URL-only classification is an entire
product category. Consumer focus tools (Freedom, Cold Turkey, LeechBlock)
don't read content at all — they're domain/URL-pattern blockers. FocalPoint
already outclasses them *because* it sees title + snippet; the ranking is
about spending those bytes well.

1. **URL (hostname + path + query)** — ~100 bytes, near-perfect site
   identity plus topic slugs for free. Always fresh. Strip tracking params
   (`utm_*`, `fbclid`) before sending — improves the cache hit rate at zero
   cost.
2. **`document.title`** — ~60 bytes of publisher-curated topic summary;
   reliably updated by SPA routers. The single best freshness-safe text
   signal.
3. **`h1` (first visible)** — the page's self-declared topic; rendered DOM,
   so always current after SPA navigation. On YouTube it's the video title;
   on Reddit posts, the post title. Currently unused as a distinct field.
4. **JSON-LD `@type` (+ `name`/`headline`)** — on ~41% of pages (Web Almanac
   2024). `@type: VideoObject | NewsArticle | Product | Recipe` is a 15-byte
   category label. SEO-policed, so trustworthy for topic. Stale on
   client-side navs like all head metadata.
5. **`og:title` / `og:description`** — OG on ~64% of pages; dense
   human-written summaries. Use only when fresh (og:title vs document.title
   agreement test).
6. **`meta[name=description]`** — same, slightly lower quality.
7. **Main-content text** — the tie-breaker, not the star. 200–300 chars of
   lede disambiguates ("Python" the language vs the snake). Diminishing
   returns past that for a yes/no relevance call.
8. **twitter:\* meta** — almost always duplicates og:*; skip.

**Readability?** Overkill — it extracts full clean articles. Steal its two
cheapest ideas only: link-density penalty and negative class names
(`nav|footer|sidebar|comment|promo`).

**500 chars?** Reasonable, arguably generous. A *structured* 500 (labeled
fields) beats an unstructured wall because the model knows each fragment's
provenance.

## 3. Timing and triggering architecture

Verified platform facts:

- `chrome.webNavigation.onHistoryStateUpdated` fires for `history.pushState`
  SPA navigations; requires the `"webNavigation"` permission, which carries
  the same install warning as the already-declared `"tabs"` permission — so
  adopting it costs no new warning.
- `tabs.onUpdated` + `changeInfo.url` also catches SPA URL changes in
  practice, but no doc guarantees it for every pushState; `webNavigation`
  is the documented mechanism.
- MAIN-world `pushState` monkey-patching and the Navigation API are
  redundant given `webNavigation` in the SW; skip both.

Recommended: background debounces (~300ms/tab) `onHistoryStateUpdated` +
`onReferenceFragmentUpdated` (frameId 0) + keeps `tabs.onActivated`; content
script replaces fixed delays with title-observer + body-mutation quiescence
(300–500ms quiet, 3s hard cap), disconnecting observers after firing.

## 4. Recommended extraction algorithm (pseudocode)

```
buildClassificationPayload():
  url    = stripTrackingParams(location.href)
  title  = document.title.trim()

  fields = []
  h1 = firstVisible('h1')
  if h1: fields.push("H1: " + clean(h1.innerText, 120))

  ogTitle = meta('og:title')
  if ogTitle and roughlyContains(title, ogTitle):        // freshness gate
      desc = meta('og:description') || meta('description')
      if desc: fields.push("Desc: " + clean(desc, 200))
      ld = firstJsonLd()                                 // try/catch, cap 5KB
      if ld?.@type: fields.push("Type: " + ld.@type + (ld.name ? " — " + clean(ld.name, 80) : ""))

  if youtube.com:  fields.push("Video: " + watchTitle + " | Channel: " + channelName)
  if reddit.com:   fields.push("Subreddit: r/" + parseFromPath(url))

  remaining = 500 - joinedLength(fields)
  if remaining > 60:
      container = firstOf('main','article','[role=main]','#content')
      text = collectText(container || document.body, remaining)
      if text.length > 20: fields.push("Body: " + text)

  snippet = fields.join(" | ") || title || location.hostname   // never empty
  return { url, pageTitle: title, pageSnippet: snippet.slice(0, 500) }

collectText(root, budget):
  // TreeWalker over text nodes; skip script/style/noscript/template,
  // [aria-hidden=true], [role=dialog], [aria-modal=true],
  // id/class matching /cookie|consent|gdpr|paywall/i,
  // blocks with link-density > 0.5. Stop at budget chars.
  // No forced layout (unlike innerText); consent/nav-resistant.
```

No API contract change — structure lives inside the single `pageSnippet`
string. URL normalization changes cache keys once; old entries expire in
24h.

## Unverified / caveats (from the research agent)

- Chrome PDF-viewer content-script exclusion: documented for Firefox;
  Chrome matches in practice, no official Chrome doc sentence found.
- innerText slotted-vs-shadow behavior: spec-derived, not tested on shreddit.
- No doc guarantees `tabs.onUpdated` fires for every pushState.
- yt-* events are unofficial internals.
- No comprehensive verified list of sites using closed shadow roots.
- No published input-feature spec from a consumer focus tool doing LLM
  classification; conclusions triangulated from the web-categorization
  industry and URL-classification patents.

Sources: Chrome webNavigation API docs · MDN onHistoryStateUpdated · Chrome
permissions list · Chrome/MDN content-script docs · Chrome Navigation API ·
Zren/ResizeYoutubePlayerToWindowSize#72 · Web Almanac 2024 (Structured
Data) · mozilla/readability · Apify shadow-DOM guide · w3c/webextensions#647
· Google Workspace canvas-rendering announcement · zvelo ML categorization.
