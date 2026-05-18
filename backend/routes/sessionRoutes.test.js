import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { ObjectId } from 'mongodb';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock('../config/redisConnection.js', () => ({
  default: {
    get: (...args) => mockGet(...args),
    set: (...args) => mockSet(...args),
    del: (...args) => mockDel(...args),
  },
}));

const { buildTestApp } = await import('../test/buildTestApp.js');
const { clearDb } = await import('../test/dbHelpers.js');
const { registerAndSign } = await import('../test/authHelpers.js');
const { sessions, users } = await import('../config/mongoCollections.js');
const { closeConnection } = await import('../config/mongoConnection.js');
const { createSession } = await import('../data/session.js');

const app = buildTestApp();

const validGoal = 'Finish writing the Tier 1 route specs';

const cacheKeyFor = (url, goal, sens) =>
  `classify:${crypto.createHash('sha256').update(`${url}:${goal}:${sens}`).digest('hex')}`;

beforeEach(async () => {
  mockGet.mockReset();
  mockSet.mockReset();
  mockDel.mockReset();
  await clearDb();
});

afterAll(async () => {
  await closeConnection();
});

describe('GET /api/sessions', () => {
  it('returns the caller\'s sessions sorted by startTime desc and not other users\' sessions', async () => {
    const { user: me, token } = await registerAndSign({ username: 'me.user' });
    const { user: other } = await registerAndSign({ username: 'other.user' });

    const sessionCollection = await sessions();
    const earlier = new Date('2026-01-01T10:00:00Z');
    const later = new Date('2026-02-01T10:00:00Z');
    const myFirst = await sessionCollection.insertOne({
      userId: new ObjectId(me._id), sessionGoal: 'First goal that is long enough',
      startTime: earlier, actualEndTime: earlier, isActive: false,
      blockCount: 0, overrideCount: 0, blockSensitivity: 'standard', strictMode: false,
    });
    await sessionCollection.insertOne({
      userId: new ObjectId(me._id), sessionGoal: 'Second goal that is long enough',
      startTime: later, actualEndTime: null, isActive: true,
      blockCount: 0, overrideCount: 0, blockSensitivity: 'standard', strictMode: false,
    });
    await sessionCollection.insertOne({
      userId: new ObjectId(other._id), sessionGoal: 'Other user goal that is long enough',
      startTime: later, actualEndTime: null, isActive: true,
      blockCount: 0, overrideCount: 0, blockSensitivity: 'standard', strictMode: false,
    });

    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    res.body.forEach((s) => expect(s.userId).toBe(me._id));

    const startTimes = res.body.map((s) => new Date(s.startTime).getTime());
    expect(startTimes[0]).toBeGreaterThan(startTimes[1]);
    expect(res.body[1]._id).toBe(myFirst.insertedId.toString());
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(401);
  });

  it('returns 200 with an empty array when the caller has no sessions', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/sessions', () => {
  it('returns 201 with the new session including duration-derived expectedEndTime and snapshotted preferences', async () => {
    const { user, token } = await registerAndSign();

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionGoal: validGoal, durationInMinutes: 30 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      sessionGoal: validGoal,
      userId: user._id,
      isActive: true,
      blockCount: 0,
      overrideCount: 0,
      blockSensitivity: 'standard',
      strictMode: false,
    });
    expect(typeof res.body._id).toBe('string');

    const start = new Date(res.body.startTime).getTime();
    const end = new Date(res.body.expectedEndTime).getTime();
    expect(end - start).toBe(30 * 60_000);
  });

  it('returns 201 with expectedEndTime: null when no duration is provided', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionGoal: validGoal });

    expect(res.status).toBe(201);
    expect(res.body.expectedEndTime).toBeNull();
  });

  it('snapshots the user\'s preferences at creation time, not defaults', async () => {
    const { user, token } = await registerAndSign();
    const userCollection = await users();
    await userCollection.updateOne(
      { _id: new ObjectId(user._id) },
      { $set: { 'preferences.blockSensitivity': 'strict', 'preferences.strictMode': true } },
    );

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionGoal: validGoal });

    expect(res.status).toBe(201);
    expect(res.body.blockSensitivity).toBe('strict');
    expect(res.body.strictMode).toBe(true);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ sessionGoal: validGoal });

    expect(res.status).toBe(401);
  });

  it('returns 400 when the body is empty', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'You must provide session information' });
  });

  it('returns 400 when sessionGoal is too short', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionGoal: 'too short' });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 400 when durationInMinutes is non-numeric', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionGoal: validGoal, durationInMinutes: 'thirty' });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 409 when the user already has an active session, and inserts no second row', async () => {
    const { user, token } = await registerAndSign();
    await createSession(user._id, validGoal);

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionGoal: 'A different goal for this attempt' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'You already have an active session' });

    const sessionCollection = await sessions();
    expect(await sessionCollection.countDocuments({})).toBe(1);
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns 200 with the session when the caller owns it', async () => {
    const { user, token } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const res = await request(app)
      .get(`/api/sessions/${created._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(created._id);
    expect(res.body.userId).toBe(user._id);
    expect(res.body.sessionGoal).toBe(validGoal);
  });

  it('returns 401 without a token', async () => {
    const { user } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const res = await request(app).get(`/api/sessions/${created._id}`);

    expect(res.status).toBe(401);
  });

  it('returns 403 when the session belongs to a different user, and does not leak session fields', async () => {
    const { user: owner } = await registerAndSign({ username: 'owner.user' });
    const { token: attackerToken } = await registerAndSign({ username: 'attacker.user' });
    const created = await createSession(owner._id, validGoal);

    const res = await request(app)
      .get(`/api/sessions/${created._id}`)
      .set('Authorization', `Bearer ${attackerToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(res.body).not.toHaveProperty('sessionGoal');
    expect(res.body).not.toHaveProperty('userId');
  });

  it('returns 404 when no session exists for that id', async () => {
    const { token } = await registerAndSign();
    const missingId = new ObjectId().toString();

    const res = await request(app)
      .get(`/api/sessions/${missingId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Session not found' });
  });

  it('returns 400 when the id is not a valid ObjectId', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .get('/api/sessions/not-an-objectid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid ID' });
  });
});

describe('PUT /api/sessions/:id', () => {
  it('returns 200 and ends the session (isActive false, actualEndTime set) when the caller owns it', async () => {
    const { user, token } = await registerAndSign();
    const created = await createSession(user._id, validGoal);
    const before = Date.now();

    const res = await request(app)
      .put(`/api/sessions/${created._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const sessionCollection = await sessions();
    const doc = await sessionCollection.findOne({ _id: new ObjectId(created._id) });
    expect(doc.isActive).toBe(false);
    expect(doc.actualEndTime).toBeInstanceOf(Date);
    expect(doc.actualEndTime.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('returns 401 without a token', async () => {
    const { user } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const res = await request(app).put(`/api/sessions/${created._id}`);

    expect(res.status).toBe(401);
  });

  it('returns 403 and does not modify the session when the caller is not the owner', async () => {
    const { user: owner } = await registerAndSign({ username: 'owner.user' });
    const { token: attackerToken } = await registerAndSign({ username: 'attacker.user' });
    const created = await createSession(owner._id, validGoal);

    const sessionCollection = await sessions();
    const before = await sessionCollection.findOne({ _id: new ObjectId(created._id) });

    const res = await request(app)
      .put(`/api/sessions/${created._id}`)
      .set('Authorization', `Bearer ${attackerToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });

    const after = await sessionCollection.findOne({ _id: new ObjectId(created._id) });
    expect(after.isActive).toBe(true);
    expect(after.actualEndTime).toBeNull();
    expect(after).toEqual(before);
  });

  it('returns 404 when no session exists for that id', async () => {
    const { token } = await registerAndSign();
    const missingId = new ObjectId().toString();

    const res = await request(app)
      .put(`/api/sessions/${missingId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Session not found' });
  });

  it('returns 400 when the id is not a valid ObjectId', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .put('/api/sessions/not-an-objectid')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 409 when the session is already ended', async () => {
    const { user, token } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const sessionCollection = await sessions();
    await sessionCollection.updateOne(
      { _id: new ObjectId(created._id) },
      { $set: { isActive: false, actualEndTime: new Date() } },
    );

    const res = await request(app)
      .put(`/api/sessions/${created._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Session is already ended' });
  });
});

describe('POST /api/sessions/:id/block', () => {
  it('returns 200 and increments blockCount by exactly 1 on an active session the caller owns', async () => {
    const { user, token } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const res = await request(app)
      .post(`/api/sessions/${created._id}/block`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const sessionCollection = await sessions();
    const doc = await sessionCollection.findOne({ _id: new ObjectId(created._id) });
    expect(doc.blockCount).toBe(1);
  });

  it('returns 401 without a token', async () => {
    const { user } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const res = await request(app).post(`/api/sessions/${created._id}/block`);

    expect(res.status).toBe(401);
  });

  it('returns 403 and does not modify the session when the caller is not the owner', async () => {
    const { user: owner } = await registerAndSign({ username: 'owner.user' });
    const { token: attackerToken } = await registerAndSign({ username: 'attacker.user' });
    const created = await createSession(owner._id, validGoal);

    const sessionCollection = await sessions();
    const before = await sessionCollection.findOne({ _id: new ObjectId(created._id) });

    const res = await request(app)
      .post(`/api/sessions/${created._id}/block`)
      .set('Authorization', `Bearer ${attackerToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });

    const after = await sessionCollection.findOne({ _id: new ObjectId(created._id) });
    expect(after).toEqual(before);
  });

  it('returns 409 and does not increment when the session is already ended', async () => {
    const { user, token } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const sessionCollection = await sessions();
    await sessionCollection.updateOne(
      { _id: new ObjectId(created._id) },
      { $set: { isActive: false, actualEndTime: new Date() } },
    );

    const res = await request(app)
      .post(`/api/sessions/${created._id}/block`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Session is already ended' });

    const doc = await sessionCollection.findOne({ _id: new ObjectId(created._id) });
    expect(doc.blockCount).toBe(0);
  });
});

describe('POST /api/sessions/:id/override', () => {
  const overrideBody = {
    url: 'https://example.com/article',
    sessionGoal: 'A perfectly valid session goal here',
    blockSensitivity: 'standard',
  };

  it('returns 200, increments overrideCount, AND rewrites the Redis cache to ALLOW with 24h TTL', async () => {
    const { user, token } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const res = await request(app)
      .post(`/api/sessions/${created._id}/override`)
      .set('Authorization', `Bearer ${token}`)
      .send(overrideBody);

    expect(res.status).toBe(200);

    const sessionCollection = await sessions();
    const doc = await sessionCollection.findOne({ _id: new ObjectId(created._id) });
    expect(doc.overrideCount).toBe(1);

    const expectedKey = cacheKeyFor(
      overrideBody.url, overrideBody.sessionGoal, overrideBody.blockSensitivity,
    );
    expect(mockSet).toHaveBeenCalledWith(
      expectedKey,
      JSON.stringify({ decision: 'ALLOW', reason: "User overrode this page's block" }),
      'EX',
      86400,
    );
  });

  it('returns 401 without a token', async () => {
    const { user } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const res = await request(app)
      .post(`/api/sessions/${created._id}/override`)
      .send(overrideBody);

    expect(res.status).toBe(401);
  });

  it('returns 403, does not increment, and does not touch Redis when the caller is not the owner', async () => {
    const { user: owner } = await registerAndSign({ username: 'owner.user' });
    const { token: attackerToken } = await registerAndSign({ username: 'attacker.user' });
    const created = await createSession(owner._id, validGoal);

    const res = await request(app)
      .post(`/api/sessions/${created._id}/override`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send(overrideBody);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });

    const sessionCollection = await sessions();
    const doc = await sessionCollection.findOne({ _id: new ObjectId(created._id) });
    expect(doc.overrideCount).toBe(0);
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('returns 409, does not increment, and does not touch Redis when the session is already ended', async () => {
    const { user, token } = await registerAndSign();
    const created = await createSession(user._id, validGoal);

    const sessionCollection = await sessions();
    await sessionCollection.updateOne(
      { _id: new ObjectId(created._id) },
      { $set: { isActive: false, actualEndTime: new Date() } },
    );

    const res = await request(app)
      .post(`/api/sessions/${created._id}/override`)
      .set('Authorization', `Bearer ${token}`)
      .send(overrideBody);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Session is already ended' });

    const doc = await sessionCollection.findOne({ _id: new ObjectId(created._id) });
    expect(doc.overrideCount).toBe(0);
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDel).not.toHaveBeenCalled();
  });
});
