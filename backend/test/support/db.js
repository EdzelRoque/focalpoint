import { ObjectId } from 'mongodb';
import { users, sessions } from '../../config/mongoCollections.js';

export const clearDb = async () => {
  const [u, s] = await Promise.all([users(), sessions()]);
  await Promise.all([u.deleteMany({}), s.deleteMany({})]);
};

export const rawSession = async (id) => (await sessions()).findOne({ _id: new ObjectId(id) });
export const rawUser = async (email) => (await users()).findOne({ email });

/** Move a session's clock: make it look like it started `minutesAgo` minutes ago. */
export const backdateSession = async (id, minutesAgo) => {
  const s = await rawSession(id);
  const shift = minutesAgo * 60_000;
  const startTime = new Date(Date.now() - shift);
  const expectedEndTime = s.expectedEndTime
    ? new Date(startTime.getTime() + (s.expectedEndTime - s.startTime))
    : null;
  await (await sessions()).updateOne({ _id: s._id }, { $set: { startTime, expectedEndTime } });
};

/** Simulate an account that saved an unreleased sensitivity before it was locked. */
export const setStoredPreferences = async (email, preferences) =>
  (await users()).updateOne({ email }, { $set: { preferences } });
