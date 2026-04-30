import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';

// Mock the data layer before importing sessionRoutes — real implementations
// would attempt MongoDB/Redis connections at import time. We intentionally do
// NOT mock ../middleware/auth.js: this file's contract IS the auth wiring,
// so the real authMiddleware must run.
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
    classificationData: {
        clearClassificationCache: vi.fn().mockResolvedValue(undefined),
    },
}));

const { sessionData } = await import('../data/index.js');
const sessionRouter = (await import('./sessionRoutes.js')).default;

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', sessionRouter);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
});

describe('#2.5 — GET /sessions is scoped to the token holder, ignoring client-supplied userId', () => {
    const USER_A_ID = new ObjectId().toHexString();
    const USER_B_ID = new ObjectId().toHexString();

    it('uses the token\'s userId even when query and body try to inject another userId', async () => {
        sessionData.getSessionsByUserId.mockResolvedValue([]);

        const tokenA = jwt.sign({ userId: USER_A_ID }, 'test-secret', { expiresIn: '7d' });

        const res = await request(buildApp())
            .get(`/sessions?userId=${USER_B_ID}`)
            .set('Authorization', `Bearer ${tokenA}`)
            .send({ userId: USER_B_ID });

        expect(res.status).toBe(200);
        expect(sessionData.getSessionsByUserId).toHaveBeenCalledWith(USER_A_ID);
        expect(sessionData.getSessionsByUserId).not.toHaveBeenCalledWith(USER_B_ID);
    });
});
