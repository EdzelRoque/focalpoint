// popup.html's scripts share one global scope, so use the helper namespaces
// directly; destructuring into same-named consts is a redeclaration SyntaxError.
const BASE_URL = fpConfig.API_BASE_URL;

// DOM elements for each view
const viewLogin = document.getElementById('view-login');
const viewStart = document.getElementById('view-start');
const viewActive = document.getElementById('view-active');
const logoutBtn = document.getElementById('logout-btn');

// DOM elements for login view
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const registerLink = document.getElementById('open-register');

// DOM elements for session view
const sessionForm = document.getElementById('session-form');
const sessionGoal = document.getElementById('session-goal');
const sessionDuration = document.getElementById('session-duration');
const startError = document.getElementById('start-error');

// DOM elements for active session view
const activeGoal = document.getElementById('active-goal-text');
const timerDisplay = document.getElementById('timer-display');
const statBlocks = document.getElementById('stat-blocks');
const statOverrides = document.getElementById('stat-overrides');
const endError = document.getElementById('end-error');
const endSessionBtn = document.getElementById('end-btn');

let elapsedInterval = null; // To track the elapsed timer interval

// Helper functions
const showError = (el, message) => {
  el.textContent = message;
  el.style.display = 'block';
};

const hideError = (el) => {
  el.textContent = '';
  el.style.display = 'none';
};

const showView = (view) => {
  // Hide all views
  viewLogin.style.display = 'none';
  viewStart.style.display = 'none';
  viewActive.style.display = 'none';

  // Show the selected view
  view.style.display = 'flex';
};

// Elapsed timer. Also watches for the session's end time so the popup returns
// to the start view the moment a timed session runs out.
const startElapsedTimer = (session) => {
  if (elapsedInterval) clearInterval(elapsedInterval); // Clear any existing timer
  const startTime = new Date(session.startTime).getTime();

  const update = () => {
    if (fpSessionHelpers.isSessionExpired(session)) {
      sessionOver();
      return;
    }
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    timerDisplay.textContent = fpPopupHelpers.formatElapsed(elapsed);
  };

  update();
  elapsedInterval = setInterval(update, 1000);
};

const stopElapsedTimer = () => {
  if (elapsedInterval) {
    clearInterval(elapsedInterval);
    elapsedInterval = null;
  }
};

// Load active session view
const loadActiveSession = (session) => {
  activeGoal.textContent = session.sessionGoal;
  statBlocks.textContent = session.blockCount || 0;
  statOverrides.textContent = session.overrideCount || 0;
  logoutBtn.style.display = 'block';
  showView(viewActive);
  startElapsedTimer(session);
};

// The session ended on its own (time ran out, or the backend says it's over):
// forget it locally and go back to the start view.
const sessionOver = async () => {
  stopElapsedTimer();
  await chrome.storage.local.remove('activeSession');
  chrome.runtime.sendMessage({ action: 'session_ended' }).catch(() => {});
  showView(viewStart);
};

// Start tracking a session the popup just received from the backend
const adoptSession = async (session) => {
  await chrome.storage.local.set({ activeSession: session });
  // Tell the background service worker a session has started
  chrome.runtime.sendMessage({ action: 'session_started', session }).catch(() => {});
  loadActiveSession(session);
};

