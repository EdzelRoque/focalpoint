import { sessions } from '../config/mongoCollections.js';
import { ObjectId } from 'mongodb';
import { 
    validateId, 
    validateSessionGoal, 
    validateTimeDuration,
    validateBlockSensitivity
} from '../validation.js';

export const createSession = async (userId, sessionGoal, durationInMinutes=null, blockSensitivity, strictMode) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate userId, sessionGoal, blockSensitivity, strictMode. Create a startTime
    userId = validateId(userId);
    sessionGoal = validateSessionGoal(sessionGoal);
    blockSensitivity = validateBlockSensitivity(blockSensitivity);
    if (typeof strictMode !== 'boolean') throw 'strictMode must be a boolean';

    const startTime = new Date();
    let expectedEndTime = null;

    if (durationInMinutes !== null) {
        durationInMinutes = validateTimeDuration(durationInMinutes);
        // Multiply by 60,000 to convert minutes to milliseconds
        expectedEndTime = new Date(startTime.getTime() + durationInMinutes * 60000);
    }

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
        blockSensitivity: blockSensitivity,
        strictMode: strictMode
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

    return session;
};

export const getSessionsByUserId = async (userId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate userId
    userId = validateId(userId);

    // Find all sessions for the given userId
    let userSessions = await sessionCollection.find({ userId: new ObjectId(userId) }).toArray();

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
    
    return { success: true };
};