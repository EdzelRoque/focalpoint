// Journeys: Login (Tier 1), Failed login (Tier 2), popup + register-link
// smokes (Tier 3). Spec: docs/planning/extension/journeys-spec.md

import { test, expect } from './helpers/fixtures.js';
import { sharedUser } from './helpers/api.js';

test('login stores the token and shows the Start view', async ({
  openPopup,
  storage,
}) => {
  const popup = await openPopup();

  // Catches: init() routing to the wrong view for an empty storage state
  await expect(popup.locator('#view-login')).toBeVisible();
  await expect(popup.locator('#view-start')).toBeHidden();

  const { email, password } = sharedUser();
  await popup.fill('#login-email', email);
  await popup.fill('#login-password', password);
  await popup.click('#login-btn');

  // Catches: showView not switching after a successful login
  await expect(popup.locator('#view-start')).toBeVisible();
  await expect(popup.locator('#view-login')).toBeHidden();

  // Catches: token never stored — every later classification would
  // silently fail open while the UI looks logged in
  const stored = await storage.get();
  expect(typeof stored.token).toBe('string');
  expect(stored.token.split('.')).toHaveLength(3);

  // Catches: logout affordance never appearing after auth
  await expect(popup.locator('#logout-btn')).toBeVisible();
});

test('failed login surfaces the backend error and stays on the login view', async ({
  openPopup,
  storage,
}) => {
  const popup = await openPopup();

  await popup.fill('#login-email', sharedUser().email);
  await popup.fill('#login-password', 'Wrong#1password');
  await popup.click('#login-btn');

  // Catches: backend rejection swallowed — user retries blind
  await expect(popup.locator('#login-error')).toBeVisible();
  await expect(popup.locator('#login-error')).not.toHaveText('');
  await expect(popup.locator('#view-login')).toBeVisible();

  // Catches: a token being stored despite the 401
  expect((await storage.get()).token).toBeUndefined();
});

test('smoke: popup opens with zero page errors and the login view visible', async ({
  context,
  extensionId,
}) => {
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', (err) => errors.push(err));

  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // Catches: load-order breakage of lib/popup-helpers.js → popup.js
  await expect(page.locator('#view-login')).toBeVisible();
  expect(errors).toEqual([]);
});

test('smoke: register link opens the web register page in a new tab', async ({
  openPopup,
  serviceWorker,
}) => {
  const popup = await openPopup();
  await popup.click('#open-register');

  // Assert the created tab's URL only (pendingUrl covers the un-committed
  // navigation) — never wait on the external page actually loading.
  await expect
    .poll(() =>
      serviceWorker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return tabs.map((t) => t.pendingUrl || t.url);
      }),
    )
    .toContain('https://focalpoint-rho.vercel.app/register');
});
