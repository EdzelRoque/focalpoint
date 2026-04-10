export const mongoConfig = {
  serverUrl: process.env.MONGO_URI || 'mongodb://localhost:27017/',
  database: 'FocalPoint',
};