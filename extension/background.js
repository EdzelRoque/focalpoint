import './lib/privacy.js'; // publishes globalThis.fpPrivacy

// Keep track of the session in memory for quick access
const BASE_URL = 'https://focalpoint-q8r5.onrender.com';
let activeSession = null;

// chrome.storage.local is the source of truth for activeSession. Lazy
// read-through cache; storage wins on conflict.
const getActiveSession = async () => {
    if (activeSession) return activeSession;
    try {
        const data = await chrome.storage.local.get(['activeSession']);
        if (data.activeSession) activeSession = data.activeSession;
    } catch (err) {
        console.error('Background: Error loading active session from storage', err);
    }
    return activeSession;
};

// The one place page data leaves the extension. Returns a reason to withhold
// the page, or null when it may be sent.
const getWithholdReason = async (url) => {
    const { privacyConsent, privateDomains } = await chrome.storage.local.get([
        'privacyConsent',
        'privateDomains',
    ]);
    if (!privacyConsent) return 'Privacy consent needed';
    if (fpPrivacy.isNeverSend(url, privateDomains ?? [])) return 'Private page';
    return null;
};

// Keep the in-memory cache in sync with storage writes from any source
// (popup.js writes, logout clear, our own block/override increments).
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!('activeSession' in changes)) return;
    activeSession = changes.activeSession.newValue ?? null;
});

// init() is no longer needed: getActiveSession() reads chrome.storage.local
// lazily on demand, and chrome.storage.onChanged keeps the in-memory cache
// in sync afterward. Previously this pre-warmed the cache at SW startup, but
// it raced with cold-wake events (the listener could fire before the await
// resolved) and gave a false sense of safety.
// const init = async () => {
//     try {
//         const data = await chrome.storage.local.get(["activeSession"]);
//         if (data.activeSession) {
//             activeSession = data.activeSession;
//         }
//     } catch (err) {
//         console.error("Background: Error loading active session from storage", err);
//     }
// };
// init();


