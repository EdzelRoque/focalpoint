// The background service worker: classify pages for the active session, keep
// stats in sync, record overrides, and end timed sessions when time runs out.
import { describe, it, expect, vi } from 'vitest';
import { loadBackground, settle, session, minutesFromNow } from '../support/load.js';

const PAGE = {
  url: 'https://www.youtube.com/watch?v=funnycats',
  pageTitle: 'Funny cats compilation',
  pageSnippet: 'Watch the funniest cats of the year',
};
const loggedIn = (s = session()) => ({ token: 'tok-123', activeSession: s });

const classify = (chrome, payload = PAGE) => chrome.deliver({ action: 'classify_page', payload });

describe('classifying a page', () => {
  it('does nothing without an active session (no request is made)', async () => {
    const { chrome, backend } = await loadBackground({ storage: { token: 'tok' } });
    expect(await classify(chrome)).toEqual({ error: 'No active session' });
    expect(backend.calls).toHaveLength(0);
  });

  it('allows everything when not logged in (fail open)', async () => {
    const { chrome, backend } = await loadBackground({ storage: { activeSession: session() } });
    expect(await classify(chrome)).toMatchObject({ decision: 'ALLOW' });
    expect(backend.calls).toHaveLength(0);
  });

  it('sends the page plus the session goal and sensitivity, with the token', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/classify', { json: { decision: 'ALLOW', reason: 'ok' } });
    await classify(chrome);
    const [call] = backend.calls;
    expect(call.url).toBe('https://focalpoint-q8r5.onrender.com/api/classify');
    expect(call.headers.Authorization).toBe('Bearer tok-123');
    expect(call.body).toEqual({ ...PAGE, sessionGoal: session().sessionGoal, blockSensitivity: 'standard' });
  });

  it('passes an ALLOW decision through without counting a block', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/classify', { json: { decision: 'ALLOW', reason: 'On topic.' } });
    expect(await classify(chrome)).toEqual({ decision: 'ALLOW', reason: 'On topic.', strictMode: false });
    expect(backend.callsTo('POST', '/api/sessions')).toHaveLength(0);
  });

  it('on BLOCK: records the block, updates stored stats, tells the popup, returns strict mode', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn(session({ strictMode: true, blockCount: 2 })) });
    backend.on('POST /api/classify', { json: { decision: 'BLOCK', reason: 'Cats.' } });
    backend.on('POST /api/sessions/:id/block', { json: { success: true } });

    expect(await classify(chrome)).toEqual({ decision: 'BLOCK', reason: 'Cats.', strictMode: true });
    expect(backend.callsTo('POST', '/api/sessions/64b0000000000000000000aa/block')).toHaveLength(1);
    expect(chrome.storageData().activeSession.blockCount).toBe(3);
    expect(chrome.sentRuntime).toContainEqual({ action: 'stats_update', stats: { blockCount: 3, overrideCount: 0 } });
  });

  it('counts every block event, including the same page again', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/classify', { json: { decision: 'BLOCK', reason: 'Cats.' } });
    backend.on('POST /api/sessions/:id/block', { json: { success: true } });
    await classify(chrome);
    await classify(chrome);
    expect(chrome.storageData().activeSession.blockCount).toBe(2);
  });

  it('still blocks if recording the block fails (count unchanged)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/classify', { json: { decision: 'BLOCK', reason: 'Cats.' } });
    backend.on('POST /api/sessions/:id/block', { status: 500, json: { error: 'x' } });
    expect((await classify(chrome)).decision).toBe('BLOCK');
    expect(chrome.storageData().activeSession.blockCount).toBe(0);
  });

  it('stops blocking if the backend says the session is over (409)', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/classify', { json: { decision: 'BLOCK', reason: 'Cats.' } });
    backend.on('POST /api/sessions/:id/block', { status: 409, json: { error: 'Session is already ended' } });
    expect(await classify(chrome)).toEqual({ error: 'No active session' });
    expect(chrome.storageData().activeSession).toBeUndefined();
  });

  it.each([
    ['the backend errors', () => ({ status: 500, json: { error: 'boom' } })],
    ['the network is down', () => new TypeError('Failed to fetch')],
  ])('returns an error (so the page is not blocked) when %s', async (_label, response) => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/classify', response);
    const res = await classify(chrome);
    expect(res.error).toBeDefined();
    expect(res.decision).toBeUndefined();
  });

  it('rejects a malformed payload', async () => {
    const { chrome } = await loadBackground({ storage: loggedIn() });
    expect(await classify(chrome, { url: 'https://x.com' })).toEqual({ error: 'Invalid message payload' });
  });
});

