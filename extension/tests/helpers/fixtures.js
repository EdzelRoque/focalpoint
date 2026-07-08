// Shared Playwright fixtures for the journey suite.
//
// Every test gets a fresh persistent Chromium context (fresh profile → fresh
// chrome.storage.local) with the rewritten extension copy loaded. Backend,
// Redis, and the static page server are shared per-run (global-setup.js);
// the auto cleanup fixture ends any session a test leaves active so the
// shared user's one-active-session constraint never leaks a 409 forward.

import { test as base, chromium, expect } from '@playwright/test';
import { createSession, endActiveSessions, sharedToken } from './api.js';

export const test = base.extend({
  context: async ({}, use, testInfo) => {
    const context = await chromium.launchPersistentContext(
      testInfo.outputPath('profile'),
      {
        headless: false, // MV3 extensions require headed Chromium (CI: xvfb)
        args: [
          `--disable-extensions-except=${process.env.FP_EXT_DIR}`,
          `--load-extension=${process.env.FP_EXT_DIR}`,
          '--no-first-run',
          '--no-default-browser-check',
        ],
      },
    );
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    await use(sw);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  // chrome.storage.local, read/written from inside the extension (the SW has
  // the chrome APIs; no page needed).
  storage: async ({ serviceWorker }, use) => {
    await use({
      get: () => serviceWorker.evaluate(() => chrome.storage.local.get(null)),
      set: (items) =>
        serviceWorker.evaluate((i) => chrome.storage.local.set(i), items),
    });
  },

  openPopup: async ({ context, extensionId }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      return page;
    });
  },

  // Journeys that aren't about login/session-start seed their state directly:
  // real backend session + real storage write (the popup's own persistence
  // path is exercised by the journeys that own it).
  startSessionDirect: async ({ storage }, use) => {
    await use(async (sessionGoal, durationInMinutes) => {
      const session = await createSession(sessionGoal, durationInMinutes);
      await storage.set({ token: sharedToken(), activeSession: session });
      return session;
    });
  },

  _sessionCleanup: [
    async ({}, use) => {
      await use();
      await endActiveSessions().catch(() => {});
    },
    { auto: true },
  ],
});

export { expect };

export const pageUrl = (name) => `${process.env.FP_PAGES_URL}/${name}`;

// Session goals must be =10 chars (backend validateSessionGoal) and unique
// per test so seeded cache keys can never collide across tests.
export const uniqueGoal = (label) =>
  `Journey goal ${label} ${Date.now()}${Math.floor(Math.random() * 1e6)}`;