// Add event listeners for messages from popup.js or content.js (For classification of new tabs)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "session_started") {
        activeSession = message.session;
        sendResponse({ status: "Session saved in background" });
    }

    if (message.action === "session_ended") {
        activeSession = null;
        sendResponse({ status: "Session cleared in background" });
    }

    if (message.action === "classify_page") {
        // Get the URL, pageTitle, and pageSnippet from the message payload
        const payload = message.payload;
        const url = payload.url;
        const pageTitle = payload.pageTitle;
        const pageSnippet = payload.pageSnippet;

        // Validate the payload
        if (!url || !pageTitle || !pageSnippet) {
            sendResponse({ error: "Invalid message payload" });
            return;
        }

        // Call the backend classification API with the provided data
        const processClassification = async () => {
            try {
                const session = await getActiveSession();
                if (!session) {
                    sendResponse({ error: "No active session" });
                    return;
                }

                const sessionGoal = session.sessionGoal;
                const blockSensitivity = session.blockSensitivity;
                const strictMode = session.strictMode;

                const withheld = await getWithholdReason(url);
                if (withheld) {
                    sendResponse({ decision: "ALLOW", reason: withheld, strictMode });
                    return;
                }

                // Load token from storage to authenticate the request
                const { token } = await chrome.storage.local.get("token");
                if (!token) {
                    sendResponse({ decision: "ALLOW", reason: "Not authenticated" });
                    return;
                }

                const res = await fetch(`${BASE_URL}/api/classify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        url: fpPrivacy.stripUrl(url),
                        pageTitle: pageTitle,
                        pageSnippet: pageSnippet,
                        sessionGoal: sessionGoal,
                        blockSensitivity: blockSensitivity,
                        urlStripped: true
                    })
                });
                const data = await res.json();

                if (!res.ok) {
                    sendResponse({ error: data.error });
                    return;
                }

                // Determine the decision based on the backend response, if it indicates block, it will prompt the user to confirm to block or override
                if (data.decision === "BLOCK") {
                    const blockRes = await fetch(`${BASE_URL}/api/sessions/${session._id}/block`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (blockRes.ok) {
                        activeSession.blockCount += 1;
                        await chrome.storage.local.set({ activeSession }); // Persist the updated session state

                        // Send a message to popup to update the UI stats.
                        // Fire-and-forget: rejects whenever the popup is closed
                        // (no receiving end), which must not fail the block flow.
                        chrome.runtime.sendMessage({
                            action: "stats_update",
                            stats: {
                                blockCount: activeSession.blockCount,
                                overrideCount: activeSession.overrideCount
                            }
                        }).catch(() => {});
                    } else {
                        console.warn("Background: block sync failed", blockRes.status);
                    }
                }
                
                // Send the final decision back to the content script, including strictMode
                sendResponse({ 
                    decision: data.decision, 
                    reason: data.reason,
                    strictMode: strictMode
                 });
            } catch (error) {
                sendResponse({ error: error });
            }
        };

        // Execute the async function
        processClassification();
    }

    if (message.action === 'override_page') {
      // Get the URL from the message payload
      const payload = message.payload;
      const url = payload.url;

      // Validate the payload
      if (!url) {
        sendResponse({ error: 'Invalid message payload' });
        return;
      }

      // Call the backend override API to log the override action
      const processOverride = async () => {
        try {
          const session = await getActiveSession();
          if (!session) {
            sendResponse({ error: 'No active session' });
            return;
          }

          const sessionGoal = session.sessionGoal;
          const blockSensitivity = session.blockSensitivity;

          const withheld = await getWithholdReason(url);
          if (withheld) {
            sendResponse({ error: withheld });
            return;
          }
          // Load token from storage to authenticate the request
          const { token } = await chrome.storage.local.get('token');
          if (!token) {
            sendResponse({ error: 'Not authenticated' });
            return;
          }

          const overrideRes = await fetch(
            `${BASE_URL}/api/sessions/${session._id}/override`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                url: fpPrivacy.stripUrl(url),
                pageTitle: payload.pageTitle,
                sessionGoal: sessionGoal,
                blockSensitivity: blockSensitivity,
              }),
            },
          );

          if (overrideRes.ok) {
            activeSession.overrideCount += 1;
            await chrome.storage.local.set({ activeSession }); // Persist the updated session state

            // Send a message to popup to update the UI stats.
            // Fire-and-forget: rejects whenever the popup is closed (no
            // receiving end), which must not fail the override flow.
            chrome.runtime.sendMessage({
              action: 'stats_update',
              stats: {
                blockCount: activeSession.blockCount,
                overrideCount: activeSession.overrideCount,
              },
            }).catch(() => {});

            sendResponse({ status: 'Override logged' });
          } else {
            console.warn("Background: override sync failed", overrideRes.status);
            sendResponse({ error: `Override sync failed: ${overrideRes.status}` });
          }
        } catch (error) {
          sendResponse({ error: error });
        }
      };
      // Execute the async function
      processOverride();
    }

    // Synchronously return true to keep the message channel open
    return true;
});


// The content script already handles classifying new pages, so we have to handle:
// 1. When the user switches to a different, already-open tab
// 2. When a URL changes inside the SAME tab (The YouTube SPA fix)


// 1. Listen for when the user switches to a different, already-open tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const session = await getActiveSession();
    if (!session) return; // Don't track if no session is active

    try {
        await chrome.tabs.sendMessage(activeInfo.tabId, { action: "tab_change" });
    } catch (error) {
        // Silently fail if the tab is a chrome:// page or hasn't loaded a content script
    }
});

// 2. Listen for when a URL changes inside the SAME tab (SPAs)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const session = await getActiveSession();
  if (!session) return;

  // SPAs update the URL without changing the document status to 'complete'
  if (changeInfo.url) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'spa_change' });
    } catch (error) {
      // Silently fail if the content script isn't there
    }
  }
});

