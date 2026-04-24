// Keep track of the session in memory for quick access
const BASE_URL = 'https://focalpoint-q8r5.onrender.com';
let activeSession = null;


// Implement initialization logic
const init = async () => {
    try {
        const data = await chrome.storage.local.get(["activeSession"]);
        if (data.activeSession) {
            activeSession = data.activeSession;
        }
    } catch (err) {
        console.error("Background: Error loading active session from storage", err);
    }
};

init();


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
        if (!activeSession) {
            sendResponse({ error: "No active session" });
            return;
        }

        // Get the URL, pageTitle, and pageSnippet from the message payload
        const payload = message.payload;
        const url = payload.url;
        const pageTitle = payload.pageTitle;
        const pageSnippet = payload.pageSnippet;
        // Extract from activeSession
        const sessionGoal = activeSession.sessionGoal;
        const blockSensitivity = activeSession.blockSensitivity;
        const strictMode = activeSession.strictMode;

        // Validate the payload
        if (!url || !pageTitle || !pageSnippet) {
            sendResponse({ error: "Invalid message payload" });
            return;
        }

        // Call the backend classification API with the provided data
        const processClassification = async () => {
            try {
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
                        url: url, 
                        pageTitle: pageTitle, 
                        pageSnippet: pageSnippet,
                        sessionGoal: sessionGoal,
                        blockSensitivity: blockSensitivity
                    })
                });
                const data = await res.json();

                if (!res.ok) {
                    sendResponse({ error: data.error });
                    return;
                }

                // Determine the decision based on the backend response, if it indicates block, it will prompt the user to confirm to block or override
                if (data.decision === "BLOCK") {
                    const blockRes = await fetch(`${BASE_URL}/api/sessions/${activeSession._id}/block`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (blockRes.ok) {
                        activeSession.blockCount += 1;
                        await chrome.storage.local.set({ activeSession }); // Persist the updated session state

                        // Send a message to popup to update the UI stats
                        chrome.runtime.sendMessage({
                            action: "stats_update",
                            stats: {
                                blockCount: activeSession.blockCount,
                                overrideCount: activeSession.overrideCount
                            }
                        });
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
      // Necessary for background.js
      if (!activeSession) {
        sendResponse({ error: 'No active session' });
        return;
      }

      // Get the URL from the message payload
      const payload = message.payload;
      const url = payload.url;
      // Extra from activeSession
      const sessionGoal = activeSession.sessionGoal;
      const blockSensitivity = activeSession.blockSensitivity;

      // Validate the payload
      if (!url) {
        sendResponse({ error: 'Invalid message payload' });
        return;
      }

      // Call the backend override API to log the override action
      const processOverride = async () => {
        try {
          // Load token from storage to authenticate the request
          const { token } = await chrome.storage.local.get('token');
          // Necessary for background.js
          if (!token) {
            sendResponse({ error: 'Not authenticated' });
            return;
          }

          const overrideRes = await fetch(
            `${BASE_URL}/api/sessions/${activeSession._id}/override`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                url: url,
                sessionGoal: sessionGoal,
                blockSensitivity: blockSensitivity,
              }),
            },
          );

          if (overrideRes.ok) {
            activeSession.overrideCount += 1;
            await chrome.storage.local.set({ activeSession }); // Persist the updated session state

            // Send a message to popup to update the UI stats
            chrome.runtime.sendMessage({
              action: 'stats_update',
              stats: {
                blockCount: activeSession.blockCount,
                overrideCount: activeSession.overrideCount,
              },
            });

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
    if (!activeSession) return; // Don't track if no session is active

    try {
        await chrome.tabs.sendMessage(activeInfo.tabId, { action: "tab_change" });
    } catch (error) {
        // Silently fail if the tab is a chrome:// page or hasn't loaded a content script
    }
});

// 2. Listen for when a URL changes inside the SAME tab (SPAs)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!activeSession) return;

  // SPAs update the URL without changing the document status to 'complete'
  if (changeInfo.url) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'spa_change' });
    } catch (error) {
      // Silently fail if the content script isn't there
    }
  }
});

