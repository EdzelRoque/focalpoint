import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { buildTestApp } from '../test/buildTestApp.js';
import { clearDb } from '../test/dbHelpers.js';
import { users } from '../config/mongoCollections.js';
import { closeConnection } from '../config/mongoConnection.js';
import { register } from '../data/user.js';

const app = buildTestApp();

const validBody = {
  username: 'jane.doe',
  email: 'jane@example.com',
  password: 'Sup3rSecret!',
};

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await closeConnection();
});

describe('POST /auth/register', () => {
  it('creates a user and returns 201 with public fields (no password)', async () => {
    const res = await request(app).post('/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      username: 'jane.doe',
      email: 'jane@example.com',
      preferences: { blockSensitivity: 'standard', strictMode: false },
    });
    expect(typeof res.body._id).toBe('string');
    expect(res.body).not.toHaveProperty('password');
  });

  it('persists the user with a bcrypt hash, lowercased email, and default preferences', async () => {
    await request(app).post('/auth/register').send(validBody);

    const userCollection = await users();
    const doc = await userCollection.findOne({ email: 'jane@example.com' });

    expect(doc).not.toBeNull();
    expect(doc.username).toBe('jane.doe');
    expect(doc.email).toBe('jane@example.com');
    expect(doc.password).not.toBe(validBody.password);
    expect(await bcrypt.compare(validBody.password, doc.password)).toBe(true);
    expect(doc.preferences).toEqual({ blockSensitivity: 'standard', strictMode: false });
  });

  it('returns 400 when the body is empty', async () => {
    const res = await request(app).post('/auth/register').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'You must provide user information' });
  });

  it('returns 400 when the email format is invalid', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, email: 'notanemail' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid email format');
  });

  it('returns 400 when the password fails validation rules', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, password: 'short' });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 409 when the username is already taken', async () => {
    await register(validBody.username, validBody.email, validBody.password);

    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, email: 'other@example.com' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Username is already taken' });
  });

  it('returns 409 when the email is already registered', async () => {
    await register(validBody.username, validBody.email, validBody.password);

    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, username: 'other.name' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email is already registered' });
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await register(validBody.username, validBody.email, validBody.password);
  });

  it('returns 200 with a JWT carrying only userId, plus public user fields', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: validBody.email, password: validBody.password });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      username: 'jane.doe',
      email: 'jane@example.com',
      preferences: { blockSensitivity: 'standard', strictMode: false },
    });
    expect(typeof res.body._id).toBe('string');
    expect(res.body).not.toHaveProperty('password');
    expect(typeof res.body.token).toBe('string');

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe(res.body._id);
    expect(decoded).not.toHaveProperty('email');
    expect(decoded).not.toHaveProperty('password');
  });

  it('returns 400 when the body is empty', async () => {
    const res = await request(app).post('/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'You must provide credentials' });
  });

  it('returns 400 with a generic "Invalid email or password" when email is missing (no field-level leak)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: validBody.password });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });

  it('returns 400 with a generic "Invalid email or password" when password is missing', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: validBody.email });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });

  it('returns 401 with "Invalid email or password" when the password is wrong', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: validBody.email, password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });

  it('returns the same 401 + message when the email is unknown (no user-enumeration leak)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: validBody.password });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });
});
