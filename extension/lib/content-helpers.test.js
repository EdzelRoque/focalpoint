import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './content-helpers.js';

const { getPageSnippet, injectBlockOverlay } = globalThis.fpContentHelpers;

const LONG_TEXT =
  'Deep work is the ability to focus without distraction on a\n' +
  'cognitively   demanding task. It is a skill that allows you to\n' +
  '\t quickly master complicated information and produce better\n' +
  'results in less time. '.repeat(6);

const normalized = (text) => text.replace(/\s+/g, ' ').trim();

describe('getPageSnippet', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.title = '';
  });

  it('returns the first 500 chars of whitespace-normalized main text', () => {
    const main = document.createElement('main');
    main.textContent = LONG_TEXT;
    document.body.append(main);

    const snippet = getPageSnippet();

    expect(snippet).toBe(normalized(LONG_TEXT).slice(0, 500));
  });

  it('prefers main over an article that appears earlier in the document', () => {
    document.body.innerHTML =
      '<article>This short article teaser comes first.</article>';
    const main = document.createElement('main');
    main.textContent = LONG_TEXT;
    document.body.append(main);

    expect(getPageSnippet()).toBe(normalized(LONG_TEXT).slice(0, 500));
  });

  it('falls through a too-short container to paragraph text', () => {
    document.body.innerHTML =
      '<main>tiny</main>' +
      '<p>This paragraph has genuinely useful page content in it.</p>';

    expect(getPageSnippet()).toBe(
      'This paragraph has genuinely useful page content in it.',
    );
  });

  it('caps concatenated paragraph and heading text at 500 chars', () => {
    const paragraph = `<p>${'focused writing session content '.repeat(4)}</p>`;
    document.body.innerHTML = `<h1>Course notes</h1>${paragraph.repeat(10)}`;

    const snippet = getPageSnippet();

    expect(snippet.length).toBe(500);
    expect(snippet.startsWith('Course notes focused writing session')).toBe(
      true,
    );
  });

  it('uses the trimmed meta description when no body text qualifies', () => {
    document.body.innerHTML = '<p>too short</p>';
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = '  A study guide for the calculus midterm exam.  ';
    document.head.append(meta);

    expect(getPageSnippet()).toBe(
      'A study guide for the calculus midterm exam.',
    );
  });

  it('never returns empty: falls back to the hostname on a blank page', () => {
    // Empty body, empty title — the old code returned "" here, which made
    // background.js reject the payload and skip classification entirely.
    expect(getPageSnippet()).toBe(window.location.hostname);
    expect(getPageSnippet()).not.toBe('');
  });
});

describe('injectBlockOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  it('injects the overlay with the reason text and both buttons', () => {
    injectBlockOverlay('Off-topic: social media', false);

    expect(document.getElementById('focalpoint-overlay')).not.toBeNull();
    expect(document.getElementById('fp-reason').textContent).toBe(
      'Off-topic: social media',
    );
    expect(document.getElementById('fp-go-back')).not.toBeNull();
    expect(document.getElementById('fp-proceed')).not.toBeNull();
  });

  it('shows the default message when reason is missing', () => {
    injectBlockOverlay(undefined, false);

    expect(document.getElementById('fp-reason').textContent).toBe(
      'This page does not appear to be related to your current focus goal.',
    );
  });

  it('omits the proceed button in strict mode', () => {
    injectBlockOverlay('reason', true);

    expect(document.getElementById('fp-proceed')).toBeNull();
  });

  it('does not inject a second overlay when one already exists', () => {
    injectBlockOverlay('first', false);
    injectBlockOverlay('second', false);

    expect(document.querySelectorAll('#focalpoint-overlay').length).toBe(1);
    expect(document.getElementById('fp-reason').textContent).toBe('first');
  });

  it('sends the override message and removes the overlay on proceed', () => {
    globalThis.chrome = { runtime: { sendMessage: vi.fn() } };
    injectBlockOverlay('reason', false);

    document.getElementById('fp-proceed').click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'override_page',
      payload: { url: window.location.href },
    });
    expect(document.getElementById('focalpoint-overlay')).toBeNull();
  });

  it('renders hostile HTML in the reason as literal text, not markup', () => {
    injectBlockOverlay('<img src=x onerror=alert(1)>', false);

    const reasonEl = document.getElementById('fp-reason');
    expect(reasonEl.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(reasonEl.querySelector('img')).toBeNull();
  });
});
