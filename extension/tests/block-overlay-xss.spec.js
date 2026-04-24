import {
    test,
    expect,
    stubTestPage,
    mockClassify,
    mockBlockEndpoint,
    seedSession,
} from './fixtures.js';

const XSS_PAYLOAD = '<img src=x onerror="window.__xss_fired=true">';

test('#5 — block overlay renders `reason` as text, never as markup', async ({
    context,
    serviceWorker,
}) => {
    await stubTestPage(context);
    await mockBlockEndpoint(context, { status: 200 });
    await mockClassify(context, () => ({
        decision: 'BLOCK',
        reason: XSS_PAYLOAD,
    }));

    const page = await context.newPage();
    await page.goto('https://test.fp/xss');

    // At this point the SW has no activeSession, so the first classify_page call
    // bails early. Seed the session, then reload to retrigger classification.
    await seedSession(serviceWorker, page);
    await page.reload();

    await page.waitForSelector('#focalpoint-overlay', { timeout: 15_000 });
    // Let any onerror handler parsed out of innerHTML have a chance to run.
    await page.waitForTimeout(300);

    // Assertion 1 — the bug: onerror must not have fired. Pre-fix this is `true`
    // (innerHTML parses <img> and the broken src triggers onerror). Post-fix this
    // stays `undefined` because textContent never parses.
    const xssFired = await page.evaluate(() => window.__xss_fired);
    expect(xssFired).toBeUndefined();

    // Assertion 2 — post-fix DOM shape: the reason slot holds the raw string as a
    // text node, with zero parsed child elements.
    await page.waitForSelector('#fp-reason', { timeout: 5_000 });
    const reasonShape = await page.$eval('#fp-reason', (el) => ({
        childCount: el.children.length,
        textContent: el.textContent,
    }));
    expect(reasonShape.childCount).toBe(0);
    expect(reasonShape.textContent).toBe(XSS_PAYLOAD);
});
