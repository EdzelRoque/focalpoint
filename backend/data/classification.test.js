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

const { classify, clearClassificationCache } = await import('./classification.js');

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

describe('#3.8 — clearClassificationCache writes the same key shape classify reads', () => {
    it('clearClassificationCache(url, goal, sens) and classify(url, ..., goal, sens) operate on the byte-identical key', async () => {
        redisDel.mockResolvedValue(1);
        redisSet.mockResolvedValue('OK');

        const url = 'https://example.com/article';
        const goal = 'Do focused research on a topic';
        const sens = 'standard';

        await clearClassificationCache(url, goal, sens);
        const writeKey = redisSet.mock.calls[0][0];

        redisSet.mockClear();
        redisGet.mockResolvedValue(null);
        messagesCreate.mockResolvedValue({
            content: [{ text: '{"decision":"ALLOW","reason":"ok"}' }],
        });

        await classify(url, 'Example title', 'Some snippet long enough.', goal, sens);
        const readKey = redisGet.mock.calls[0][0];

        expect(readKey).toBe(writeKey);
    });
});

describe('#3.2 — cache key invariant: url, sessionGoal, and blockSensitivity each affect the key', () => {
    it('produces a distinct cache key when any of url / goal / sensitivity changes', async () => {
        redisGet.mockResolvedValue(null);
        redisSet.mockResolvedValue('OK');
        messagesCreate.mockResolvedValue({
            content: [{ text: '{"decision":"ALLOW","reason":"ok"}' }],
        });

        const baseUrl = 'https://example.com/article';
        const baseGoal = 'Do focused research on a topic';
        const baseSens = 'standard';
        const title = 'Example page title';
        const snippet = 'Some page snippet content that is long enough.';

        await classify(baseUrl, title, snippet, baseGoal, baseSens);
        await classify('https://other.example.com/page', title, snippet, baseGoal, baseSens);
        await classify(baseUrl, title, snippet, 'A completely different goal', baseSens);
        await classify(baseUrl, title, snippet, baseGoal, 'strict');

        expect(redisGet).toHaveBeenCalledTimes(4);
        const keys = redisGet.mock.calls.map((c) => c[0]);
        expect(new Set(keys).size).toBe(4);
    });
});

describe('#3.1 — fail-open contract: classify never throws and never BLOCKs by accident', () => {
    it('returns ALLOW when the Anthropic API throws', async () => {
        redisGet.mockResolvedValue(null);
        redisSet.mockResolvedValue('OK');
        messagesCreate.mockRejectedValue(new Error('Anthropic API down'));

        const result = await classify(...validArgs());

        expect(result.decision).toBe('ALLOW');
    });

    it('returns ALLOW when the Anthropic response is not valid JSON', async () => {
        redisGet.mockResolvedValue(null);
        redisSet.mockResolvedValue('OK');
        messagesCreate.mockResolvedValue({
            content: [{ text: 'this is not json {{{ malformed' }],
        });

        const result = await classify(...validArgs());

        expect(result.decision).toBe('ALLOW');
    });

    it('returns ALLOW when the Anthropic response contains an unknown decision value', async () => {
        redisGet.mockResolvedValue(null);
        redisSet.mockResolvedValue('OK');
        messagesCreate.mockResolvedValue({
            content: [{ text: '{"decision":"MAYBE","reason":"hedging"}' }],
        });

        const result = await classify(...validArgs());

        expect(result.decision).toBe('ALLOW');
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
