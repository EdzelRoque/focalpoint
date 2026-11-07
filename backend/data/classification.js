import redis from '../config/redisConnection.js';
import { Anthropic } from "@anthropic-ai/sdk";
import crypto from 'crypto';
import { 
  validateURL, 
  validatePageTitle, 
  validatePageSnippet, 
  validateSessionGoal,
  validateBlockSensitivity
 } from "../validation.js";

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Query strings and fragments can hold reset tokens, session IDs, and search
// terms, so they never go to Claude. The title identifies the page instead.
const withoutQueryOrFragment = (url) => {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
};

// Clients that remove the query string send many pages as one URL (every
// YouTube video is /watch), so the title has to be part of their cache key.
// Older clients send the full URL and keep the original key.
const cacheKeyFor = (url, sessionGoal, blockSensitivity, pageTitle) => {
    const parts = [url, sessionGoal, blockSensitivity];
    if (pageTitle !== undefined) parts.push(pageTitle);
    return `classify:${crypto.createHash('sha256').update(parts.join(':')).digest('hex')}`;
};

const callClaude = async (url, pageTitle, pageSnippet, sessionGoal, blockSensitivity) => {
    let sensitivityInstructions = '';

    switch (blockSensitivity) {
      case 'lenient':
        sensitivityInstructions = `
          - Mode: LENIENT
          - Rule 1: Allow broad exploration. If the content is even remotely related, tangentially helpful, or adjacent to the goal, respond with ALLOW.
          - Rule 2: All neutral gateways, search engines, and platform homepages are ALLOWED.
          - Rule 3: Only respond with BLOCK for explicit, unambiguous time-wasters (e.g., gaming, unrelated entertainment, shopping) that have absolutely zero connection to the goal.
        `;
        break;
      case 'strict':
        sensitivityInstructions = `
          - Mode: STRICT
          - Rule 1: If the page contains content explicitly relevant to the goal, respond with ALLOW.
          - Rule 2: If the page is a neutral gateway, search engine, or platform homepage (like google.com or the youtube.com homepage) that the user must navigate through to search for their target content, respond with ALLOW.
          - Rule 3: If the page is explicitly distracting, off-topic, or irrelevant, respond with BLOCK.
        `;
        break;
      default: // "standard"
        sensitivityInstructions = `
          - Mode: STANDARD
          - Rule 1: If the page contains content directly relevant or moderately helpful to the stated goal, respond with ALLOW.
          - Rule 2: Neutral gateways or search engines (like google.com) and platform homepages (like youtube.com) are ALLOWED.
          - Rule 3: If the page is explicitly distracting, off-topic, or wanders too far from the core goal, respond with BLOCK.
        `;
    }

      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 100,
        system: `You are a focus assistant that decides whether a webpage is relevant to a user's stated goal.
        
        CRITICAL RULES:
        ${sensitivityInstructions}
        
        You must respond with ONLY a JSON object in this exact format, nothing else:
        {"decision": "ALLOW", "reason": "one sentence explanation"}
        or
        {"decision": "BLOCK", "reason": "one sentence explanation"}
        
        Do not include any other text, markdown, or explanation outside the JSON object.`,
        messages: [
          {
            role: 'user',
            content: `User's goal: ${sessionGoal}\n\nPage URL: ${withoutQueryOrFragment(url)}\nPage title: ${pageTitle}\nPage content snippet: ${pageSnippet}\n\nIs this page relevant to the user's goal?`,
          },
        ],
      });

      // Extract the text from Claude's response
      let text = response.content[0].text.trim();
      text = text.replace(/```json/gi, '').replace(/```/g, ''); // Remove any code block formatting if present
      
      // Parse the JSON response
      const parsed = JSON.parse(text);

      if (!parsed.decision || !['ALLOW', 'BLOCK'].includes(parsed.decision)) {
        throw 'Invalid decision format';
      }
      return parsed;
};

export const classify = async (url, pageTitle, pageSnippet, sessionGoal, blockSensitivity, { urlStripped = false } = {}) => {
    // Validate url, pageTitle, pageSnippet, sessionGoal, blockSensitivity
    url = validateURL(url);
    pageTitle = validatePageTitle(pageTitle);
    pageSnippet = validatePageSnippet(pageSnippet);
    sessionGoal = validateSessionGoal(sessionGoal);
    blockSensitivity = validateBlockSensitivity(blockSensitivity);

    // Check Redis cache for existing classification result
    const cacheKey = cacheKeyFor(url, sessionGoal, blockSensitivity, urlStripped ? pageTitle : undefined);
    const cached = await redis.get(cacheKey);
    if (cached) {
        const parsed = JSON.parse(cached);
        return parsed;
    }

    // Cache miss, proceed to classify the text. Fail open on any error
    // (network, malformed JSON, etc.) but do NOT cache the fail-open result —
    // a transient failure shouldn't poison the cache for 24h.
    try {
        const decision = await callClaude(url, pageTitle, pageSnippet, sessionGoal, blockSensitivity);
        await redis.set(cacheKey, JSON.stringify(decision), 'EX', 86400); // Cache for 24 hours
        return decision;
    } catch (error) {
        // Only the failure type: a full error can carry request contents.
        console.error('Classification API Error:', error?.name ?? 'Unknown', error?.status ?? '');
        return { decision: 'ALLOW', reason: 'Classification error -- defaulting to allow' };
    }
};


// Helper function to clear classification cache for a specific URL and session goal (called when user overrides a block)
export const clearClassificationCache = async (url, sessionGoal, blockSensitivity, { pageTitle } = {}) => {
    url = validateURL(url);
    sessionGoal = validateSessionGoal(sessionGoal);
    blockSensitivity = validateBlockSensitivity(blockSensitivity);

    if (pageTitle !== undefined) pageTitle = validatePageTitle(pageTitle);

    const cacheKey = cacheKeyFor(url, sessionGoal, blockSensitivity, pageTitle);
    await redis.del(cacheKey);

    // Set the new cache value to ALLOW with reason "User override - cache cleared" so that the user can visit the same site again without getting blocked
    const newDecision = { decision: 'ALLOW', reason: 'User overrode this page\'s block' };
    await redis.set(cacheKey, JSON.stringify(newDecision), 'EX', 86400);
}