/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://example.com/start" }
 *
 * Contract tests for content.js's tab_change / spa_change handlers and the
 * classify_page orchestration they drive (stale-response + navigation
 * guards). fpContentHelpers is stubbed — snippet extraction and the overlay
 * DOM have their own unit tests in lib/; these tests are about the contract.
 *
 * Every case keeps the snippet stub constant so the same-title/changed-snippet
 * retry guard (the documented livelock, classify-retry-livelock.md) never
 * triggers — its behavior is deliberately not encoded here.
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
