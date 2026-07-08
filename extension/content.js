// To track the most recent classification request and ignore stale responses
let currentClassificationId = 0;
let lastClassifiedTitle = null;
let lastClassifiedSnippet = null;

// getPageSnippet and injectBlockOverlay live in lib/content-helpers.js,
// loaded before this file via the manifest content_scripts js array. Use
// the fpContentHelpers namespace directly — destructuring into same-named
// consts is a redeclaration SyntaxError in the shared content-script scope.

// Helper function to call the background script, which calls the Claude API.
// isRetry is compared strictly to true because event listeners invoke this
// with an Event as the first argument.
const classify_page = async (isRetry) => {
  const url = window.location.href;
  const pageTitle = document.title;
  const pageSnippet = fpContentHelpers.getPageSnippet();

  // Don't classify extension pages or chrome:// pages or if user has already chosen to override
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://'))
    return;

  // Same title but changed snippet usually means the page is still rendering
  // — give it one beat to settle. At most ONE deferral per trigger: pages
  // whose text never stops changing (feeds, tickers, chat) would otherwise
  // re-defer forever and never be classified (classify-retry-livelock.md).
  // The retry classifies with whatever snippet is current.
  if (pageTitle === lastClassifiedTitle && pageSnippet !== lastClassifiedSnippet && isRetry !== true) {
    setTimeout(() => classify_page(true), 1000);
    return;
  }

  const classificationId = ++currentClassificationId;

  lastClassifiedTitle = pageTitle;
  lastClassifiedSnippet = pageSnippet;

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
      return;
    }

    if (response.decision === 'BLOCK') {
      fpContentHelpers.injectBlockOverlay(response.reason, response.strictMode);
    }
  } catch (err) {
    return;
  }
};

// Init() will run as soon as the content script loads onto the page
const init = async () => {
  try {
    // YouTube-specific setup
    if (window.location.hostname.includes('youtube.com')) {
      document.addEventListener('yt-page-data-updated', () => {
        const existing = document.getElementById('focalpoint-overlay');
        if (existing) existing.remove();
        classify_page();
      });
    }

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

// Listeners -- this is for messages from background.js to trigger classification on a tab change or SPA navigation
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
    // If we are on YouTube, do nothing. Let the yt-navigate-finish event handle it.
    if (window.location.hostname.includes('youtube.com')) return;

    const existing = document.getElementById('focalpoint-overlay');
    if (existing) existing.remove();

    // Capture URL now so we can verify it hasn't changed again during the wait
    const urlAtChangeTime = window.location.href;

    setTimeout(() => {
      // If the URL changed again during the wait, abort
      if (window.location.href !== urlAtChangeTime) return;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', classify_page);
      } else {
        classify_page();
      }
    }, 1000); // Wait 1 second for SPA content to load
  }
});
