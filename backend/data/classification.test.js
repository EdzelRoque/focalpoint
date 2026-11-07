import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { inspect } from 'util';

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

describe('privacy', () => {
  const secretUrl = 'https://example.com/reset?token=secret-token#fragment-secret';
  const secretReason = 'This page mentions a private diagnosis';

  const allLogOutput = (...spies) =>
    spies.flatMap((spy) => spy.mock.calls).map((call) => call.map((arg) => inspect(arg)).join(' ')).join('\n');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never sends the query string or fragment to Claude', async () => {
    mockGet.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ content: [{ text: '{"decision":"ALLOW","reason":"ok"}' }] });

    await classify(secretUrl, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, 'standard');

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Page URL: https://example.com/reset\n');
    expect(prompt).not.toContain('secret');
  });

  it('does not log the decision reason after a Claude call', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGet.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      content: [{ text: JSON.stringify({ decision: 'BLOCK', reason: secretReason }) }],
    });

    await classify(inputs.url, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, 'standard');

    expect(allLogOutput(log)).not.toContain('diagnosis');
  });

  it('does not log the decision reason on a cache hit', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGet.mockResolvedValue(JSON.stringify({ decision: 'BLOCK', reason: secretReason }));

    await classify(inputs.url, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, 'standard');

    expect(allLogOutput(log)).not.toContain('diagnosis');
  });

  it('logs only the failure type when a Claude call fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockResolvedValue(null);
    mockCreate.mockRejectedValue(new Error('request failed for private page text'));

    await classify(inputs.url, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, 'standard');

    expect(allLogOutput(error)).not.toContain('private page text');
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('cache key for clients that remove the query string', () => {
  const strippedKey = (url, goal, sens, title) =>
    `classify:${crypto.createHash('sha256').update(`${url}:${goal}:${sens}:${title}`).digest('hex')}`;

  it('gives pages with the same URL and different titles separate answers', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ decision: 'ALLOW', reason: 'ok' }));
    const url = 'https://www.youtube.com/watch';

    await classify(url, 'Calculus lecture', inputs.pageSnippet, inputs.sessionGoal, 'standard', { urlStripped: true });
    await classify(url, 'Funny cats', inputs.pageSnippet, inputs.sessionGoal, 'standard', { urlStripped: true });

    expect(mockGet.mock.calls[0][0]).toBe(strippedKey(url, inputs.sessionGoal, 'standard', 'Calculus lecture'));
    expect(mockGet.mock.calls[1][0]).toBe(strippedKey(url, inputs.sessionGoal, 'standard', 'Funny cats'));
  });

  it('writes an override to the same key that classify reads', async () => {
    mockGet.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ content: [{ text: '{"decision":"BLOCK","reason":"off topic"}' }] });

    await classify(inputs.url, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, 'standard', { urlStripped: true });
    await clearClassificationCache(inputs.url, inputs.sessionGoal, 'standard', { pageTitle: inputs.pageTitle });

    expect(mockSet.mock.calls[1][0]).toBe(mockGet.mock.calls[0][0]);
  });
});
