import { sessions } from '../config/mongoCollections.js';
import { ObjectId } from 'mongodb';
import { 
    validateId, 
    validateSessionGoal, 
    validateTimeDuration 
} from '../validation.js';

export const createSession = async (userId, sessionGoal, durationInMinutes=null) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate userId, startTime, endTime, and sessionGoal
    userId = validateId(userId);
    sessionGoal = validateSessionGoal(sessionGoal);

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
        blockedCount: 0,
        overriddenCount: 0
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

    return {
        _id: sessionId,
        userId: session.userId.toString(),
        sessionGoal: session.sessionGoal,
        startTime: session.startTime,
        expectedEndTime: session.expectedEndTime,
        actualEndTime: actualEndTime,
        isActive: false
    };

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

export const incrementBlockedCount = async (sessionId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate sessionId
    sessionId = validateId(sessionId);

    // Increment the blockedCount for the session
    const updateInfo = await sessionCollection.updateOne(
        { _id: new ObjectId(sessionId) },
        { $inc: { blockedCount: 1 } }
    );
    if (!updateInfo.acknowledged) throw 'Could not increment blocked count';

    return await getSessionById(sessionId);
};

export const incrementOverrideCount = async (sessionId) => {
    // Get the sessions collection
    const sessionCollection = await sessions();

    // Validate sessionId
    sessionId = validateId(sessionId);

    // Increment the overriddenCount for the session
    const updateInfo = await sessionCollection.updateOne(
        { _id: new ObjectId(sessionId) },
        { $inc: { overriddenCount: 1 } }
    );
    if (!updateInfo.acknowledged) throw 'Could not increment overridden count';
    
    return await getSessionById(sessionId);
};