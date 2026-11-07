import express from 'express';
import cors from 'cors';
import configRoutes from './routes/index.js';
import corsOptions from './middleware/corsConfig.js';
import { createLimiters } from './middleware/limiters.js';

// Builds the full Express app (rate limits, CORS, JSON, routes) without
// listening, so tests exercise exactly the middleware stack production runs.
export const createApp = ({ limiterOverrides = {} } = {}) => {
    const app = express();

    const { global: globalLimiter, auth: authLimiter, classify: classifyLimiter } =
        createLimiters(limiterOverrides);
    app.use('/api/classify', classifyLimiter);
    app.use('/auth', authLimiter);
    app.use(globalLimiter);
    app.use(cors(corsOptions));
    app.use(express.json());

    configRoutes(app);
    return app;
};
