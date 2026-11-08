// Cross-cutting HTTP behavior: rate limits, CORS, unknown routes.
import { describe, it, expect } from 'vitest';
import { newApp } from './support/api.js';

describe('rate limits (per minute, per IP)', () => {
  it('allows 10 auth requests, then answers 429', async () => {
    const api = newApp();
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await api.post('/auth/login').send({})).status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('allows 60 general API requests, then answers 429', async () => {
    const api = newApp();
    const statuses = [];
    for (let i = 0; i < 61; i++) statuses.push((await api.get('/api/sessions')).status);
    expect(statuses.slice(0, 60).every((s) => s === 401)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});

describe('CORS', () => {
  it('allows the FocalPoint dashboard origin', async () => {
    const res = await newApp().get('/nope').set('Origin', 'https://focalpoint-rho.vercel.app');
    expect(res.headers['access-control-allow-origin']).toBe('https://focalpoint-rho.vercel.app');
  });

  it('allows Chrome extension origins', async () => {
    const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const res = await newApp().get('/nope').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('does not allow other websites', async () => {
    const res = await newApp().get('/api/sessions').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('unknown routes', () => {
  it('answer 404 JSON', async () => {
    const res = await newApp().get('/definitely/not/here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route Not found' });
  });
});
