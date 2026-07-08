// Global setup for the extension journey suite (docs/planning/extension/journeys-spec.md).
//
// Boots the full real stack once per run:
//   1. a rewritten copy of the extension pointing at the local backend
//   2. mongodb-memory-server
//   3. the real backend (`node app.js`) with stdout captured to a log file
//      (the `Cached:` log line doubles as /api/classify observability)
//   4. a static server for the deterministic test pages
//   5. one registered + logged-in test user shared by all tests
//
// Anthropic is never reachable: ANTHROPIC_BASE_URL points at a dead local
// port, so an accidental cache-miss call fails instantly and the backend
// fails open (uncached) instead of hitting the network.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(extensionRoot, '..', 'backend');
const tmpDir = path.join(__dirname, '.tmp');

const BACKEND_PORT = Number(process.env.FP_TEST_BACKEND_PORT ?? 4310);
const PAGES_PORT = Number(process.env.FP_TEST_PAGES_PORT ?? 4311);
const REDIS_URL = process.env.FP_TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15';

const PROD_BASE_URL = 'https://focalpoint-q8r5.onrender.com';

const TEST_USER = {
  username: 'journey.user',
  email: 'journeys@example.com',
  password: 'Journeys#1pass',
};

// ---------------------------------------------------------------------------

const buildExtensionCopy = (backendUrl) => {
  const extDir = path.join(tmpDir, 'ext');
  fs.rmSync(extDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(extDir, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(extDir, 'images'), { recursive: true });

  const copy = (rel) =>
    fs.copyFileSync(path.join(extensionRoot, rel), path.join(extDir, rel));

  // Only the shipped extension files — not tests, configs, or node_modules.
  copy('popup.html');
  copy('popup.css');
  copy('content.js');
  copy('lib/content-helpers.js');
  copy('lib/popup-helpers.js');
  for (const img of fs.readdirSync(path.join(extensionRoot, 'images'))) {
    copy(path.join('images', img));
  }

  // Rewrite the hardcoded production URL in the two scripts that fetch.
  for (const rel of ['background.js', 'popup.js']) {
    const src = fs.readFileSync(path.join(extensionRoot, rel), 'utf8');
    if (!src.includes(PROD_BASE_URL)) {
      throw new Error(
        `${rel} no longer contains ${PROD_BASE_URL} — the journey harness ` +
          'rewrite is broken; update PROD_BASE_URL in tests/global-setup.js',
      );
    }
    fs.writeFileSync(
      path.join(extDir, rel),
      src.replaceAll(PROD_BASE_URL, backendUrl),
    );
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'),
  );
  manifest.host_permissions = manifest.host_permissions.map((perm) =>
    perm.startsWith(PROD_BASE_URL) ? `${backendUrl}/*` : perm,
  );
  fs.writeFileSync(
    path.join(extDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  return extDir;
};

const startPagesServer = () =>
  new Promise((resolve, reject) => {
    const pagesDir = path.join(__dirname, 'pages');
    const server = createServer((req, res) => {
      const name = path.basename(new URL(req.url, 'http://x').pathname);
      const file = path.join(pagesDir, name);
      if (name.endsWith('.html') && fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(file));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<title>Not found</title><p>No such test page exists here.</p>');
      }
    });
    server.on('error', reject);
    server.listen(PAGES_PORT, '127.0.0.1', () => resolve(server));
  });

const startBackend = (backendUrl, mongoUri) => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const logPath = path.join(tmpDir, 'backend.log');
  fs.writeFileSync(logPath, '');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const child = spawn(process.execPath, ['app.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      MONGO_URI: mongoUri,
      REDIS_URL,
      JWT_SECRET: 'journeys-test-secret',
      ANTHROPIC_API_KEY: 'test-key-never-used',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
      // The suite's real traffic exceeds the production per-minute limits;
      // see the env-gated override in backend/app.js.
      RATE_LIMIT_MAX: '10000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  return { child, logPath };
};

const waitForBackend = async (backendUrl) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${backendUrl}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(
    `Backend never came up on ${backendUrl} — see ${path.join(tmpDir, 'backend.log')}`,
  );
};

const prepareRedis = async () => {
  const db = Number(new URL(REDIS_URL).pathname.slice(1) || '0');
  if (db === 0) {
    throw new Error(
      `Refusing to FLUSHDB on Redis db 0 (${REDIS_URL}) — point ` +
        'FP_TEST_REDIS_URL at a dedicated db index (default /15).',
    );
  }
  const redis = new Redis(REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    await redis.flushdb();
  } catch (err) {
    throw new Error(
      `Cannot reach Redis at ${REDIS_URL}. Start one first, e.g.:\n` +
        '  docker run -d --name focalpoint-test-redis -p 6379:6379 redis:7\n' +
        `(${err.message})`,
    );
  } finally {
    redis.disconnect();
  }
};

const registerAndLogin = async (backendUrl) => {
  const reg = await fetch(`${backendUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  });
  if (reg.status !== 201) {
    throw new Error(`Test-user registration failed (${reg.status}): ${await reg.text()}`);
  }
  const login = await fetch(`${backendUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
  if (!login.ok) {
    throw new Error(`Test-user login failed (${login.status}): ${await login.text()}`);
  }
  const { token } = await login.json();
  return token;
};

// ---------------------------------------------------------------------------

export default async function globalSetup() {
  const backendUrl = `http://127.0.0.1:${BACKEND_PORT}`;
  const pagesUrl = `http://127.0.0.1:${PAGES_PORT}`;

  await prepareRedis();
  const extDir = buildExtensionCopy(backendUrl);
  const pagesServer = await startPagesServer();
  const mongod = await MongoMemoryServer.create();
  const { child: backend, logPath } = startBackend(backendUrl, mongod.getUri());
  await waitForBackend(backendUrl);
  const token = await registerAndLogin(backendUrl);

  // Workers inherit the runner's env — this is how tests find the stack.
  process.env.FP_BACKEND_URL = backendUrl;
  process.env.FP_PAGES_URL = pagesUrl;
  process.env.FP_EXT_DIR = extDir;
  process.env.FP_BACKEND_LOG = logPath;
  process.env.FP_TOKEN = token;
  process.env.FP_USERNAME = TEST_USER.username;
  process.env.FP_EMAIL = TEST_USER.email;
  process.env.FP_PASSWORD = TEST_USER.password;
  process.env.FP_REDIS_URL = REDIS_URL;

  return async () => {
    backend.kill();
    await new Promise((resolve) => {
      backend.once('exit', resolve);
      setTimeout(resolve, 3000).unref();
    });
    await mongod.stop();
    await new Promise((resolve) => pagesServer.close(resolve));
  };
}
