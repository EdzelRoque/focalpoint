// Journey: private page data never leaks, end to end, from a real browser.
import fs from 'node:fs';
import { test, expect, pageUrl, overlay, claudeRequests } from './harness/fixtures.js';

test('query strings and fragments never reach Claude, and the backend logs no page data', async ({ context, ext, student }) => {
  const { body: session } = await student.startSession();
  await ext.signIn(student.token, session);
  const logBefore = fs.readFileSync(process.env.FP_BACKEND_LOG, 'utf8').length;

  const page = await context.newPage();
  await page.goto(`${pageUrl('off-topic.html')}?reset_token=SECRET-TOKEN-42&q=private+search#SECRET-FRAGMENT`);
  await expect(overlay(page)).toBeVisible();

  const mine = (await claudeRequests()).filter((r) => r.messages[0].content.includes(student.goal));
  expect(mine).toHaveLength(1);
  const sent = JSON.stringify(mine[0]);
  expect(sent).toContain('/off-topic.html');
  expect(sent).not.toMatch(/SECRET-TOKEN-42|private\+search|SECRET-FRAGMENT/);
  expect(sent).not.toContain(student.email);

  const newLogs = fs.readFileSync(process.env.FP_BACKEND_LOG, 'utf8').slice(logBefore);
  expect(newLogs).not.toMatch(/SECRET-TOKEN-42|SECRET-FRAGMENT|Funny cat|off-topic\.html/);
  expect(newLogs).not.toContain(student.goal);
});
