import { register, login } from './user.js';
import { createSession, endSession, getSessionsByUserId, getSessionById } from './session.js';
import { classify } from './classification.js';

export const userData = {
    register,
    login
};

export const classificationData = {
    classify
};

export const sessionData = {
    createSession,
    endSession,
    getSessionsByUserId,
    getSessionById
};