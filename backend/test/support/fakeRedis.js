// In-memory replacement for the ioredis client, covering the commands the
// backend uses (get, set with EX, del) plus inspection helpers for tests.
const store = new Map(); // key -> { value, ttlSeconds }

export const fakeRedis = {
  async get(key) {
    return store.has(key) ? store.get(key).value : null;
  },
  async set(key, value, mode, seconds) {
    store.set(key, { value, ttlSeconds: mode === 'EX' ? seconds : null });
    return 'OK';
  },
  async del(...keys) {
    let n = 0;
    for (const k of keys) if (store.delete(k)) n++;
    return n;
  },
  on() {},

  // --- test helpers ---
  keys: (prefix = '') => [...store.keys()].filter((k) => k.startsWith(prefix)),
  entry: (key) => store.get(key),
  flush: () => store.clear(),
};
