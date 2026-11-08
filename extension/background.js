import './lib/config.js';
import './lib/session-helpers.js';
import './lib/login-state.js';

const BASE_URL = globalThis.fpConfig.API_BASE_URL;
const { isSessionExpired } = globalThis.fpSessionHelpers;
const EXPIRY_ALARM = 'fp-session-expiry';

// Keep track of the session in memory for quick access
let activeSession = null;

// A session is over: forget it locally, take down any block overlays, and let
// the popup (if open) return to the start view. The backend closes expired
// sessions on its own, so no request is needed here.
const broadcastSessionEnded = async () => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { action: 'session_ended' }).catch(() => {});
    }
    chrome.runtime.sendMessage({ action: 'session_ended' }).catch(() => {});
};

const endSessionLocally = async () => {
    const { activeSession: stored } = await chrome.storage.local.get('activeSession');
    activeSession = null;
    await chrome.alarms.clear(EXPIRY_ALARM);
    // Removing an expired session already broadcasts (storage.onChanged below);
    // any other ending (backend said 409) broadcasts here.
    await chrome.storage.local.remove('activeSession');
    if (!isSessionExpired(stored)) await broadcastSessionEnded();
};

// The backend rejected the token (401): sign out, flag it on the toolbar icon,
// and take down any overlays, since nothing is blocked while signed out.
const loginExpired = async () => {
    activeSession = null;
    await chrome.alarms.clear(EXPIRY_ALARM);
    await globalThis.fpLoginState.markLoginExpired();
    await broadcastSessionEnded();
};

// Fires at expectedEndTime so blocking stops even if the user is idle.
const scheduleExpiry = async (session) => {
    if (session && session.expectedEndTime) {
        await chrome.alarms.create(EXPIRY_ALARM, { when: new Date(session.expectedEndTime).getTime() });
    } else {
        await chrome.alarms.clear(EXPIRY_ALARM);
    }
};

// chrome.storage.local is the source of truth for activeSession. Lazy
// read-through cache; storage wins on conflict. An expired session is ended
// here as a backstop in case the alarm hasn't fired yet.
const getActiveSession = async () => {
    if (!activeSession) {
        try {
            const data = await chrome.storage.local.get(['activeSession']);
            if (data.activeSession) activeSession = data.activeSession;
        } catch (err) {
            console.error('Background: Error loading active session from storage', err);
        }
    }
    if (activeSession && isSessionExpired(activeSession)) {
        await endSessionLocally();
        return null;
    }
    return activeSession;
};

// Keep the in-memory cache in sync with storage writes from any source
// (popup.js writes, logout clear, our own block/override increments).
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!('activeSession' in changes)) return;
    const { oldValue, newValue } = changes.activeSession;
    activeSession = newValue ?? null;
    scheduleExpiry(activeSession);
    // The popup can notice expiry first and clear storage itself; overlays
    // must still come down everywhere.
    if (!newValue && oldValue && isSessionExpired(oldValue)) broadcastSessionEnded();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== EXPIRY_ALARM) return;
    await getActiveSession(); // ends it if expired
});

// Persist updated counts and push them to the popup. Fire-and-forget message:
// it rejects whenever the popup is closed (no receiving end).
const saveStats = async (session) => {
    await chrome.storage.local.set({ activeSession: session });
    chrome.runtime.sendMessage({
        action: 'stats_update',
        stats: { blockCount: session.blockCount, overrideCount: session.overrideCount },
    }).catch(() => {});
};

const classifyPage = async (payload) => {
    const session = await getActiveSession();
    if (!session) return { error: 'No active session' };

    // Load token from storage to authenticate the request
    const { token } = await chrome.storage.local.get('token');
    if (!token) return { decision: 'ALLOW', reason: 'Not authenticated' };

    const res = await fetch(`${BASE_URL}/api/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            url: payload.url,
            pageTitle: payload.pageTitle,
            pageSnippet: payload.pageSnippet,
            sessionGoal: session.sessionGoal,
            blockSensitivity: session.blockSensitivity,
        }),
    });
    if (res.status === 401) {
        await loginExpired();
        return { error: 'Not authenticated' };
    }
    const data = await res.json();
    if (!res.ok) return { error: data.error };

    if (data.decision === 'BLOCK') {
        const blockRes = await fetch(`${BASE_URL}/api/sessions/${session._id}/block`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });

        if (blockRes.ok) {
            session.blockCount += 1;
            await saveStats(session);
        } else if (blockRes.status === 401) {
            await loginExpired();
            return { error: 'Not authenticated' };
        } else if (blockRes.status === 409) {
            // The backend says the session is over (expired or ended elsewhere):
            // stop blocking.
            await endSessionLocally();
            return { error: 'No active session' };
        } else {
            console.warn('Background: block sync failed', blockRes.status);
        }
    }

    // Send the final decision back to the content script, including strictMode
    return { decision: data.decision, reason: data.reason, strictMode: session.strictMode };
};

// Result shapes for the overlay: {status} = logged, {sessionEnded} = nothing
// left to block for, {error} = keep the overlay and let the user retry.
const overridePage = async (payload) => {
    const session = await getActiveSession();
    if (!session) return { sessionEnded: true };

    const { token } = await chrome.storage.local.get('token');
    if (!token) return { error: 'Not authenticated' };

    const overrideRes = await fetch(`${BASE_URL}/api/sessions/${session._id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            url: payload.url,
            sessionGoal: session.sessionGoal,
            blockSensitivity: session.blockSensitivity,
        }),
    });

    if (overrideRes.ok) {
        session.overrideCount += 1;
        await saveStats(session);
        return { status: 'Override logged' };
    }
    if (overrideRes.status === 409) {
        await endSessionLocally();
        return { sessionEnded: true };
    }
    if (overrideRes.status === 401) {
        await loginExpired();
        return { sessionEnded: true }; // signed out: nothing is blocked any more
    }
    console.warn('Background: override sync failed', overrideRes.status);
    return { error: `Override sync failed: ${overrideRes.status}` };
};

// Add event listeners for messages from popup.js or content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'session_started') {
        activeSession = message.session;
        scheduleExpiry(activeSession);
        sendResponse({ status: 'Session saved in background' });
        return;
    }

    if (message.action === 'session_ended') {
        activeSession = null;
        chrome.alarms.clear(EXPIRY_ALARM);
        sendResponse({ status: 'Session cleared in background' });
        return;
    }

    if (message.action === 'classify_page') {
        const payload = message.payload || {};
        if (!payload.url || !payload.pageTitle || !payload.pageSnippet) {
            sendResponse({ error: 'Invalid message payload' });
            return;
        }
        classifyPage(payload).then(sendResponse, (error) => sendResponse({ error: String(error) }));
        return true; // keep the channel open for the async response
    }

    if (message.action === 'override_page') {
        const payload = message.payload || {};
        if (!payload.url) {
            sendResponse({ error: 'Invalid message payload' });
            return;
        }
        overridePage(payload).then(sendResponse, (error) => sendResponse({ error: String(error) }));
        return true;
    }
});


// The content script already handles classifying new pages, so we have to handle:
// 1. When the user switches to a different, already-open tab
// 2. When a URL changes inside the SAME tab (The YouTube SPA fix)

// 1. Listen for when the user switches to a different, already-open tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const session = await getActiveSession();
    if (!session) return; // Don't track if no session is active

    try {
        await chrome.tabs.sendMessage(activeInfo.tabId, { action: 'tab_change' });
    } catch (error) {
        // Silently fail if the tab is a chrome:// page or hasn't loaded a content script
    }
});

// 2. Listen for when a URL changes inside the SAME tab (SPAs)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
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
