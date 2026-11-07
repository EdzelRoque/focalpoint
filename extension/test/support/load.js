// Loads the real extension scripts into the jsdom test environment with a
// fresh fake chrome + fake backend, the way Chrome would load them.
import { vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeChrome } from './fakeChrome.js';
import { createFakeBackend } from './fakeBackend.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const install = (storage) => {
  const chrome = createFakeChrome(storage);
  const backend = createFakeBackend();
  vi.stubGlobal('chrome', chrome);
  vi.stubGlobal('fetch', backend.fetch);
  return { chrome, backend };
};

// Lets queued promise callbacks and listener chains finish.
export const settle = async (rounds = 10) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
};

export const loadBackground = async ({ storage = {} } = {}) => {
  const env = install(storage);
  vi.resetModules();
  await import('../../background.js');
  return env;
};

export const loadContent = async ({ storage = {}, html = '<main>Organic chemistry lecture notes on reaction mechanisms and stereochemistry.</main>', title = 'Lecture notes' } = {}) => {
  const env = install(storage);
  document.title = title;
  document.body.innerHTML = html;
  vi.resetModules();
  await import('../../lib/content-helpers.js');
  await import('../../content.js');
  return env;
};

export const loadPopup = async ({ storage = {}, routes = {} } = {}) => {
  const env = install(storage);
  // The background service worker is always there to receive popup messages
  env.chrome.runtime.respond = async () => undefined;
  for (const [route, response] of Object.entries(routes)) env.backend.on(route, response);
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
  vi.resetModules();
  await import('../../lib/config.js');
  await import('../../lib/session-helpers.js');
  await import('../../lib/login-state.js');
  await import('../../lib/popup-helpers.js');
  await import('../../popup.js');
  await settle();
  return env;
};

/** Which popup view is showing: 'login' | 'start' | 'active'. */
export const popupView = () =>
  ['login', 'start', 'active'].find((v) => document.getElementById(`view-${v}`).style.display !== 'none');

export const submit = (formId) =>
  document.getElementById(formId).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

export const minutesFromNow = (m) => new Date(Date.now() + m * 60_000).toISOString();

export const session = (overrides = {}) => ({
  _id: '64b0000000000000000000aa',
  userId: '64b0000000000000000000bb',
  sessionGoal: 'Study for my organic chemistry midterm',
  startTime: new Date(Date.now() - 5 * 60_000).toISOString(),
  expectedEndTime: minutesFromNow(55),
  actualEndTime: null,
  isActive: true,
  blockCount: 0,
  overrideCount: 0,
  blockSensitivity: 'standard',
  strictMode: false,
  ...overrides,
});
