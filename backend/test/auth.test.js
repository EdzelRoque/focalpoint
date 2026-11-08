// Accounts: register, login, tokens, profile and settings.
import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { newApp, signUp, STRONG_PASSWORD } from './support/api.js';
import { setStoredPreferences } from './support/db.js';

let api;
beforeEach(() => {
  api = newApp();
});

const register = (body) => api.post('/auth/register').send(body);

describe('register', () => {
  it('creates an account with default preferences (standard sensitivity, strict mode off)', async () => {
    const res = await register({ username: 'chem.student', email: 'Chem@School.edu', password: STRONG_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      username: 'chem.student',
      email: 'chem@school.edu', // stored lower-case
      preferences: { blockSensitivity: 'standard', strictMode: false },
    });
  });

  it('rejects a taken username or email with 409 (email check is case-insensitive)', async () => {
    await register({ username: 'chem.student', email: 'chem@school.edu', password: STRONG_PASSWORD });
    expect((await register({ username: 'chem.student', email: 'other@school.edu', password: STRONG_PASSWORD })).status).toBe(409);
    expect((await register({ username: 'someone_else', email: 'CHEM@school.edu', password: STRONG_PASSWORD })).status).toBe(409);
  });

  it('treats usernames as taken regardless of case, but keeps the casing as typed', async () => {
    const first = await register({ username: 'Chem.Student', email: 'a@school.edu', password: STRONG_PASSWORD });
    expect(first.body.username).toBe('Chem.Student');
    const clash = await register({ username: 'chem.student', email: 'b@school.edu', password: STRONG_PASSWORD });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('Username is already taken');
  });

  it.each([
    ['no uppercase', 'sup3r$ecret'],
    ['no lowercase', 'SUP3R$ECRET'],
    ['no digit', 'Super$ecret'],
    ['no special character', 'Sup3rSecret'],
    ['under 8 characters', 'Su3$abc'],
    ['a space', 'Sup3r $ecret'],
  ])('rejects a password with %s (400)', async (_label, password) => {
    expect((await register({ username: 'chem.student', email: 'c@school.edu', password })).status).toBe(400);
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(26)],
    ['invalid characters', 'chem student!'],
  ])('rejects a username that is %s (400)', async (_label, username) => {
    expect((await register({ username, email: 'c@school.edu', password: STRONG_PASSWORD })).status).toBe(400);
  });

  it('rejects an invalid email (400) and an empty body (400)', async () => {
    expect((await register({ username: 'chem.student', email: 'not-an-email', password: STRONG_PASSWORD })).status).toBe(400);
    expect((await register({})).status).toBe(400);
  });
});

describe('login', () => {
  beforeEach(async () => {
    await register({ username: 'chem.student', email: 'chem@school.edu', password: STRONG_PASSWORD });
  });

  it('returns a 7-day token for the account, plus profile data', async () => {
    const res = await api.post('/auth/login').send({ email: 'CHEM@school.edu', password: STRONG_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'chem.student', email: 'chem@school.edu' });
    const claims = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(claims.userId).toBe(res.body._id);
    expect(claims.exp - claims.iat).toBe(7 * 24 * 3600);
  });

  it('gives the same 401 message for a wrong password and an unknown email (no account probing)', async () => {
    const wrongPw = await api.post('/auth/login').send({ email: 'chem@school.edu', password: 'Wr0ng$pass' });
    const noUser = await api.post('/auth/login').send({ email: 'nobody@school.edu', password: STRONG_PASSWORD });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error).toBe(noUser.body.error);
  });

  it('rejects missing credentials with 400', async () => {
    expect((await api.post('/auth/login').send({})).status).toBe(400);
    expect((await api.post('/auth/login').send({ email: 'chem@school.edu' })).status).toBe(400);
  });
});

