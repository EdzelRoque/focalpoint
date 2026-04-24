import {
    test,
    expect,
    stubTestPage,
    mockClassify,
    mockBlockEndpoint,
    mockOverrideEndpoint,
    seedSession,
    readActiveSession,
} from './fixtures.js';

async function triggerBlock(context, page, serviceWorker) {
    await stubTestPage(context);
    await mockClassify(context, () => ({
        decision: 'BLOCK',
        reason: 'Distraction detected by spec.',
    }));
    await page.goto('https://test.fp/sync');
    await seedSession(serviceWorker, page);
    await page.reload();
    await page.waitForSelector('#focalpoint-overlay', { timeout: 15_000 });
}

test('#8 — block counter stays put when POST /block fails', async ({
    context,
    serviceWorker,
}) => {
    await mockBlockEndpoint(context, { status: 500 });
    const page = await context.newPage();
    await triggerBlock(context, page, serviceWorker);

    // Give the SW a tick to finish its post-classify flow (fetch + state writes).
    await page.waitForTimeout(300);

    const session = await readActiveSession(serviceWorker);
    expect(session.blockCount).toBe(0);
});

test('#8 — block counter increments when POST /block succeeds', async ({
    context,
    serviceWorker,
}) => {
    await mockBlockEndpoint(context, { status: 200 });
    const page = await context.newPage();
    await triggerBlock(context, page, serviceWorker);

    await page.waitForTimeout(300);

    const session = await readActiveSession(serviceWorker);
    expect(session.blockCount).toBe(1);
});

test('#8 — override counter stays put when POST /override fails', async ({
    context,
    serviceWorker,
}) => {
    await mockBlockEndpoint(context, { status: 200 });
    await mockOverrideEndpoint(context, { status: 500 });
    const page = await context.newPage();
    await triggerBlock(context, page, serviceWorker);

    await page.waitForSelector('#fp-proceed');
    await page.click('#fp-proceed');

    // Allow the SW enough time to fire /override and process the response.
    await page.waitForTimeout(1000);

    const session = await readActiveSession(serviceWorker);
    expect(session.overrideCount).toBe(0);
});

test('#8 — override counter increments when POST /override succeeds', async ({
    context,
    serviceWorker,
}) => {
    await mockBlockEndpoint(context, { status: 200 });
    await mockOverrideEndpoint(context, { status: 200 });
    const page = await context.newPage();
    await triggerBlock(context, page, serviceWorker);

    await page.waitForSelector('#fp-proceed');
    await page.click('#fp-proceed');

    await page.waitForTimeout(1000);

    const session = await readActiveSession(serviceWorker);
    expect(session.overrideCount).toBe(1);
});
