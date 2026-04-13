import redis from '../config/redisConnection.js';
import { Anthropic } from "@anthropic-ai/sdk";
import crypto from 'crypto';
import { validateURL, validatePageTitle, validatePageSnippet, validateSessionGoal } from "../validation.js";

const callClaude = async (url, pageTitle, pageSnippet, sessionGoal) => {
    const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    });

    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 100,
        system: `You are a focus assistant that decides whether a webpage is relevant to a user's stated goal.
        
        CRITICAL RULES:
        1. If the page contains content explicitly relevant to the goal, respond with ALLOW.
        2. If the page is a neutral gateway, search engine, or platform homepage (like google.com or the youtube.com homepage) that the user must navigate through to search for their target content, respond with ALLOW.
        3. If the page is explicitly distracting, off-topic, or irrelevant, respond with BLOCK.
        
        You must respond with ONLY a JSON object in this exact format, nothing else:
        {"decision": "ALLOW", "reason": "one sentence explanation"}
        or
        {"decision": "BLOCK", "reason": "one sentence explanation"}
        
        Do not include any other text, markdown, or explanation outside the JSON object.`,
        messages: [
          {
            role: 'user',
            content: `User's goal: ${sessionGoal}\n\nPage URL: ${url}\nPage title: ${pageTitle}\nPage content snippet: ${pageSnippet}\n\nIs this page relevant to the user's goal?`
          },
        ],
      });

      // Extract the text from Claude's response
      let text = response.content[0].text.trim();
      text = text.replace(/```json/gi, '').replace(/```/g, ''); // Remove any code block formatting if present
      
      // Parse the JSON response
      const parsed = JSON.parse(text);
      console.log('Claude response:', parsed);

      if (!parsed.decision || !['ALLOW', 'BLOCK'].includes(parsed.decision)) {
        throw 'Invalid decision format';
      }
      return parsed;
    } catch (error) {
        console.error('Classification API Error:', error);
        // If Claude returns something unexpected, default to ALLOW
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
    if (cached) {
        const parsed = JSON.parse(cached);
        console.log('Cached:', parsed);
        return parsed;
    }

    // Cache miss, proceed to classify the text
    const decision = await callClaude(url, pageTitle, pageSnippet, sessionGoal);
    await redis.set(cacheKey, JSON.stringify(decision), 'EX', 86400); // Cache for 24 hours
    
    return decision;
};


// Helper function to clear classification cache for a specific URL and session goal (called when user overrides a block)
export const clearClassificationCache = async (url, sessionGoal) => {
    const cacheKey = `classify:${crypto.createHash('md5').update(`${url}:${sessionGoal}`).digest('hex')}`;
    await redis.del(cacheKey);

    // Set the new cache value to ALLOW with reason "User override - cache cleared" so that the user can visit the same site again without getting blocked
    const newDecision = { decision: 'ALLOW', reason: 'User overrode this page\'s block' };
    await redis.set(cacheKey, JSON.stringify(newDecision), 'EX', 86400);
}