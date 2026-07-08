// Journeys: Off-topic page → overlay, On-topic page → no overlay,
// Override → not re-blocked, Tab switch to already-open off-topic tab
// (all Tier 1). Spec: docs/planning/extension/journeys-spec.md

import { test, expect, pageUrl, uniqueGoal } from './helpers/fixtures.js';
import { getSession } from './helpers/api.js';
import { seedDecision } from './helpers/seed.js';
import { waitForBackendLog } from './helpers/backend-log.js';

test('off-topic page gets the overlay with the seeded reason', async ({
  startSessionDirect,
  storage,
  context,
}) => {
  const goal = uniqueGoal('off-topic');
  const session = await startSessionDirect(goal);
  const reason = `OFF-TOPIC-REASON-${Date.now()}`;
  await seedDecision(
    pageUrl('off-topic.html'),
    goal,
    session.blockSensitivity,
    'BLOCK',
    reason,
  );

  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));

  // Catches: any break in the whole block pipeline — the extension failing
  // at its one job
  await expect(page.locator('#focalpoint-overlay')).toBeVisible();

  // Catches: reason relay broken (default text = plumbing half alive)
  await expect(page.locator('#fp-reason')).toHaveText(reason);

  // Catches: strictMode mis-relayed as truthy for a normal session
  await expect(page.locator('#fp-go-back')).toBeVisible();
  await expect(page.locator('#fp-proceed')).toBeVisible();

  // Storage write happens only after the backend block sync succeeded, so
  // polling storage (free) also proves the backend call. One HTTP GET then
  // pins the backend count.
  await expect
    .poll(async () => (await storage.get()).activeSession.blockCount)
    .toBe(1);
  expect((await getSession(session._id)).blockCount).toBe(1);
});

test('on-topic page shows no overlay', async ({
  startSessionDirect,
  context,
}) => {
  const goal = uniqueGoal('on-topic');
  const session = await startSessionDirect(goal);
  const reason = `ON-TOPIC-ALLOW-${Date.now()}`;
  await seedDecision(
    pageUrl('on-topic.html'),
    goal,
    session.blockSensitivity,
    'ALLOW',
    reason,
  );

  const page = await context.newPage();
  await page.goto(pageUrl('on-topic.html'));

  // The backend log proves classification actually completed before the
  // negative assertion — "no overlay" must not pass just because nothing
  // ran yet.
  await waitForBackendLog(reason);

  // Catches: decision handling inverted/broken — blocking everything
  await expect(page.locator('#focalpoint-overlay')).toHaveCount(0);

  // Catches: ALLOW wrongly triggering the block-count sync
  expect((await getSession(session._id)).blockCount).toBe(0);
});

test('override dismisses the overlay, logs it, and prevents re-block on revisit', async ({
  startSessionDirect,
  storage,
  context,
}) => {
  const goal = uniqueGoal('override');
  const session = await startSessionDirect(goal);
  const reason = `OVERRIDE-BLOCK-${Date.now()}`;
  await seedDecision(
    pageUrl('off-topic.html'),
    goal,
    session.blockSensitivity,
    'BLOCK',
    reason,
  );

  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await expect(page.locator('#focalpoint-overlay')).toBeVisible();

  await page.click('#fp-proceed');

  // Catches: proceed listener broken — user permanently trapped
  await expect(page.locator('#focalpoint-overlay')).toHaveCount(0);

  // Catches: override sync / storage persistence regression
  await expect
    .poll(async () => (await storage.get()).activeSession.overrideCount)
    .toBe(1);
  expect((await getSession(session._id)).overrideCount).toBe(1);

  // Revisit: the backend rewrote the cache entry to ALLOW on override —
  // the user must not be instantly re-blocked on the same page.
  const { blockCount: blocksBefore } = await getSession(session._id);
  await page.reload();
  await waitForBackendLog("User overrode this page's block");

  // Catches: clearClassificationCache rewrite regression (instant re-block)
  await expect(page.locator('#focalpoint-overlay')).toHaveCount(0);

  // Catches: the block flow re-firing on the ALLOW revisit
  expect((await getSession(session._id)).blockCount).toBe(blocksBefore);
});

test('switching to an already-open off-topic tab injects the overlay', async ({
  startSessionDirect,
  context,
}) => {
  const goal = uniqueGoal('tab-switch');
  const reason = `TAB-SWITCH-${Date.now()}`;

  // Open the off-topic tab BEFORE any session exists: its load-time
  // classification is a no-op, so only tabs.onActivated can block it later.
  const offTopicTab = await context.newPage();
  await offTopicTab.goto(pageUrl('off-topic.html'));
  await offTopicTab.waitForTimeout(1500);
  await expect(offTopicTab.locator('#focalpoint-overlay')).toHaveCount(0);

  // A second tab takes focus; the session starts while the off-topic tab is
  // in the background. (Direct-seeded: popup-driven session start is owned
  // by its own journey, and storage.set exercises the same onChanged sync
  // path in the background SW.)
  const otherTab = await context.newPage();
  const session = await startSessionDirect(goal);
  await seedDecision(
    pageUrl('off-topic.html'),
    goal,
    session.blockSensitivity,
    'BLOCK',
    reason,
  );

  await offTopicTab.bringToFront();

  // Catches: onActivated → tab_change → re-classify chain broken —
  // already-open distraction tabs become permanent blind spots
  await expect(offTopicTab.locator('#focalpoint-overlay')).toBeVisible();
  await expect(offTopicTab.locator('#fp-reason')).toHaveText(reason);

  // Catches: block sync regression on the tab-switch path
  await expect
    .poll(async () => (await getSession(session._id)).blockCount, {
      intervals: [250, 500, 1000],
    })
    .toBe(1);

  otherTab.close();
});
