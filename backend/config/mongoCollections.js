import { dbConnection } from './mongoConnection.js';

const getCollectionFn = (collection) => async () => {
  const db = await dbConnection();
  return db.collection(collection);
};

export const users = getCollectionFn('users');
export const sessions = getCollectionFn('sessions');
