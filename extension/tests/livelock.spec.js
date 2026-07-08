// Journey: Churning feed still gets blocked (Tier 2) — ARRIVES RED.
//
// Known bug (docs/planning/extension/classify-retry-livelock.md): the retry
// guard in content.js defers classification whenever the title matches the
// last classified title but the snippet changed. On a page whose text never
// stops changing (feeds, tickers, chat), every re-check defers again — the
// page is never classified after a tab_change and the overlay never appears.
//
// test.fixme keeps CI green until the interim fix lands (bounded retry: one
// deferral per navigation event, then classify with the current snippet).
// The fix PR flips this to a live test — red-first, then green.

import { test, expect, pageUrl, uniqueGoal } from './helpers/fixtures.js';
import { getSession } from './helpers/api.js';
import { seedDecision } from './helpers/seed.js';

test.fixme('churning feed tab still gets blocked after a tab switch', async ({
  startSessionDirect,
  context,
}) => {
  const goal = uniqueGoal('livelock');
  const reason = `LIVELOCK-BLOCK-${Date.now()}`;

  // Same construction as the Tier 1 tab-switch journey, but the page's text
  // churns every 300ms under a constant title — the livelock trigger. The
  // pre-session load primes lastClassifiedTitle; the churn then makes the
  // guard defer forever on the tab_change re-classification.
  const feedTab = await context.newPage();
  await feedTab.goto(pageUrl('feed.html'));
  await feedTab.waitForTimeout(1500);
  await expect(feedTab.locator('#focalpoint-overlay')).toHaveCount(0);

  await context.newPage();
  const session = await startSessionDirect(goal);
  await seedDecision(
    pageUrl('feed.html'),
    goal,
    session.blockSensitivity,
    'BLOCK',
    reason,
  );

  await feedTab.bringToFront();

  // Catches: the livelock — the extension silently failing on exactly the
  // kind of page (infinite feeds) it most needs to catch. The seeded cache
  // key uses only the URL, so the churning snippet can't affect the result.
  await expect(feedTab.locator('#focalpoint-overlay')).toBeVisible({
    timeout: 10_000,
  });
  await expect
    .poll(async () => (await getSession(session._id)).blockCount, {
      intervals: [250, 500, 1000],
    })
    .toBe(1);
});
