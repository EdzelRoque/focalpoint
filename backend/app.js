import 'dotenv/config';
import { createApp } from './createApp.js';

if (!process.env.JWT_SECRET || !process.env.ANTHROPIC_API_KEY || !process.env.MONGO_URI) {
    throw new Error('Missing required env vars: JWT_SECRET, ANTHROPIC_API_KEY, MONGO_URI');
}

// RATE_LIMIT_MAX is an env-gated escape hatch for automated test traffic
// (the extension journey suite drives real requests far above human rates).
// Unset in production, so the hardcoded per-route limits apply unchanged.
const app = createApp({
    limiterOverrides: process.env.RATE_LIMIT_MAX ? { max: Number(process.env.RATE_LIMIT_MAX) } : {},
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
