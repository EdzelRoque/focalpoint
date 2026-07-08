/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://example.com/start" }
 *
 * Contract tests for content.js's tab_change / spa_change handlers and the
 * classify_page orchestration they drive (stale-response + navigation
 * guards). fpContentHelpers is stubbed — snippet extraction and the overlay
 * DOM have their own unit tests in lib/; these tests are about the contract.
 *
 * The tab_change / spa_change cases keep the snippet stub constant so the
 * same-title/changed-snippet retry guard stays out of their way; the guard's
 * own contract (bounded retry — the fix for the livelock documented in
 * classify-retry-livelock.md) is encoded in its dedicated describe block.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeFake } from './test/chrome-fake.js';

let fake;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const addOverlay = () => {
  const overlay = document.createElement('div');
  overlay.id = 'focalpoint-overlay';
  document.body.appendChild(overlay);
  return overlay;
};

const overlayInDom = () => document.getElementById('focalpoint-overlay') !== null;

beforeEach(async () => {
  history.replaceState({}, '', '/start'); // jsdom URL persists across tests in this file
  document.body.innerHTML = '';
  document.title = 'Start Page';
  fake = createChromeFake();
  globalThis.chrome = fake.chrome;
  globalThis.fpContentHelpers = {
    getPageSnippet: vi.fn(() => 'controlled snippet text'),
    injectBlockOverlay: vi.fn(),
  };
  vi.resetModules();
  await import('./content.js');
  // init() classifies once at load; let it settle and discard its traffic so
  // each test asserts only on what its own dispatch caused.
  await flush();
  fake.chrome.runtime.sendMessage.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.chrome;
  delete globalThis.fpContentHelpers;
});

describe('tab_change', () => {
  it('removes the stale overlay, re-classifies the page, and injects the overlay on BLOCK', async () => {
    addOverlay();
    fake.chrome.runtime.sendMessage.mockResolvedValueOnce({
      decision: 'BLOCK',
      reason: 'off topic',
      strictMode: true,
    });

    fake.dispatchMessage({ action: 'tab_change' });
    await flush();

    expect(overlayInDom()).toBe(false);
    expect(fake.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'classify_page',
      payload: {
        url: 'https://example.com/start',
        pageTitle: 'Start Page',
        pageSnippet: 'controlled snippet text',
      },
    });
    expect(fpContentHelpers.injectBlockOverlay).toHaveBeenCalledWith('off topic', true);
  });

  it('does not inject an overlay on ALLOW', async () => {
    fake.chrome.runtime.sendMessage.mockResolvedValueOnce({ decision: 'ALLOW' });

    fake.dispatchMessage({ action: 'tab_change' });
    await flush();

    expect(fpContentHelpers.injectBlockOverlay).not.toHaveBeenCalled();
  });

  it.each([
    ['an error response', { error: 'backend down' }],
    ['an empty response', undefined],
  ])('fails open on %s from the background', async (_label, response) => {
    fake.chrome.runtime.sendMessage.mockResolvedValueOnce(response);

    fake.dispatchMessage({ action: 'tab_change' });
    await flush();

    expect(fpContentHelpers.injectBlockOverlay).not.toHaveBeenCalled();
  });

  it('fails open when the classify message itself rejects', async () => {
    fake.chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('SW asleep'));

    fake.dispatchMessage({ action: 'tab_change' });
    await flush();

    expect(fpContentHelpers.injectBlockOverlay).not.toHaveBeenCalled();
  });

  it('discards a stale BLOCK that resolves after a newer classification started', async () => {
    const deferred = [];
    fake.chrome.runtime.sendMessage.mockImplementation(
      () => new Promise((resolve) => deferred.push(resolve)),
    );

    fake.dispatchMessage({ action: 'tab_change' }); // classification A
    await flush();
    fake.dispatchMessage({ action: 'tab_change' }); // classification B supersedes A
    await flush();
    deferred[0]({ decision: 'BLOCK', reason: 'stale', strictMode: false });
    await flush();

    expect(fpContentHelpers.injectBlockOverlay).not.toHaveBeenCalled();

    deferred[1]({ decision: 'BLOCK', reason: 'fresh', strictMode: false });
    await flush();

    expect(fpContentHelpers.injectBlockOverlay).toHaveBeenCalledTimes(1);
    expect(fpContentHelpers.injectBlockOverlay).toHaveBeenCalledWith('fresh', false);
  });

  it('discards a BLOCK for a page the user already navigated away from', async () => {
    const deferred = [];
    fake.chrome.runtime.sendMessage.mockImplementation(
      () => new Promise((resolve) => deferred.push(resolve)),
    );

    fake.dispatchMessage({ action: 'tab_change' });
    await flush();
    history.pushState({}, '', '/moved-on');
    deferred[0]({ decision: 'BLOCK', reason: 'too late', strictMode: false });
    await flush();

    expect(fpContentHelpers.injectBlockOverlay).not.toHaveBeenCalled();
  });
});

describe('same-title retry guard (bounded deferral)', () => {
  // init() in beforeEach already classified once, pinning
  // lastClassifiedTitle = 'Start Page' / lastClassifiedSnippet =
  // 'controlled snippet text' — the guard's precondition.

  it('classifies with the current snippet after a single 1s deferral when the snippet changed under the same title', async () => {
    vi.useFakeTimers();
    fake.chrome.runtime.sendMessage.mockResolvedValue({ decision: 'ALLOW' });
    fpContentHelpers.getPageSnippet.mockReturnValue('snippet after settling');

    fake.dispatchMessage({ action: 'tab_change' });
    await vi.advanceTimersByTimeAsync(0);

    // Still-rendering heuristic: same title + changed snippet defers once
    expect(fake.chrome.runtime.sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    // Catches: the deferral never settling into an actual classification
    expect(fake.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(fake.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'classify_page',
      payload: {
        url: 'https://example.com/start',
        pageTitle: 'Start Page',
        pageSnippet: 'snippet after settling',
      },
    });
  });

  it('does not livelock when the snippet never stops changing', async () => {
    vi.useFakeTimers();
    fake.chrome.runtime.sendMessage.mockResolvedValue({ decision: 'ALLOW' });
    let churn = 0;
    fpContentHelpers.getPageSnippet.mockImplementation(
      () => `churning snippet ${++churn}`,
    );

    fake.dispatchMessage({ action: 'tab_change' });
    await vi.advanceTimersByTimeAsync(5000);

    // Catches: unbounded re-deferral on feed-like pages — distinct from the
    // test above, which a wait-for-stability regression would still pass;
    // here the snippet is different on every read and classification must
    // happen anyway (exactly once, with whatever snippet was current).
    expect(fake.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('spa_change', () => {
  it('removes the overlay immediately but classifies only after the 1s settle delay', async () => {
    vi.useFakeTimers();
    addOverlay();
    fake.chrome.runtime.sendMessage.mockResolvedValueOnce({ decision: 'ALLOW' });

    fake.dispatchMessage({ action: 'spa_change' });

    expect(overlayInDom()).toBe(false);
    expect(fake.chrome.runtime.sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(fake.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'classify_page',
      payload: {
        url: 'https://example.com/start',
        pageTitle: 'Start Page',
        pageSnippet: 'controlled snippet text',
      },
    });
  });

  it('aborts the delayed classification when the URL changes again during the wait', async () => {
    vi.useFakeTimers();

    fake.dispatchMessage({ action: 'spa_change' });
    history.pushState({}, '', '/changed-again');
    await vi.advanceTimersByTimeAsync(1000);

    expect(fake.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
