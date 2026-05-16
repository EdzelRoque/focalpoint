import express from 'express';
import configRoutes from '../routes/index.js';

export const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  configRoutes(app);
  return app;
};
