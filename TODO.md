# FocalPoint — Post-Audit TODO

Findings from the full codebase audit (2026-04-22). Items are grouped by urgency, not by file.

---

## Fix Now

These are active bugs or security vulnerabilities that affect production today.

### 1. IDOR on all session sub-routes
**Files:** `backend/routes/sessionRoutes.js`  
Every session endpoint validates that the caller is authenticated but never checks that the session belongs to them. Any user with a valid JWT can read, end, or corrupt another user's session just by knowing or guessing their session ID.  
**Fix:** After `sessionData.getSessionById(sessionId)`, compare `session.userId.toString() !== req.user.userId` and return 403 if they don't match. Apply this check to `GET /api/sessions/:id`, `PUT /api/sessions/:id`, `POST /api/sessions/:id/block`, and `POST /api/sessions/:id/override`.

### 2. CORS is fully open
**Files:** `backend/app.js:8`  
`app.use(cors())` with no config accepts requests from any origin.  
**Fix:** Pass an `origin` allowlist: your Vercel domain and the `chrome-extension://` URL of your published extension. Reject everything else.

### 3. No JWT_SECRET guard at startup
**Files:** `backend/app.js`  
If `JWT_SECRET` is missing from the environment, `jwt.sign()` and `jwt.verify()` silently use `undefined` as the secret. The server starts, issues tokens, and accepts them — all with no actual secret.  
**Fix:** Add a startup guard at the top of `app.js`:
```js
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
```

### 4. No rate limiting on any endpoint
**Files:** `backend/app.js` (global), `backend/routes/classificationRoutes.js`, `backend/routes/userRoutes.js`  
`POST /api/classify` calls Anthropic on every cache miss — a single leaked JWT can burn the API budget. `POST /auth/login` and `POST /auth/register` have no brute-force protection.  
**Fix:** Add `express-rate-limit`. A reasonable starting point: 60 req/min globally, 10 req/min on `/auth/login` and `/auth/register`, 100 req/min on `/api/classify` per IP.

---

## Fix Soon

These won't cause an incident today but have real consequences if they go unaddressed.

### 5. `reason` string injected as raw innerHTML
**Files:** `extension/content.js:77` (inside `overlay.innerHTML`)  
The reason string from Claude is interpolated into a template literal that becomes `innerHTML`. If the model ever returns a reason containing HTML, it becomes active markup in the page.  
**Fix:** Build the overlay structure with `createElement`/`textContent` instead of a template literal, or create the element, set innerHTML for the static structure, then set `reasonEl.textContent = reason` after the fact.

### 6. `Anthropic()` client created on every classify request
**Files:** `backend/data/classification.js:13`  
A new SDK client (and underlying HTTP client) is instantiated on every cache miss.  
**Fix:** Move `const client = new Anthropic(...)` to module scope, outside `callClaude`.

### 7. `incrementBlockCount` and `incrementOverrideCount` report success even when the session doesn't exist
**Files:** `backend/data/session.js:120-144`  
MongoDB acknowledges a `$inc` update even when `matchedCount === 0`. The functions check only `!updateInfo.acknowledged`, so they return `{ success: true }` for writes that matched nothing. `endSession` has the same gap.  
**Fix:** After the `updateOne`, also check `updateInfo.matchedCount === 0` and throw `'Session not found'`.

### 8. Block and override fetch results are unchecked in the extension
**Files:** `extension/background.js:88-93` (block), `extension/background.js:151-166` (override)  
If the backend returns an error for either call, the extension still increments the local counter and removes the overlay. The popup's stat display and the database fall out of sync.  
**Fix:** Check `res.ok` before incrementing `activeSession.blockCount` / `activeSession.overrideCount`. On failure, either skip the local increment or log a warning.

### 9. `clearClassificationCache` imported directly from data file, bypassing `data/index.js`
**Files:** `backend/routes/sessionRoutes.js:4`, `backend/data/index.js`  
All other data-layer access goes through `data/index.js`. This one doesn't.  
**Fix:** Export `clearClassificationCache` from `data/index.js` as part of `classificationData` and update the import in `sessionRoutes.js`.

