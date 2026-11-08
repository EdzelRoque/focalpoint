// Focus-session lifecycle: start, one-at-a-time, duration rules, auto-end at
// expiry, manual end, and the block/override counters behind session stats.
import { describe, it, expect, beforeEach } from 'vitest';
import { newApp, signUp, startSession, GOAL } from './support/api.js';
import { rawSession, backdateSession, setStoredPreferences } from './support/db.js';

let api, me;
beforeEach(async () => {
  api = newApp();
  me = await signUp(api);
});

describe('starting a session', () => {
  it('creates an active session with zeroed stats and the goal as given (trimmed)', async () => {
    const res = await startSession(api, me.auth, { sessionGoal: `  ${GOAL}  `, durationInMinutes: 45 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: me.user._id,
      sessionGoal: GOAL,
      isActive: true,
      blockCount: 0,
      overrideCount: 0,
      actualEndTime: null,
      blockSensitivity: 'standard',
      strictMode: false,
    });
    const minutes = (new Date(res.body.expectedEndTime) - new Date(res.body.startTime)) / 60_000;
    expect(minutes).toBe(45);
  });

  it('allows an open-ended session when no duration is given', async () => {
    const res = await startSession(api, me.auth, { sessionGoal: GOAL });
    expect(res.status).toBe(201);
    expect(res.body.expectedEndTime).toBeNull();
  });

  it('treats an explicit null duration as open-ended', async () => {
    const res = await startSession(api, me.auth, { sessionGoal: GOAL, durationInMinutes: null });
    expect(res.status).toBe(201);
    expect(res.body.expectedEndTime).toBeNull();
  });

  it.each([
    [1, 201],
    [480, 201],
    [481, 400],
    [0, 400],
    [-5, 400],
    [2.5, 400],
    ['60', 400],
  ])('duration %j minutes -> %i (whole minutes, 1 to 480)', async (durationInMinutes, status) => {
    const res = await startSession(api, me.auth, { sessionGoal: GOAL, durationInMinutes });
    expect(res.status).toBe(status);
  });

  it.each([
    ['too short', 'Study now'],
    ['blank', '      '],
    ['too long', 'x'.repeat(501)],
  ])('rejects a %s goal with 400', async (_label, sessionGoal) => {
    const res = await startSession(api, me.auth, { sessionGoal, durationInMinutes: 30 });
    expect(res.status).toBe(400);
  });

  it('only allows one active session per user (409 on a second start)', async () => {
    expect((await startSession(api, me.auth)).status).toBe(201);
    const second = await startSession(api, me.auth);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('You already have an active session');
  });

  it('snapshots strict mode from settings at start; later settings changes do not touch it', async () => {
    await api.put('/auth/settings').set(me.auth)
      .send({ username: me.creds.username, email: me.creds.email, blockSensitivity: 'standard', strictMode: true });
    const started = await startSession(api, me.auth);
    expect(started.body.strictMode).toBe(true);

    await api.put('/auth/settings').set(me.auth)
      .send({ username: me.creds.username, email: me.creds.email, blockSensitivity: 'standard', strictMode: false });
    const fetched = await api.get(`/api/sessions/${started.body._id}`).set(me.auth);
    expect(fetched.body.strictMode).toBe(true);
  });

  it('always uses standard sensitivity, even for accounts that stored an unreleased level', async () => {
    await setStoredPreferences(me.creds.email, { blockSensitivity: 'strict', strictMode: false });
    const res = await startSession(api, me.auth);
    expect(res.body.blockSensitivity).toBe('standard');
  });
});

describe('auto-end when the duration runs out', () => {
  it('ends an overdue session with actualEndTime = expectedEndTime', async () => {
    const { body: s } = await startSession(api, me.auth, { sessionGoal: GOAL, durationInMinutes: 30 });
    await backdateSession(s._id, 90); // started 90 min ago, so due 60 min ago

    const res = await api.get(`/api/sessions/${s._id}`).set(me.auth);
    expect(res.body.isActive).toBe(false);
    expect(res.body.actualEndTime).toBe(res.body.expectedEndTime);
  });

  it('shows expired sessions as ended in the session list', async () => {
    const { body: s } = await startSession(api, me.auth, { sessionGoal: GOAL, durationInMinutes: 10 });
    await backdateSession(s._id, 11);

    const list = await api.get('/api/sessions').set(me.auth);
    expect(list.body[0]).toMatchObject({ _id: s._id, isActive: false });
  });

  it('lets a new session start once the old one has expired', async () => {
    const { body: s } = await startSession(api, me.auth, { sessionGoal: GOAL, durationInMinutes: 10 });
    await backdateSession(s._id, 11);
    expect((await startSession(api, me.auth)).status).toBe(201);
  });

  it('stops counting blocks and overrides after expiry (409)', async () => {
    const { body: s } = await startSession(api, me.auth, { sessionGoal: GOAL, durationInMinutes: 10 });
    await backdateSession(s._id, 11);

    expect((await api.post(`/api/sessions/${s._id}/block`).set(me.auth)).status).toBe(409);
    const override = await api.post(`/api/sessions/${s._id}/override`).set(me.auth)
      .send({ url: 'https://youtube.com/', sessionGoal: GOAL, blockSensitivity: 'standard' });
    expect(override.status).toBe(409);
    expect((await rawSession(s._id)).blockCount).toBe(0);
  });

  it('never expires an open-ended session', async () => {
    const { body: s } = await startSession(api, me.auth, { sessionGoal: GOAL });
    await backdateSession(s._id, 60 * 24 * 3);
    const res = await api.get(`/api/sessions/${s._id}`).set(me.auth);
    expect(res.body.isActive).toBe(true);
  });

  it('does not expire a session before its end time', async () => {
    const { body: s } = await startSession(api, me.auth, { sessionGoal: GOAL, durationInMinutes: 30 });
    await backdateSession(s._id, 29);
    const res = await api.get(`/api/sessions/${s._id}`).set(me.auth);
    expect(res.body.isActive).toBe(true);
  });

  it('reports 409 when ending a session that already expired, and keeps the expiry end time', async () => {
    const { body: s } = await startSession(api, me.auth, { sessionGoal: GOAL, durationInMinutes: 10 });
    await backdateSession(s._id, 11);
    const res = await api.put(`/api/sessions/${s._id}`).set(me.auth);
    expect(res.status).toBe(409);
    const raw = await rawSession(s._id);
    expect(raw.actualEndTime.getTime()).toBe(raw.expectedEndTime.getTime());
  });
});

