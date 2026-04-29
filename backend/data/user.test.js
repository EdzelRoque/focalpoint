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
