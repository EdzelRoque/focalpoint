// Contract tests for background.js message handlers, the storage.onChanged
// cache sync, and the tab-event forwards. The in-memory activeSession cache
// is module-private, so every cache assertion observes it through the public
// contract: what a subsequent classify_page does. fetch is mocked at the
// boundary — the backend is an external service at this layer.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeFake } from './test/chrome-fake.js';

const BASE_URL = 'https://focalpoint-q8r5.onrender.com';

const makeSession = (overrides = {}) => ({
  _id: 'sess-1',
  sessionGoal: 'Study for my machine learning exam',
  blockSensitivity: 'standard',
  strictMode: false,
  blockCount: 0,
  overrideCount: 0,
  ...overrides,
});

const makePayload = (overrides = {}) => ({
  url: 'https://example.com/article',
  pageTitle: 'An Article',
  pageSnippet: 'Some page text long enough to matter',
  ...overrides,
});

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

let fake;
let fetchMock;

// Popup-style seeding: storage is the source of truth; the onChanged listener
// primes the background cache as a side effect, same as in real Chrome.
const seedActive = async (session = makeSession()) => {
  await fake.chrome.storage.local.set({ token: 'tok-1', activeSession: session });
  fake.chrome.storage.local.set.mockClear();
  return session;
};

