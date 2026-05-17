import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { clearDb } from '../test/dbHelpers.js';
import { registerAndSign } from '../test/authHelpers.js';
import { closeConnection } from '../config/mongoConnection.js';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockCreate = vi.fn();

vi.mock('../config/redisConnection.js', () => ({
  default: {
    get: (...args) => mockGet(...args),
    set: (...args) => mockSet(...args),
    del: (...args) => mockDel(...args),
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: function Anthropic() {
    this.messages = { create: (...args) => mockCreate(...args) };
  },
}));

const { buildTestApp } = await import('../test/buildTestApp.js');
const app = buildTestApp();

const cacheKeyFor = (url, goal, sens) =>
  `classify:${crypto.createHash('sha256').update(`${url}:${goal}:${sens}`).digest('hex')}`;

const validBody = {
  url: 'https://example.com/article',
  pageTitle: 'Example Title',
  pageSnippet: 'Some snippet of page content here',
  sessionGoal: 'Learn about test driven development practices',
  blockSensitivity: 'standard',
};

beforeEach(async () => {
  mockGet.mockReset();
  mockSet.mockReset();
  mockDel.mockReset();
  mockCreate.mockReset();
  await clearDb();
});

afterAll(async () => {
  await closeConnection();
});

describe('POST /api/classify', () => {
  it('returns 200 with the decision on cache miss with a valid Anthropic response', async () => {
    const { token } = await registerAndSign();
    mockGet.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      content: [{ text: '{"decision":"BLOCK","reason":"unrelated to goal"}' }],
    });

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ decision: 'BLOCK', reason: 'unrelated to goal' });
    expect(mockSet).toHaveBeenCalledWith(
      cacheKeyFor(validBody.url, validBody.sessionGoal, validBody.blockSensitivity),
      JSON.stringify({ decision: 'BLOCK', reason: 'unrelated to goal' }),
      'EX',
      86400,
    );
  });

  it('returns the cached decision and does not call Anthropic on cache hit', async () => {
    const { token } = await registerAndSign();
    const cached = { decision: 'ALLOW', reason: 'previously decided' };
    mockGet.mockResolvedValue(JSON.stringify(cached));

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cached);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/classify').send(validBody);

    expect(res.status).toBe(401);
  });

  it('returns 400 when the body is empty', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'You must provide site information' });
  });

  it('returns 400 when the url is invalid', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, url: 'not a url' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid URL format' });
  });

  it('returns 400 when blockSensitivity is not one of the allowed values', async () => {
    const { token } = await registerAndSign();

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, blockSensitivity: 'medium' });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('fails open with ALLOW and does NOT cache when Anthropic throws', async () => {
    const { token } = await registerAndSign();
    mockGet.mockResolvedValue(null);
    mockCreate.mockRejectedValue(new Error('Anthropic API down'));

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      decision: 'ALLOW',
      reason: 'Classification error -- defaulting to allow',
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('fails open with ALLOW and does NOT cache when Anthropic returns malformed JSON', async () => {
    const { token } = await registerAndSign();
    mockGet.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      content: [{ text: 'this is not json at all' }],
    });

    const res = await request(app)
      .post('/api/classify')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('ALLOW');
    expect(mockSet).not.toHaveBeenCalled();
  });
});
