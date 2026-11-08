import { afterEach, vi } from 'vitest';

// jsdom has no layout, so it lacks innerText. Use textContent instead so the
// snippet logic can be tested. Real innerText behavior (hidden text, no
// script/style) is covered by the journey tests in real Chrome.
if (!('innerText' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'innerText', {
    get() { return this.textContent; },
    configurable: true,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});