describe('recording an override', () => {
  const override = (chrome) => chrome.deliver({ action: 'override_page', payload: { url: PAGE.url } });

  it('sends url, goal and sensitivity; counts it; tells the popup', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/sessions/:id/override', { json: { success: true } });

    expect(await override(chrome)).toEqual({ status: 'Override logged' });
    expect(backend.calls[0].body).toEqual({ url: PAGE.url, sessionGoal: session().sessionGoal, blockSensitivity: 'standard' });
    expect(chrome.storageData().activeSession.overrideCount).toBe(1);
    expect(chrome.sentRuntime).toContainEqual({ action: 'stats_update', stats: { blockCount: 0, overrideCount: 1 } });
  });

  it('reports an error (overlay stays) when the backend fails, without counting', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/sessions/:id/override', { status: 500, json: {} });
    expect((await override(chrome)).error).toMatch(/500/);
    expect(chrome.storageData().activeSession.overrideCount).toBe(0);
  });

  it('reports an error when the network is down', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/sessions/:id/override', () => new TypeError('Failed to fetch'));
    expect((await override(chrome)).error).toBeDefined();
  });

  it('reports sessionEnded (overlay comes down) when the session is over', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/sessions/:id/override', { status: 409, json: { error: 'Session is already ended' } });
    expect(await override(chrome)).toEqual({ sessionEnded: true });
    expect(chrome.storageData().activeSession).toBeUndefined();
  });

  it('reports sessionEnded when there is no active session', async () => {
    const { chrome, backend } = await loadBackground({ storage: { token: 't' } });
    expect(await override(chrome)).toEqual({ sessionEnded: true });
    expect(backend.calls).toHaveLength(0);
  });
});

describe('auto-end when the duration runs out', () => {
  it('schedules an alarm at the session end time when a session starts', async () => {
    const { chrome } = await loadBackground({ storage: { token: 't' } });
    const s = session({ expectedEndTime: minutesFromNow(30) });
    await chrome.storage.local.set({ activeSession: s });
    await settle();
    expect(chrome.alarms.all.get('fp-session-expiry').scheduledTime).toBe(Date.parse(s.expectedEndTime));
  });

  it('schedules no alarm for an open-ended session', async () => {
    const { chrome } = await loadBackground({ storage: { token: 't' } });
    await chrome.storage.local.set({ activeSession: session({ expectedEndTime: null }) });
    await settle();
    expect(chrome.alarms.all.size).toBe(0);
  });

  it('when the alarm fires: forgets the session and takes overlays down in every tab', async () => {
    const { chrome } = await loadBackground({ storage: loggedIn(session({ expectedEndTime: minutesFromNow(-1) })) });
    await chrome.fireAlarm('fp-session-expiry');
    await settle();
    expect(chrome.storageData().activeSession).toBeUndefined();
    expect(chrome.sentToTabs.map((m) => m.tabId).sort()).toEqual([1, 2]);
    expect(chrome.sentToTabs.every((m) => m.msg.action === 'session_ended')).toBe(true);
    expect(chrome.sentRuntime).toContainEqual({ action: 'session_ended' });
  });

  it('an early or stale alarm does not end a session that still has time left', async () => {
    const { chrome } = await loadBackground({ storage: loggedIn() });
    await chrome.fireAlarm('fp-session-expiry');
    await settle();
    expect(chrome.storageData().activeSession).toBeDefined();
  });

  it('never classifies (or blocks) after the end time, even if the alarm was missed', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn(session({ expectedEndTime: minutesFromNow(-1) })) });
    expect(await classify(chrome)).toEqual({ error: 'No active session' });
    expect(backend.calls).toHaveLength(0);
    expect(chrome.storageData().activeSession).toBeUndefined();
  });

  it('takes overlays down when the popup notices the expiry first and clears the session', async () => {
    const expired = session({ expectedEndTime: minutesFromNow(-1) });
    const { chrome } = await loadBackground({ storage: loggedIn(expired) });
    await chrome.storage.local.remove('activeSession');
    await settle();
    expect(chrome.sentToTabs.filter((m) => m.msg.action === 'session_ended')).toHaveLength(2);
  });

  it('manual end: does not message tabs (overlays already shown stay until navigation)', async () => {
    const { chrome } = await loadBackground({ storage: loggedIn() });
    await chrome.storage.local.remove('activeSession');
    await chrome.deliver({ action: 'session_ended' });
    await settle();
    expect(chrome.sentToTabs).toHaveLength(0);
    expect(chrome.alarms.all.size).toBe(0);
  });
});