### 10. No active session guard when starting a new session
**Files:** `backend/data/session.js` (`createSession`), `backend/routes/sessionRoutes.js`  
`POST /api/sessions` never checks whether the user already has an `isActive: true` session. Duplicate active sessions can accumulate in the database if a client is buggy or the request is replayed.  
**Fix:** In `createSession`, query for an existing active session for the user and throw `'You already have an active session'` if one exists.

### 11. `GET /api/sessions` is unbounded
**Files:** `backend/data/session.js:102`, `backend/routes/sessionRoutes.js`  
The query fetches every session the user has ever created with no limit. The frontend sorts the entire array in memory.  
**Fix:** Add a reasonable cap (e.g., `.limit(500)`) and optionally add server-side sorting (`{ startTime: -1 }`) so the client doesn't have to.

---

## Fix When You Touch Those Features

Low urgency. Fine to leave until the relevant feature is being worked on.

### 12. Dashboard chart aggregates all-time data, labeled "this week"
**Files:** `frontend/src/pages/Dashboard.tsx:72-92`  
`dayMap` accumulates minutes for each day-of-week name across all sessions ever. A session from months ago on a Tuesday adds to the "Tue" bar. The chart heading says "Focus time this week."  
**Fix:** Filter `sessions` to only those where `startTime` falls within the current calendar week before building `dayMap`.

### 13. `weeklyReport` toggle is dead UI
**Files:** `frontend/src/pages/Settings.tsx:89`, `handleSave`, `fetchSettings`  
The "Weekly report" toggle is wired to state but never sent in `handleSave` and the backend has no such field. Saving does nothing.  
**Fix:** Either remove the toggle until the feature is built, or add a `weeklyReport` field to the user document and backend settings endpoint.

### 14. Double validation in routes and data layer
**Files:** All route files and all `data/` files  
Every input is validated twice — once in the route, once in the data function. If one side changes, the other may silently accept or reject inputs it shouldn't.  
**Fix (low priority, opinionated):** Pick a single authoritative layer for each concern. The CLAUDE.md documents this as intentional, but consider removing the data-layer validators and relying solely on the route-layer validators, or vice versa.

### 15. `getSessionById` and `getSessionsByUserId` return inconsistently shaped objects
**Files:** `backend/data/session.js:80-110`  
`getSessionsByUserId` maps over results and converts `_id` and `userId` to strings. `getSessionById` returns the raw Mongo document with `ObjectId` instances. Callers get different shapes depending on which function is used.  
**Fix:** Normalize both functions to serialize `_id` and `userId` to strings before returning.

### 16. MongoDB collection memoization doesn't survive reconnects
**Files:** `backend/config/mongoCollections.js`  
The `_col` closure variable is set once and never refreshed. If the MongoDB connection drops and `dbConnection()` creates a new client, `_col` still holds a reference to the old connection's collection object.  
**Fix:** Remove the `_col` cache and call `db.collection(collection)` directly each time, or verify that `ioredis`/`mongodb` drivers handle reconnection transparently (the native MongoDB driver does for most operations, but it's worth confirming).

### 17. No maximum length validation on `pageSnippet`
**Files:** `backend/validation.js:96-99`  
`validatePageSnippet` enforces a minimum of 5 characters but no maximum. The extension caps the snippet at 500 chars, but the API will accept arbitrarily large strings and forward them to Anthropic.  
**Fix:** Add `if (snippet.length > 2000) throw 'Page snippet is too long'` (or similar) to the validator.

### 18. MD5 used as Redis cache key hash
**Files:** `backend/data/classification.js:96, 114`  
MD5 is broken for cryptographic use. Collisions here aren't a security issue but are bad practice.  
**Fix:** Swap `crypto.createHash('md5')` for `crypto.createHash('sha256')`. The key length increases slightly but Redis handles it fine.

### 19. `chrome.runtime.sendMessage` for `session_started` is fire-and-forget
**Files:** `extension/popup.js:210`  
If the MV3 service worker is sleeping when this fires, the message is lost and `background.js`'s in-memory `activeSession` stays null until the worker restarts. Most real-world usage is fine because `background.js` re-reads from `chrome.storage.local` on init — but tab switches immediately after a session start could slip through.  
**Fix:** Use `chrome.storage.local.set({ activeSession: data })` (which is already done on line 207) as the source of truth and have `background.js` read from storage on demand rather than trusting in-memory state alone.
