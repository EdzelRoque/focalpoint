import { Router } from 'express';
import { classificationData } from '../data/index.js';
import authMiddleware from '../middleware/auth.js';
import { 
    validateURL, 
    validatePageTitle, 
    validatePageSnippet, 
    validateSessionGoal,
    validateBlockSensitivity 
} from '../validation.js';

const router = Router();

router.route('/classify')
    .post(authMiddleware, async (req, res) => {
      // Get sessionId from the URL parameters
      let userId = req.user.userId;
      let siteInfo = req.body;
      if (!siteInfo || Object.keys(siteInfo).length === 0)
        return res
          .status(400)
          .json({ error: 'You must provide site information' });

      // Validate input data
      let { url, pageTitle, pageSnippet, sessionGoal, blockSensitivity } = req.body;
      try {
        url = validateURL(url);
        pageTitle = validatePageTitle(pageTitle);
        pageSnippet = validatePageSnippet(pageSnippet);
        sessionGoal = validateSessionGoal(sessionGoal);
        blockSensitivity = validateBlockSensitivity(blockSensitivity);
      } catch (error) {
        return res.status(400).json({ error: error });
      }

      // Call the classify function from classificationData
      try {
        const result = await classificationData.classify(
          url,
          pageTitle,
          pageSnippet,
          sessionGoal,
          blockSensitivity
        );
        return res.json(result);
      } catch (error) {
        return res.status(500).json({ error: error });
      }
    });

export default router;