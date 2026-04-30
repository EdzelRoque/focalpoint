import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../data/index.js', () => ({
    classificationData: {
        classify: vi.fn(),
    },
}));

const { classificationData } = await import('../data/index.js');
const classificationRouter = (await import('./classificationRoutes.js')).default;

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', classificationRouter);
    return app;
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
});

describe('#3.10 — POST /api/classify requires auth', () => {
    it('returns 401 and never invokes the classifier when no Authorization header is sent', async () => {
        const res = await request(buildApp())
            .post('/api/classify')
            .send({
                url: 'https://example.com/article',
                pageTitle: 'Example title',
                pageSnippet: 'Some page snippet that is long enough.',
                sessionGoal: 'Do focused research on a topic',
                blockSensitivity: 'standard',
            });

        expect(res.status).toBe(401);
        expect(classificationData.classify).not.toHaveBeenCalled();
    });
});
