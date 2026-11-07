// HTTP-level helpers: every test talks to the real Express app (rate limits,
// CORS, JSON parsing, routes) through supertest.
import request from 'supertest';
import { createApp } from '../../createApp.js';

let counter = 0;

export const newApp = (options) => request(createApp(options));

export const STRONG_PASSWORD = 'Sup3r$ecret';

/** Registers + logs in a fresh user. Returns { api, token, user, auth }. */
export const signUp = async (api, overrides = {}) => {
  counter += 1;
  const creds = {
    username: overrides.username ?? `student${counter}`,
    email: overrides.email ?? `student${counter}@school.edu`,
    password: overrides.password ?? STRONG_PASSWORD,
  };
  const reg = await api.post('/auth/register').send(creds);
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api.post('/auth/login').send({ email: creds.email, password: creds.password });
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  const token = login.body.token;
  return { token, user: reg.body, creds, auth: { Authorization: `Bearer ${token}` } };
};

export const GOAL = 'Study for my organic chemistry midterm';

export const startSession = (api, auth, body = { sessionGoal: GOAL, durationInMinutes: 60 }) =>
  api.post('/api/sessions').set(auth).send(body);

export const page = (overrides = {}) => ({
  url: 'https://www.khanacademy.org/science/organic-chemistry',
  pageTitle: 'Organic chemistry | Khan Academy',
  pageSnippet: 'Learn about alkanes, alkenes, reaction mechanisms and stereochemistry.',
  sessionGoal: GOAL,
  blockSensitivity: 'standard',
  ...overrides,
});
