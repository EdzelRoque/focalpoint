import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';

vi.mock('../data/index.js', () => ({
    userData: {
        register: vi.fn(),
        login: vi.fn(),
        updateUserSettings: vi.fn(),
    },
}));

const usersCollection = {
    findOne: vi.fn(),
};
vi.mock('../config/mongoCollections.js', () => ({
    users: vi.fn(async () => usersCollection),
}));

const { userData } = await import('../data/index.js');
const userRouter = (await import('./userRoutes.js')).default;

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/auth', userRouter);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
});

describe('#1.4 — POST /auth/login returns a JWT signed with JWT_SECRET, containing userId, expiring in ~7 days', () => {
    it('returns a token whose decoded payload has userId === user._id and exp ~ 7 days from iat', async () => {
        const knownId = new ObjectId().toHexString();
        userData.login.mockResolvedValue({
            _id: knownId,
            username: 'alice',
            email: 'alice@example.com',
            preferences: { blockSensitivity: 'standard', strictMode: false },
        });

        const res = await request(buildApp())
            .post('/auth/login')
            .send({ email: 'alice@example.com', password: 'P@ssw0rd!' });

        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe('string');

        const decoded = jwt.verify(res.body.token, 'test-secret');
        expect(decoded.userId).toBe(knownId);

        const sevenDays = 7 * 24 * 60 * 60;
        const window = sevenDays * 0.01;
        expect(decoded.exp - decoded.iat).toBeGreaterThanOrEqual(sevenDays - window);
        expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(sevenDays + window);
    });
});

describe('#1.5 — POST /auth/login returns 401 + "Invalid email or password" when login() throws', () => {
    it('maps a thrown auth failure to 401 with the uniform error body', async () => {
        userData.login.mockRejectedValue('Invalid email or password');

        const res = await request(buildApp())
            .post('/auth/login')
            .send({ email: 'alice@example.com', password: 'P@ssw0rd!' });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Invalid email or password' });
    });
});

describe('#1.9 — GET /auth/me returns the current user, never another user', () => {
    const USER_A_ID = new ObjectId();
    const USER_B_ID = new ObjectId();

    const userA = {
        _id: USER_A_ID,
        username: 'alice',
        email: 'alice@example.com',
        password: '$2b$12$fakebcrypthashforuserAxxxxxxxxxxxxxxxxxxxxxxxxxx',
        preferences: { blockSensitivity: 'standard', strictMode: false },
    };
    const userB = {
        _id: USER_B_ID,
        username: 'bob',
        email: 'bob@example.com',
        password: '$2b$12$fakebcrypthashforuserBxxxxxxxxxxxxxxxxxxxxxxxxxx',
        preferences: { blockSensitivity: 'strict', strictMode: true },
    };

    beforeEach(() => {
        const byId = {
            [USER_A_ID.toHexString()]: userA,
            [USER_B_ID.toHexString()]: userB,
        };
        usersCollection.findOne.mockImplementation(async (query) => {
            if (query && query._id && typeof query._id.toHexString === 'function') {
                return byId[query._id.toHexString()] ?? null;
            }
            return null;
        });
    });

    it('returns the token-holder\'s username/email/preferences, and never includes password', async () => {
        const tokenA = jwt.sign({ userId: USER_A_ID.toHexString() }, 'test-secret', { expiresIn: '7d' });

        const res = await request(buildApp())
            .get('/auth/me')
            .set('Authorization', `Bearer ${tokenA}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            username: 'alice',
            email: 'alice@example.com',
            preferences: { blockSensitivity: 'standard', strictMode: false },
        });
        expect(res.body).not.toHaveProperty('password');
    });

    it('ignores body/query attempts to inject another user\'s id and still returns the token-holder', async () => {
        const tokenA = jwt.sign({ userId: USER_A_ID.toHexString() }, 'test-secret', { expiresIn: '7d' });

        const res = await request(buildApp())
            .get(`/auth/me?userId=${USER_B_ID.toHexString()}&_id=${USER_B_ID.toHexString()}`)
            .set('Authorization', `Bearer ${tokenA}`)
            .send({ userId: USER_B_ID.toHexString(), _id: USER_B_ID.toHexString() });

        expect(res.status).toBe(200);
        expect(res.body.username).toBe('alice');
        expect(res.body.email).toBe('alice@example.com');
    });

    it('returns 404 when the token is valid but the user no longer exists', async () => {
        const ghostId = new ObjectId().toHexString();
        const tokenGhost = jwt.sign({ userId: ghostId }, 'test-secret', { expiresIn: '7d' });

        const res = await request(buildApp())
            .get('/auth/me')
            .set('Authorization', `Bearer ${tokenGhost}`);

        expect(res.status).toBe(404);
    });
});

describe('#1.11 — PUT /auth/settings does not forward extra body fields to the data layer', () => {
    const USER_A_ID = new ObjectId();

    function tokenA() {
        return jwt.sign({ userId: USER_A_ID.toHexString() }, 'test-secret', { expiresIn: '7d' });
    }

    it('only hands the four whitelisted fields to userData.updateUserSettings, dropping password/role/_id', async () => {
        userData.updateUserSettings.mockResolvedValue({
            _id: USER_A_ID.toHexString(),
            username: 'aliceNew',
            email: 'alice@example.com',
            preferences: { blockSensitivity: 'strict', strictMode: true },
        });

        const res = await request(buildApp())
            .put('/auth/settings')
            .set('Authorization', `Bearer ${tokenA()}`)
            .send({
                username: 'aliceNew',
                email: 'alice@example.com',
                blockSensitivity: 'strict',
                strictMode: true,
                password: 'TryToOverride!1',
                role: 'admin',
                _id: new ObjectId().toHexString(),
                preferences: { strictMode: false, somethingExtra: 'x' },
            });

        expect(res.status).toBe(200);
        expect(userData.updateUserSettings).toHaveBeenCalledTimes(1);

        const args = userData.updateUserSettings.mock.calls[0];
        expect(args).toEqual([
            USER_A_ID.toHexString(),
            'aliceNew',
            'alice@example.com',
            'strict',
            true,
        ]);

        const serialized = JSON.stringify(args);
        expect(serialized).not.toMatch(/password/i);
        expect(serialized).not.toMatch(/admin/);
        expect(serialized).not.toMatch(/somethingExtra/);
    });

    it('returns 400 and never calls the data layer when a required field is missing', async () => {
        const res = await request(buildApp())
            .put('/auth/settings')
            .set('Authorization', `Bearer ${tokenA()}`)
            .send({
                username: 'aliceNew',
                email: 'alice@example.com',
                blockSensitivity: 'strict',
                // strictMode omitted
            });

        expect(res.status).toBe(400);
        expect(userData.updateUserSettings).not.toHaveBeenCalled();
    });
});
