import redis from '../config/redisConnection.js';
import { Anthropic } from "@anthropic-ai/sdk";
import crypto from 'crypto';
import { validateURL, validatePageTitle, validatePageSnippet, validateSessionGoal } from "../validation.js";

const callClaude = async (url, pageTitle, pageSnippet, sessionGoal) => {
    const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    });

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      system: `You are a focus assistant that decides whether a webpage is relevant to a user's stated goal.
    You must respond with ONLY a JSON object in this exact format, nothing else:
    {"decision": "ALLOW", "reason": "one sentence explanation"}
    or
    {"decision": "BLOCK", "reason": "one sentence explanation"}
    Do not include any other text, markdown, or explanation outside the JSON object.`,
      messages: [
        {
          role: 'user',
          content: `User's goal: ${sessionGoal}

    Page URL: ${url}
    Page title: ${pageTitle}
    Page content snippet: ${pageSnippet}

    Is this page relevant to the user's goal?`,
        },
      ],
    });

    // Extract the text from Claude's response
    const text = response.content[0].text.trim();

    // Parse the JSON response
    try {
        const parsed = JSON.parse(text);
        if (!parsed.decision || !['ALLOW', 'BLOCK'].includes(parsed.decision)) {
            throw 'Invalid decision format';
        }
        return parsed;
    } catch (error) {
        // If Claude returns something unexpected, default to ALLOW
        // so we never incorrectly block a legimate page
        return { decision: 'ALLOW', reason: 'Classification error -- defaulting to allow' };
    }
    

};

export const classify = async (url, pageTitle, pageSnippet, sessionGoal) => {
    // Validate url, pageTitle, pageSnippet, and sessionGoal
    url = validateURL(url);
    pageTitle = validatePageTitle(pageTitle);
    pageSnippet = validatePageSnippet(pageSnippet);
    sessionGoal = validateSessionGoal(sessionGoal);

    // Check Redis cache for existing classification result
    const cacheKey = `classify:${crypto.createHash('md5').update(`${url}:${sessionGoal}`).digest('hex')}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Cache miss, proceed to classify the text
    const decision = await callClaude(url, pageTitle, pageSnippet, sessionGoal);

    await redis.set(cacheKey, JSON.stringify(decision), 'EX', 86400); // Cache for 24 hours
    return decision;
};