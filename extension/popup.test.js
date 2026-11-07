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
  await fake.chrome.storage.local.set({ privacyConsent: true, ...storageSeed });
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
  await import('./lib/privacy.js'); // publishes globalThis.fpPrivacy
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.chrome;
  delete globalThis.fpPopupHelpers;
  delete globalThis.fpPrivacy;
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

const isVisible = (id) => document.getElementById(id).style.display !== 'none';

describe('privacy consent', () => {
  it('shows the consent view instead of the start view until the user agrees', async () => {
    await loadPopup({ token: 'tok-1', privacyConsent: undefined });

    expect(isVisible('view-consent')).toBe(true);
    expect(isVisible('view-start')).toBe(false);
  });

  it('stores consent and continues to the start view on agree', async () => {
    await loadPopup({ token: 'tok-1', privacyConsent: undefined });

    document.getElementById('consent-agree').click();
    await flushMicrotasks();

    expect((await fake.chrome.storage.local.get(['privacyConsent'])).privacyConsent).toBe(true);
    expect(isVisible('view-start')).toBe(true);
    expect(isVisible('view-consent')).toBe(false);
  });

  it('returns to a running session after agreeing', async () => {
    await loadPopup({ token: 'tok-1', activeSession: makeSession(), privacyConsent: undefined });

    document.getElementById('consent-agree').click();
    await flushMicrotasks();

    expect(isVisible('view-active')).toBe(true);
  });

  it('opens the privacy policy from the consent view', async () => {
    await loadPopup({ token: 'tok-1', privacyConsent: undefined });

    document.getElementById('consent-policy').click();

    expect(fake.chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://focalpoint-rho.vercel.app/privacy',
    });
  });
});

describe('private sites list', () => {
  const addDomain = async (value) => {
    document.getElementById('private-domain').value = value;
    document.getElementById('private-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();
  };
  const stored = async () => (await fake.chrome.storage.local.get(['privateDomains'])).privateDomains;

  it('saves a cleaned-up domain and shows it', async () => {
    await loadPopup({ token: 'tok-1' });

    await addDomain('https://www.MyTherapist.example/notes');

    expect(await stored()).toEqual(['mytherapist.example']);
    expect(document.getElementById('private-list').textContent).toContain('mytherapist.example');
  });

  it('shows an error and saves nothing for an invalid domain', async () => {
    await loadPopup({ token: 'tok-1' });

    await addDomain('not a domain');

    expect(await stored()).toBeUndefined();
    expect(isVisible('private-error')).toBe(true);
  });

  it('does not add the same domain twice', async () => {
    await loadPopup({ token: 'tok-1', privateDomains: ['example.com'] });

    await addDomain('example.com');

    expect(await stored()).toEqual(['example.com']);
  });

  it('removes a domain', async () => {
    await loadPopup({ token: 'tok-1', privateDomains: ['example.com'] });

    document.querySelector('#private-list button').click();
    await flushMicrotasks();

    expect(await stored()).toEqual([]);
  });

  it('renders a saved domain as text, never as HTML', async () => {
    await loadPopup({ token: 'tok-1', privateDomains: ['<img src=x>.example'] });

    expect(document.querySelector('#private-list img')).toBeNull();
  });
});

describe('sign out', () => {
  it('keeps consent and the private list, and removes the token and session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    await loadPopup({ token: 'tok-1', activeSession: makeSession(), privateDomains: ['example.com'] });

    document.getElementById('logout-btn').click();
    await flushMicrotasks();
    await flushMicrotasks();

    const left = await fake.chrome.storage.local.get([
      'token', 'activeSession', 'privacyConsent', 'privateDomains',
    ]);
    expect(left).toEqual({ privacyConsent: true, privateDomains: ['example.com'] });
    vi.unstubAllGlobals();
  });
});
