// To track the most recent classification request and ignore stale responses
let currentClassificationId = 0;
let lastClassifiedTitle = null;
let lastClassifiedSnippet = null;

// Get a snippet of visible text from the page
const getPageSnippet = () => {
    // For SPAs, main content areas are more reliable than meta description
    // because meta tags often don't update on client-side navigation
    const mainContent = document.querySelector(
        'main, article, [role="main"], #content',
    );
    if (mainContent) {
        const text = mainContent.innerText;
        if (text && text.trim().length > 20) {
            return text.trim().slice(0, 500);
        }
    }

    // Paragraph text as second option
    const paragraphs = document.querySelectorAll('p, h1, h2, h3');
    let text = '';
    for (let el of paragraphs) {
        text += el.innerText + ' ';
        if (text.length > 500) break;
    }
    if (text.trim().length > 20) {
        return text.trim().slice(0, 500);
    }

    // Meta description as last resort only — unreliable on SPAs
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && metaDesc.content && metaDesc.content.length > 20) {
        return metaDesc.content.slice(0, 500);
    }

    return document.title;
};

// Inject the soft block overlay
const injectBlockOverlay = (reason) => {
  // Don't inject if one already exists
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

            <p style="font-size: 14px; color: #5a5f6e; line-height: 1.6; margin: 0 0 32px;">
                ${reason || 'This page does not appear to be related to your current focus goal.'}
            </p>

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
            </div>
        </div>
    `;

  document.body.appendChild(overlay);

  // Go back button
  document.getElementById('fp-go-back').addEventListener('click', () => {
    window.history.back();
  });

  // Proceed anyway button
  document.getElementById('fp-proceed').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'override_page',
      payload: { url: window.location.href },
    });
    overlay.remove();
  });
};

// Classify the current page
const classify_page = async () => {
  const url = window.location.href;
  const pageTitle = document.title;
  const pageSnippet = getPageSnippet();

  // Don't classify extension pages or chrome:// pages or if user has already chosen to override
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://'))
    return;

  if (pageTitle === lastClassifiedTitle && pageSnippet !== lastClassifiedSnippet) {
    setTimeout(classify_page, 1000);
    return;
  }

  const classificationId = ++currentClassificationId;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'classify_page',
      payload: { url, pageTitle, pageSnippet },
    });

    // If a newer classification has started since this one, discard this result
    if (classificationId !== currentClassificationId) return;

    // By the time Claude responds, are we still on the same page? If not, abort (prevents acting on stale classification results after navigation)
    if (window.location.href !== url) return;

    if (!response || response.error) {
      console.log(
        'FocalPoint:',
        response?.error || 'No response from background',
      );
      return;
    }

    if (response.decision === 'BLOCK') {
      injectBlockOverlay(response.reason);
    }
  } catch (err) {
    // Extension context may be invalidated — silently fail
    return;
  }
};

// Run classification when content script first loads on a fresh page
// Use document.readyState to ensure the HTML is parsed before we scrape
const init = async () => {
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', classify_page);
    } else {
      classify_page();
    }
  } catch (err) {
    // Silently fail if we can't run the content script for some reason
    return;
  }
};

init();

// Listen for CHECK_NOW from background (tab switch or SPA navigation)
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'tab_change') {
    const existing = document.getElementById('focalpoint-overlay');
    if (existing) existing.remove();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', classify_page);
    } else {
      classify_page();
    }
  }

  if (message.action === 'spa_change') {
    // For SPAs, we need to wait a moment for the new content to load before classifying
    const existing = document.getElementById('focalpoint-overlay');
    if (existing) existing.remove();

    // Capture URL now so we can verify it hasn't changed again during the wait
    const urlAtChangeTime = window.location.href;

    setTimeout(() => {
      // If the URL changed again during the wait, abort
      // This prevents classifying an intermediate navigation
      if (window.location.href !== urlAtChangeTime) return;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', classify_page);
      } else {
        classify_page();
      }
    }, 1000); // Wait 1 second for SPA content to load
  }
});