describe('tokens', () => {
  const protectedRoutes = [
    ['get', '/api/sessions'],
    ['post', '/api/sessions'],
    ['get', '/api/sessions/64b000000000000000000000'],
    ['put', '/api/sessions/64b000000000000000000000'],
    ['post', '/api/sessions/64b000000000000000000000/block'],
    ['post', '/api/sessions/64b000000000000000000000/override'],
    ['post', '/api/classify'],
    ['get', '/auth/me'],
    ['put', '/auth/settings'],
  ];

  it.each(protectedRoutes)('%s %s requires a token (401)', async (method, path) => {
    expect((await api[method](path)).status).toBe(401);
  });

  it.each([
    ['an expired token', () => jwt.sign({ userId: '64b000000000000000000000' }, process.env.JWT_SECRET, { expiresIn: -10 })],
    ['a token signed with another secret', () => jwt.sign({ userId: '64b000000000000000000000' }, 'not-the-secret')],
    ['garbage', () => 'not.a.jwt'],
  ])('rejects %s (401)', async (_label, makeToken) => {
    const res = await api.get('/api/sessions').set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(401);
  });

  it('rejects a non-Bearer authorization header (401)', async () => {
    const { token } = await signUp(api);
    expect((await api.get('/api/sessions').set('Authorization', token)).status).toBe(401);
  });
});

describe('profile and settings', () => {
  it('GET /auth/me returns the profile without the password', async () => {
    const me = await signUp(api);
    const res = await api.get('/auth/me').set(me.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      username: me.creds.username,
      email: me.creds.email,
      preferences: { blockSensitivity: 'standard', strictMode: false },
    });
  });

  it('saves username, email and strict mode', async () => {
    const me = await signUp(api);
    const res = await api.put('/auth/settings').set(me.auth)
      .send({ username: 'renamed_user', email: 'new@school.edu', blockSensitivity: 'standard', strictMode: true });
    expect(res.status).toBe(200);
    const after = await api.get('/auth/me').set(me.auth);
    expect(after.body).toMatchObject({
      username: 'renamed_user',
      email: 'new@school.edu',
      preferences: { strictMode: true, blockSensitivity: 'standard' },
    });
  });

  it('stores standard when an unreleased sensitivity is sent (lenient/strict are "coming soon")', async () => {
    const me = await signUp(api);
    await api.put('/auth/settings').set(me.auth)
      .send({ username: me.creds.username, email: me.creds.email, blockSensitivity: 'strict', strictMode: false });
    expect((await api.get('/auth/me').set(me.auth)).body.preferences.blockSensitivity).toBe('standard');
  });

  it('reports standard for accounts that stored an unreleased level earlier', async () => {
    const me = await signUp(api);
    await setStoredPreferences(me.creds.email, { blockSensitivity: 'lenient', strictMode: true });
    const res = await api.get('/auth/me').set(me.auth);
    expect(res.body.preferences).toEqual({ blockSensitivity: 'standard', strictMode: true });
  });

  it('lets you change the casing of your own username', async () => {
    const me = await signUp(api, { username: 'chem_student' });
    const res = await api.put('/auth/settings').set(me.auth)
      .send({ username: 'Chem_Student', email: me.creds.email, blockSensitivity: 'standard', strictMode: false });
    expect(res.status).toBe(200);
    expect((await api.get('/auth/me').set(me.auth)).body.username).toBe('Chem_Student');
  });

  it('keeps your own username/email when re-saving them unchanged', async () => {
    const me = await signUp(api);
    const res = await api.put('/auth/settings').set(me.auth)
      .send({ username: me.creds.username, email: me.creds.email, blockSensitivity: 'standard', strictMode: false });
    expect(res.status).toBe(200);
  });

  it.each([
    ['strictMode is not a boolean', { strictMode: 'yes' }],
    ['the sensitivity is unknown', { blockSensitivity: 'extreme' }],
    ['the email is invalid', { email: 'nope' }],
  ])('rejects settings where %s (400)', async (_label, patch) => {
    const me = await signUp(api);
    const res = await api.put('/auth/settings').set(me.auth)
      .send({ username: me.creds.username, email: me.creds.email, blockSensitivity: 'standard', strictMode: false, ...patch });
    expect(res.status).toBe(400);
  });

  it('returns 404 from /auth/me for a token whose account no longer exists', async () => {
    const token = jwt.sign({ userId: '64b000000000000000000000' }, process.env.JWT_SECRET);
    expect((await api.get('/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(404);
  });
});
