/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://www.youtube.com/watch?v=abc" }
 *
 * The YouTube branch of content.js's spa_change handler needs a youtube.com
 * hostname, and jsdom's URL origin is fixed per environment — hence its own
 * file (pushState can't change the origin in content.test.js).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeFake } from './test/chrome-fake.js';

let fake;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  document.body.innerHTML = '';
  document.title = 'Some Video - YouTube';
  fake = createChromeFake();
  globalThis.chrome = fake.chrome;
  globalThis.fpContentHelpers = {
    getPageSnippet: vi.fn(() => 'controlled snippet text'),
    injectBlockOverlay: vi.fn(),
  };
  vi.resetModules();
  await import('./content.js');
  await flush();
  fake.chrome.runtime.sendMessage.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.chrome;
  delete globalThis.fpContentHelpers;
});

describe('spa_change on YouTube', () => {
  it('does nothing — yt-page-data-updated owns YouTube re-classification', async () => {
    vi.useFakeTimers();
    const overlay = document.createElement('div');
    overlay.id = 'focalpoint-overlay';
    document.body.appendChild(overlay);

    fake.dispatchMessage({ action: 'spa_change' });
    await vi.advanceTimersByTimeAsync(2000);

    expect(document.getElementById('focalpoint-overlay')).not.toBeNull();
    expect(fake.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