// Look up the user's active session on the backend (e.g. one started on
// another device, or before this extension's storage was cleared).
const fetchActiveSession = async (token) => {
  const res = await fetch(`${BASE_URL}/api/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return fpSessionHelpers.findActiveSession(await res.json());
};

// Signed-out view after the backend rejected the token (it expired)
const showLoginExpired = () => {
  stopElapsedTimer();
  logoutBtn.style.display = 'none';
  showView(viewLogin);
  showError(loginError, fpLoginState.LOGIN_EXPIRED_MESSAGE);
};

const loginExpired = async () => {
  await fpLoginState.markLoginExpired();
  chrome.runtime.sendMessage({ action: 'session_ended' }).catch(() => {});
  showLoginExpired();
};

const init = async () => {
  const storage = await chrome.storage.local.get(['token', 'activeSession', 'loginExpired']);

  if (!storage.token) {
    // Not logged in
    showView(viewLogin);
    if (storage.loginExpired) showLoginExpired();
    return;
  }

  if (storage.activeSession && fpSessionHelpers.isSessionExpired(storage.activeSession)) {
    logoutBtn.style.display = 'block';
    await sessionOver();
    return;
  }

  if (storage.activeSession) {
    // Logged in and session is running
    loadActiveSession(storage.activeSession);
    return;
  }

  // Logged in but no active session
  logoutBtn.style.display = 'block';
  showView(viewStart);
};

init();

// Login logic
loginForm.addEventListener('submit', async (event) => {
  // Prevent the default form submission behavior and hide any existing error messages
  event.preventDefault();
  hideError(loginError);

  // Get the email and password values from the submitted form
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  // Validate email and password
  const loginCheck = fpPopupHelpers.validateLoginFields(email, password);
  if (!loginCheck.valid) {
    showError(loginError, loginCheck.error);
    return;
  }

  // Send login request to backend
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(loginError, data.error || 'Login failed. Please try again.');
      return;
    }

    await chrome.storage.local.set({ token: data.token });
    await fpLoginState.clearLoginExpired();
    logoutBtn.style.display = 'block';

    // Pick up a session that is already running for this account
    const running = await fetchActiveSession(data.token).catch(() => null);
    if (running) {
      await adoptSession(running);
      return;
    }
    showView(viewStart);
  } catch (err) {
    showError(loginError, 'An error occurred. Please try again.');
  }
});

// Register link logic
registerLink.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: `${fpConfig.DASHBOARD_URL}/register` });
});

// Session start logic
sessionForm.addEventListener('submit', async (event) => {
  // Prevent the default form submission behavior and hide any existing error messages
  event.preventDefault();
  hideError(startError);

  // Validate goal and duration
  const sessionCheck = fpPopupHelpers.validateSessionInput(
    sessionGoal.value,
    sessionDuration.value,
  );
  if (!sessionCheck.valid) {
    showError(startError, sessionCheck.error);
    return;
  }

  // Send session creation request to backend
  try {
    const { token } = await chrome.storage.local.get('token');

    const res = await fetch(`${BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionGoal: sessionCheck.goal,
        durationInMinutes: sessionCheck.duration
      }),
    });
    if (res.status === 401) {
      await loginExpired();
      return;
    }
    const data = await res.json();

    // A session is already running for this account: resume it instead of
    // leaving the user stuck behind "You already have an active session".
    if (res.status === 409) {
      const running = await fetchActiveSession(token).catch(() => null);
      if (running) {
        await adoptSession(running);
        return;
      }
    }

    if (!res.ok) {
      showError(
        startError,
        data.error || 'Failed to start session. Please try again.',
      );
      return;
    }

    // Store session in chrome.storage so background.js can access it
    await adoptSession(data);
  } catch (err) {
    showError(startError, 'An error occurred. Please try again.');
  }
});

// Session end logic
endSessionBtn.addEventListener('click', async () => {
  // Hide any existing error messages
  hideError(endError);

  // Send session end request to backend
  try {
    const { token, activeSession } = await chrome.storage.local.get([
      'token',
      'activeSession',
    ]);

    const res = await fetch(`${BASE_URL}/api/sessions/${activeSession._id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      await loginExpired();
      return;
    }
    const data = await res.json();

    // Already ended (its time ran out, or it was ended elsewhere)
    if (res.status === 409) {
      await sessionOver();
      return;
    }

    if (!res.ok) {
      showError(
        endError,
        data.error || 'Failed to end session. Please try again.',
      );
      return;
    }

    // Remove session result in chrome.storage
    await chrome.storage.local.remove('activeSession');

    // Tell the background service worker a session has ended
    chrome.runtime.sendMessage({ action: 'session_ended', session: data });

    stopElapsedTimer();
    showView(viewStart);
  } catch (err) {
    showError(endError, 'An error occurred. Please try again.');
  }
});

// Logout logic
logoutBtn.addEventListener('click', async () => {
  stopElapsedTimer();

  // If there's an active session, end it before logging out
  const { token, activeSession } = await chrome.storage.local.get([
    'token',
    'activeSession',
  ]);
  if (activeSession && token) {
    try {
      await fetch(`${BASE_URL}/api/sessions/${activeSession._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // Silent fail — we're logging out regardless
    }
  }

  await chrome.storage.local.clear();
  await fpLoginState.clearLoginExpired();
  logoutBtn.style.display = 'none';
  showView(viewLogin);
});

// Listen for stat updates from background -- this will be for changes in block/override counts while session is active
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'stats_update') {
    // Live stats belong to the active-session view only; ignore broadcasts
    // while the login or start view is showing.
    if (viewActive.style.display === 'none') return;

    statBlocks.textContent = message.stats.blockCount || 0;
    statOverrides.textContent = message.stats.overrideCount || 0;
  }

  // The background ended the session (its time ran out, or the login expired)
  if (message.action === 'session_ended') {
    chrome.storage.local.get(['token', 'loginExpired']).then(({ token, loginExpired: expired }) => {
      if (!token && expired) {
        showLoginExpired();
      } else if (viewActive.style.display !== 'none') {
        stopElapsedTimer();
        showView(viewStart);
      }
    });
  }
});
