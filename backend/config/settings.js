//YOU WILL NEED TO CHANGE THE DB NAME TO MATCH THE REQUIRED DB NAME IN THE ASSIGNMENT SPECS!!!
export const mongoConfig = {
  serverUrl: process.env.MONGO_URI || 'mongodb://localhost:27017/',
  database: 'FocalPoint',
};