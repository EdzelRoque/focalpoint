import { Router } from 'express';
import { userData } from '../data/index.js';
import jwt from 'jsonwebtoken';
import { 
    validateUsername, 
    validateEmail, 
    validatePassword } from '../validation.js';

const router = Router();

router.route('/register')
    .post(async (req, res) => {
        // Get user information from the request body
        let userInfo = req.body;
        if (!userInfo || Object.keys(userInfo).length === 0) return res.status(400).json({ error: 'You must provide user information' });
        
        // Validate userInfo fields (username, email, password)
        let { username, email, password } = userInfo;
        try {
            username = validateUsername(username);
            email = validateEmail(email);
            password = validatePassword(password);
        } catch (error) {
            return res.status(400).json({ error: error });
        }

        // Call the register function from userData
        try {
            const newUser = await userData.register(username, email, password);
            return res.json(newUser);
        } catch (error) {
            if (error === 'Username is already taken' || error === 'Email is already registered') {
                return res.status(409).json({ error: error });
            }
            return res.status(500).json({ error: error });
        }
    });

router.route('/login')
    .post(async (req, res) => {
        // Get user information from the request body
        let userInfo = req.body;
        if (!userInfo || Object.keys(userInfo).length === 0) return res.status(400).json({ error: 'You must provide credentials' });

        // Validate userInfo fields (email, password)
        let { email, password } = userInfo;
        try {
            email = validateEmail(email);
            if (!password || typeof password !== 'string' || password.trim().length === 0) throw 'Invalid email or password';
            password = password.trim();
        } catch (error) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }
        
        // Call the login function from userData
        try {
            const user = await userData.login(email, password);
            
            // Generate a JWT token for the authenticated user
            const token = jwt.sign(
                { userId: user._id },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json({ token });
        } catch (error) {
            return res.status(401).json({ error: error });
        }
    });

export default router;
