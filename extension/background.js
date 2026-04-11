// Keep track of the session in memory for quick access
const BASE_URL = 'http://localhost:3000';
let activeSession = null;


// Implement initialization logic
const init = async () => {
    try {
        const data = await chrome.storage.local.get(["activeSession"]);
        if (data.activeSession) {
            activeSession = data.activeSession;
            console.log("Background: Loaded active session from storage ->", activeSession.sessionGoal);
        }
    } catch (err) {
        console.error("Background: Error loading active session from storage", err);
    }
};

init();


// Add event listeners for messages from popup.js or content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "SESSION_STARTED") {
        activeSession = message.session;
        sendResponse({ status: "Session saved in background" });
    }

    if (message.action === "SESSION_ENDED") {
        activeSession = null;
        sendResponse({ status: "Session cleared in background" });
    }

    if (message.action === "CLASSIFY_PAGE") {
        if (!activeSession) {
            sendResponse({ error: "No active session" });
            return;
        }

        // Get the URL, pageTitle, pageSnippet, and sessionGoal from the message payload
        const payload = message.payload;
        const url = payload.url;
        const pageTitle = payload.pageTitle;
        const pageSnippet = payload.pageSnippet;
        const sessionGoal = payload.sessionGoal;

        // Validate the payload
        if (!url || !pageTitle || !pageSnippet || !sessionGoal) {
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
                        sessionGoal: sessionGoal
                    })
                });
                const data = await res.json();

                if (!res.ok) {
                    sendResponse({ error: data.error });
                    return;
                }

                // Determine the decision based on the backend response, if it indicates block, it will prompt the user to confirm to block or override
                if (data.decision === "BLOCK") {
                    await fetch(`${BASE_URL}/api/sessions/${activeSession._id}/block`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
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
                }
                
                // Send the final decision back to the content script
                sendResponse({ decision: data.decision, reason: data.reason });
            } catch (error) {
                sendResponse({ error: error });
            }
        };

        // Execute the async function
        processClassification();
    }

    if (message.action === "OVERRIDE_PAGE") {
        // Necessary for background.js
        if (!activeSession) {
            sendResponse({ error: "No active session" });
            return;
        }

        // Call the backend override API to log the override action
        const processOverride = async () => {
            try {
                // Load token from storage to authenticate the request
                const { token } = await chrome.storage.local.get("token");
                // Necessary for background.js
                if (!token) {
                    sendResponse({ error: "Not authenticated" });
                    return;
                }

                await fetch(`${BASE_URL}/api/sessions/${activeSession._id}/override`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                activeSession.overrideCount += 1;
                await chrome.storage.local.set({ activeSession }); // Persist the updated session state

                // Send a message to popup to update the UI stats
                chrome.runtime.sendMessage({ 
                    action: "stats_update",
                    stats: { 
                        blockCount: activeSession.blockCount, 
                        overrideCount: activeSession.overrideCount 
                    }
                });

                sendResponse({ status: "Override logged" });
            } catch (error) {
                sendResponse({ error: error });
            }
        }
        // Execute the async function
        processOverride();
    }

    // Synchronously return true to keep the message channel open
    return true;
});

