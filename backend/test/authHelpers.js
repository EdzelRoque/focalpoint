import jwt from 'jsonwebtoken';
import { register } from '../data/user.js';

export const registerAndSign = async (overrides = {}) => {
  const username = overrides.username || `user.${Math.random().toString(36).slice(2, 10)}`;
  const email = overrides.email || `${username.replace('.', '_')}@example.com`;
  const password = overrides.password || 'Sup3rSecret!';

  const user = await register(username, email, password);
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  return { user, token };
};
