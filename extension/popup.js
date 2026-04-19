const BASE_URL = 'https://focalpoint-q8r5.onrender.com';

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

// Elapsed timer
const startElapsedTimer = (startTime) => {
  if (elapsedInterval) clearInterval(elapsedInterval); // Clear any existing timer

  const update = () => {
    // Calculate elapsed time
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    if (hours > 0) {
      timerDisplay.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
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
  startElapsedTimer(new Date(session.startTime).getTime());
  logoutBtn.style.display = 'block';
  showView(viewActive);
};

const init = async () => {
  const storage = await chrome.storage.local.get(['token', 'activeSession']);

  if (!storage.token) {
    // Not logged in
    showView(viewLogin);
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
  if (!email || !password) {
    showError(loginError, 'Please fill in all fields.');
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
    logoutBtn.style.display = 'block';
    showView(viewStart);
  } catch (err) {
    showError(loginError, 'An error occurred. Please try again.');
  }
});

// Register link logic
registerLink.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: `https://focalpoint-rho.vercel.app/register` });
});

// Session start logic
sessionForm.addEventListener('submit', async (event) => {
  // Prevent the default form submission behavior and hide any existing error messages
  event.preventDefault();
  hideError(startError);

  // Get the goal and duration values from the submitted form
  const goal = sessionGoal.value.trim();
  const duration = sessionDuration.value;

  // Validate goal and duration
  if (!goal) {
    showError(startError, 'Please enter a goal for your focus session.');
    return;
  }
  if (duration && (isNaN(duration) || duration < 1 || duration > 480)) {
    showError(
      startError,
      'Please enter a valid duration between 1 and 480 minutes.',
    );
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
        sessionGoal: goal,
        durationInMinutes: duration ? parseInt(duration) : null
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(
        startError,
        data.error || 'Failed to start session. Please try again.',
      );
      return;
    }

    // Store session in chrome.storage so background.js can access it
    await chrome.storage.local.set({ activeSession: data });

    // Tell the background service worker a session has started
    chrome.runtime.sendMessage({ action: 'session_started', session: data });

    loadActiveSession(data);
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
    const data = await res.json();

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
  logoutBtn.style.display = 'none';
  showView(viewLogin);
});

// Listen for stat updates from background -- this will be for changes in block/override counts while session is active
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'stats_update') {
    statBlocks.textContent = message.stats.blockCount || 0;
    statOverrides.textContent = message.stats.overrideCount || 0;
  }
});
