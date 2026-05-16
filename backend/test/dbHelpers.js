import { users, sessions } from '../config/mongoCollections.js';

export const clearDb = async () => {
  const [u, s] = await Promise.all([users(), sessions()]);
  await Promise.all([u.deleteMany({}), s.deleteMany({})]);
};
