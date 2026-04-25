import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track every `new Anthropic(...)` invocation.
const anthropicConstructor = vi.fn();
const messagesCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
    Anthropic: class {
        constructor(opts) {
            anthropicConstructor(opts);
            this.messages = { create: messagesCreate };
        }
    },
}));

// Redis is the other external dep we must never load for real.
const redisGet = vi.fn();
const redisSet = vi.fn();
const redisDel = vi.fn();
vi.mock('../config/redisConnection.js', () => ({
    default: {
        get: (...args) => redisGet(...args),
        set: (...args) => redisSet(...args),
        del: (...args) => redisDel(...args),
    },
}));

const { classify } = await import('./classification.js');

beforeEach(() => {
    anthropicConstructor.mockClear();
    messagesCreate.mockReset();
    redisGet.mockReset();
    redisSet.mockReset();
    redisDel.mockReset();
});

const validArgs = () => [
    'https://example.com/article',
    'Example page title',
    'Some page snippet content that is long enough.',
    'Do focused research on a topic',
    'standard',
];

describe('#18 — classification cache key uses sha256', () => {
    it('passes a sha256-shaped key (classify:<64 hex chars>) to redis.get', async () => {
        redisGet.mockResolvedValue(null);
        redisSet.mockResolvedValue('OK');
        messagesCreate.mockResolvedValue({
            content: [{ text: '{"decision":"ALLOW","reason":"ok"}' }],
        });

        await classify(...validArgs());

        expect(redisGet).toHaveBeenCalledTimes(1);
        const key = redisGet.mock.calls[0][0];
        expect(key).toMatch(/^classify:[a-f0-9]{64}$/);
    });
});

describe('#6 — Anthropic client is instantiated at module scope, not per request', () => {
    it('constructs the Anthropic client at most once across multiple classify cache-miss calls', async () => {
        // Force cache miss both times
        redisGet.mockResolvedValue(null);
        redisSet.mockResolvedValue('OK');
        messagesCreate.mockResolvedValue({
            content: [{ text: '{"decision":"ALLOW","reason":"ok"}' }],
        });

        await classify(...validArgs());
        await classify(...validArgs());

        // Module-scoped client => constructor called once for the whole module lifetime.
        // (The mock was cleared in beforeEach, so we're counting *this test's* invocations.
        // With a module-scoped client, that count should be 0; with per-call instantiation,
        // it would be 2.)
        expect(anthropicConstructor.mock.calls.length).toBeLessThanOrEqual(1);
        expect(messagesCreate).toHaveBeenCalledTimes(2);
    });
});
