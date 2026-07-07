// Pure content-script helpers. Classic script (no export statements) so the
// manifest can list it before content.js; published on globalThis so vitest
// can import the same file.

const normalizeWhitespace = (text) => (text || '').replace(/\s+/g, ' ').trim();

// Up to 500 chars of normalized page text for classification. Containers are
// tried in explicit priority order (not combined-selector document order —
// an early <article> teaser must not shadow the real <main>). Never returns
// an empty string: background.js rejects falsy snippets, which used to make
// blank pages silently skip classification.
const getPageSnippet = () => {
    // Main content container as the first option, in priority order
    for (const selector of ['main', 'article', '[role="main"]', '#content']) {
        const el = document.querySelector(selector);
        if (el) {
            const text = normalizeWhitespace(el.innerText);
            if (text.length > 20) return text.slice(0, 500);
        }
    }

    // Paragraph and heading text as second option
    let combined = '';
    for (const el of document.querySelectorAll('p, h1, h2, h3')) {
        combined += el.innerText + ' ';
        if (combined.length > 500) break;
    }
    combined = normalizeWhitespace(combined);
    if (combined.length > 20) return combined.slice(0, 500);

    // Meta description as last resort only — unreliable on SPAs
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && metaDesc.content) {
        const meta = normalizeWhitespace(metaDesc.content);
        if (meta.length > 20) return meta.slice(0, 500);
    }

    return document.title.trim() || window.location.hostname;
};

// Injects the block overlay with a reason. No-op if one already exists.
const injectBlockOverlay = (reason, strictMode) => {
  if (document.getElementById('focalpoint-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'focalpoint-overlay';
  overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(13, 15, 18, 0.97);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: 'DM Sans', system-ui, sans-serif;
        color: #e8e9eb;
    `;

  // Create the button HTML conditionally
  const proceedButtonHTML = strictMode
    ? ''
    : `
      <button id="fp-proceed" style="
          padding: 10px 20px;
          background: #13151e;
          color: #5a5f6e;
          border: 1px solid #1e2129;
          border-radius: 8px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
      ">Proceed anyway</button>
  `;

  overlay.innerHTML = `
        <div style="max-width: 420px; text-align: center; padding: 32px;">
            <div style="
                width: 48px; height: 48px;
                background: #1a1d27;
                border: 1px solid #6366f1;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                margin: 0 auto 20px;
                font-size: 22px;
            ">⚑</div>

            <p style="font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6366f1; margin: 0 0 10px;">FocalPoint</p>

            <h2 style="font-size: 22px; font-weight: 600; margin: 0 0 12px; color: #e8e9eb;">
                This page looks like a distraction
            </h2>

            <p id="fp-reason" style="font-size: 14px; color: #5a5f6e; line-height: 1.6; margin: 0 0 32px;"></p>

            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="fp-go-back" style="
                    padding: 10px 20px;
                    background: #6366f1;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-family: inherit;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                ">Go back</button>

                ${proceedButtonHTML}
            </div>
        </div>
    `;

  document.body.appendChild(overlay);

  // Assign reason as text to prevent any HTML inside the model response from being parsed as markup.
  document.getElementById('fp-reason').textContent =
    reason || 'This page does not appear to be related to your current focus goal.';

  // Go back button event listener
  document.getElementById('fp-go-back').addEventListener('click', () => {
    window.history.back();
  });

  // Only attach the proceed listener if the button actually exists!
  if (!strictMode) {
    document.getElementById('fp-proceed').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'override_page',
        payload: { url: window.location.href },
      });
      overlay.remove();
    });
  }
};

globalThis.fpContentHelpers = { getPageSnippet, injectBlockOverlay };
