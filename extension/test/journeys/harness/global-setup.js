// Journey suite global setup. Boots the full real stack once per run:
//   1. a copy of the extension whose lib/config.js points at the local backend
//   2. mongodb-memory-server
//   3. a fake Claude (the real backend's Anthropic SDK talks to it over HTTP)
//   4. the real backend (`node app.js`), stdout/stderr captured to a log file
//   5. a static server for the test pages in test/journeys/pages
//
// The fake Claude decides by page title: a title containing "[off-topic]"
// is BLOCKed, anything else is ALLOWed. It records every request so journeys
// can check exactly what reached "Claude".

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Redis from 'ioredis';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..', '..', '..');
const backendRoot = path.resolve(extensionRoot, '..', 'backend');
const tmpDir = path.join(extensionRoot, 'test', '.tmp');

const BACKEND_PORT = Number(process.env.FP_TEST_BACKEND_PORT ?? 4310);
const PAGES_PORT = Number(process.env.FP_TEST_PAGES_PORT ?? 4311);
const CLAUDE_PORT = Number(process.env.FP_TEST_CLAUDE_PORT ?? 4312);
const REDIS_URL = process.env.FP_TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15';

// Files Chrome loads from the extension. Tests, configs and node_modules stay out.
const SHIPPED = ['manifest.json', 'background.js', 'content.js', 'popup.html', 'popup.css', 'popup.js', 'lib/config.js',
  'lib/session-helpers.js', 'lib/login-state.js', 'lib/content-helpers.js', 'lib/popup-helpers.js'];

const buildExtensionCopy = (backendUrl) => {
  const extDir = path.join(tmpDir, 'ext');
  fs.rmSync(extDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(extDir, 'lib'), { recursive: true });
  fs.cpSync(path.join(extensionRoot, 'images'), path.join(extDir, 'images'), { recursive: true });
  for (const rel of SHIPPED) fs.copyFileSync(path.join(extensionRoot, rel), path.join(extDir, rel));

  const config = fs.readFileSync(path.join(extDir, 'lib/config.js'), 'utf8');
  const rewritten = config.replace(/API_BASE_URL: '[^']+'/, `API_BASE_URL: '${backendUrl}'`);
  if (rewritten === config) throw new Error('lib/config.js has no API_BASE_URL to rewrite; update the journey harness');
  fs.writeFileSync(path.join(extDir, 'lib/config.js'), rewritten);

  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = ['<all_urls>', `${backendUrl}/*`];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return extDir;
};

const listen = (server, port) =>
  new Promise((resolve, reject) => { server.on('error', reject); server.listen(port, '127.0.0.1', () => resolve(server)); });

const startPagesServer = () => listen(createServer((req, res) => {
  const name = path.basename(new URL(req.url, 'http://x').pathname);
  const file = path.join(here, '..', 'pages', name);
  if (name.endsWith('.html') && fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<title>Not found</title><p>No such test page exists here.</p>');
  }
}), PAGES_PORT);

const startFakeClaude = () => {
  const requests = [];
  return listen(createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/__requests') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(requests));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push(body);
    const prompt = body.messages[0].content;
    const title = /Page title: (.*)/.exec(prompt)?.[1] ?? '';
    const decision = title.includes('[off-topic]')
      ? { decision: 'BLOCK', reason: 'This page is not related to your study goal.' }
      : { decision: 'ALLOW', reason: 'Related to your goal.' };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_fake', type: 'message', role: 'assistant', model: body.model,
      content: [{ type: 'text', text: JSON.stringify(decision) }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    }));
  }), CLAUDE_PORT);
};

const startBackend = (mongoUri, claudeUrl) => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const logPath = path.join(tmpDir, 'backend.log');
  fs.writeFileSync(logPath, '');
  const log = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn(process.execPath, ['app.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      MONGO_URI: mongoUri,
      REDIS_URL,
      JWT_SECRET: 'journeys-test-secret',
      ANTHROPIC_API_KEY: 'test-key-not-real',
      ANTHROPIC_BASE_URL: claudeUrl,
      // Journeys send far more requests than the production per-minute limits
      // allow; see the env-gated override in backend/app.js.
      RATE_LIMIT_MAX: '100000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return { child, logPath };
};

const waitForBackend = async (backendUrl, logPath) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { await fetch(`${backendUrl}/`); return; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error(`Backend never came up on ${backendUrl}; see ${logPath}`);
};

const prepareRedis = async () => {
  const db = Number(new URL(REDIS_URL).pathname.slice(1) || '0');
  if (db === 0) throw new Error(`Refusing to FLUSHDB Redis db 0 (${REDIS_URL}); use a dedicated db index (default /15).`);
  const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.flushdb();
  } catch (err) {
    throw new Error(`Cannot reach Redis at ${REDIS_URL}. Start one first, e.g.\n  docker run -d --name focalpoint-test-redis -p 6379:6379 redis:7\n(${err.message})`);
  } finally {
    redis.disconnect();
  }
};

export default async function globalSetup() {
  const backendUrl = `http://127.0.0.1:${BACKEND_PORT}`;
  await prepareRedis();
  const extDir = buildExtensionCopy(backendUrl);
  const pages = await startPagesServer();
  const claude = await startFakeClaude();
  const mongod = await MongoMemoryServer.create();
  const { child: backend, logPath } = startBackend(mongod.getUri(), `http://127.0.0.1:${CLAUDE_PORT}`);
  await waitForBackend(backendUrl, logPath);

  // Workers inherit the runner's env; this is how tests find the stack.
  Object.assign(process.env, {
    FP_BACKEND_URL: backendUrl,
    FP_PAGES_URL: `http://127.0.0.1:${PAGES_PORT}`,
    FP_CLAUDE_URL: `http://127.0.0.1:${CLAUDE_PORT}`,
    FP_EXT_DIR: extDir,
    FP_BACKEND_LOG: logPath,
    FP_MONGO_URI: mongod.getUri(),
  });

  return async () => {
    backend.kill();
    await new Promise((resolve) => { backend.once('exit', resolve); setTimeout(resolve, 3000).unref(); });
    await mongod.stop();
    await new Promise((r) => pages.close(r));
    await new Promise((r) => claude.close(r));
  };
}
