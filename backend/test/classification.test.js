// Classifying a page against the student's goal: what Claude is asked, how
// its answer is used, caching, and failing open (never block on an error).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newApp, signUp, page, GOAL } from './support/api.js';
import { fakeClaude } from './support/fakeClaude.js';
import { fakeRedis } from './support/fakeRedis.js';

let api, me;
beforeEach(async () => {
  api = newApp();
  me = await signUp(api);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const classify = (body = page(), auth = me.auth) => api.post('/api/classify').set(auth).send(body);

describe('decisions', () => {
  it('returns Claude\'s ALLOW decision and reason', async () => {
    fakeClaude.reply({ decision: 'ALLOW', reason: 'Organic chemistry lesson matches the goal.' });
    const res = await classify();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ decision: 'ALLOW', reason: 'Organic chemistry lesson matches the goal.' });
  });

  it('returns Claude\'s BLOCK decision and reason', async () => {
    fakeClaude.reply({ decision: 'BLOCK', reason: 'A gaming stream is unrelated to chemistry.' });
    const res = await classify(page({ url: 'https://www.twitch.tv/somegamer', pageTitle: 'somegamer - Twitch' }));
    expect(res.body).toEqual({ decision: 'BLOCK', reason: 'A gaming stream is unrelated to chemistry.' });
  });

  it('accepts a decision wrapped in a ```json code fence', async () => {
    fakeClaude.reply({ rawText: '```json\n{"decision":"BLOCK","reason":"Off topic."}\n```' });
    expect((await classify()).body.decision).toBe('BLOCK');
  });

  it('asks Claude with the goal, title and snippet, using claude-haiku-4-5', async () => {
    await classify();
    const [req] = fakeClaude.requests();
    expect(req.path).toBe('/v1/messages');
    expect(req.body.model).toBe('claude-haiku-4-5');
    const prompt = fakeClaude.promptText();
    expect(prompt).toContain(GOAL);
    expect(prompt).toContain('Organic chemistry | Khan Academy');
    expect(prompt).toContain('reaction mechanisms');
  });

  it('uses the STANDARD rules for every request while only standard is released', async () => {
    await classify(page({ blockSensitivity: 'strict' }));
    await classify(page({ blockSensitivity: 'lenient', url: 'https://example.com/other' }));
    expect(fakeClaude.systemText(0)).toContain('Mode: STANDARD');
    expect(fakeClaude.systemText(1)).toContain('Mode: STANDARD');
  });

  it('treats neutral gateways like search and platform homepages as allowed (prompt rule)', async () => {
    await classify();
    expect(fakeClaude.systemText()).toMatch(/search engines.*ALLOWED/s);
  });
});

describe('caching', () => {
  it('reuses a decision for the same URL + goal for 24 hours instead of asking Claude again', async () => {
    fakeClaude.reply({ decision: 'BLOCK', reason: 'Off topic.' });
    await classify();
    const again = await classify();

    expect(again.body).toEqual({ decision: 'BLOCK', reason: 'Off topic.' });
    expect(fakeClaude.requests()).toHaveLength(1);
    const [key] = fakeRedis.keys('classify:');
    expect(fakeRedis.entry(key).ttlSeconds).toBe(86400);
  });

  it('shares Claude\'s decisions between users with the same URL + goal (saves API calls)', async () => {
    const other = await signUp(api);
    fakeClaude.reply({ decision: 'BLOCK', reason: 'Off topic.' });
    await classify();
    const theirs = await classify(page(), other.auth);
    expect(theirs.body.decision).toBe('BLOCK');
    expect(fakeClaude.requests()).toHaveLength(1);
  });

  it('asks again when the goal is different', async () => {
    await classify();
    await classify(page({ sessionGoal: 'Write my history essay on the French Revolution' }));
    expect(fakeClaude.requests()).toHaveLength(2);
  });

  it('treats different query strings as different pages (e.g. two YouTube videos)', async () => {
    fakeClaude.reply({ decision: 'ALLOW', reason: 'Chem lecture.' }, { decision: 'BLOCK', reason: 'Music video.' });
    const a = await classify(page({ url: 'https://www.youtube.com/watch?v=chemlecture' }));
    const b = await classify(page({ url: 'https://www.youtube.com/watch?v=musicvideo' }));
    expect([a.body.decision, b.body.decision]).toEqual(['ALLOW', 'BLOCK']);
  });
});

describe('fail open: an error never blocks a page', () => {
  const failures = [
    ['Claude returns an HTTP error', { status: 400 }],
    ['Claude returns non-JSON text', { rawText: 'Sure! This page looks fine.' }],
    ['Claude returns an unknown decision', { rawText: '{"decision":"MAYBE","reason":"?"}' }],
    ['Claude returns JSON without a decision', { rawText: '{"reason":"no decision"}' }],
  ];

  it.each(failures)('%s -> ALLOW', async (_label, reply) => {
    fakeClaude.reply(reply);
    const res = await classify();
    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('ALLOW');
  });

  it.each(failures)('%s -> the failure is not cached', async (_label, reply) => {
    fakeClaude.reply(reply, { decision: 'BLOCK', reason: 'Off topic.' });
    await classify();
    expect(fakeRedis.keys('classify:')).toHaveLength(0);
    expect((await classify()).body.decision).toBe('BLOCK');
  });
});

describe('input checks', () => {
  it.each([
    ['empty body', {}],
    ['a non-web URL', page({ url: 'file:///C:/notes.txt' })],
    ['a malformed URL', page({ url: 'not a url' })],
    ['a 1-character title', page({ pageTitle: 'X' })],
    ['a too-short snippet', page({ pageSnippet: 'abc' })],
    ['a snippet over 2000 chars', page({ pageSnippet: 'a'.repeat(2001) })],
    ['a too-short goal', page({ sessionGoal: 'study' })],
    ['an unknown sensitivity', page({ blockSensitivity: 'extreme' })],
  ])('rejects %s with 400 and never calls Claude', async (_label, body) => {
    const res = await classify(body);
    expect(res.status).toBe(400);
    expect(fakeClaude.requests()).toHaveLength(0);
  });
});
