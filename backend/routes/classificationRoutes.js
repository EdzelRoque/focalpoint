import { Router } from 'express';
import { classificationData } from '../data/index.js';
import authMiddleware from '../middleware/auth.js';
import { validateURL, validatePageTitle, validatePageSnippet, validateSessionGoal } from '../validation.js';

const router = Router();

router.route('/classify')
    .post(authMiddleware, async (req, res) => { 
        const { url, pageTitle, pageSnippet, sessionGoal } = req.body;

        // Validate input data
        try {
            validateURL(url);
            validatePageTitle(pageTitle);
            validatePageSnippet(pageSnippet);
            validateSessionGoal(sessionGoal);
        } catch (error) {
            return res.status(400).json({ error: error });
        }
        
        // Call the classify function from classificationData
        try {
            const result = await classificationData.classify(url, pageTitle, pageSnippet, sessionGoal);
            return res.json(result);
        } catch (error) {
            return res.status(500).json({ error: error });
        }
    });

export default router;