// Seeds classification decisions into Redis exactly the way the production
// classifier writes them (backend/data/classification.js), so the backend
// serves them through its real cache path and Anthropic is never called.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const PAGES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pages');

// The extension classifies by address without its query string, plus the page
// title, so seeds need the same two parts. The title defaults to the <title>
// of the matching test page; pages whose title changes pass it explicitly.
const titleOfPage = (url) => {
  const file = path.join(PAGES_DIR, path.basename(new URL(url).pathname));
  // The static server answers unknown pages with this title.
  if (!fs.existsSync(file)) return 'Not found';
  const html = fs.readFileSync(file, 'utf8');
  return /<title>(.*?)<\/title>/s.exec(html)[1].trim();
};

const cacheKey = (url, goal, sensitivity, title = titleOfPage(url)) => {
  const parsed = new URL(url);
  const hash = crypto
    .createHash('sha256')
    .update(`${parsed.origin}${parsed.pathname}:${goal}:${sensitivity}:${title}`)
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

export const seedDecision = (url, goal, sensitivity, decision, reason, title) =>
  withRedis((redis) =>
    redis.set(
      cacheKey(url, goal, sensitivity, title),
      JSON.stringify({ decision, reason }),
      'EX',
      86400,
    ),
  );

export const readDecision = (url, goal, sensitivity, title) =>
  withRedis(async (redis) => {
    const raw = await redis.get(cacheKey(url, goal, sensitivity, title));
    return raw ? JSON.parse(raw) : null;
  });