describe('expired login (the backend answers 401)', () => {
  const expectSignedOutWithBadge = (chrome) => {
    const data = chrome.storageData();
    expect(data.token).toBeUndefined();
    expect(data.activeSession).toBeUndefined();
    expect(data.loginExpired).toBe(true);
    expect(chrome.action.badge.text).toBe('!');
  };

  it('on classify: signs out, shows the "!" badge, does not block, takes overlays down', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/classify', { status: 401, json: { error: 'Invalid or expired token.' } });
    const res = await classify(chrome);
    expect(res.decision).toBeUndefined();
    expectSignedOutWithBadge(chrome);
    await settle();
    expect(chrome.sentToTabs.filter((m) => m.msg.action === 'session_ended')).toHaveLength(2);
  });

  it('on recording a block: signs out and does not block', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/classify', { json: { decision: 'BLOCK', reason: 'Cats.' } });
    backend.on('POST /api/sessions/:id/block', { status: 401, json: {} });
    expect((await classify(chrome)).decision).toBeUndefined();
    expectSignedOutWithBadge(chrome);
  });

  it('on an override: signs out and lets the overlay come down', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/sessions/:id/override', { status: 401, json: {} });
    expect(await chrome.deliver({ action: 'override_page', payload: { url: PAGE.url } })).toEqual({ sessionEnded: true });
    expectSignedOutWithBadge(chrome);
  });

  it('after signing out, nothing is checked any more', async () => {
    const { chrome, backend } = await loadBackground({ storage: loggedIn() });
    backend.on('POST /api/classify', { status: 401, json: {} });
    await classify(chrome);
    await classify(chrome);
    expect(backend.callsTo('POST', '/api/classify')).toHaveLength(1);
  });
});

describe('tab events', () => {
  it('re-checks a tab when the user switches to it during a session', async () => {
    const { chrome } = await loadBackground({ storage: loggedIn() });
    for (const fn of chrome.tabs.onActivated.fns) await fn({ tabId: 7 });
    expect(chrome.sentToTabs).toEqual([{ tabId: 7, msg: { action: 'tab_change' } }]);
  });

  it('re-checks a tab when its URL changes in place (single-page apps)', async () => {
    const { chrome } = await loadBackground({ storage: loggedIn() });
    for (const fn of chrome.tabs.onUpdated.fns) await fn(7, { url: 'https://x.com/b' }, {});
    for (const fn of chrome.tabs.onUpdated.fns) await fn(7, { status: 'loading' }, {});
    expect(chrome.sentToTabs).toEqual([{ tabId: 7, msg: { action: 'spa_change' } }]);
  });

  it('ignores tab events when no session is active', async () => {
    const { chrome } = await loadBackground({ storage: { token: 't' } });
    for (const fn of chrome.tabs.onActivated.fns) await fn({ tabId: 7 });
    for (const fn of chrome.tabs.onUpdated.fns) await fn(7, { url: 'https://x.com/b' }, {});
    expect(chrome.sentToTabs).toHaveLength(0);
  });
});
