import {
    test,
    expect,
    stubTestPage,
    mockClassify,
    seedSessionViaStorageOnly,
} from './fixtures.js';

test('#19 — tab switch triggers classify when session is only in storage (no session_started message)', async ({
    context,
    serviceWorker,
}) => {
    await stubTestPage(context);

    let classifyCallCount = 0;
    await mockClassify(context, () => {
        classifyCallCount += 1;
        return { decision: 'ALLOW', reason: 'spec ok' };
    });

    const pageA = await context.newPage();
    await pageA.goto('https://test.fp/a');

    const pageB = await context.newPage();
    await pageB.goto('https://test.fp/b');

    await seedSessionViaStorageOnly(serviceWorker);

    classifyCallCount = 0;

    await pageA.bringToFront();

    await pageA.waitForTimeout(2000);

    expect(classifyCallCount).toBeGreaterThan(0);
});
