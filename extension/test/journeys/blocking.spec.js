// Journeys: what a student sees while browsing during a focus session.
import { test, expect, pageUrl, overlay, expectAllowed, claudeSaw } from './harness/fixtures.js';

test.describe('during a focus session', () => {
  test.beforeEach(async ({ student, ext }) => {
    const { body: session } = await student.startSession();
    await ext.signIn(student.token, session);
  });

  test('an on-topic study page is not blocked', async ({ context, student }) => {
    const page = await context.newPage();
    await page.goto(pageUrl('on-topic.html'));
    await expectAllowed(page, student, 'Organic chemistry: reaction mechanisms');
  });

  test('an off-topic page is covered by the overlay with the reason', async ({ context, student }) => {
    const page = await context.newPage();
    await page.goto(pageUrl('off-topic.html'));
    await expect(overlay(page)).toBeVisible();
    await expect(page.locator('#fp-reason')).toHaveText('This page is not related to your study goal.');
    await expect(page.locator('#fp-proceed')).toBeVisible();

    const [session] = await student.sessions();
    expect(session.blockCount).toBe(1);
  });

  test('"Proceed anyway" lets the student through, counts the override, and the page stays allowed', async ({ context, student, ext }) => {
    const page = await context.newPage();
    await page.goto(pageUrl('off-topic.html'));
    await page.locator('#fp-proceed').click();
    await expect(overlay(page)).toHaveCount(0);

    await expect.poll(async () => (await student.sessions())[0].overrideCount).toBe(1);
    await expect.poll(async () => (await ext.storage()).activeSession.overrideCount).toBe(1);

    await page.reload();
    await page.waitForTimeout(1500);
    await expect(overlay(page)).toHaveCount(0);
  });

  test('"Go back" returns to the previous page', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(pageUrl('start.html'));
    await page.locator('#to-off-topic').click();
    await expect(overlay(page)).toBeVisible();
    await page.locator('#fp-go-back').click();
    await expect(page).toHaveTitle('Study hub');
  });

  test('switching back to a blocked tab blocks it again and counts again', async ({ context, student }) => {
    const blocked = await context.newPage();
    await blocked.goto(pageUrl('off-topic.html'));
    await expect(overlay(blocked)).toBeVisible();

    const other = await context.newPage();
    await other.goto(pageUrl('on-topic.html'));
    await blocked.bringToFront();

    await expect.poll(async () => (await student.sessions())[0].blockCount).toBe(2);
    await expect(overlay(blocked)).toBeVisible();
  });
});

test('strict mode: no "Proceed anyway", only "Go back"', async ({ context, student, ext }) => {
  await student.setStrictMode(true);
  const { body: session } = await student.startSession();
  await ext.signIn(student.token, session);

  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await expect(overlay(page)).toBeVisible();
  await expect(page.locator('#fp-go-back')).toBeVisible();
  await expect(page.locator('#fp-proceed')).toHaveCount(0);
});

test('without a session nothing is checked or blocked', async ({ context, student, ext }) => {
  await ext.signIn(student.token);
  const page = await context.newPage();
  await page.goto(pageUrl('off-topic.html'));
  await page.waitForTimeout(2000);
  await expect(overlay(page)).toHaveCount(0);
  expect(await claudeSaw(student.goal, 'Funny cat videos [off-topic]')).toBe(false);
});

test('single-page-app navigation to an off-topic video gets blocked', async ({ context, student, ext }) => {
  const { body: session } = await student.startSession();
  await ext.signIn(student.token, session);

  const page = await context.newPage();
  await page.goto(pageUrl('spa.html'));
  await expectAllowed(page, student, 'Video player: Organic chemistry lecture');

  await page.evaluate(() => window.goOffTopic());
  await expect(overlay(page)).toBeVisible();
});

test('a page whose text never stops changing (a feed) still gets classified and blocked', async ({ context, student, ext }) => {
  const { body: session } = await student.startSession();
  await ext.signIn(student.token, session);

  const page = await context.newPage();
  await page.goto(pageUrl('feed.html'));
  await expect(overlay(page)).toBeVisible();
});
