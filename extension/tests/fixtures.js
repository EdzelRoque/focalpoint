import { test as base, chromium, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '..');

const BACKEND_HOST = 'focalpoint-q8r5.onrender.com';

const defaultSession = () => ({
    _id: 'test-session-id-aaaaaaaaaaaaaaaa',
    sessionGoal: 'Test the TDD pipeline for the extension',
    blockSensitivity: 'standard',
    strictMode: false,
    blockCount: 0,
    overrideCount: 0,
    isActive: true,
});

export const test = base.extend({
    // Persistent context with the unpacked extension loaded.
    context: async ({}, use) => {
        const context = await chromium.launchPersistentContext('', {
            headless: false,
            args: [
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`,
                '--no-first-run',
                '--no-default-browser-check',
            ],
        });
        await use(context);
        await context.close();
    },

    // Raw service-worker handle. No seeding here — tests call `seedSession`
    // after the page is open so we can use chrome.scripting.executeScript.
    serviceWorker: async ({ context }, use) => {
        let [sw] = context.serviceWorkers();
        if (!sw) sw = await context.waitForEvent('serviceworker');
        await use(sw);
    },
});

export { expect };

export const backendHost = BACKEND_HOST;

/**
 * Serve a minimal HTML page for any https://test.fp/** URL. The extension's
 * content script runs on this page because the manifest matches <all_urls>.
 */
export const stubTestPage = async (context) => {
    await context.route('https://test.fp/**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `<!doctype html>
<html><head><title>FocalPoint test page</title>
<meta name="description" content="A stable test page used only by automated specs."/></head>
<body><main>${'Test page content that is long enough to be a valid snippet. '.repeat(5)}</main></body></html>`,
        }),
    );
};

export const mockClassify = async (context, handler) => {
    await context.route(`https://${BACKEND_HOST}/api/classify`, async (route) => {
        const body = handler(route.request());
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(body),
        });
    });
};

export const mockBlockEndpoint = async (context, { status = 200 } = {}) => {
    await context.route(
        new RegExp(`^https://${BACKEND_HOST.replace(/\./g, '\\.')}/api/sessions/[^/]+/block$`),
        (route) =>
            route.fulfill({
                status,
                contentType: 'application/json',
                body: status >= 400 ? JSON.stringify({ error: 'forced failure' }) : '{}',
            }),
    );
};

export const mockOverrideEndpoint = async (context, { status = 200 } = {}) => {
    await context.route(
        new RegExp(`^https://${BACKEND_HOST.replace(/\./g, '\\.')}/api/sessions/[^/]+/override$`),
        (route) =>
            route.fulfill({
                status,
                contentType: 'application/json',
                body: status >= 400 ? JSON.stringify({ error: 'forced failure' }) : '{}',
            }),
    );
};

/**
 * Seed the extension's storage with a fake token and active session, and wake
 * the service worker's in-memory `activeSession` by injecting a session_started
 * message from a content script running on the given page.
 *
 * The SW's in-memory state is module-scoped and can't be poked directly via
 * sw.evaluate(). Instead we use chrome.scripting.executeScript to run code in
 * the content-script world, where chrome.runtime.sendMessage works and will
 * route to the SW's own onMessage listener.
 */
export const seedSession = async (serviceWorker, page, overrides = {}) => {
    const session = { ...defaultSession(), ...overrides };
    const pageUrl = page.url();

    await serviceWorker.evaluate(
        async ({ session, pageUrl }) => {
            await chrome.storage.local.set({
                token: 'fake-jwt-for-tests',
                activeSession: session,
            });

            const tabs = await chrome.tabs.query({});
            const tab = tabs.find((t) => t.url === pageUrl);
            if (!tab) throw new Error(`Tab not found for url ${pageUrl}`);

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: async (s) => {
                    await chrome.runtime.sendMessage({ action: 'session_started', session: s });
                },
                args: [session],
            });
        },
        { session, pageUrl },
    );

    // Small settle delay so the SW processes the message before the next action.
    await page.waitForTimeout(150);

    return session;
};

export const readActiveSession = async (serviceWorker) => {
    return serviceWorker.evaluate(async () => {
        const { activeSession } = await chrome.storage.local.get('activeSession');
        return activeSession;
    });
};
