/**
 * @vitest-environment jsdom
 *
 * Contract tests for popup.js's stats_update listener — the only live path
 * for the block/override counters while the popup is open. The real
 * popup.html body and real lib/popup-helpers.js are used (never mock our own
 * code); storage is seeded before import because init() runs at load.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import popupHtml from './popup.html?raw';
import { createChromeFake } from './test/chrome-fake.js';

const bodyHtml = popupHtml.slice(popupHtml.indexOf('<body>') + '<body>'.length, popupHtml.indexOf('</body>'));

let fake;

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const makeSession = () => ({
  _id: 'sess-1',
  sessionGoal: 'Study for my machine learning exam',
  startTime: new Date().toISOString(),
  blockCount: 0,
  overrideCount: 0,
});

// Seed storage first, then import — popup.js queries the DOM and runs init()
// at load, and init() decides the visible view from storage.
const loadPopup = async (storageSeed) => {
  await fake.chrome.storage.local.set(storageSeed);
  await import('./popup.js');
  await flushMicrotasks();
};

const statBlocks = () => document.getElementById('stat-blocks').textContent;
const statOverrides = () => document.getElementById('stat-overrides').textContent;

beforeEach(async () => {
  vi.useFakeTimers(); // keeps the elapsed-timer interval from leaking between tests
  document.body.innerHTML = bodyHtml;
  fake = createChromeFake();
  globalThis.chrome = fake.chrome;
  vi.resetModules();
  await import('./lib/popup-helpers.js'); // publishes globalThis.fpPopupHelpers
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.chrome;
  delete globalThis.fpPopupHelpers;
});

describe('stats_update', () => {
  it('updates both counters while the active-session view is shown', async () => {
    await loadPopup({ token: 'tok-1', activeSession: makeSession() });
    expect(document.getElementById('view-active').style.display).toBe('flex'); // arrange sanity

    fake.dispatchMessage({ action: 'stats_update', stats: { blockCount: 3, overrideCount: 1 } });

    expect(statBlocks()).toBe('3');
    expect(statOverrides()).toBe('1');
  });

  it('renders 0 for missing or zero counts instead of "undefined"', async () => {
    await loadPopup({ token: 'tok-1', activeSession: makeSession() });

    fake.dispatchMessage({ action: 'stats_update', stats: { blockCount: 0, overrideCount: undefined } });

    expect(statBlocks()).toBe('0');
    expect(statOverrides()).toBe('0');
  });

  it('leaves the counters untouched when the active-session view is not shown', async () => {
    await loadPopup({ token: 'tok-1' }); // logged in, no session → start view

    fake.dispatchMessage({ action: 'stats_update', stats: { blockCount: 3, overrideCount: 5 } });

    expect(statBlocks()).toBe('0');
    expect(statOverrides()).toBe('0');
  });
});