beforeEach(async () => {
  fake = createChromeFake();
  globalThis.chrome = fake.chrome;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  await import('./background.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.chrome;
});

describe('session_started / session_ended', () => {
  it('acks session_started and classifies with the handed-off session without reading storage', async () => {
    await fake.chrome.storage.local.set({ token: 'tok-1' }); // no activeSession in storage
    fetchMock.mockResolvedValueOnce(jsonResponse({ decision: 'ALLOW', reason: 'on topic' }));

    const ack = await fake.dispatchMessage({ action: 'session_started', session: makeSession() });
    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(ack).toEqual({ status: 'Session saved in background' });
    expect(response).toEqual({ decision: 'ALLOW', reason: 'on topic', strictMode: false });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sessionGoal).toBe('Study for my machine learning exam');
  });

  it('acks session_ended and subsequent classify_page reports no active session', async () => {
    await fake.dispatchMessage({ action: 'session_started', session: makeSession() });

    const ack = await fake.dispatchMessage({ action: 'session_ended' });
    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(ack).toEqual({ status: 'Session cleared in background' });
    expect(response).toEqual({ error: 'No active session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('storage.onChanged cache sync', () => {
  // These prime the cache via session_started while keeping storage EMPTY of
  // activeSession, so the lazy storage read can't mask a broken listener.
  it('classifies against the new session after activeSession is rewritten in storage', async () => {
    await fake.chrome.storage.local.set({ token: 'tok-1' });
    await fake.dispatchMessage({ action: 'session_started', session: makeSession() });
    fetchMock.mockResolvedValueOnce(jsonResponse({ decision: 'ALLOW', reason: 'ok' }));

    await fake.chrome.storage.local.set({
      activeSession: makeSession({ sessionGoal: 'Write my thesis', blockSensitivity: 'strict' }),
    });
    await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sessionGoal).toBe('Write my thesis');
    expect(body.blockSensitivity).toBe('strict');
  });

  it('stops classifying after activeSession is removed from storage', async () => {
    await seedActive();

    await fake.chrome.storage.local.remove('activeSession');
    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(response).toEqual({ error: 'No active session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the cached session when an unrelated key changes', async () => {
    await fake.chrome.storage.local.set({ token: 'tok-1' });
    await fake.dispatchMessage({ action: 'session_started', session: makeSession() });
    fetchMock.mockResolvedValueOnce(jsonResponse({ decision: 'ALLOW', reason: 'ok' }));

    await fake.chrome.storage.local.set({ token: 'tok-refreshed' });
    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(response).toMatchObject({ decision: 'ALLOW' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sessionGoal).toBe('Study for my machine learning exam');
  });

  it('ignores activeSession changes from a non-local storage area', async () => {
    await fake.chrome.storage.local.set({ token: 'tok-1' });
    await fake.dispatchMessage({ action: 'session_started', session: makeSession() });
    fetchMock.mockResolvedValueOnce(jsonResponse({ decision: 'ALLOW', reason: 'ok' }));

    fake.fireStorageChanged({ activeSession: { oldValue: makeSession() } }, 'sync');
    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(response).toMatchObject({ decision: 'ALLOW' });
  });
});

describe('classify_page', () => {
  it('POSTs the page and session to /api/classify and relays ALLOW with strictMode', async () => {
    await seedActive(makeSession({ strictMode: true }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ decision: 'ALLOW', reason: 'on topic' }));

    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/classify`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-1',
    });
    expect(JSON.parse(init.body)).toEqual({
      url: 'https://example.com/article',
      pageTitle: 'An Article',
      pageSnippet: 'Some page text long enough to matter',
      sessionGoal: 'Study for my machine learning exam',
      blockSensitivity: 'standard',
    });
    expect(response).toEqual({ decision: 'ALLOW', reason: 'on topic', strictMode: true });
    expect(fake.chrome.storage.local.set).not.toHaveBeenCalled();
    expect(fake.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('on BLOCK syncs the block count, persists it, broadcasts stats, and relays the decision', async () => {
    await seedActive(makeSession({ blockCount: 2, overrideCount: 1 }));
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ decision: 'BLOCK', reason: 'off topic' }))
      .mockResolvedValueOnce(jsonResponse({}));

    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    const [blockUrl, blockInit] = fetchMock.mock.calls[1];
    expect(blockUrl).toBe(`${BASE_URL}/api/sessions/sess-1/block`);
    expect(blockInit.method).toBe('POST');
    expect(blockInit.headers).toEqual({ Authorization: 'Bearer tok-1' });
    expect(fake.chrome.storage.local.set).toHaveBeenCalledWith({
      activeSession: expect.objectContaining({ blockCount: 3 }),
    });
    expect(fake.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'stats_update',
      stats: { blockCount: 3, overrideCount: 1 },
    });
    expect(response).toEqual({ decision: 'BLOCK', reason: 'off topic', strictMode: false });
  });

  it.each(['url', 'pageTitle', 'pageSnippet'])(
    'rejects a payload missing %s without calling the backend',
    async (field) => {
      await seedActive();

      const response = await fake.dispatchMessage({
        action: 'classify_page',
        payload: makePayload({ [field]: '' }),
      });

      expect(response).toEqual({ error: 'Invalid message payload' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('reports no active session without calling the backend', async () => {
    await fake.chrome.storage.local.set({ token: 'tok-1' });

    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(response).toEqual({ error: 'No active session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails open with ALLOW when there is a session but no token', async () => {
    await fake.chrome.storage.local.set({ activeSession: makeSession() });

    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(response).toEqual({ decision: 'ALLOW', reason: 'Not authenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('relays a backend classify error without blocking, persisting, or broadcasting', async () => {
    await seedActive();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, { ok: false, status: 500 }));

    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(response).toEqual({ error: 'boom' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fake.chrome.storage.local.set).not.toHaveBeenCalled();
    expect(fake.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('still relays BLOCK when the block-count sync fails, without counting it', async () => {
    await seedActive();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ decision: 'BLOCK', reason: 'off topic' }))
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });

    expect(response).toEqual({ decision: 'BLOCK', reason: 'off topic', strictMode: false });
    expect(fake.chrome.storage.local.set).not.toHaveBeenCalled();
    expect(fake.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('completes the block flow without an unhandled rejection when the stats broadcast fails', async () => {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      await seedActive();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ decision: 'BLOCK', reason: 'off topic' }))
        .mockResolvedValueOnce(jsonResponse({}));
      // Plain function, not a vi.fn: mock wrappers attach handlers to returned
      // promises to record settled results, which masks the unhandled rejection
      // this test exists to detect.
      fake.chrome.runtime.sendMessage = () =>
        Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));

      const response = await fake.dispatchMessage({ action: 'classify_page', payload: makePayload() });
      await new Promise((resolve) => setImmediate(resolve));

      expect(response).toMatchObject({ decision: 'BLOCK' });
      expect(fake.chrome.storage.local.set).toHaveBeenCalledWith({
        activeSession: expect.objectContaining({ blockCount: 1 }),
      });
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});

describe('override_page', () => {
  const overridePayload = { url: 'https://example.com/article' };

  it('POSTs the override, persists the incremented count, broadcasts stats, and acks', async () => {
    await seedActive(makeSession({ blockCount: 4, overrideCount: 2 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    const response = await fake.dispatchMessage({ action: 'override_page', payload: overridePayload });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/sessions/sess-1/override`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-1',
    });
    expect(JSON.parse(init.body)).toEqual({
      url: 'https://example.com/article',
      sessionGoal: 'Study for my machine learning exam',
      blockSensitivity: 'standard',
    });
    expect(fake.chrome.storage.local.set).toHaveBeenCalledWith({
      activeSession: expect.objectContaining({ overrideCount: 3 }),
    });
    expect(fake.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'stats_update',
      stats: { blockCount: 4, overrideCount: 3 },
    });
    expect(response).toEqual({ status: 'Override logged' });
  });

  it('rejects a payload without a url and does not call the backend', async () => {
    await seedActive();

    const response = await fake.dispatchMessage({ action: 'override_page', payload: {} });

    expect(response).toEqual({ error: 'Invalid message payload' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports no active session without calling the backend', async () => {
    await fake.chrome.storage.local.set({ token: 'tok-1' });

    const response = await fake.dispatchMessage({ action: 'override_page', payload: overridePayload });

    expect(response).toEqual({ error: 'No active session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports not authenticated when there is a session but no token', async () => {
    await fake.chrome.storage.local.set({ activeSession: makeSession() });

    const response = await fake.dispatchMessage({ action: 'override_page', payload: overridePayload });

    expect(response).toEqual({ error: 'Not authenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a failed sync without counting, persisting, or broadcasting', async () => {
    await seedActive();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    const response = await fake.dispatchMessage({ action: 'override_page', payload: overridePayload });

    expect(response).toEqual({ error: 'Override sync failed: 500' });
    expect(fake.chrome.storage.local.set).not.toHaveBeenCalled();
    expect(fake.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('completes the override flow without an unhandled rejection when the stats broadcast fails', async () => {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      await seedActive();
      fetchMock.mockResolvedValueOnce(jsonResponse({}));
      // Plain function, not a vi.fn — see the classify_page broadcast test.
      fake.chrome.runtime.sendMessage = () =>
        Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));

      const response = await fake.dispatchMessage({ action: 'override_page', payload: overridePayload });
      await new Promise((resolve) => setImmediate(resolve));

      expect(response).toEqual({ status: 'Override logged' });
      expect(fake.chrome.storage.local.set).toHaveBeenCalledWith({
        activeSession: expect.objectContaining({ overrideCount: 1 }),
      });
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});

describe('tabs.onActivated → tab_change forward', () => {
  it('forwards tab_change to the activated tab while a session is active', async () => {
    await seedActive();

    await fake.dispatchTabActivated({ tabId: 7 });

    expect(fake.chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { action: 'tab_change' });
  });

  it('sends nothing when no session is active', async () => {
    await fake.dispatchTabActivated({ tabId: 7 });

    expect(fake.chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('swallows the error when the tab has no content script', async () => {
    await seedActive();
    fake.chrome.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist.'));

    await expect(fake.dispatchTabActivated({ tabId: 7 })).resolves.toBeDefined();
  });
});

describe('tabs.onUpdated → spa_change forward', () => {
  it('forwards spa_change when the URL changes in place while a session is active', async () => {
    await seedActive();

    await fake.dispatchTabUpdated(9, { url: 'https://example.com/next' });

    expect(fake.chrome.tabs.sendMessage).toHaveBeenCalledWith(9, { action: 'spa_change' });
  });

  it('sends nothing for updates without a URL change', async () => {
    await seedActive();

    await fake.dispatchTabUpdated(9, { status: 'complete' });

    expect(fake.chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('sends nothing when no session is active', async () => {
    await fake.dispatchTabUpdated(9, { url: 'https://example.com/next' });

    expect(fake.chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
