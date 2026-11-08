// Runs before every test file, before any app module is imported.
import { vi, beforeEach, afterAll } from 'vitest';
import { startFakeClaude, fakeClaude } from '../support/fakeClaude.js';
import { fakeRedis } from '../support/fakeRedis.js';

vi.mock('../../config/redisConnection.js', async () => ({
  default: (await import('../support/fakeRedis.js')).fakeRedis,
}));

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
process.env.ANTHROPIC_BASE_URL = await startFakeClaude();

const { clearDb } = await import('../support/db.js');
const { closeConnection } = await import('../../config/mongoConnection.js');

beforeEach(async () => {
  await clearDb();
  fakeRedis.flush();
  fakeClaude.reset();
});

afterAll(async () => {
  await closeConnection();
});
