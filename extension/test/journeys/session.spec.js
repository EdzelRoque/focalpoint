// Journeys through the popup: sign in, start, watch stats, end, sign out.
import { test, expect, pageUrl, overlay, newStudent } from './harness/fixtures.js';

const signInViaPopup = async (popup, student) => {
  await popup.locator('#login-email').fill(student.email);
  await popup.locator('#login-password').fill(student.password);
  await popup.locator('#login-btn').click();
};

test('sign in, start a timed session, see a block counted live, end it', async ({ context, ext, student }) => {
  const popup = await ext.openPopup();
  await expect(popup.locator('#view-login')).toBeVisible();
  await signInViaPopup(popup, student);
  await expect(popup.locator('#view-start')).toBeVisible();

  await popup.locator('#session-goal').fill(student.goal);
  await popup.locator('#session-duration').fill('45');
  await popup.locator('#start-btn').click();
  await expect(popup.locator('#view-active')).toBeVisible();
  await expect(popup.locator('#active-goal-text')).toHaveText(student.goal);

  const [backendSession] = await student.sessions();
  expect(backendSession).toMatchObject({ isActive: true, sessionGoal: student.goal, blockSensitivity: 'standard' });
  const minutes = (new Date(backendSession.expectedEndTime) - new Date(backendSession.startTime)) / 60_000;
  expect(minutes).toBe(45);

  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await expect(overlay(page)).toBeVisible();
  await expect(popup.locator('#stat-blocks')).toHaveText('1');

  await popup.bringToFront();
  await popup.locator('#end-btn').click();
  await expect(popup.locator('#view-start')).toBeVisible();
  const [ended] = await student.sessions();
  expect(ended).toMatchObject({ isActive: false, blockCount: 1 });
  expect(ended.actualEndTime).not.toBeNull();

  // After ending, browsing is no longer checked
  const after = await context.newPage();
  await after.goto(pageUrl('off-topic.html'));
  await after.waitForTimeout(2000);
  await expect(overlay(after)).toHaveCount(0);
});

test('a wrong password shows the error and stays signed out', async ({ ext, student }) => {
  const popup = await ext.openPopup();
  await signInViaPopup(popup, { ...student, password: 'Wr0ng$password' });
  await expect(popup.locator('#login-error')).toHaveText('Invalid email or password');
  expect((await ext.storage()).token).toBeUndefined();
});

test('the popup refuses durations over 8 hours without contacting the backend', async ({ ext, student }) => {
  await ext.signIn(student.token);
  const popup = await ext.openPopup();
  await popup.locator('#session-goal').fill(student.goal);
  await popup.locator('#session-duration').fill('481');
  await popup.locator('#start-btn').click();
  await expect(popup.locator('#start-error')).toContainText('between 1 and 480');
  expect(await student.sessions()).toEqual([]);
});

test('signing out ends the running session and clears the extension', async ({ ext, student }) => {
  const { body: session } = await student.startSession();
  await ext.signIn(student.token, session);
  const popup = await ext.openPopup();
  await expect(popup.locator('#view-active')).toBeVisible();

  await popup.locator('#logout-btn').click();
  await expect(popup.locator('#view-login')).toBeVisible();
  expect(await ext.storage()).toEqual({});
  expect((await student.sessions())[0].isActive).toBe(false);
});

test.describe('a session already running for the account (stuck-session fix)', () => {
  test('signing in picks it up', async ({ ext, student }) => {
    await student.startSession(); // e.g. started on another laptop
    const popup = await ext.openPopup();
    await signInViaPopup(popup, student);
    await expect(popup.locator('#view-active')).toBeVisible();
    await expect(popup.locator('#active-goal-text')).toHaveText(student.goal);
  });

  test('pressing Start resumes it instead of erroring', async ({ ext, student }) => {
    await ext.signIn(student.token); // extension storage lost the session
    await student.startSession();
    const popup = await ext.openPopup();
    await popup.locator('#session-goal').fill('A different goal typed on this device');
    await popup.locator('#start-btn').click();
    await expect(popup.locator('#view-active')).toBeVisible();
    await expect(popup.locator('#active-goal-text')).toHaveText(student.goal);
    expect((await ext.storage()).activeSession.sessionGoal).toBe(student.goal);
  });

  test('the resumed session blocks pages and can be ended', async ({ context, ext, student }) => {
    await ext.signIn(student.token);
    await student.startSession();
    const popup = await ext.openPopup();
    await popup.locator('#session-goal').fill('Typed on this device for testing');
    await popup.locator('#start-btn').click();
    await expect(popup.locator('#view-active')).toBeVisible();

    const page = await context.newPage();
    await page.goto(pageUrl('off-topic.html'));
    await expect(overlay(page)).toBeVisible();

    await popup.bringToFront();
    await popup.locator('#end-btn').click();
    await expect(popup.locator('#view-start')).toBeVisible();
    expect((await student.sessions())[0].isActive).toBe(false);
  });
});

test('an expired login: nothing is blocked, the icon shows "!", the popup asks to sign in, and signing in resumes the session', async ({ context, ext, student, serviceWorker }) => {
  const { body: session } = await student.startSession();
  // A token the backend rejects, like one past its 7 days
  await ext.signIn('expired.or.invalid.token', session);

  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await expect.poll(async () => (await ext.storage()).loginExpired).toBe(true);
  await expect(overlay(page)).toHaveCount(0);
  expect(await serviceWorker.evaluate(() => chrome.action.getBadgeText({}))).toBe('!');

  const popup = await ext.openPopup();
  await expect(popup.locator('#login-error')).toHaveText('Your login expired. Sign in again.');
  await signInViaPopup(popup, student);
  await expect(popup.locator('#view-active')).toBeVisible();
  expect(await serviceWorker.evaluate(() => chrome.action.getBadgeText({}))).toBe('');
});

test('two students: one student\'s override never unblocks the page for the other', async ({ context, ext, student }, testInfo) => {
  // Same goal for both, so they share Claude's cached decision for the page
  const other = await newStudent(testInfo);
  const sharedGoal = student.goal;
  const { body: mine } = await student.startSession();
  const { body: theirs } = await other.api('POST', '/api/sessions', { sessionGoal: sharedGoal, durationInMinutes: 60 });

  await ext.signIn(student.token, mine);
  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await page.locator('#fp-proceed').click();
  await expect(overlay(page)).toHaveCount(0);
  await expect.poll(async () => (await student.sessions())[0].overrideCount).toBe(1);

  // The same browser now belongs to the other student
  await ext.signIn(other.token, theirs);
  const theirPage = await context.newPage();
  await theirPage.goto(pageUrl('off-topic.html'));
  await expect(overlay(theirPage)).toBeVisible();
  expect((await other.sessions())[0]).toMatchObject({ blockCount: 1, overrideCount: 0 });
});
