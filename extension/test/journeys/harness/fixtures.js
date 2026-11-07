// Playwright fixtures for journeys. Each test gets a fresh Chrome profile with
// the extension loaded, plus its own freshly registered student (so tests never
// share sessions, overrides or cache entries).
import { test as base, chromium, expect } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

const BACKEND = () => process.env.FP_BACKEND_URL;
export const pageUrl = (name) => `${process.env.FP_PAGES_URL}/${name}`;

let counter = 0;
const PASSWORD = 'Journey$1pass';

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BACKEND()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

/** Register + log in a new student via the API. */
export const newStudent = async (testInfo) => {
  counter += 1;
  const id = `${testInfo.workerIndex}${Date.now().toString(36)}${counter}`;
  const creds = { username: `j${id}`.slice(0, 25), email: `j${id}@school.edu`, password: PASSWORD };
  const reg = await api('POST', '/auth/register', { body: creds });
  if (reg.status !== 201) throw new Error(`register failed ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api('POST', '/auth/login', { body: { email: creds.email, password: PASSWORD } });
  // A unique goal per student keeps every test's cache entries separate
  const goal = `Study organic chemistry reaction mechanisms (run ${id})`;
  return {
    ...creds,
    id: login.body._id,
    token: login.body.token,
    goal,
    api: (method, path, body) => api(method, path, { token: login.body.token, body }),
    startSession: (durationInMinutes = 60) =>
      api('POST', '/api/sessions', { token: login.body.token, body: { sessionGoal: goal, durationInMinutes } }),
    sessions: async () => (await api('GET', '/api/sessions', { token: login.body.token })).body,
    setStrictMode: (strictMode) =>
      api('PUT', '/auth/settings', { token: login.body.token, body: { username: creds.username, email: creds.email, blockSensitivity: 'standard', strictMode } }),
  };
};

/** Direct DB access for things a journey can't wait for in real time (e.g. a session's end time). */
export const withDb = async (fn) => {
  const client = await MongoClient.connect(process.env.FP_MONGO_URI);
  try { return await fn(client.db('FocalPoint')); } finally { await client.close(); }
};

export const setSessionEnd = (sessionId, when) =>
  withDb((db) => db.collection('sessions').updateOne({ _id: new ObjectId(sessionId) }, { $set: { expectedEndTime: when } }));

/** Everything the fake Claude was asked during this run. */
export const claudeRequests = async () => (await fetch(`${process.env.FP_CLAUDE_URL}/__requests`)).json();
export const claudeSaw = async (goal, title) =>
  (await claudeRequests()).some((r) => r.messages[0].content.includes(goal) && r.messages[0].content.includes(`Page title: ${title}`));

export const test = base.extend({
  context: async ({}, use, testInfo) => {
    const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
      headless: false, // MV3 extensions need headed Chromium (CI uses xvfb)
      args: [
        `--disable-extensions-except=${process.env.FP_EXT_DIR}`,
        `--load-extension=${process.env.FP_EXT_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
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

  student: async ({}, use, testInfo) => {
    await use(await newStudent(testInfo));
  },

  /** chrome.storage.local inside the extension, plus popup access. */
  ext: async ({ context, serviceWorker, extensionId }, use) => {
    await use({
      storage: () => serviceWorker.evaluate(() => chrome.storage.local.get(null)),
      set: (items) => serviceWorker.evaluate((i) => chrome.storage.local.set(i), items),
      /** Log the extension in and (optionally) adopt a backend session, as the popup would. */
      signIn: (token, activeSession) =>
        serviceWorker.evaluate((i) => chrome.storage.local.set(i), activeSession ? { token, activeSession } : { token }),
      openPopup: async () => {
        const popup = await context.newPage();
        await popup.goto(`chrome-extension://${extensionId}/popup.html`);
        return popup;
      },
    });
  },
});

export { expect };

export const overlay = (page) => page.locator('#focalpoint-overlay');

/**
 * Asserts a page was judged and NOT blocked: waits until the fake Claude has
 * seen this page for this goal, gives the answer time to land, then checks.
 */
export const expectAllowed = async (page, student, title) => {
  await expect.poll(() => claudeSaw(student.goal, title), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(750);
  await expect(overlay(page)).toHaveCount(0);
};
