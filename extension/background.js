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
    if (message.type === "SESSION_STARTED") {
        activeSession = message.session;
        sendResponse({ status: "Session saved in background" });
    }

    if (message.type === "SESSION_ENDED") {
        activeSession = null;
        sendResponse({ status: "Session cleared in background" });
    }

    if (message.type === "CLASSIFY_PAGE") {
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
                    // Update the background memory state
                    activeSession.blockedCount += 1;

                    // Send a message to popup to update the UI stats
                    chrome.runtime.sendMessage({ 
                        action: "stats_update",
                        stats: { blockedCount: activeSession.blockedCount, overrideCount: activeSession.overrideCount }
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

    // Synchronously return true to keep the message channel open
    return true;
});

