// The popup: login, starting/ending sessions, resuming a session that is
// already running, live stats, and returning to the start view at expiry.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPopup, popupView, submit, settle, session, minutesFromNow } from '../support/load.js';

const $ = (id) => document.getElementById(id);
const type = (id, value) => { $(id).value = value; };

beforeEach(() => {
  // popup.js ticks its timer with setInterval; keep it from outliving a test
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

describe('opening the popup', () => {
  it('shows login when signed out', async () => {
    await loadPopup();
    expect(popupView()).toBe('login');
    expect($('logout-btn').style.display).toBe('none');
  });

  it('shows the start form when signed in with no session', async () => {
    await loadPopup({ storage: { token: 't' } });
    expect(popupView()).toBe('start');
    expect($('logout-btn').style.display).toBe('block');
  });

  it('shows the running session: goal, stats and elapsed time', async () => {
    const s = session({ blockCount: 4, overrideCount: 1, startTime: new Date(Date.now() - 65_000).toISOString() });
    await loadPopup({ storage: { token: 't', activeSession: s } });
    expect(popupView()).toBe('active');
    expect($('active-goal-text').textContent).toBe(s.sessionGoal);
    expect($('stat-blocks').textContent).toBe('4');
    expect($('stat-overrides').textContent).toBe('1');
    expect($('timer-display').textContent).toBe('01:05');
  });

  it('shows the start form (and forgets the session) if its time already ran out', async () => {
    const { chrome } = await loadPopup({ storage: { token: 't', activeSession: session({ expectedEndTime: minutesFromNow(-1) }) } });
    expect(popupView()).toBe('start');
    expect(chrome.storageData().activeSession).toBeUndefined();
  });
});

describe('login', () => {
  const login = async (env, email = 'chem@school.edu', password = 'Sup3r$ecret') => {
    type('login-email', email);
    type('login-password', password);
    submit('login-form');
    await settle();
  };

  it('stores the token and shows the start form', async () => {
    const env = await loadPopup({ routes: { 'POST /auth/login': { json: { token: 'new-token' } }, 'GET /api/sessions': { json: [] } } });
    await login(env);
    expect(env.chrome.storageData().token).toBe('new-token');
    expect(popupView()).toBe('start');
    expect(env.backend.calls[0].body).toEqual({ email: 'chem@school.edu', password: 'Sup3r$ecret' });
  });

  it('resumes a session that is already running for the account', async () => {
    const running = session({ _id: '64b0000000000000000000cc' });
    const env = await loadPopup({ routes: {
      'POST /auth/login': { json: { token: 'tok' } },
      'GET /api/sessions': { json: [running, session({ _id: 'old', isActive: false })] },
    } });
    await login(env);
    expect(popupView()).toBe('active');
    expect(env.chrome.storageData().activeSession._id).toBe('64b0000000000000000000cc');
    expect(env.chrome.sentRuntime).toContainEqual({ action: 'session_started', session: running });
  });

  it('still logs in if the session lookup fails', async () => {
    const env = await loadPopup({ routes: {
      'POST /auth/login': { json: { token: 'tok' } },
      'GET /api/sessions': () => new TypeError('Failed to fetch'),
    } });
    await login(env);
    expect(popupView()).toBe('start');
  });

  it('shows the backend error for bad credentials', async () => {
    const env = await loadPopup({ routes: { 'POST /auth/login': { status: 401, json: { error: 'Invalid email or password' } } } });
    await login(env);
    expect(popupView()).toBe('login');
    expect($('login-error').textContent).toBe('Invalid email or password');
    expect(env.chrome.storageData().token).toBeUndefined();
  });

  it('does not call the backend when a field is empty', async () => {
    const env = await loadPopup();
    await login(env, '', 'x');
    expect($('login-error').textContent).toBe('Please fill in all fields.');
    expect(env.backend.calls).toHaveLength(0);
  });

  it('shows a generic error when the network fails', async () => {
    const env = await loadPopup({ routes: { 'POST /auth/login': () => new TypeError('Failed to fetch') } });
    await login(env);
    expect($('login-error').textContent).toBe('An error occurred. Please try again.');
  });

  it('"Create one" opens the dashboard registration page', async () => {
    const env = await loadPopup();
    $('open-register').click();
    expect(env.chrome.tabs.created).toEqual([{ url: 'https://focalpoint-rho.vercel.app/register' }]);
  });
});

describe('starting a session', () => {
  const start = async (goal, duration) => {
    type('session-goal', goal);
    type('session-duration', duration);
    submit('session-form');
    await settle();
  };

  it('creates it on the backend, stores it, tells the background, shows it', async () => {
    const created = session();
    const env = await loadPopup({ storage: { token: 'tok' }, routes: { 'POST /api/sessions': { status: 201, json: created } } });
    await start('  Study for my organic chemistry midterm ', '60');

    expect(env.backend.calls[0].body).toEqual({ sessionGoal: 'Study for my organic chemistry midterm', durationInMinutes: 60 });
    expect(env.backend.calls[0].headers.Authorization).toBe('Bearer tok');
    expect(env.chrome.storageData().activeSession).toEqual(created);
    expect(env.chrome.sentRuntime).toContainEqual({ action: 'session_started', session: created });
    expect(popupView()).toBe('active');
  });

  it('sends no duration for an open-ended session', async () => {
    const env = await loadPopup({ storage: { token: 'tok' }, routes: { 'POST /api/sessions': { status: 201, json: session({ expectedEndTime: null }) } } });
    await start('Study for my organic chemistry midterm', '');
    expect(env.backend.calls[0].body.durationInMinutes).toBeNull();
  });

  it.each(['0', '481', '2.5'])('rejects duration %j before calling the backend', async (duration) => {
    const env = await loadPopup({ storage: { token: 'tok' } });
    await start('Study for my organic chemistry midterm', duration);
    expect($('start-error').textContent).toMatch(/between 1 and 480/);
    expect(env.backend.calls).toHaveLength(0);
  });

  it('resumes the running session instead of getting stuck on "already active" (409)', async () => {
    const running = session({ _id: '64b0000000000000000000dd', sessionGoal: 'Started on my other laptop' });
    const env = await loadPopup({ storage: { token: 'tok' }, routes: {
      'POST /api/sessions': { status: 409, json: { error: 'You already have an active session' } },
      'GET /api/sessions': { json: [running] },
    } });
    await start('Study for my organic chemistry midterm', '30');
    expect(popupView()).toBe('active');
    expect($('active-goal-text').textContent).toBe('Started on my other laptop');
    expect(env.chrome.storageData().activeSession._id).toBe('64b0000000000000000000dd');
  });

  it('shows the 409 error if no running session can be found', async () => {
    await loadPopup({ storage: { token: 'tok' }, routes: {
      'POST /api/sessions': { status: 409, json: { error: 'You already have an active session' } },
      'GET /api/sessions': { json: [] },
    } });
    await start('Study for my organic chemistry midterm', '30');
    expect(popupView()).toBe('start');
    expect($('start-error').textContent).toBe('You already have an active session');
  });

  it('shows backend validation errors', async () => {
    await loadPopup({ storage: { token: 'tok' }, routes: {
      'POST /api/sessions': { status: 400, json: { error: 'Session goal must be at least 10 characters long' } },
    } });
    await start('Study', '30');
    expect($('start-error').textContent).toBe('Session goal must be at least 10 characters long');
  });
});

describe('during a session', () => {
  it('updates stats live from the background', async () => {
    const env = await loadPopup({ storage: { token: 't', activeSession: session() } });
    await env.chrome.deliver({ action: 'stats_update', stats: { blockCount: 7, overrideCount: 2 } });
    expect($('stat-blocks').textContent).toBe('7');
    expect($('stat-overrides').textContent).toBe('2');
  });

  it('ignores stats broadcasts when no session is showing', async () => {
    const env = await loadPopup({ storage: { token: 't' } });
    await env.chrome.deliver({ action: 'stats_update', stats: { blockCount: 7, overrideCount: 2 } });
    expect($('stat-blocks').textContent).toBe('0');
  });

  it('returns to the start form the moment the time runs out', async () => {
    const env = await loadPopup({ storage: { token: 't', activeSession: session({ expectedEndTime: new Date(Date.now() + 2500).toISOString() }) } });
    expect(popupView()).toBe('active');
    await vi.advanceTimersByTimeAsync(0);
    await new Promise((r) => setTimeout(r, 2600));
    vi.advanceTimersByTime(1000);
    await settle();
    expect(popupView()).toBe('start');
    expect(env.chrome.storageData().activeSession).toBeUndefined();
  });

  it('returns to the start form when the background ends the session', async () => {
    const env = await loadPopup({ storage: { token: 't', activeSession: session() } });
    await env.chrome.deliver({ action: 'session_ended' });
    expect(popupView()).toBe('start');
  });
});

describe('ending a session', () => {
  it('ends it on the backend, forgets it, tells the background', async () => {
    const env = await loadPopup({ storage: { token: 'tok', activeSession: session() }, routes: {
      'PUT /api/sessions/:id': { json: { success: true } },
    } });
    $('end-btn').click();
    await settle();
    expect(env.backend.callsTo('PUT', '/api/sessions/64b0000000000000000000aa')).toHaveLength(1);
    expect(env.chrome.storageData().activeSession).toBeUndefined();
    expect(env.chrome.sentRuntime).toContainEqual({ action: 'session_ended', session: { success: true } });
    expect(popupView()).toBe('start');
  });

  it('treats "already ended" (409) as ended', async () => {
    const env = await loadPopup({ storage: { token: 'tok', activeSession: session() }, routes: {
      'PUT /api/sessions/:id': { status: 409, json: { error: 'Session is already ended' } },
    } });
    $('end-btn').click();
    await settle();
    expect(popupView()).toBe('start');
    expect(env.chrome.storageData().activeSession).toBeUndefined();
  });

  it('keeps the session and shows the error on other failures', async () => {
    const env = await loadPopup({ storage: { token: 'tok', activeSession: session() }, routes: {
      'PUT /api/sessions/:id': { status: 500, json: { error: 'Could not end session' } },
    } });
    $('end-btn').click();
    await settle();
    expect(popupView()).toBe('active');
    expect($('end-error').textContent).toBe('Could not end session');
    expect(env.chrome.storageData().activeSession).toBeDefined();
  });
});

describe('expired login', () => {
  const EXPIRED = 'Your login expired. Sign in again.';

  it('opens on the login view with the expired message after the background signed out', async () => {
    await loadPopup({ storage: { loginExpired: true } });
    expect(popupView()).toBe('login');
    expect($('login-error').textContent).toBe(EXPIRED);
    expect($('login-error').style.display).toBe('block');
  });

  it('a plain signed-out popup shows no message', async () => {
    await loadPopup();
    expect($('login-error').style.display).toBe('none');
  });

  it.each([
    ['starting a session', 'POST /api/sessions', async () => {
      $('session-goal').value = 'Study for my organic chemistry midterm';
      submit('session-form');
    }, { token: 'old' }],
    ['ending a session', 'PUT /api/sessions/:id', async () => { $('end-btn').click(); }, { token: 'old', activeSession: session() }],
  ])('a 401 while %s signs out, shows the badge and the message', async (_label, route, act, storage) => {
    const env = await loadPopup({ storage, routes: { [route]: { status: 401, json: { error: 'Invalid or expired token.' } } } });
    await act();
    await settle();
    expect(popupView()).toBe('login');
    expect($('login-error').textContent).toBe(EXPIRED);
    expect(env.chrome.storageData()).toEqual({ loginExpired: true });
    expect(env.chrome.action.badge.text).toBe('!');
  });

  it('switches to the login view if the background signs out while the popup is open', async () => {
    const env = await loadPopup({ storage: { token: 't', activeSession: session() } });
    await env.chrome.storage.local.remove(['token', 'activeSession']);
    await env.chrome.storage.local.set({ loginExpired: true });
    await env.chrome.deliver({ action: 'session_ended' });
    await settle();
    expect(popupView()).toBe('login');
    expect($('login-error').textContent).toBe(EXPIRED);
  });

  it('signing in again clears the badge and the flag, and resumes the running session', async () => {
    const env = await loadPopup({ storage: { loginExpired: true }, routes: {
      'POST /auth/login': { json: { token: 'fresh' } },
      'GET /api/sessions': { json: [session()] },
    } });
    env.chrome.action.badge.text = '!';
    $('login-email').value = 'chem@school.edu';
    $('login-password').value = 'Sup3r$ecret';
    submit('login-form');
    await settle();
    expect(env.chrome.storageData().loginExpired).toBeUndefined();
    expect(env.chrome.action.badge.text).toBe('');
    expect(popupView()).toBe('active');
  });
});

describe('signing out', () => {
  it('ends the running session, then clears everything', async () => {
    const env = await loadPopup({ storage: { token: 'tok', activeSession: session() }, routes: {
      'PUT /api/sessions/:id': { json: { success: true } },
    } });
    $('logout-btn').click();
    await settle();
    expect(env.backend.callsTo('PUT', '/api/sessions/')).toHaveLength(1);
    expect(env.chrome.storageData()).toEqual({});
    expect(popupView()).toBe('login');
  });

  it('clears an expired-login badge too', async () => {
    const env = await loadPopup({ storage: { token: 'tok' } });
    env.chrome.action.badge.text = '!';
    $('logout-btn').click();
    await settle();
    expect(env.chrome.action.badge.text).toBe('');
  });

  it('signs out even if ending the session fails', async () => {
    const env = await loadPopup({ storage: { token: 'tok', activeSession: session() }, routes: {
      'PUT /api/sessions/:id': () => new TypeError('Failed to fetch'),
    } });
    $('logout-btn').click();
    await settle();
    expect(env.chrome.storageData()).toEqual({});
    expect(popupView()).toBe('login');
  });
});
