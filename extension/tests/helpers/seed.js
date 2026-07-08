// Seeds classification decisions into Redis exactly the way the production
// classifier writes them (backend/data/classification.js), so the backend
// serves them through its real cache path and Anthropic is never called.

import crypto from 'node:crypto';
import Redis from 'ioredis';

// classify() validates the URL first, and validateURL returns the
// URL-constructor-normalized href — the cache key is built from THAT, so the
// seed must normalize identically or the key silently misses.
const cacheKey = (url, goal, sensitivity) => {
  const normalized = new URL(url).href;
  const hash = crypto
    .createHash('sha256')
    .update(`${normalized}:${goal}:${sensitivity}`)
    .digest('hex');
  return `classify:${hash}`;
};

const withRedis = async (fn) => {
  const redis = new Redis(process.env.FP_REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    return await fn(redis);
  } finally {
    redis.disconnect();
  }
};

export const seedDecision = (url, goal, sensitivity, decision, reason) =>
  withRedis((redis) =>
    redis.set(
      cacheKey(url, goal, sensitivity),
      JSON.stringify({ decision, reason }),
      'EX',
      86400,
    ),
  );

export const readDecision = (url, goal, sensitivity) =>
  withRedis(async (redis) => {
    const raw = await redis.get(cacheKey(url, goal, sensitivity));
    return raw ? JSON.parse(raw) : null;
  });
