import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ObjectId } from 'mongodb';

// Mock these before sessionRoutes.js is imported — their real implementations
// would attempt MongoDB/Redis connections at import time.
vi.mock('../data/index.js', () => ({
    sessionData: {
        getSessionById: vi.fn(),
        getSessionsByUserId: vi.fn(),
        createSession: vi.fn(),
        endSession: vi.fn(),
        incrementBlockCount: vi.fn(),
        incrementOverrideCount: vi.fn(),
    },
    userData: {},
    classificationData: {},
}));

vi.mock('../data/classification.js', () => ({
    clearClassificationCache: vi.fn().mockResolvedValue(undefined),
}));

// Replace auth middleware so tests can inject any userId via a request header.
vi.mock('../middleware/auth.js', () => ({
    default: (req, _res, next) => {
        req.user = { userId: req.headers['x-test-user-id'] };
        next();
    },
}));

import { sessionData } from '../data/index.js';
import sessionRouter from './sessionRoutes.js';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', sessionRouter);
    return app;
}

const USER_A_ID = new ObjectId().toHexString(); // session owner
const USER_B_ID = new ObjectId().toHexString(); // attacker
const SESSION_ID = new ObjectId().toHexString();

const fakeSession = () => ({
    _id: new ObjectId(SESSION_ID),
    userId: new ObjectId(USER_A_ID),
    sessionGoal: 'Test the IDOR fix',
    isActive: true,
    blockSensitivity: 'standard',
});

describe('IDOR — GET /sessions/:id', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 403 when the requesting user does not own the session', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());

        const res = await request(buildApp())
            .get(`/sessions/${SESSION_ID}`)
            .set('x-test-user-id', USER_B_ID);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
    });

    it('returns 200 when the requesting user owns the session', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());

        const res = await request(buildApp())
            .get(`/sessions/${SESSION_ID}`)
            .set('x-test-user-id', USER_A_ID);

        expect(res.status).toBe(200);
    });
});

describe('IDOR — PUT /sessions/:id', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 403 when the requesting user does not own the session', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());

        const res = await request(buildApp())
            .put(`/sessions/${SESSION_ID}`)
            .set('x-test-user-id', USER_B_ID);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
    });

    it('returns 200 when the requesting user owns the session', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());
        sessionData.endSession.mockResolvedValue({ ...fakeSession(), isActive: false });

        const res = await request(buildApp())
            .put(`/sessions/${SESSION_ID}`)
            .set('x-test-user-id', USER_A_ID);

        expect(res.status).toBe(200);
    });
});

describe('IDOR — POST /sessions/:id/block', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 403 when the requesting user does not own the session', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());

        const res = await request(buildApp())
            .post(`/sessions/${SESSION_ID}/block`)
            .set('x-test-user-id', USER_B_ID);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
    });

    it('returns 200 when the requesting user owns the session', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());
        sessionData.incrementBlockCount.mockResolvedValue({ ...fakeSession(), blockCount: 1 });

        const res = await request(buildApp())
            .post(`/sessions/${SESSION_ID}/block`)
            .set('x-test-user-id', USER_A_ID);

        expect(res.status).toBe(200);
    });
});

describe('IDOR — POST /sessions/:id/override', () => {
    beforeEach(() => vi.clearAllMocks());

    const overrideBody = {
        url: 'https://example.com',
        sessionGoal: 'Test the IDOR fix now',
        blockSensitivity: 'standard',
    };

    it('returns 403 when the requesting user does not own the session', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());

        const res = await request(buildApp())
            .post(`/sessions/${SESSION_ID}/override`)
            .set('x-test-user-id', USER_B_ID)
            .send(overrideBody);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
    });

    it('returns 200 when the requesting user owns the session', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());
        sessionData.incrementOverrideCount.mockResolvedValue({ ...fakeSession(), overrideCount: 1 });

        const res = await request(buildApp())
            .post(`/sessions/${SESSION_ID}/override`)
            .set('x-test-user-id', USER_A_ID)
            .send(overrideBody);

        expect(res.status).toBe(200);
    });
});
