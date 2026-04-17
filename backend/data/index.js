import { register, login, updateUserSettings } from './user.js';
import { createSession, endSession, getSessionsByUserId, getSessionById, incrementBlockCount, incrementOverrideCount } from './session.js';
import { classify } from './classification.js';

export const userData = {
    register,
    login,
    updateUserSettings
};

export const classificationData = {
    classify
};

export const sessionData = {
    createSession,
    endSession,
    getSessionsByUserId,
    getSessionById,
    incrementBlockCount,
    incrementOverrideCount
};