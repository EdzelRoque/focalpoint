import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';

const usersCollection = {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
};

vi.mock('../config/mongoCollections.js', () => ({
    users: vi.fn(async () => usersCollection),
}));

const { register, login, updateUserSettings } = await import('./user.js');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('#1.1 — register stores password as a bcrypt hash, never plaintext', () => {
    it('hashes the password before insert and never returns it to the caller', async () => {
        usersCollection.findOne.mockResolvedValue(null);

        let captured;
        usersCollection.insertOne.mockImplementation(async (doc) => {
            captured = doc;
            return { acknowledged: true, insertedId: new ObjectId() };
        });

        const plaintext = 'P@ssw0rd!';
        const result = await register('alice', 'alice@example.com', plaintext);

        expect(captured).toBeDefined();
        expect(captured.password).not.toBe(plaintext);
        expect(captured.password.startsWith('$2')).toBe(true);
        expect(await bcrypt.compare(plaintext, captured.password)).toBe(true);

        expect(result).not.toHaveProperty('password');
    });
});

describe('#1.5 — login fails uniformly for unknown email vs wrong password (no enumeration)', () => {
    let realHash;

    beforeEach(async () => {
        if (!realHash) realHash = await bcrypt.hash('Real!1Pass', 4);
    });

    it('throws "Invalid email or password" when the email is not in the database', async () => {
        usersCollection.findOne.mockResolvedValue(null);

        await expect(login('ghost@example.com', 'AnyPass!1')).rejects.toBe('Invalid email or password');
    });

    it('throws "Invalid email or password" when the email exists but the password is wrong', async () => {
        usersCollection.findOne.mockResolvedValue({
            _id: new ObjectId(),
            username: 'alice',
            email: 'alice@example.com',
            password: realHash,
            preferences: { blockSensitivity: 'standard', strictMode: false },
        });

        await expect(login('alice@example.com', 'Wrong!1Pass')).rejects.toBe('Invalid email or password');
    });
});

describe('#1.2 — register throws specific strings on duplicates', () => {
    it('throws "Username is already taken" when the username already exists', async () => {
        usersCollection.findOne.mockImplementation(async (query) => {
            if (query.username) {
                return { _id: new ObjectId(), username: query.username };
            }
            return null;
        });

        await expect(register('alice', 'alice@example.com', 'P@ssw0rd!')).rejects.toBe('Username is already taken');
    });

    it('throws "Email is already registered" when the email already exists but the username is free', async () => {
        usersCollection.findOne.mockImplementation(async (query) => {
            if (query.email) {
                return { _id: new ObjectId(), email: query.email };
            }
            return null;
        });

        await expect(register('alice', 'alice@example.com', 'P@ssw0rd!')).rejects.toBe('Email is already registered');
    });
});

describe('#1.3 — register applies default preferences to new users', () => {
    it('inserts and returns preferences { blockSensitivity: "standard", strictMode: false }', async () => {
        usersCollection.findOne.mockResolvedValue(null);

        let captured;
        usersCollection.insertOne.mockImplementation(async (doc) => {
            captured = doc;
            return { acknowledged: true, insertedId: new ObjectId() };
        });

        const result = await register('alice', 'alice@example.com', 'P@ssw0rd!');

        expect(captured.preferences).toEqual({ blockSensitivity: 'standard', strictMode: false });
        expect(result.preferences).toEqual({ blockSensitivity: 'standard', strictMode: false });
        // 1.12 root cause: stored email is lowercased so login's lowercase lookup hits.
        expect(captured.email).toBe(captured.email.toLowerCase());
    });
});

describe('#1.10 — updateUserSettings excludes self via $ne when checking uniqueness', () => {
    it('does not throw when User A resubmits their own current username and email', async () => {
        const USER_A_ID = new ObjectId();
        const userA = { _id: USER_A_ID, username: 'alice', email: 'alice@example.com' };

        // Smart mock simulating Mongo's $ne semantics: returns the matching record
        // ONLY when its _id does NOT equal the value passed in $ne. If $ne points at
        // the same user (i.e. self-exclusion is correctly applied), findOne returns null.
        usersCollection.findOne.mockImplementation(async (query) => {
            const matchesUsername = query.username === userA.username;
            const matchesEmail = query.email === userA.email;
            if (!matchesUsername && !matchesEmail) return null;

            const ne = query._id?.$ne;
            if (ne && ne.toHexString() === USER_A_ID.toHexString()) return null;
            return userA;
        });
        usersCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });

        await expect(
            updateUserSettings(USER_A_ID.toHexString(), 'alice', 'alice@example.com', 'standard', false)
        ).resolves.toBeDefined();
    });

    it('throws "Username is already taken" when a different user already holds it', async () => {
        const USER_A_ID = new ObjectId();
        const SOME_OTHER_USER_ID = new ObjectId();

        usersCollection.findOne.mockImplementation(async (query) => {
            if (query.username === 'taken-name') {
                return { _id: SOME_OTHER_USER_ID, username: 'taken-name' };
            }
            return null;
        });

        await expect(
            updateUserSettings(USER_A_ID.toHexString(), 'taken-name', 'alice@example.com', 'standard', false)
        ).rejects.toBe('Username is already taken');
    });
});

describe('#1.12 — login looks up the user by lowercased email (case-insensitive)', () => {
    it('finds the stored record when called with mixed-case email', async () => {
        const realHash = await bcrypt.hash('P@ssw0rd!', 4);
        const STORED_EMAIL = 'foo@example.com';

        // Smart mock: returns the user only when the query email is lowercased.
        // If anywhere in the chain (validateEmail → findOne) drops the lowercase,
        // findOne returns null → login throws "Invalid email or password" → test fails.
        usersCollection.findOne.mockImplementation(async (query) => {
            if (query.email === STORED_EMAIL) {
                return {
                    _id: new ObjectId(),
                    username: 'foo',
                    email: STORED_EMAIL,
                    password: realHash,
                    preferences: { blockSensitivity: 'standard', strictMode: false },
                };
            }
            return null;
        });

        const result = await login('Foo@Example.COM', 'P@ssw0rd!');

        expect(result.email).toBe(STORED_EMAIL);
    });
});

describe('#1.11 — updateUserSettings writes only username, email, and preferences (no mass assignment)', () => {
    it('writes a $set with exactly username/email/preferences and never includes password', async () => {
        const userId = new ObjectId().toHexString();

        usersCollection.findOne.mockResolvedValue(null);
        usersCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });

        await updateUserSettings(userId, 'aliceNew', 'alice@example.com', 'strict', true);

        expect(usersCollection.updateOne).toHaveBeenCalledTimes(1);
        const [filter, update] = usersCollection.updateOne.mock.calls[0];

        expect(filter._id.toHexString()).toBe(userId);

        expect(Object.keys(update)).toEqual(['$set']);
        expect(Object.keys(update.$set).sort()).toEqual(['email', 'preferences', 'username']);
        expect(Object.keys(update.$set.preferences).sort()).toEqual(['blockSensitivity', 'strictMode']);

        expect(JSON.stringify(update)).not.toMatch(/password/i);
    });
});
