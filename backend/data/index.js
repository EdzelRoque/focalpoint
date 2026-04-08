import { register, login } from './user.js';
import { createSession, endSession, getSessionsByUserId, getSessionById } from './session.js';

export const userData = {
    register,
    login
};

export const sessionData = {
    createSession,
    endSession,
    getSessionsByUserId,
    getSessionById
};