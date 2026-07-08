// Journey: Generic SPA navigation re-classifies (Tier 2).
// Spec: docs/planning/extension/journeys-spec.md
//
// The YouTube-specific path (yt-page-data-updated) is deliberately NOT
// automated — it can't fire on a local page; it's a documented manual smoke
// check (spec Tier 3) and its wiring is pinned by content.youtube.test.js.

import { test, expect, uniqueGoal } from './helpers/fixtures.js';
import { seedDecision } from './helpers/seed.js';
import { waitForBackendLog } from './helpers/backend-log.js';

test('pushState navigation re-classifies and manages the overlay', async ({
  startSessionDirect,
  context,
}) => {
  const goal = uniqueGoal('spa');
  const session = await startSessionDirect(goal);
  const base = process.env.FP_PAGES_URL;

  await seedDecision(
    `${base}/spa.html`,
    goal,
    session.blockSensitivity,
    'ALLOW',
    `SPA-HOME-${Date.now()}`,
  );
  const blockedReason = `SPA-BLOCKED-${Date.now()}`;
  await seedDecision(
    `${base}/spa-blocked`,
    goal,
    session.blockSensitivity,
    'BLOCK',
    blockedReason,
  );
  const allowedReason = `SPA-ALLOWED-${Date.now()}`;
  await seedDecision(
    `${base}/spa-allowed`,
    goal,
    session.blockSensitivity,
    'ALLOW',
    allowedReason,
  );

  const page = await context.newPage();
  await page.goto(`${base}/spa.html`);

  // Client-side navigation to the blocked route: no page load, only
  // pushState. tabs.onUpdated must catch it and spa_change re-classify
  // after the 1s settle delay.
  await page.click('#to-blocked');

  // Catches: the whole SPA re-classification chain broken — SPAs would be
  // classified once at load and never again
  await expect(page.locator('#focalpoint-overlay')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('#fp-reason')).toHaveText(blockedReason);

  // Navigate the SPA to an allowed route. The overlay blocks user clicks by
  // design, so simulate the app itself navigating (a redirect/autoplay-style
  // route change) — exactly what spa_change must handle: drop the stale
  // overlay immediately, then re-classify the new route.
  await page.evaluate(() => {
    history.pushState({}, '', '/spa-allowed');
    render('/spa-allowed');
  });

  // Catches: stale overlay surviving an SPA route change away from the
  // blocked content
  await expect(page.locator('#focalpoint-overlay')).toHaveCount(0);

  // Catches: the allowed route being wrongly re-blocked — wait until its
  // classification actually completed, then require no overlay
  await waitForBackendLog(allowedReason, 15_000);
  await expect(page.locator('#focalpoint-overlay')).toHaveCount(0);
});
