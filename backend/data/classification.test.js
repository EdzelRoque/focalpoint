import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

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

const { classify, clearClassificationCache } = await import('./classification.js');

const cacheKeyFor = (url, goal, sens) =>
  `classify:${crypto.createHash('sha256').update(`${url}:${goal}:${sens}`).digest('hex')}`;

const inputs = {
  url: 'https://example.com/article',
  pageTitle: 'Example Title',
  pageSnippet: 'Some snippet of page content here',
  sessionGoal: 'Learn about test driven development practices',
  blockSensitivity: 'standard',
};

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
  mockDel.mockReset();
  mockCreate.mockReset();
});

describe('classify', () => {
  it('returns the cached decision on a cache hit and does not call Anthropic', async () => {
    const cached = { decision: 'BLOCK', reason: 'previously decided' };
    mockGet.mockResolvedValue(JSON.stringify(cached));

    const result = await classify(
      inputs.url, inputs.pageTitle, inputs.pageSnippet,
      inputs.sessionGoal, inputs.blockSensitivity
    );

    expect(result).toEqual(cached);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('on cache miss with a valid Claude response, caches the decision for 24h', async () => {
    mockGet.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      content: [{ text: '{"decision":"BLOCK","reason":"unrelated to goal"}' }],
    });

    const result = await classify(
      inputs.url, inputs.pageTitle, inputs.pageSnippet,
      inputs.sessionGoal, inputs.blockSensitivity
    );

    expect(result).toEqual({ decision: 'BLOCK', reason: 'unrelated to goal' });
    expect(mockSet).toHaveBeenCalledWith(
      cacheKeyFor(inputs.url, inputs.sessionGoal, inputs.blockSensitivity),
      JSON.stringify({ decision: 'BLOCK', reason: 'unrelated to goal' }),
      'EX',
      86400
    );
  });

  it('returns the fail-open ALLOW on Claude failure and does NOT cache the failure', async () => {
    mockGet.mockResolvedValue(null);
    mockCreate.mockRejectedValue(new Error('Anthropic API down'));

    const result = await classify(
      inputs.url, inputs.pageTitle, inputs.pageSnippet,
      inputs.sessionGoal, inputs.blockSensitivity
    );

    expect(result.decision).toBe('ALLOW');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('uses different cache keys for different blockSensitivity values', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ decision: 'ALLOW', reason: 'ok' }));

    await classify(inputs.url, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, 'standard');
    await classify(inputs.url, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, 'strict');

    const keys = mockGet.mock.calls.map((c) => c[0]);
    expect(keys[0]).toBe(cacheKeyFor(inputs.url, inputs.sessionGoal, 'standard'));
    expect(keys[1]).toBe(cacheKeyFor(inputs.url, inputs.sessionGoal, 'strict'));
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe('clearClassificationCache', () => {
  it('deletes the cache entry and writes a User-override ALLOW with 24h TTL at the matching key', async () => {
    mockDel.mockResolvedValue(1);
    mockSet.mockResolvedValue('OK');

    await clearClassificationCache(inputs.url, inputs.sessionGoal, inputs.blockSensitivity);

    const key = cacheKeyFor(inputs.url, inputs.sessionGoal, inputs.blockSensitivity);
    expect(mockDel).toHaveBeenCalledWith(key);
    expect(mockSet).toHaveBeenCalledWith(
      key,
      JSON.stringify({ decision: 'ALLOW', reason: "User overrode this page's block" }),
      'EX',
      86400
    );
  });

  it('throws on invalid URL and makes no Redis calls', async () => {
    await expect(
      clearClassificationCache('not-a-url', inputs.sessionGoal, inputs.blockSensitivity)
    ).rejects.toBe('Invalid URL format');

    expect(mockDel).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });
});
