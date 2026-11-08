// Private page data must never leak: query strings and fragments (reset
// tokens, searches) never reach Claude, and nothing private is logged.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newApp, signUp, startSession, page, STRONG_PASSWORD } from './support/api.js';
import { fakeClaude } from './support/fakeClaude.js';

const SECRET_URL = 'https://accounts.school.edu/reset?token=RESET-TOKEN-123&q=my+private+search#frag-SECRET';
const SECRET_SNIPPET = 'Private snippet text about my medical appointment';
const SECRET_GOAL = 'Prepare for my confidential scholarship interview';

let api, me, logged;
beforeEach(async () => {
  logged = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    vi.spyOn(console, level).mockImplementation((...args) => logged.push(args.map(String).join(' ')));
  }
  api = newApp();
  me = await signUp(api);
});

const allLogs = () => logged.join('\n');
const classifySecret = () =>
  api.post('/api/classify').set(me.auth).send(page({ url: SECRET_URL, pageSnippet: SECRET_SNIPPET, sessionGoal: SECRET_GOAL }));

describe('what Claude sees', () => {
  it('gets only origin + path of the URL: no query string, no fragment', async () => {
    await classifySecret();
    const sent = JSON.stringify(fakeClaude.requests()[0].body);
    expect(sent).toContain('https://accounts.school.edu/reset');
    expect(sent).not.toContain('RESET-TOKEN-123');
    expect(sent).not.toContain('my+private+search');
    expect(sent).not.toContain('frag-SECRET');
  });

  it('never receives the student\'s identity (email, username or user id)', async () => {
    await classifySecret();
    const sent = JSON.stringify(fakeClaude.requests()[0].body);
    expect(sent).not.toContain(me.creds.email);
    expect(sent).not.toContain(me.creds.username);
    expect(sent).not.toContain(me.user._id);
  });
});

describe('what the backend logs', () => {
  it('logs no page data or goal on a successful classification', async () => {
    fakeClaude.reply({ decision: 'BLOCK', reason: 'Off topic.' });
    await classifySecret();
    expect(allLogs()).not.toMatch(/RESET-TOKEN-123|Private snippet|scholarship interview|accounts\.school\.edu/);
  });

  it('logs no page data or goal when Claude fails', async () => {
    fakeClaude.reply({ status: 400 });
    await classifySecret();
    expect(logged.length).toBeGreaterThan(0); // the failure is reported...
    expect(allLogs()).not.toMatch(/RESET-TOKEN-123|Private snippet|scholarship interview|accounts\.school\.edu/); // ...without the data
  });

  it('logs no page data or goal when Claude returns garbage', async () => {
    fakeClaude.reply({ rawText: `I saw ${SECRET_SNIPPET}` });
    await classifySecret();
    expect(allLogs()).not.toMatch(/RESET-TOKEN-123|Private snippet|scholarship interview/);
  });

  it('logs no page data or goal when an override is recorded', async () => {
    const { body: s } = await startSession(api, me.auth, { sessionGoal: SECRET_GOAL, durationInMinutes: 30 });
    await api.post(`/api/sessions/${s._id}/override`).set(me.auth)
      .send({ url: SECRET_URL, sessionGoal: SECRET_GOAL, blockSensitivity: 'standard' });
    expect(allLogs()).not.toMatch(/RESET-TOKEN-123|scholarship interview|accounts\.school\.edu/);
  });
});

describe('account data', () => {
  it('never returns or logs the password, and stores only a bcrypt hash', async () => {
    const { rawUser } = await import('./support/db.js');
    const stored = await rawUser(me.creds.email);
    expect(stored.password).not.toBe(STRONG_PASSWORD);
    expect(stored.password).toMatch(/^\$2[aby]\$12\$/);

    const login = await api.post('/auth/login').send({ email: me.creds.email, password: STRONG_PASSWORD });
    const me2 = await api.get('/auth/me').set(me.auth);
    for (const body of [me.user, login.body, me2.body]) {
      expect(JSON.stringify(body)).not.toContain(STRONG_PASSWORD);
      expect(body).not.toHaveProperty('password');
    }
    expect(allLogs()).not.toContain(STRONG_PASSWORD);
  });

  it('session lists contain only the requesting student\'s sessions and no account data', async () => {
    await startSession(api, me.auth);
    const list = await api.get('/api/sessions').set(me.auth);
    expect(JSON.stringify(list.body)).not.toContain(me.creds.email);
  });
});
