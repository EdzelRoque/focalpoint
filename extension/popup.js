const BASE_URL = 'https://focalpoint-q8r5.onrender.com';

// DOM elements for each view
const viewLogin = document.getElementById('view-login');
const viewStart = document.getElementById('view-start');
const viewActive = document.getElementById('view-active');
const viewConsent = document.getElementById('view-consent');
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

// DOM elements for consent and the private sites list
const consentAgree = document.getElementById('consent-agree');
const consentPolicy = document.getElementById('consent-policy');
const privateSites = document.getElementById('private-sites');
const privateForm = document.getElementById('private-form');
const privateDomain = document.getElementById('private-domain');
const privateError = document.getElementById('private-error');
const privateList = document.getElementById('private-list');

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
  viewConsent.style.display = 'none';
  // Show the selected view
  view.style.display = 'flex';

  // The private list applies whenever the user can be in a session
  const listVisible = view === viewStart || view === viewActive;
  privateSites.style.display = listVisible ? 'block' : 'none';
};

// Elapsed timer
const startElapsedTimer = (startTime) => {
  if (elapsedInterval) clearInterval(elapsedInterval); // Clear any existing timer

  const update = () => {
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
  startElapsedTimer(new Date(session.startTime).getTime());
  logoutBtn.style.display = 'block';
  showView(viewActive);
};

// Signed-in users pass through consent before any session view
const showSignedInView = async () => {
  const { privacyConsent, activeSession } = await chrome.storage.local.get([
    'privacyConsent',
    'activeSession',
  ]);
  logoutBtn.style.display = 'block';

  if (!privacyConsent) {
    showView(viewConsent);
  } else if (activeSession) {
    loadActiveSession(activeSession);
  } else {
    showView(viewStart);
  }
};

// Private sites list. Text only: saved values never render as HTML.
const renderPrivateList = async () => {
  const { privateDomains = [] } = await chrome.storage.local.get(['privateDomains']);
  privateList.replaceChildren(
    ...privateDomains.map((domain) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = domain;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${domain}`);
      remove.addEventListener('click', async () => {
        await chrome.storage.local.set({
          privateDomains: privateDomains.filter((d) => d !== domain),
        });
        await renderPrivateList();
      });
      item.append(name, remove);
      return item;
    }),
  );
};

const init = async () => {
  await renderPrivateList();
  const { token } = await chrome.storage.local.get(['token']);

  if (!token) {
    // Not logged in
    showView(viewLogin);
    return;
  }

  await showSignedInView();
};

init();

// Consent logic
consentAgree.addEventListener('click', async () => {
  await chrome.storage.local.set({ privacyConsent: true });
  await showSignedInView();
});

consentPolicy.addEventListener('click', (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: 'https://focalpoint-rho.vercel.app/privacy' });
});

// Private sites logic
privateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError(privateError);

  const domain = fpPrivacy.normalizeDomain(privateDomain.value);
  if (!domain) {
    showError(privateError, 'Please enter a domain, such as example.com.');
    return;
  }

  const { privateDomains = [] } = await chrome.storage.local.get(['privateDomains']);
  if (!privateDomains.includes(domain)) {
    await chrome.storage.local.set({ privateDomains: [...privateDomains, domain] });
  }
  privateDomain.value = '';
  await renderPrivateList();
});

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
    await showSignedInView();
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

  // Consent and the private list stay: signing out must not silently
  // start sending pages the user chose to keep private.
  await chrome.storage.local.remove(['token', 'activeSession']);
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
});
