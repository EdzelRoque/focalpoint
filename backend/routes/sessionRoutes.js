import { Router } from 'express';
import { sessionData } from '../data/index.js';
import authMiddleware from '../middleware/auth.js';
import {
    validateId,
    validateSessionGoal,
    validateTimeDuration
} from '../validation.js';

const router = Router();

router.route('/sessions')
    .get(authMiddleware, async (req, res) => {
        // Get userId from the authenticated user
        let userId = req.user.userId;

        // Validate userId
        try {
            userId = validateId(userId);
        } catch (error) {
            return res.status(400).json({ error: error });
        }

        // Call the getSessionsByUserId function from sessionData
        try {
            const sessions = await sessionData.getSessionsByUserId(userId);
            return res.json(sessions);
        } catch (error) {
            return res.status(500).json({ error: error });
        }
    })
    .post(authMiddleware, async (req, res) => {
        // Get userId from the authenticated user and session information from the request body
        let userId = req.user.userId;
        let sessionInfo = req.body;
        if (!sessionInfo || Object.keys(sessionInfo).length === 0) return res.status(400).json({ error: 'You must provide session information' });

        // Validate userId, sessionGoal, and durationInMinutes
        let { sessionGoal, durationInMinutes } = sessionInfo;
        try {
            userId = validateId(userId);
            sessionGoal = validateSessionGoal(sessionGoal);
            if (durationInMinutes) {
                durationInMinutes = validateTimeDuration(durationInMinutes);
            }
        } catch (error) {
            return res.status(400).json({ error: error });
        }

        // Call the createSession function from sessionData
        try {
            const newSession = await sessionData.createSession(userId, sessionGoal, durationInMinutes);
            return res.json(newSession);
        } catch (error) {
            return res.status(500).json({ error: error });
        }
    });

router.route('/sessions/:id')
    .get(authMiddleware, async (req, res) => {
        // Get userId from the authenticated user and sessionId from the URL parameters
        let userId = req.user.userId;
        let sessionId = req.params.id;

        // Validate userId and sessionId
        try {
            userId = validateId(userId);
            sessionId = validateId(sessionId);
        } catch (error) {
            return res.status(400).json({ error: error });
        }

        // Call the getSessionById function from sessionData
        try {
            let session = await sessionData.getSessionById(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }
            return res.json(session);
        } catch (error) {
            return res.status(500).json({ error: error });
        }
    })
    .put(authMiddleware, async (req, res) => {
        // Get sessionId from the URL parameters
        let userId = req.user.userId;
        let sessionId = req.params.id;

        // Validate userId and sessionId
        try {
            userId = validateId(userId);
            sessionId = validateId(sessionId);
        } catch (error) {
            return res.status(400).json({ error: error });
        }

        // Call the endSession function from sessionData
        try {
            const updatedSession = await sessionData.endSession(sessionId);
            return res.json(updatedSession);
        } catch (error) {
            return res.status(500).json({ error: error });
        }
    });

router.route('/sessions/:id/block')
    .post(authMiddleware, async (req, res) => {
        // Get sessionId from the URL parameters
        let userId = req.user.userId;
        let sessionId = req.params.id;

        // Validate userId and sessionId
        try {
            userId = validateId(userId);
            sessionId = validateId(sessionId);
        } catch (error) {
            return res.status(400).json({ error: error });
        }

        // Call the incrementBlockCount function from sessionData
        try {
            const updatedSession = await sessionData.incrementBlockCount(sessionId);
            return res.json(updatedSession);
        } catch (error) {
            return res.status(500).json({ error: error });
        }
    });

router.route('/sessions/:id/override')
    .post(authMiddleware, async (req, res) => {
        // Get sessionId from the URL parameters
        let userId = req.user.userId;
        let sessionId = req.params.id;

        // Validate userId and sessionId
        try {
            userId = validateId(userId);
            sessionId = validateId(sessionId);
        } catch (error) {
            return res.status(400).json({ error: error });
        }

        // Call the incrementOverrideCount function from sessionData
        try {
            const updatedSession = await sessionData.incrementOverrideCount(sessionId);
            return res.json(updatedSession);
        } catch (error) {
            return res.status(500).json({ error: error });
        }
    });

export default router;