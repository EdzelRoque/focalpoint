// Journey: a timed session runs out. Blocking stops everywhere, the popup
// returns to Start, and the backend records the planned end time.
import { test, expect, pageUrl, overlay, setSessionEnd } from './harness/fixtures.js';

test('when the time runs out: overlays come down, new pages are not blocked, the session is recorded as ended on time', async ({ context, ext, student }) => {
  const { body: session } = await student.startSession(30);
  // Shrink the session so it ends a few seconds from now
  const endsAt = new Date(Date.now() + 8_000);
  await setSessionEnd(session._id, endsAt);
  await ext.signIn(student.token, { ...session, expectedEndTime: endsAt.toISOString() });

  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await expect(overlay(page)).toBeVisible();
  const popup = await ext.openPopup();
  await expect(popup.locator('#view-active')).toBeVisible();

  // Time runs out
  await expect(overlay(page)).toHaveCount(0, { timeout: 20_000 });
  await expect(popup.locator('#view-start')).toBeVisible();
  expect((await ext.storage()).activeSession).toBeUndefined();

  const later = await context.newPage();
  await later.goto(pageUrl('off-topic.html'));
  await later.waitForTimeout(2000);
  await expect(overlay(later)).toHaveCount(0);

  const [ended] = await student.sessions();
  expect(ended.isActive).toBe(false);
  expect(ended.actualEndTime).toBe(ended.expectedEndTime);
  // Blocks from before the end are kept (tab switches can re-show the overlay,
  // and every showing counts, so this can be more than 1)
  expect(ended.blockCount).toBeGreaterThanOrEqual(1);
});

test('opening the popup after the time ran out shows Start, and a new session can begin', async ({ ext, student }) => {
  const { body: session } = await student.startSession(30);
  const past = new Date(Date.now() - 60_000);
  await setSessionEnd(session._id, past);
  await ext.signIn(student.token, { ...session, expectedEndTime: past.toISOString() });

  const popup = await ext.openPopup();
  await expect(popup.locator('#view-start')).toBeVisible();
  await popup.locator('#session-goal').fill(student.goal);
  await popup.locator('#start-btn').click();
  await expect(popup.locator('#view-active')).toBeVisible();
  const sessions = await student.sessions();
  expect(sessions.map((s) => s.isActive)).toEqual([true, false]);
});
