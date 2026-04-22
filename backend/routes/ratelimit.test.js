import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemoryStore } from 'express-rate-limit';
import { createLimiters } from '../middleware/limiters.js';

// Pass { max: 2 } so tests hit the limit in 3 requests instead of 60/10/100.
// Each buildApp() call gets fresh MemoryStore instances (no state bleed between tests).
function buildApp(route = '/ping') {
    const { global: globalLimiter, auth: authLimiter, classify: classifyLimiter } =
        createLimiters({ max: 2 });

    const app = express();
    app.use('/api/classify', classifyLimiter);
    app.use('/auth', authLimiter);
    app.use(globalLimiter);
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    app.post('/auth/login', (_req, res) => res.json({ ok: true }));
    app.post('/api/classify', (_req, res) => res.json({ ok: true }));
    return app;
}

describe('Rate limiting', () => {
    it('returns 429 after the limit is exceeded on a global route', async () => {
        const app = buildApp();

        await request(app).get('/ping');
        await request(app).get('/ping');
        const res = await request(app).get('/ping'); // 3rd request — over the max:2 limit

        expect(res.status).toBe(429);
    });

    it('returns 200 while under the limit', async () => {
        const app = buildApp();

        const res = await request(app).get('/ping');

        expect(res.status).toBe(200);
    });

    it('returns 429 after the limit is exceeded on the auth route', async () => {
        const app = buildApp();

        await request(app).post('/auth/login');
        await request(app).post('/auth/login');
        const res = await request(app).post('/auth/login');

        expect(res.status).toBe(429);
    });

    it('returns 429 after the limit is exceeded on the classify route', async () => {
        const app = buildApp();

        await request(app).post('/api/classify');
        await request(app).post('/api/classify');
        const res = await request(app).post('/api/classify');

        expect(res.status).toBe(429);
    });
});
