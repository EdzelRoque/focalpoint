// The eval only talks to Claude; keep the classifier module from opening a
// Redis connection.
import { vi } from 'vitest';

vi.mock('../config/redisConnection.js', () => ({
  default: { get: async () => null, set: async () => 'OK', del: async () => 0, on() {} },
}));
