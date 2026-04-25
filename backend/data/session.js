import { sessions, users } from '../config/mongoCollections.js';
import { ObjectId } from 'mongodb';
import { 
    validateId, 
    validateSessionGoal, 
    validateTimeDuration
} from '../validation.js';

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
        blockSensitivity: user.preferences.blockSensitivity,
        strictMode: user.preferences.strictMode
    };

    // Insert the new session into the database
    const insertInfo = await sessionCollection.insertOne(newSession);
    if (!insertInfo.acknowledged || !insertInfo.insertedId) throw 'Could not create session';

    return {
        _id: insertInfo.insertedId.toString(),
        ...newSession
    };
};

export const endSession = async (sessionId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate sessionId
    sessionId = validateId(sessionId);

    // Find the session by ID
    const session = await sessionCollection.findOne({ _id: new ObjectId(sessionId) });
    if (!session) throw 'Session not found';
    if (!session.isActive) throw 'Session is already ended';

    // Update the session to set actualEndTime and mark it as inactive
    const actualEndTime = new Date();
    const updateInfo = await sessionCollection.updateOne(
        { _id: new ObjectId(sessionId) },
        { $set: { actualEndTime: actualEndTime, isActive: false } }
    );

    if (!updateInfo.acknowledged) throw 'Could not end session';
    if (updateInfo.matchedCount === 0) throw 'Session not found';

    return { success: true };
};

export const getSessionById = async (sessionId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate sessionId
    sessionId = validateId(sessionId);

    // Find the session by ID
    const session = await sessionCollection.findOne({ _id: new ObjectId(sessionId) });
    if (!session) throw 'Session not found';

    session._id = session._id.toString();
    session.userId = session.userId.toString();
    return session;
};

export const getSessionsByUserId = async (userId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate userId
    userId = validateId(userId);

    // Find all sessions for the given userId
    let userSessions = await sessionCollection
        .find({ userId: new ObjectId(userId) })
        .sort({ startTime: -1 })
        .limit(100)
        .toArray();

    userSessions = userSessions.map(session => {
        session._id = session._id.toString();
        session.userId = session.userId.toString();
        return session;
    });

    return userSessions;
};

export const incrementBlockCount = async (sessionId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate sessionId
    sessionId = validateId(sessionId);

    // Increment the blockCount for the session
    const updateInfo = await sessionCollection.updateOne(
        { _id: new ObjectId(sessionId) },
        { $inc: { blockCount: 1 } }
    );
    if (!updateInfo.acknowledged) throw 'Could not increment block count';
    if (updateInfo.matchedCount === 0) throw 'Session not found';

    return { success: true };
};

export const incrementOverrideCount = async (sessionId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate sessionId
    sessionId = validateId(sessionId);

    // Increment the overrideCount for the session
    const updateInfo = await sessionCollection.updateOne(
        { _id: new ObjectId(sessionId) },
        { $inc: { overrideCount: 1 } }
    );
    if (!updateInfo.acknowledged) throw 'Could not increment override count';
    if (updateInfo.matchedCount === 0) throw 'Session not found';

    return { success: true };
};