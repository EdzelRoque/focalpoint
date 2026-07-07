// jsdom does not implement innerText (it requires layout). Delegate to
// textContent so getPageSnippet & co. are testable. Real innerText
// semantics (hidden text, script/style exclusion) are covered by the
// Playwright layer in real Chrome.
if (!('innerText' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'innerText', {
    get() {
      return this.textContent;
    },
    configurable: true,
  });
}
