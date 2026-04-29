import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import authMiddleware from './auth.js';

function buildApp() {
    const app = express();
    app.get('/protected', authMiddleware, (_req, res) => res.status(200).json({ ok: true }));
    return app;
}

beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
});

describe('#1.6 — authMiddleware rejects requests without a Bearer token', () => {
    it('returns 401 when the Authorization header is missing', async () => {
        const res = await request(buildApp()).get('/protected');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Access denied. No token provided.' });
    });

    it('returns 401 when the Authorization header is not a Bearer scheme', async () => {
        const res = await request(buildApp())
            .get('/protected')
            .set('Authorization', 'Basic dXNlcjpwYXNz');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Access denied. No token provided.' });
    });
});

describe('#1.7 — authMiddleware rejects expired/tampered/invalid tokens', () => {
    it('returns 401 when the token is structurally garbage', async () => {
        const res = await request(buildApp())
            .get('/protected')
            .set('Authorization', 'Bearer not.a.jwt');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Invalid or expired token.' });
    });

    it('returns 401 when the token is signed with the wrong secret', async () => {
        const token = jwt.sign({ userId: 'user-42' }, 'wrong-secret');

        const res = await request(buildApp())
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Invalid or expired token.' });
    });

    it('returns 401 when the token is signed correctly but already expired', async () => {
        const token = jwt.sign({ userId: 'user-42' }, 'test-secret', { expiresIn: -10 });

        const res = await request(buildApp())
            .get('/protected')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Invalid or expired token.' });
    });
});
