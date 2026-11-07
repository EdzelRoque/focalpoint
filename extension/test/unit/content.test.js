// The content script: when a page gets classified, and what happens with the
// answer (block overlay or nothing).
import { describe, it, expect, vi } from 'vitest';
import { loadContent, settle } from '../support/load.js';

const overlay = () => document.getElementById('focalpoint-overlay');
const classifyRequests = (chrome) => chrome.sentRuntime.filter((m) => m.action === 'classify_page');

describe('on page load', () => {
  it('asks the background to classify the page with its URL, title and snippet', async () => {
    const env = await loadContent({ title: 'Reaction mechanisms' });
    await settle();
    expect(classifyRequests(env.chrome)).toEqual([{
      action: 'classify_page',
      payload: {
        url: window.location.href,
        pageTitle: 'Reaction mechanisms',
        pageSnippet: 'Organic chemistry lecture notes on reaction mechanisms and stereochemistry.',
      },
    }]);
  });

  it('uses the hostname when the page has no title', async () => {
    const env = await loadContent({ title: '   ' });
    await settle();
    expect(classifyRequests(env.chrome)[0].payload.pageTitle).toBe(window.location.hostname);
  });

  it('shows the overlay with the reason on BLOCK', async () => {
    await loadWith(async () => ({ decision: 'BLOCK', reason: 'Cats are off topic.', strictMode: false }));
    expect(overlay()).not.toBeNull();
    expect(document.getElementById('fp-reason').textContent).toBe('Cats are off topic.');
  });
});

// Loads the content script with a scripted background answer.
const loadWith = async (respond) => {
  const { createFakeChrome } = await import('../support/fakeChrome.js');
  const chrome = createFakeChrome();
  chrome.runtime.respond = respond;
  vi.stubGlobal('chrome', chrome);
  document.title = 'Some page';
  document.body.innerHTML = '<main>Some page content that is long enough to classify</main>';
  vi.resetModules();
  await import('../../lib/content-helpers.js');
  await import('../../content.js');
  await settle();
  return chrome;
};

describe('fail open: nothing is blocked unless the answer is BLOCK', () => {
  it.each([
    ['ALLOW', async () => ({ decision: 'ALLOW', reason: 'ok' })],
    ['an error', async () => ({ error: 'No active session' })],
    ['no answer', async () => undefined],
    ['a failed message', async () => { throw new Error('Extension context invalidated'); }],
  ])('%s -> no overlay', async (_label, respond) => {
    await loadWith(respond);
    expect(overlay()).toBeNull();
  });

  it('respects strict mode from the answer (no "Proceed anyway")', async () => {
    await loadWith(async () => ({ decision: 'BLOCK', reason: 'x', strictMode: true }));
    expect(overlay()).not.toBeNull();
    expect(document.getElementById('fp-proceed')).toBeNull();
  });
});

describe('stale answers are ignored', () => {
  it('drops an answer that arrives after the user navigated to another URL', async () => {
    let release;
    await loadWith(() => new Promise((r) => { release = r; }));
    window.history.pushState({}, '', '/somewhere-else');
    release({ decision: 'BLOCK', reason: 'old page' });
    await settle();
    expect(overlay()).toBeNull();
    window.history.pushState({}, '', '/');
  });

  it('drops an older answer when a newer classification has started', async () => {
    const pending = [];
    const chrome = await loadWith(() => new Promise((r) => pending.push(r)));
    // a tab switch starts a second classification of the same page
    document.body.innerHTML = '<main>Different content now that is long enough</main>';
    await chrome.deliver({ action: 'tab_change' });
    await new Promise((r) => setTimeout(r, 1100)); // one deferral (snippet changed)
    await settle();
    expect(pending).toHaveLength(2);
    pending[0]({ decision: 'BLOCK', reason: 'stale' });
    await settle();
    expect(overlay()).toBeNull();
    pending[1]({ decision: 'ALLOW', reason: 'fresh' });
  });
});

describe('messages from the background', () => {
  it('session_ended takes the overlay down', async () => {
    const chrome = await loadWith(async () => ({ decision: 'BLOCK', reason: 'x', strictMode: false }));
    expect(overlay()).not.toBeNull();
    await chrome.deliver({ action: 'session_ended' });
    expect(overlay()).toBeNull();
  });

  it('tab_change removes the old overlay and classifies again', async () => {
    let answer = { decision: 'BLOCK', reason: 'x', strictMode: false };
    const chrome = await loadWith(async () => answer);
    answer = { decision: 'ALLOW', reason: 'now fine' };
    await chrome.deliver({ action: 'tab_change' });
    await settle();
    expect(overlay()).toBeNull();
    expect(classifyRequests(chrome)).toHaveLength(2);
  });

  it('spa_change waits ~1s for the new content, then classifies', async () => {
    const chrome = await loadWith(async () => ({ decision: 'ALLOW' }));
    vi.useFakeTimers();
    window.history.pushState({}, '', '/next-video');
    await chrome.deliver({ action: 'spa_change' });
    expect(classifyRequests(chrome)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(classifyRequests(chrome)).toHaveLength(2);
    expect(classifyRequests(chrome)[1].payload.url).toMatch(/\/next-video$/);
    vi.useRealTimers();
    window.history.pushState({}, '', '/');
  });

  it('spa_change is skipped if the URL changes again during the wait', async () => {
    const chrome = await loadWith(async () => ({ decision: 'ALLOW' }));
    vi.useFakeTimers();
    window.history.pushState({}, '', '/a');
    await chrome.deliver({ action: 'spa_change' });
    window.history.pushState({}, '', '/b');
    await vi.advanceTimersByTimeAsync(1000);
    expect(classifyRequests(chrome)).toHaveLength(1);
    vi.useRealTimers();
    window.history.pushState({}, '', '/');
  });
});

describe('pages whose text keeps changing (feeds, tickers) still get classified', () => {
  it('defers at most once, then classifies with the current text', async () => {
    const chrome = await loadWith(async () => ({ decision: 'BLOCK', reason: 'feed', strictMode: false }));
    document.getElementById('focalpoint-overlay')?.remove();
    vi.useFakeTimers();
    let tick = 0;
    const timer = setInterval(() => { document.body.innerHTML = `<main>Live feed update number ${++tick} with plenty of text</main>`; }, 200);
    document.body.innerHTML = '<main>Live feed update number 0 with plenty of text</main>';
    await chrome.deliver({ action: 'tab_change' });
    await vi.advanceTimersByTimeAsync(1000);
    clearInterval(timer);
    vi.useRealTimers();
    await settle();
    expect(classifyRequests(chrome)).toHaveLength(2);
  });
});
