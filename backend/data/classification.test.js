import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inspect } from 'util';
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

describe('privacy', () => {
  const privateReason = 'This page mentions a private diagnosis';

  // inspect, not String: objects must show their contents for these checks to mean anything
  const loggedText = (spy) =>
    spy.mock.calls.map((call) => call.map((arg) => inspect(arg)).join(' ')).join('\n');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never sends the query string or fragment to Claude', async () => {
    mockGet.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ content: [{ text: '{"decision":"ALLOW","reason":"ok"}' }] });

    await classify(
      'https://example.com/reset?token=secret-token#fragment-secret',
      inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, inputs.blockSensitivity
    );

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Page URL: https://example.com/reset\n');
    expect(prompt).not.toContain('secret');
  });

  it('does not log the reason for a new decision', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGet.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      content: [{ text: JSON.stringify({ decision: 'BLOCK', reason: privateReason }) }],
    });

    await classify(inputs.url, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, inputs.blockSensitivity);

    expect(loggedText(log)).not.toContain('diagnosis');
  });

  it('does not log the reason when a saved decision is reused', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockGet.mockResolvedValue(JSON.stringify({ decision: 'BLOCK', reason: privateReason }));

    await classify(inputs.url, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, inputs.blockSensitivity);

    expect(loggedText(log)).not.toContain('diagnosis');
  });

  it('logs only the type and status when a Claude call fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockResolvedValue(null);
    const failure = Object.assign(new TypeError('request failed for private page text'), { status: 503 });
    mockCreate.mockRejectedValue(failure);

    await classify(inputs.url, inputs.pageTitle, inputs.pageSnippet, inputs.sessionGoal, inputs.blockSensitivity);

    const output = loggedText(error);
    expect(output).toContain('TypeError');
    expect(output).toContain('503');
    expect(output).not.toContain('private page text');
  });
});
