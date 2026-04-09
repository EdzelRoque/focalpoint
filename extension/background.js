// Keep track of the session in memory for quick access
let activeSession = null;

// Wake up and check storage just in case Chrome put the worker to sleep
chrome.runtime.onStartup.addListener(async () => {
    const data = await chrome.storage.local.get("activeSession");
    if (data.activeSession) {
        activeSession = data.activeSession;
    }
});

// Listen for messages from the popup (and eventually the content script)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SESSION_STARTED") {
        console.log("Background: Session started with goal ->", message.session.sessionGoal);
        activeSession = message.session;
        sendResponse({ status: "Session saved in background" });
    }

    if (message.type === "SESSION_ENDED") {
        console.log("Background: Session ended.");
        activeSession = null;
        sendResponse({ status: "Session cleared in background" });
    }

    // Returning true tells Chrome we might send a response asynchronously
    return true;
});

