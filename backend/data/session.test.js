import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import {
  createSession,
  endSession,
  getSessionById,
  getSessionsByUserId,
} from './session.js';
import { register, updateUserSettings } from './user.js';
import { sessions } from '../config/mongoCollections.js';
import { closeConnection } from '../config/mongoConnection.js';
import { clearDb } from '../test/dbHelpers.js';

const validUser = {
  username: 'jane.doe',
  email: 'jane@example.com',
  password: 'Sup3rSecret!',
};
const goal = 'Finish the data layer test suite for FocalPoint';

let userId;

beforeEach(async () => {
  await clearDb();
  const u = await register(validUser.username, validUser.email, validUser.password);
  userId = u._id;
});

afterAll(async () => {
  await closeConnection();
});

describe('createSession', () => {
  it('inserts an active session with expectedEndTime, zeroed counters, and the user’s current preferences snapshot', async () => {
    await updateUserSettings(userId, validUser.username, validUser.email, 'strict', true);
    const before = Date.now();

    const result = await createSession(userId, goal, 25);

    expect(result).toMatchObject({
      sessionGoal: goal,
      isActive: true,
      blockCount: 0,
      overrideCount: 0,
      blockSensitivity: 'strict',
      strictMode: true,
      userId,
    });
    expect(result.expectedEndTime.getTime() - result.startTime.getTime()).toBe(25 * 60000);
    expect(result.startTime.getTime()).toBeGreaterThanOrEqual(before);

    const sessionCollection = await sessions();
    const doc = await sessionCollection.findOne({ _id: new ObjectId(result._id) });
    expect(doc.userId).toBeInstanceOf(ObjectId);
    expect(doc.userId.toString()).toBe(userId);
    expect(doc.isActive).toBe(true);
  });

  it('inserts a session with null expectedEndTime when no duration is given', async () => {
    const result = await createSession(userId, goal);

    expect(result.expectedEndTime).toBeNull();
    const sessionCollection = await sessions();
    const doc = await sessionCollection.findOne({ _id: new ObjectId(result._id) });
    expect(doc.expectedEndTime).toBeNull();
  });

  it('throws when the user already has an active session and does not insert a second one', async () => {
    await createSession(userId, goal, 25);

    await expect(createSession(userId, goal, 25)).rejects.toBe('You already have an active session');

    const sessionCollection = await sessions();
    expect(await sessionCollection.countDocuments({ userId: new ObjectId(userId) })).toBe(1);
  });

  it('throws when the user is not found and does not insert a session', async () => {
    const ghostUserId = new ObjectId().toString();

    await expect(createSession(ghostUserId, goal, 25)).rejects.toBe('User not found');

    const sessionCollection = await sessions();
    expect(await sessionCollection.countDocuments({})).toBe(0);
  });
});

describe('endSession', () => {
  it('marks the session inactive and sets actualEndTime to a Date', async () => {
    const session = await createSession(userId, goal, 25);

    const result = await endSession(session._id);

    expect(result).toEqual({ success: true });
    const sessionCollection = await sessions();
    const doc = await sessionCollection.findOne({ _id: new ObjectId(session._id) });
    expect(doc.isActive).toBe(false);
    expect(doc.actualEndTime).toBeInstanceOf(Date);
  });

  it('throws when the session id does not exist', async () => {
    const ghostId = new ObjectId().toString();
    await expect(endSession(ghostId)).rejects.toBe('Session not found');
  });

  it('throws when the session is already ended and leaves the doc unchanged', async () => {
    const session = await createSession(userId, goal, 25);
    await endSession(session._id);
    const sessionCollection = await sessions();
    const after = await sessionCollection.findOne({ _id: new ObjectId(session._id) });

    await expect(endSession(session._id)).rejects.toBe('Session is already ended');

    const afterAgain = await sessionCollection.findOne({ _id: new ObjectId(session._id) });
    expect(afterAgain.actualEndTime.getTime()).toBe(after.actualEndTime.getTime());
    expect(afterAgain.isActive).toBe(false);
  });
});

describe('getSessionById', () => {
  it('returns the session with _id and userId stringified', async () => {
    const session = await createSession(userId, goal, 25);

    const result = await getSessionById(session._id);

    expect(result._id).toBe(session._id);
    expect(typeof result._id).toBe('string');
    expect(typeof result.userId).toBe('string');
    expect(result.userId).toBe(userId);
    expect(result.sessionGoal).toBe(goal);
  });

  it('throws when the session id does not exist', async () => {
    const ghostId = new ObjectId().toString();
    await expect(getSessionById(ghostId)).rejects.toBe('Session not found');
  });
});

describe('getSessionsByUserId', () => {
  it('returns sessions for the user sorted by startTime descending with ids stringified', async () => {
    const s1 = await createSession(userId, goal);
    await endSession(s1._id);
    const s2 = await createSession(userId, goal);
    await endSession(s2._id);
    const s3 = await createSession(userId, goal);

    const result = await getSessionsByUserId(userId);

    expect(result).toHaveLength(3);
    expect(result.map((s) => s._id)).toEqual([s3._id, s2._id, s1._id]);
    for (const s of result) {
      expect(typeof s._id).toBe('string');
      expect(typeof s.userId).toBe('string');
    }
  });

  it('returns an empty array when the user has no sessions', async () => {
    const result = await getSessionsByUserId(userId);
    expect(result).toEqual([]);
  });

  it('returns at most 100 sessions, the most recent ones, when more exist', async () => {
    const sessionCollection = await sessions();
    const now = Date.now();
    const docs = Array.from({ length: 150 }, (_, i) => ({
      userId: new ObjectId(userId),
      sessionGoal: goal,
      startTime: new Date(now - i * 1000),
      expectedEndTime: null,
      actualEndTime: new Date(now - i * 1000 + 500),
      isActive: false,
      blockCount: 0,
      overrideCount: 0,
      blockSensitivity: 'standard',
      strictMode: false,
    }));
    await sessionCollection.insertMany(docs);

    const result = await getSessionsByUserId(userId);

    expect(result).toHaveLength(100);
    expect(result[0].startTime.getTime()).toBe(now);
    expect(result[99].startTime.getTime()).toBe(now - 99 * 1000);
  });
});
