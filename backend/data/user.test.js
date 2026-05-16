import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { register, login, updateUserSettings } from './user.js';
import { users } from '../config/mongoCollections.js';
import { closeConnection } from '../config/mongoConnection.js';
import { clearDb } from '../test/dbHelpers.js';

const validUser = {
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

describe('register', () => {
  it('inserts the user with hashed password and default preferences, returning the public fields', async () => {
    const result = await register(validUser.username, validUser.email, validUser.password);

    expect(result).toMatchObject({
      username: 'jane.doe',
      email: 'jane@example.com',
      preferences: { blockSensitivity: 'standard', strictMode: false },
    });
    expect(typeof result._id).toBe('string');
    expect(result).not.toHaveProperty('password');

    const userCollection = await users();
    const doc = await userCollection.findOne({ email: 'jane@example.com' });
    expect(doc.password).not.toBe(validUser.password);
    expect(await bcrypt.compare(validUser.password, doc.password)).toBe(true);
  });

  it('throws when the username is already taken and does not insert a second doc', async () => {
    await register(validUser.username, validUser.email, validUser.password);

    await expect(
      register(validUser.username, 'other@example.com', 'Other1Pass!')
    ).rejects.toBe('Username is already taken');

    const userCollection = await users();
    expect(await userCollection.countDocuments({})).toBe(1);
  });

  it('throws when the email is already taken and does not insert a second doc', async () => {
    await register(validUser.username, validUser.email, validUser.password);

    await expect(
      register('other.name', validUser.email, 'Other1Pass!')
    ).rejects.toBe('Email is already registered');

    const userCollection = await users();
    expect(await userCollection.countDocuments({})).toBe(1);
  });
});

describe('login', () => {
  beforeEach(async () => {
    await register(validUser.username, validUser.email, validUser.password);
  });

  it('returns the user public fields when email and password match', async () => {
    const result = await login(validUser.email, validUser.password);

    expect(result).toMatchObject({
      username: 'jane.doe',
      email: 'jane@example.com',
      preferences: { blockSensitivity: 'standard', strictMode: false },
    });
    expect(typeof result._id).toBe('string');
    expect(result).not.toHaveProperty('password');
  });

  it('throws the generic "Invalid email or password" when the password is wrong', async () => {
    await expect(
      login(validUser.email, 'WrongPass1!')
    ).rejects.toBe('Invalid email or password');
  });

  it('throws the same generic "Invalid email or password" when the email is unknown (no enumeration leak)', async () => {
    await expect(
      login('nobody@example.com', validUser.password)
    ).rejects.toBe('Invalid email or password');
  });
});

describe('updateUserSettings', () => {
  let userId;

  beforeEach(async () => {
    const u = await register(validUser.username, validUser.email, validUser.password);
    userId = u._id;
  });

  it('updates username, email, and preferences on the user doc without touching the password', async () => {
    const userCollection = await users();
    const before = await userCollection.findOne({ email: validUser.email });

    await updateUserSettings(userId, 'jane.doe', 'jane@example.com', 'strict', true);

    const after = await userCollection.findOne({ email: 'jane@example.com' });
    expect(after.username).toBe('jane.doe');
    expect(after.preferences).toEqual({ blockSensitivity: 'strict', strictMode: true });
    expect(after.password).toBe(before.password);
  });

  it('throws when the new username is taken by a different user', async () => {
    await register('someone.else', 'else@example.com', 'OtherPass1!');

    await expect(
      updateUserSettings(userId, 'someone.else', validUser.email, 'standard', false)
    ).rejects.toBe('Username is already taken');
  });

  it('throws when the new email is taken by a different user', async () => {
    await register('someone.else', 'else@example.com', 'OtherPass1!');

    await expect(
      updateUserSettings(userId, validUser.username, 'else@example.com', 'standard', false)
    ).rejects.toBe('Email is already registered');
  });

  it('throws when strictMode is not a boolean', async () => {
    await expect(
      updateUserSettings(userId, validUser.username, validUser.email, 'standard', 'yes')
    ).rejects.toBe('strictMode must be a boolean');
  });
});
