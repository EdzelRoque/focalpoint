import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';

// Mock Mongo collections — this is the external dependency we must not load.
const sessionsCollection = {
    findOne: vi.fn(),
    find: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
};
const usersCollection = {
    findOne: vi.fn(),
};

vi.mock('../config/mongoCollections.js', () => ({
    sessions: vi.fn(async () => sessionsCollection),
    users: vi.fn(async () => usersCollection),
}));

const {
    createSession,
    endSession,
    getSessionById,
    getSessionsByUserId,
    incrementBlockCount,
    incrementOverrideCount,
} = await import('./session.js');

const USER_ID = new ObjectId().toHexString();
const SESSION_ID = new ObjectId().toHexString();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('#7 — matchedCount guards', () => {
    it('incrementBlockCount throws "Session not found" when matchedCount === 0', async () => {
        sessionsCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0 });

        await expect(incrementBlockCount(SESSION_ID)).rejects.toBe('Session not found');
    });

    it('incrementBlockCount succeeds when matchedCount === 1', async () => {
        sessionsCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });

        await expect(incrementBlockCount(SESSION_ID)).resolves.toEqual({ success: true });
    });

    it('incrementOverrideCount throws "Session not found" when matchedCount === 0', async () => {
        sessionsCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0 });

        await expect(incrementOverrideCount(SESSION_ID)).rejects.toBe('Session not found');
    });

    it('incrementOverrideCount succeeds when matchedCount === 1', async () => {
        sessionsCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });

        await expect(incrementOverrideCount(SESSION_ID)).resolves.toEqual({ success: true });
    });

    it('endSession throws "Session not found" when updateOne matches nothing', async () => {
        // Make findOne return an active session so we bypass the pre-check,
        // then simulate the session being deleted between findOne and updateOne.
        sessionsCollection.findOne.mockResolvedValue({
            _id: new ObjectId(SESSION_ID),
            userId: new ObjectId(USER_ID),
            isActive: true,
        });
        sessionsCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0 });

        await expect(endSession(SESSION_ID)).rejects.toBe('Session not found');
    });
});

describe('#10 — active-session guard in createSession', () => {
    it('throws "You already have an active session" when one already exists', async () => {
        // Simulate: user has a pre-existing active session.
        sessionsCollection.findOne.mockResolvedValue({
            _id: new ObjectId(SESSION_ID),
            userId: new ObjectId(USER_ID),
            isActive: true,
        });

        await expect(createSession(USER_ID, 'Do focused work')).rejects.toBe('You already have an active session');
        // And crucially — no insert should have happened.
        expect(sessionsCollection.insertOne).not.toHaveBeenCalled();
    });

    it('inserts a new session when no active session exists', async () => {
        // No active session -> findOne resolves null. User lookup returns valid prefs.
        sessionsCollection.findOne.mockResolvedValue(null);
        usersCollection.findOne.mockResolvedValue({
            _id: new ObjectId(USER_ID),
            preferences: { blockSensitivity: 'standard', strictMode: false },
        });
        const insertedId = new ObjectId();
        sessionsCollection.insertOne.mockResolvedValue({ acknowledged: true, insertedId });

        const result = await createSession(USER_ID, 'Do focused work');

        expect(sessionsCollection.insertOne).toHaveBeenCalledOnce();
        expect(result._id).toBe(insertedId.toString());
        expect(result.isActive).toBe(true);
    });
});

describe('#15 — getSessionById return shape', () => {
    it('serializes _id and userId to strings (matches getSessionsByUserId)', async () => {
        const idObj = new ObjectId(SESSION_ID);
        const userObj = new ObjectId(USER_ID);
        sessionsCollection.findOne.mockResolvedValue({
            _id: idObj,
            userId: userObj,
            sessionGoal: 'Focus',
            isActive: true,
        });

        const result = await getSessionById(SESSION_ID);

        expect(typeof result._id).toBe('string');
        expect(typeof result.userId).toBe('string');
        expect(result._id).toBe(SESSION_ID);
        expect(result.userId).toBe(USER_ID);
    });
});

describe('#11 — getSessionsByUserId sort + limit', () => {
    it('applies .sort({ startTime: -1 }).limit(100) to the query', async () => {
        const toArray = vi.fn().mockResolvedValue([]);
        const limit = vi.fn(() => ({ toArray }));
        const sort = vi.fn(() => ({ limit }));
        sessionsCollection.find.mockReturnValue({ sort });

        await getSessionsByUserId(USER_ID);

        expect(sort).toHaveBeenCalledWith({ startTime: -1 });
        expect(limit).toHaveBeenCalledWith(100);
        expect(toArray).toHaveBeenCalledOnce();
    });
});
