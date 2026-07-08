// Journeys: Strict mode hides Proceed, Go back leaves the blocked page,
// Block stat updates live in the popup (all Tier 2).
// Spec: docs/planning/extension/journeys-spec.md

import { test, expect, pageUrl, uniqueGoal } from './helpers/fixtures.js';
import { updatePreferences } from './helpers/api.js';
import { seedDecision } from './helpers/seed.js';

test('strict mode blocks without a Proceed button', async ({
  startSessionDirect,
  context,
}) => {
  // createSession snapshots user.preferences, so the flag must be flipped
  // BEFORE the session is created — and restored after, since the user is
  // shared across tests.
  await updatePreferences({ blockSensitivity: 'standard', strictMode: true });
  try {
    const goal = uniqueGoal('strict-mode');
    const session = await startSessionDirect(goal);
    expect(session.strictMode).toBe(true);

    const reason = `STRICT-BLOCK-${Date.now()}`;
    await seedDecision(
      pageUrl('off-topic.html'),
      goal,
      session.blockSensitivity,
      'BLOCK',
      reason,
    );

    const page = await context.newPage();
    await page.goto(pageUrl('off-topic.html'));

    // Catches: the strictMode relay breaking anywhere along preferences →
    // session snapshot → storage → background response → overlay (the
    // overlay's own composition is unit-covered in content-helpers tests)
    await expect(page.locator('#focalpoint-overlay')).toBeVisible();
    await expect(page.locator('#fp-go-back')).toBeVisible();
    await expect(page.locator('#fp-proceed')).toHaveCount(0);
  } finally {
    await updatePreferences({ blockSensitivity: 'standard', strictMode: false });
  }
});

test('Go back returns to the previous page without an overlay', async ({
  startSessionDirect,
  context,
}) => {
  const goal = uniqueGoal('go-back');
  const session = await startSessionDirect(goal);
  await seedDecision(
    pageUrl('start.html'),
    goal,
    session.blockSensitivity,
    'ALLOW',
    `GO-BACK-ALLOW-${Date.now()}`,
  );
  const reason = `GO-BACK-BLOCK-${Date.now()}`;
  await seedDecision(
    pageUrl('off-topic.html'),
    goal,
    session.blockSensitivity,
    'BLOCK',
    reason,
  );

  const page = await context.newPage();
  await page.goto(pageUrl('start.html'));
  await page.click('#go-offtopic');
  await expect(page.locator('#focalpoint-overlay')).toBeVisible();

  await page.click('#fp-go-back');

  // Catches: the Go back button not actually navigating away — the primary
  // escape route from a block would be dead
  await expect(page).toHaveURL(pageUrl('start.html'));
  await expect(page.locator('#focalpoint-overlay')).toHaveCount(0);
});

test('a block ticks the popup stat live', async ({
  openPopup,
  startSessionDirect,
  context,
}) => {
  const goal = uniqueGoal('live-stats');
  const session = await startSessionDirect(goal);
  const reason = `LIVE-STATS-${Date.now()}`;
  await seedDecision(
    pageUrl('off-topic.html'),
    goal,
    session.blockSensitivity,
    'BLOCK',
    reason,
  );

  const popup = await openPopup();
  await expect(popup.locator('#view-active')).toBeVisible();
  await expect(popup.locator('#stat-blocks')).toHaveText('0');

  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await expect(page.locator('#focalpoint-overlay')).toBeVisible();

  // No reload, no reopen: the already-open popup must receive the
  // stats_update broadcast. (The handler itself is unit-covered in
  // popup.test.js — this catches the real end-to-end delivery.)
  await expect(popup.locator('#stat-blocks')).toHaveText('1');
});
