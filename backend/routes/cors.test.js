import { describe, it, expect } from 'vitest';
import express from 'express';
import cors from 'cors';
import request from 'supertest';
import corsOptions from '../middleware/corsConfig.js';

function buildApp() {
    const app = express();
    app.use(cors(corsOptions));
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    return app;
}

describe('CORS allowlist', () => {
    it('blocks requests from an unlisted origin', async () => {
        const res = await request(buildApp())
            .get('/ping')
            .set('Origin', 'https://evil.com');

        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows requests from the Vercel frontend origin', async () => {
        const res = await request(buildApp())
            .get('/ping')
            .set('Origin', 'https://focalpoint-rho.vercel.app');

        expect(res.headers['access-control-allow-origin']).toBe('https://focalpoint-rho.vercel.app');
    });

    it('allows requests from a chrome-extension origin', async () => {
        const res = await request(buildApp())
            .get('/ping')
            .set('Origin', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop');

        expect(res.headers['access-control-allow-origin']).toBe(
            'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
        );
    });

    it('allows requests with no Origin header (server-to-server / curl)', async () => {
        const res = await request(buildApp()).get('/ping');

        expect(res.status).toBe(200);
    });
});
