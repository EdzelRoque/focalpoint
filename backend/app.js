import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import configRoutes from './routes/index.js';
import corsOptions from './middleware/corsConfig.js';
import { createLimiters } from './middleware/limiters.js';

if (!process.env.JWT_SECRET || !process.env.ANTHROPIC_API_KEY || !process.env.MONGO_URI) {
    throw new Error('Missing required env vars: JWT_SECRET, ANTHROPIC_API_KEY, MONGO_URI');
}

const app = express();

const { global: globalLimiter, auth: authLimiter, classify: classifyLimiter } = createLimiters();
app.use('/api/classify', classifyLimiter);
app.use('/auth', authLimiter);
app.use(globalLimiter);
app.use(cors(corsOptions));
app.use(express.json());

configRoutes(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
