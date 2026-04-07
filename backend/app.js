import express from 'express';
import session from 'express-session';
import configRoutes from './routes/index.js';
import jwt from 'jsonwebtoken';

const app = express();

app.use(express.json()); // allows us to get JSON data

app.use(
  session({
    name: 'AuthenticationState',
    secret: 'some secret string!',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 },
  }),
);

configRoutes(app);

app.listen(3000, () => {
  console.log("We've now got a server!");
  console.log('Your routes will be running on http://localhost:3000');
});