describe('ending a session manually', () => {
  it('marks the session inactive and records when it ended', async () => {
    const { body: s } = await startSession(api, me.auth);
    const before = Date.now();
    const res = await api.put(`/api/sessions/${s._id}`).set(me.auth);

    expect(res.status).toBe(200);
    const raw = await rawSession(s._id);
    expect(raw.isActive).toBe(false);
    expect(raw.actualEndTime.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('refuses to end the same session twice (409)', async () => {
    const { body: s } = await startSession(api, me.auth);
    await api.put(`/api/sessions/${s._id}`).set(me.auth);
    expect((await api.put(`/api/sessions/${s._id}`).set(me.auth)).status).toBe(409);
  });

  it('allows a new session after ending the previous one', async () => {
    const { body: s } = await startSession(api, me.auth);
    await api.put(`/api/sessions/${s._id}`).set(me.auth);
    expect((await startSession(api, me.auth)).status).toBe(201);
  });

  it('returns 404 for a session id that does not exist and 400 for a malformed id', async () => {
    expect((await api.put('/api/sessions/64b000000000000000000000').set(me.auth)).status).toBe(404);
    expect((await api.put('/api/sessions/not-an-id').set(me.auth)).status).toBe(400);
  });
});

describe('session stats (never lose a count)', () => {
  it('counts every block event, including repeat blocks of the same page', async () => {
    const { body: s } = await startSession(api, me.auth);
    for (let i = 0; i < 3; i++) {
      expect((await api.post(`/api/sessions/${s._id}/block`).set(me.auth)).status).toBe(200);
    }
    expect((await rawSession(s._id)).blockCount).toBe(3);
  });

  it('counts concurrent block events without dropping any', async () => {
    const { body: s } = await startSession(api, me.auth);
    await Promise.all(Array.from({ length: 10 }, () => api.post(`/api/sessions/${s._id}/block`).set(me.auth)));
    expect((await rawSession(s._id)).blockCount).toBe(10);
  });

  it('counts overrides separately from blocks', async () => {
    const { body: s } = await startSession(api, me.auth);
    await api.post(`/api/sessions/${s._id}/block`).set(me.auth);
    await api.post(`/api/sessions/${s._id}/override`).set(me.auth)
      .send({ url: 'https://youtube.com/watch?v=abc', sessionGoal: GOAL, blockSensitivity: 'standard' });
    const raw = await rawSession(s._id);
    expect(raw).toMatchObject({ blockCount: 1, overrideCount: 1 });
  });

  it('keeps final counts on an ended session', async () => {
    const { body: s } = await startSession(api, me.auth);
    await api.post(`/api/sessions/${s._id}/block`).set(me.auth);
    await api.post(`/api/sessions/${s._id}/block`).set(me.auth);
    await api.put(`/api/sessions/${s._id}`).set(me.auth);
    expect((await api.post(`/api/sessions/${s._id}/block`).set(me.auth)).status).toBe(409);
    const list = await api.get('/api/sessions').set(me.auth);
    expect(list.body[0]).toMatchObject({ blockCount: 2, isActive: false });
  });

  it('requires url, goal and sensitivity to record an override', async () => {
    const { body: s } = await startSession(api, me.auth);
    expect((await api.post(`/api/sessions/${s._id}/override`).set(me.auth).send({})).status).toBe(400);
    expect((await api.post(`/api/sessions/${s._id}/override`).set(me.auth)
      .send({ url: 'not a url', sessionGoal: GOAL, blockSensitivity: 'standard' })).status).toBe(400);
    expect((await rawSession(s._id)).overrideCount).toBe(0);
  });
});

describe('session history', () => {
  it('lists the user\'s sessions newest first', async () => {
    const first = (await startSession(api, me.auth)).body;
    await api.put(`/api/sessions/${first._id}`).set(me.auth);
    await backdateSession(first._id, 120);
    const second = (await startSession(api, me.auth)).body;

    const list = await api.get('/api/sessions').set(me.auth);
    expect(list.body.map((s) => s._id)).toEqual([second._id, first._id]);
  });

  it('returns an empty list for a new user', async () => {
    const list = await api.get('/api/sessions').set(me.auth);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
  });
});
