// Runs once per `vitest run`: one in-memory MongoDB shared by all test files
// (files run serially, see vitest.config.js; each test clears the DB).
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;

export async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
}

export async function teardown() {
  if (mongod) await mongod.stop();
}
