// "Proceed anyway": an override allows that page for the student who clicked,
// for that goal, for 24 hours, and never for anyone else.
import { describe, it, expect, beforeEach } from 'vitest';
import { newApp, signUp, startSession, page, GOAL } from './support/api.js';
import { fakeClaude } from './support/fakeClaude.js';
import { fakeRedis } from './support/fakeRedis.js';

const BLOCKED = page({ url: 'https://www.youtube.com/watch?v=funnycats', pageTitle: 'Funny cats compilation' });

let api, alice, bob, aliceSession;
beforeEach(async () => {
  api = newApp();
  alice = await signUp(api);
  bob = await signUp(api);
  aliceSession = (await startSession(api, alice.auth)).body;
  fakeClaude.reply({ decision: 'BLOCK', reason: 'Cat videos are unrelated to chemistry.' });
});

const classify = (who, body = BLOCKED) => api.post('/api/classify').set(who.auth).send(body);
const override = (who, sessionId, body = BLOCKED) =>
  api.post(`/api/sessions/${sessionId}/override`).set(who.auth)
    .send({ url: body.url, sessionGoal: body.sessionGoal, blockSensitivity: body.blockSensitivity });

describe('overriding a block', () => {
  it('allows the page for the student who overrode it', async () => {
    expect((await classify(alice)).body.decision).toBe('BLOCK');
    expect((await override(alice, aliceSession._id)).status).toBe(200);
    expect((await classify(alice)).body.decision).toBe('ALLOW');
  });

  it('keeps the override for 24 hours', async () => {
    await override(alice, aliceSession._id);
    const [key] = fakeRedis.keys('override:');
    expect(fakeRedis.entry(key).ttlSeconds).toBe(86400);
  });

  it('only covers the same goal: a different goal is judged fresh', async () => {
    await classify(alice);
    await override(alice, aliceSession._id);
    fakeClaude.reply({ decision: 'BLOCK', reason: 'Unrelated.' });
    const otherGoal = await classify(alice, { ...BLOCKED, sessionGoal: 'Finish my calculus problem set' });
    expect(otherGoal.body.decision).toBe('BLOCK');
  });

  it('only covers that exact page', async () => {
    await classify(alice);
    await override(alice, aliceSession._id);
    fakeClaude.reply({ decision: 'BLOCK', reason: 'Unrelated.' });
    const otherVideo = await classify(alice, { ...BLOCKED, url: 'https://www.youtube.com/watch?v=morecats' });
    expect(otherVideo.body.decision).toBe('BLOCK');
  });
});

describe('cross-user: overrides never affect anyone else', () => {
  it('another student with the same goal is still blocked after an override', async () => {
    await classify(alice);
    await override(alice, aliceSession._id);
    expect((await classify(bob)).body).toEqual({
      decision: 'BLOCK',
      reason: 'Cat videos are unrelated to chemistry.',
    });
  });

  it('the shared Claude decision is left untouched by an override', async () => {
    await classify(alice);
    const [sharedKey] = fakeRedis.keys('classify:');
    const before = fakeRedis.entry(sharedKey).value;
    await override(alice, aliceSession._id);
    expect(fakeRedis.entry(sharedKey).value).toBe(before);
  });

  it('an override made before any classification still does not leak', async () => {
    await override(alice, aliceSession._id);
    expect((await classify(bob)).body.decision).toBe('BLOCK');
  });

  it('a student cannot record an override on someone else\'s session (403)', async () => {
    const res = await override(bob, aliceSession._id);
    expect(res.status).toBe(403);
    expect(fakeRedis.keys('override:')).toHaveLength(0);
  });
});

describe('when an override is not recorded', () => {
  it('does not record an override on an ended session', async () => {
    await api.put(`/api/sessions/${aliceSession._id}`).set(alice.auth);
    expect((await override(alice, aliceSession._id)).status).toBe(409);
    expect(fakeRedis.keys('override:')).toHaveLength(0);
  });

  it('does not record an override for a session that does not exist', async () => {
    expect((await override(alice, '64b000000000000000000000')).status).toBe(404);
    expect(fakeRedis.keys('override:')).toHaveLength(0);
  });

  it('records against the goal sent, normalised the same way classification does', async () => {
    await override(alice, aliceSession._id, { ...BLOCKED, sessionGoal: `  ${GOAL}  ` });
    expect((await classify(alice)).body.decision).toBe('ALLOW');
  });
});
