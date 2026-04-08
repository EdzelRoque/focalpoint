import 'dotenv/config';
import express from 'express';
import configRoutes from './routes/index.js';

const app = express();

app.use(express.json()); // allows us to get JSON data

configRoutes(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server is running!');
  console.log(`Routes running on http://localhost:${PORT}`);
});
