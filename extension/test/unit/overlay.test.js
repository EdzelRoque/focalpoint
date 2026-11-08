// The block overlay and page snippet extraction (lib/content-helpers.js).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeChrome } from '../support/fakeChrome.js';
import { settle } from '../support/load.js';

let helpers, chrome;
beforeEach(async () => {
  chrome = createFakeChrome();
  vi.stubGlobal('chrome', chrome);
  vi.resetModules();
  await import('../../lib/content-helpers.js');
  helpers = globalThis.fpContentHelpers;
});

const overlay = () => document.getElementById('focalpoint-overlay');
const click = (id) => document.getElementById(id).click();

describe('block overlay', () => {
  it('shows the reason as plain text (model output is never parsed as HTML)', () => {
    helpers.injectBlockOverlay('<img src=x onerror=alert(1)>Off topic', false);
    expect(document.getElementById('fp-reason').textContent).toBe('<img src=x onerror=alert(1)>Off topic');
    expect(overlay().querySelector('img')).toBeNull();
  });

  it('falls back to a default reason', () => {
    helpers.injectBlockOverlay('', false);
    expect(document.getElementById('fp-reason').textContent).toMatch(/not appear to be related/);
  });

  it('covers the whole page above everything else', () => {
    helpers.injectBlockOverlay('x', false);
    expect(overlay().style.position).toBe('fixed');
    expect(overlay().style.zIndex).toBe('2147483647');
  });

  it('is never injected twice', () => {
    helpers.injectBlockOverlay('a', false);
    helpers.injectBlockOverlay('b', false);
    expect(document.querySelectorAll('#focalpoint-overlay')).toHaveLength(1);
  });

  it('offers "Proceed anyway" normally, but not in strict mode', () => {
    helpers.injectBlockOverlay('x', false);
    expect(document.getElementById('fp-proceed')).not.toBeNull();
    helpers.removeBlockOverlay();
    helpers.injectBlockOverlay('x', true);
    expect(document.getElementById('fp-proceed')).toBeNull();
    expect(document.getElementById('fp-go-back')).not.toBeNull();
  });

  it('"Go back" navigates back in history', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    helpers.injectBlockOverlay('x', false);
    click('fp-go-back');
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('removeBlockOverlay takes it down (and is safe with none)', () => {
    helpers.removeBlockOverlay();
    helpers.injectBlockOverlay('x', false);
    helpers.removeBlockOverlay();
    expect(overlay()).toBeNull();
  });
});

describe('"Proceed anyway" (override)', () => {
  it('asks the background to record an override for this page', async () => {
    chrome.runtime.respond = async () => ({ status: 'Override logged' });
    helpers.injectBlockOverlay('x', false);
    click('fp-proceed');
    await settle();
    expect(chrome.sentRuntime).toEqual([{ action: 'override_page', payload: { url: window.location.href } }]);
  });

  it('removes the overlay once the override is recorded', async () => {
    chrome.runtime.respond = async () => ({ status: 'Override logged' });
    helpers.injectBlockOverlay('x', false);
    click('fp-proceed');
    await settle();
    expect(overlay()).toBeNull();
  });

  it('removes the overlay if the session has already ended', async () => {
    chrome.runtime.respond = async () => ({ sessionEnded: true });
    helpers.injectBlockOverlay('x', false);
    click('fp-proceed');
    await settle();
    expect(overlay()).toBeNull();
  });

  it.each([
    ['the backend rejects it', async () => ({ error: 'Override sync failed: 500' })],
    ['the message fails', async () => { throw new Error('Extension context invalidated'); }],
    ['there is no answer', async () => undefined],
  ])('keeps the overlay and shows an error when %s', async (_label, respond) => {
    chrome.runtime.respond = respond;
    helpers.injectBlockOverlay('x', false);
    click('fp-proceed');
    await settle();
    expect(overlay()).not.toBeNull();
    expect(document.getElementById('fp-override-error').textContent).toBe(helpers.OVERRIDE_ERROR_TEXT);
    expect(document.getElementById('fp-proceed').disabled).toBe(false); // can retry
  });

  it('a retry after an error can succeed', async () => {
    let attempt = 0;
    chrome.runtime.respond = async () => (++attempt === 1 ? { error: 'down' } : { status: 'Override logged' });
    helpers.injectBlockOverlay('x', false);
    click('fp-proceed');
    await settle();
    click('fp-proceed');
    await settle();
    expect(overlay()).toBeNull();
  });

  it('cannot be double-submitted while a request is in flight', async () => {
    let release;
    chrome.runtime.respond = () => new Promise((r) => { release = r; });
    helpers.injectBlockOverlay('x', false);
    click('fp-proceed');
    click('fp-proceed');
    await settle();
    expect(chrome.sentRuntime).toHaveLength(1);
    release({ status: 'Override logged' });
  });
});

describe('page snippet', () => {
  const snippet = (html, title = 'Title') => {
    document.title = title;
    document.body.innerHTML = html;
    return helpers.getPageSnippet();
  };

  it('prefers <main> over an earlier <article> teaser', () => {
    expect(snippet('<article>Short teaser text but long enough to count</article><main>The real main content of the lesson page</main>'))
      .toBe('The real main content of the lesson page');
  });

  it('collapses whitespace and caps at 500 characters', () => {
    const s = snippet(`<main>${'word   \n '.repeat(200)}</main>`);
    expect(s.length).toBe(500);
    expect(s).not.toMatch(/\s{2,}/);
  });

  it('falls back to paragraphs and headings', () => {
    expect(snippet('<h1>Stereochemistry</h1><p>Chiral centers and enantiomers explained.</p>'))
      .toBe('Stereochemistry Chiral centers and enantiomers explained.');
  });

  it('falls back to the meta description', () => {
    document.head.innerHTML = '<meta name="description" content="A description of this page that is long enough">';
    expect(snippet('<div>tiny</div>')).toBe('A description of this page that is long enough');
  });

  it('never returns an empty string: falls back to the title, then the hostname', () => {
    expect(snippet('', 'My Title')).toBe('My Title');
    expect(snippet('', '   ')).toBe(window.location.hostname);
  });
});
