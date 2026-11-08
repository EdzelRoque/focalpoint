// The production entry point must boot under plain Node. Vitest compiles
// modules its own way and can hide errors (e.g. a duplicate import) that make
// `node app.js` crash on Render, so this spawns the real process.
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const boot = (env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ['app.js'], {
      cwd: backendRoot,
      // Point dotenv at a file that doesn't exist, so a developer's backend/.env
      // can't fill in the vars these tests leave out on purpose.
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        DOTENV_CONFIG_PATH: path.join(backendRoot, '.env.startup-test-none'),
        ...env,
      },
    });
    let output = '';
    const done = (result) => { child.kill(); resolve({ ...result, output }); };
    const timer = setTimeout(() => done({ started: false }), 10_000);
    const onData = (d) => {
      output += d;
      if (output.includes('Server is running')) { clearTimeout(timer); done({ started: true }); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ started: false, code, output }); });
  });

describe('node app.js', () => {
  it('starts with the required env vars', async () => {
    const result = await boot({
      PORT: '0',
      MONGO_URI: process.env.MONGO_URI,
      JWT_SECRET: 'x',
      ANTHROPIC_API_KEY: 'x',
      REDIS_URL: 'redis://127.0.0.1:1',
    });
    expect(result.output).not.toMatch(/SyntaxError|ReferenceError/);
    expect(result.started).toBe(true);
  });

  it('refuses to start when a required env var is missing', async () => {
    const result = await boot({ PORT: '0', JWT_SECRET: 'x', ANTHROPIC_API_KEY: 'x' });
    expect(result.started).toBe(false);
    expect(result.output).toContain('Missing required env vars');
  });
});
