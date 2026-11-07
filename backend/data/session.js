import { sessions, users } from '../config/mongoCollections.js';
import { ObjectId } from 'mongodb';
import { effectiveSensitivity } from '../config/features.js';
import {
    validateId,
    validateSessionGoal,
    validateTimeDuration
} from '../validation.js';

// A timed session ends on its own once expectedEndTime passes. Expiry is
// applied lazily: every read or write of a session first closes any overdue
// ones, recording actualEndTime = expectedEndTime (the time the user actually
// committed to, not whenever we happened to notice).
const expireOverdue = async (filter) => {
    const sessionCollection = await sessions();
    await sessionCollection.updateMany(
        { ...filter, isActive: true, expectedEndTime: { $ne: null, $lte: new Date() } },
        [{ $set: { isActive: false, actualEndTime: '$expectedEndTime' } }]
    );
};

const toPublic = (session) => ({
    ...session,
    _id: session._id.toString(),
    userId: session.userId.toString(),
});

export const createSession = async (userId, sessionGoal, durationInMinutes=null) => {
    // Get the sessions collection
    const sessionCollection = await sessions();
    //Get the users collection for the latest preferences
    const userCollection = await users();

    // Validate userId, sessionGoal, and create a startTime
    userId = validateId(userId);
    sessionGoal = validateSessionGoal(sessionGoal);

    const startTime = new Date();
    let expectedEndTime = null;

    if (durationInMinutes !== null) {
        durationInMinutes = validateTimeDuration(durationInMinutes);
        // Multiply by 60,000 to convert minutes to milliseconds
        expectedEndTime = new Date(startTime.getTime() + durationInMinutes * 60000);
    }

    // An expired session must not block starting a new one
    await expireOverdue({ userId: new ObjectId(userId) });

    // Reject if the user already has an active session (duplicate-device or zombie from a prior crash)
    const existingActive = await sessionCollection.findOne({
        userId: new ObjectId(userId),
        isActive: true
    });
    if (existingActive) throw 'You already have an active session';

    // Look up the user to get their absolute latest settings
    const user = await userCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) throw 'User not found';

    // Create the session object
    const newSession = {
        userId: new ObjectId(userId),
        sessionGoal: sessionGoal,
        startTime: startTime,
        expectedEndTime: expectedEndTime,
        actualEndTime: null,
        isActive: true,
        blockCount: 0,
        overrideCount: 0,
        blockSensitivity: effectiveSensitivity(user.preferences.blockSensitivity),
        strictMode: user.preferences.strictMode
    };

    // Insert the new session into the database
    const insertInfo = await sessionCollection.insertOne(newSession);
    if (!insertInfo.acknowledged || !insertInfo.insertedId) throw 'Could not create session';

    return {
        ...newSession,
        _id: insertInfo.insertedId.toString(),
        userId: userId,
    };
};

export const endSession = async (sessionId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate sessionId
    sessionId = validateId(sessionId);
    await expireOverdue({ _id: new ObjectId(sessionId) });

    // Find the session by ID
    const session = await sessionCollection.findOne({ _id: new ObjectId(sessionId) });
    if (!session) throw 'Session not found';
    if (!session.isActive) throw 'Session is already ended';

    // Update the session to set actualEndTime and mark it as inactive
    const actualEndTime = new Date();
    const updateInfo = await sessionCollection.updateOne(
        { _id: new ObjectId(sessionId), isActive: true },
        { $set: { actualEndTime: actualEndTime, isActive: false } }
    );

    if (!updateInfo.acknowledged) throw 'Could not end session';
    if (updateInfo.matchedCount === 0) throw 'Session is already ended';

    return { success: true };
};

export const getSessionById = async (sessionId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate sessionId
    sessionId = validateId(sessionId);
    await expireOverdue({ _id: new ObjectId(sessionId) });

    // Find the session by ID
    const session = await sessionCollection.findOne({ _id: new ObjectId(sessionId) });
    if (!session) throw 'Session not found';

    return toPublic(session);
};

export const getSessionsByUserId = async (userId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate userId
    userId = validateId(userId);
    await expireOverdue({ userId: new ObjectId(userId) });

    // Find all sessions for the given userId
    const userSessions = await sessionCollection
        .find({ userId: new ObjectId(userId) })
        .sort({ startTime: -1 })
        .limit(100)
        .toArray();

    return userSessions.map(toPublic);
};

// Shared by block/override: increments a counter on an ACTIVE session only.
const incrementCounter = async (sessionId, field) => {
    const sessionCollection = await sessions();
    sessionId = validateId(sessionId);
    await expireOverdue({ _id: new ObjectId(sessionId) });

    const session = await sessionCollection.findOne({ _id: new ObjectId(sessionId) });
    if (!session) throw 'Session not found';
    if (!session.isActive) throw 'Session is already ended';

    const updateInfo = await sessionCollection.updateOne(
        { _id: new ObjectId(sessionId), isActive: true },
        { $inc: { [field]: 1 } }
    );
    if (!updateInfo.acknowledged) throw `Could not increment ${field === 'blockCount' ? 'block' : 'override'} count`;
    if (updateInfo.matchedCount === 0) throw 'Session is already ended';

    return { success: true };
};

export const incrementBlockCount = (sessionId) => incrementCounter(sessionId, 'blockCount');

export const incrementOverrideCount = (sessionId) => incrementCounter(sessionId, 'overrideCount');
