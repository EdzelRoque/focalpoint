// Journeys: Start session, End session (Tier 1); popup reopen, logout with
// active session, start-session 409 conflict (Tier 2).
// Spec: docs/planning/extension/journeys-spec.md

import { test, expect, pageUrl, uniqueGoal } from './helpers/fixtures.js';
import { createSession, getSession, getSessions, sharedToken } from './helpers/api.js';
import { seedDecision } from './helpers/seed.js';
import { backendLog } from './helpers/backend-log.js';

test('start session persists to backend and storage and shows the Active view', async ({
  openPopup,
  storage,
}) => {
  // Login flow is owned by the login journey — seed the token directly.
  await storage.set({ token: sharedToken() });
  const popup = await openPopup();
  await expect(popup.locator('#view-start')).toBeVisible();

  const goal = uniqueGoal('start-session');
  await popup.fill('#session-goal', goal);
  await popup.fill('#session-duration', '60');
  await popup.click('#start-btn');

  // Catches: view switch or goal rendering broken
  await expect(popup.locator('#view-active')).toBeVisible();
  await expect(popup.locator('#active-goal-text')).toHaveText(goal);

  // Catches: session never created on the backend
  const active = (await getSessions()).filter((s) => s.isActive);
  expect(active).toHaveLength(1);
  expect(active[0].sessionGoal).toBe(goal);

  // Catches: storage persistence broken — the background could never
  // classify and the whole loop would be dead
  const stored = await storage.get();
  expect(stored.activeSession._id).toBe(active[0]._id);

  // Catches: loadActiveSession rendering undefined for fresh counts
  await expect(popup.locator('#stat-blocks')).toHaveText('0');
  await expect(popup.locator('#stat-overrides')).toHaveText('0');

  // Catches: startElapsedTimer wiring broken (frozen timer)
  await expect(popup.locator('#timer-display')).toHaveText(/^\d{2}:\d{2}$/);
  const before = await popup.locator('#timer-display').textContent();
  await expect
    .poll(() => popup.locator('#timer-display').textContent(), {
      intervals: [500, 1000],
    })
    .not.toBe(before);
});

test('end session ends on backend, clears storage, and stops classification', async ({
  openPopup,
  startSessionDirect,
  storage,
  context,
}) => {
  const goal = uniqueGoal('end-session');
  const session = await startSessionDirect(goal);
  const reason = `END-SESSION-${Date.now()}`;
  await seedDecision(
    pageUrl('off-topic.html'),
    goal,
    session.blockSensitivity,
    'BLOCK',
    reason,
  );

  const popup = await openPopup();
  await expect(popup.locator('#view-active')).toBeVisible();
  await popup.click('#end-btn');

  // Catches: view switch broken after ending
  await expect(popup.locator('#view-start')).toBeVisible();

  // Catches: zombie active session on the backend (tomorrow's 409)
  const after = await getSession(session._id);
  expect(after.isActive).toBe(false);
  expect(after.actualEndTime).not.toBeNull();

  // Catches: storage removal broken — the extension would keep blocking
  // after the user is done
  const stored = await storage.get();
  expect(stored.activeSession).toBeUndefined();
  expect(stored.token).toBeTruthy();

  // Catches: session gate broken — classifying (and blocking) with no
  // session. Negative assertion: bounded wait, then require both no overlay
  // and no classify cache-hit in the backend log. The message-level variant
  // is contract-covered in background.test.js; this checks the real wiring.
  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await page.waitForTimeout(3000);
  await expect(page.locator('#focalpoint-overlay')).toHaveCount(0);
  expect(backendLog()).not.toContain(reason);
});

test('popup reopen restores the Active view from storage', async ({
  openPopup,
  startSessionDirect,
}) => {
  const goal = uniqueGoal('reopen');
  await startSessionDirect(goal);

  let popup = await openPopup();
  await expect(popup.locator('#view-active')).toBeVisible();
  await popup.close();

  popup = await openPopup();
  // Catches: init() not restoring a running session from storage — user
  // believes their session was lost
  await expect(popup.locator('#view-active')).toBeVisible();
  await expect(popup.locator('#active-goal-text')).toHaveText(goal);
  await expect(popup.locator('#stat-blocks')).toHaveText('0');

  // Catches: timer restored frozen instead of ticking from startTime
  const before = await popup.locator('#timer-display').textContent();
  await expect
    .poll(() => popup.locator('#timer-display').textContent(), {
      intervals: [500, 1000],
    })
    .not.toBe(before);
});

test('logout with an active session ends it and clears all storage', async ({
  openPopup,
  startSessionDirect,
  storage,
}) => {
  const session = await startSessionDirect(uniqueGoal('logout'));

  const popup = await openPopup();
  await expect(popup.locator('#view-active')).toBeVisible();
  await popup.click('#logout-btn');

  await expect(popup.locator('#view-login')).toBeVisible();

  // Catches: logout leaving the backend session active
  await expect
    .poll(async () => (await getSession(session._id)).isActive, {
      intervals: [250, 500, 1000],
    })
    .toBe(false);

  // Catches: partial storage clear (stale token or session surviving)
  expect(await storage.get()).toEqual({});
});

test('starting a session when one exists elsewhere surfaces the 409', async ({
  openPopup,
  storage,
}) => {
  // Session created outside the extension (the web frontend scenario):
  // backend has it, extension storage does not.
  await createSession(uniqueGoal('conflict-existing'));
  await storage.set({ token: sharedToken() });

  const popup = await openPopup();
  await expect(popup.locator('#view-start')).toBeVisible();

  await popup.fill('#session-goal', uniqueGoal('conflict-attempt'));
  await popup.click('#start-btn');

  // Catches: the popup swallowing the 409 instead of surfacing it
  await expect(popup.locator('#start-error')).toBeVisible();
  await expect(popup.locator('#start-error')).toHaveText(
    'You already have an active session',
  );
  await expect(popup.locator('#view-start')).toBeVisible();

  // Catches: a failed start still writing a session into storage
  expect((await storage.get()).activeSession).toBeUndefined();
});
