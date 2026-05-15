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
    classificationData: {
        clearClassificationCache: vi.fn().mockResolvedValue(undefined),
    },
}));

// Replace auth middleware so tests can inject any userId via a request header.
vi.mock('../middleware/auth.js', () => ({
    default: (req, _res, next) => {
        req.user = { userId: req.headers['x-test-user-id'] };
        next();
    },
}));

import { sessionData, classificationData } from '../data/index.js';
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

describe('404 mapping — "Session not found" from data layer', () => {
    beforeEach(() => vi.clearAllMocks());

    it('PUT /sessions/:id returns 404 when endSession throws "Session not found"', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());
        sessionData.endSession.mockRejectedValue('Session not found');

        const res = await request(buildApp())
            .put(`/sessions/${SESSION_ID}`)
            .set('x-test-user-id', USER_A_ID);

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Session not found' });
    });

    it('POST /sessions/:id/block returns 404 when incrementBlockCount throws "Session not found"', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());
        sessionData.incrementBlockCount.mockRejectedValue('Session not found');

        const res = await request(buildApp())
            .post(`/sessions/${SESSION_ID}/block`)
            .set('x-test-user-id', USER_A_ID);

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Session not found' });
    });

    it('POST /sessions/:id/override returns 404 when incrementOverrideCount throws "Session not found"', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());
        sessionData.incrementOverrideCount.mockRejectedValue('Session not found');

        const res = await request(buildApp())
            .post(`/sessions/${SESSION_ID}/override`)
            .set('x-test-user-id', USER_A_ID)
            .send({
                url: 'https://example.com',
                sessionGoal: 'Test the IDOR fix now',
                blockSensitivity: 'standard',
            });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Session not found' });
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

describe('#3.9 — POST /sessions/:id/override calls clearClassificationCache(url, goal, sensitivity)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('invokes clearClassificationCache exactly once with the body url/goal/sensitivity after a successful override', async () => {
        sessionData.getSessionById.mockResolvedValue(fakeSession());
        sessionData.incrementOverrideCount.mockResolvedValue({ ...fakeSession(), overrideCount: 1 });

        const overrideBody = {
            url: 'https://example.com/specific-page',
            sessionGoal: 'Research the cache rewrite contract',
            blockSensitivity: 'strict',
        };

        const res = await request(buildApp())
            .post(`/sessions/${SESSION_ID}/override`)
            .set('x-test-user-id', USER_A_ID)
            .send(overrideBody);

        expect(res.status).toBe(200);
        expect(classificationData.clearClassificationCache).toHaveBeenCalledTimes(1);
        expect(classificationData.clearClassificationCache).toHaveBeenCalledWith(
            overrideBody.url,
            overrideBody.sessionGoal,
            overrideBody.blockSensitivity,
        );
    });
});

describe('#2.10 — POST /sessions returns 400 and never reaches the data layer on bad input', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([
        ['empty body', {}],
        ['missing sessionGoal', { durationInMinutes: 30 }],
        ['non-numeric durationInMinutes', { sessionGoal: 'A valid focus goal', durationInMinutes: 'thirty' }],
    ])('rejects %s with 400 and skips createSession', async (_label, body) => {
        const res = await request(buildApp())
            .post('/sessions')
            .set('x-test-user-id', USER_A_ID)
            .send(body);

        expect(res.status).toBe(400);
        expect(sessionData.createSession).not.toHaveBeenCalled();
    });
});

describe('#2.10 — POST /sessions/:id/override returns 400 and skips both data-layer and cache-clear on bad input', () => {
    beforeEach(() => vi.clearAllMocks());

    const validBody = {
        url: 'https://example.com',
        sessionGoal: 'A valid focus goal',
        blockSensitivity: 'standard',
    };

    it.each([
        ['empty body', {}],
        ['bad url protocol', { ...validBody, url: 'ftp://example.com' }],
        ['sessionGoal under 10 chars', { ...validBody, sessionGoal: 'short' }],
        ['invalid blockSensitivity', { ...validBody, blockSensitivity: 'aggressive' }],
    ])('rejects %s with 400', async (_label, body) => {
        const res = await request(buildApp())
            .post(`/sessions/${SESSION_ID}/override`)
            .set('x-test-user-id', USER_A_ID)
            .send(body);

        expect(res.status).toBe(400);
        expect(sessionData.incrementOverrideCount).not.toHaveBeenCalled();
        expect(classificationData.clearClassificationCache).not.toHaveBeenCalled();
    });
});

describe('#2.10 — Malformed :id returns 400 across all session sub-routes', () => {
    beforeEach(() => vi.clearAllMocks());

    const overrideBody = {
        url: 'https://example.com',
        sessionGoal: 'A valid focus goal',
        blockSensitivity: 'standard',
    };

    it.each([
        ['PUT /sessions/:id', 'put', '/sessions/not-a-hex', null, 'endSession'],
        ['POST /sessions/:id/override', 'post', '/sessions/not-a-hex/override', overrideBody, 'incrementOverrideCount'],
    ])('rejects %s with 400 and never calls the data layer', async (_label, method, path, body, dataFn) => {
        let req = request(buildApp())[method](path).set('x-test-user-id', USER_A_ID);
        if (body) req = req.send(body);
        const res = await req;

        expect(res.status).toBe(400);
        expect(sessionData[dataFn]).not.toHaveBeenCalled();
    });

    // Sweep E: GET /sessions with malformed token-userId (the validateId(req.user.userId) path).
    it('GET /sessions returns 400 when the token-userId is malformed', async () => {
        const res = await request(buildApp())
            .get('/sessions')
            .set('x-test-user-id', 'not-a-hex');

        expect(res.status).toBe(400);
        expect(sessionData.getSessionsByUserId).not.toHaveBeenCalled();
    });
});
