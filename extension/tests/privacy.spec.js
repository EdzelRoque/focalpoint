// Journeys: first-run consent, and pages that must never leave the browser.

import { test, expect, pageUrl, uniqueGoal } from './helpers/fixtures.js';
import { seedDecision } from './helpers/seed.js';
import { backendLog, waitForBackendLog } from './helpers/backend-log.js';
import { sharedToken } from './helpers/api.js';

test('a signed-in user must agree before starting a session', async ({ openPopup, storage }) => {
  await storage.remove('privacyConsent');
  await storage.set({ token: sharedToken() });

  const popup = await openPopup();

  // Catches: a session being startable with no disclosure
  await expect(popup.locator('#view-consent')).toBeVisible();
  await expect(popup.locator('#view-start')).toBeHidden();

  await popup.click('#consent-agree');

  // Catches: consent not continuing, or not being remembered
  await expect(popup.locator('#view-start')).toBeVisible();
  expect((await storage.get()).privacyConsent).toBe(true);
});

test('a private address is never classified', async ({ context, startSessionDirect }) => {
  const goal = uniqueGoal('private-address');
  const session = await startSessionDirect(goal);
  const reason = `PRIVATE-ADDRESS-REASON-${Date.now()}`;
  const privateUrl = `${process.env.FP_PRIVATE_PAGES_URL}/off-topic.html`;
  await seedDecision(privateUrl, goal, session.blockSensitivity, 'BLOCK', reason);

  const page = await context.newPage();
  await page.goto(privateUrl);
  await page.waitForTimeout(2000);

  // Catches: the never-send check being skipped on a real page load
  await expect(page.locator('#focalpoint-overlay')).toHaveCount(0);
  expect(backendLog()).not.toContain(reason);
});

test('a domain on the private list is never classified', async ({
  context,
  startSessionDirect,
  storage,
}) => {
  const goal = uniqueGoal('private-list');
  const session = await startSessionDirect(goal);
  await storage.set({ privateDomains: ['focalpoint-pages.test'] });
  const reason = `PRIVATE-LIST-REASON-${Date.now()}`;
  await seedDecision(pageUrl('off-topic.html'), goal, session.blockSensitivity, 'BLOCK', reason);

  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await page.waitForTimeout(2000);

  // Catches: the private list not being read on a real page load
  await expect(page.locator('#focalpoint-overlay')).toHaveCount(0);
  expect(backendLog()).not.toContain(reason);
});

test('the query string does not change the classified page', async ({
  context,
  startSessionDirect,
}) => {
  const goal = uniqueGoal('query-string');
  const session = await startSessionDirect(goal);
  const reason = `QUERY-STRIPPED-REASON-${Date.now()}`;
  await seedDecision(pageUrl('off-topic.html'), goal, session.blockSensitivity, 'BLOCK', reason);

  const page = await context.newPage();
  await page.goto(`${pageUrl('off-topic.html')}?token=secret`);

  // Catches: the query string reaching the backend, which would miss the
  // seeded entry stored under the address without it
  await waitForBackendLog(reason);
  await expect(page.locator('#focalpoint-overlay')).toBeVisible();
});
