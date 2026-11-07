import redis from '../config/redisConnection.js';
import { Anthropic } from "@anthropic-ai/sdk";
import crypto from 'crypto';
import { effectiveSensitivity } from '../config/features.js';
import { 
  validateURL, 
  validatePageTitle, 
  validatePageSnippet, 
  validateSessionGoal,
  validateBlockSensitivity,
  validateId
 } from "../validation.js";

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Query strings and fragments can hold reset tokens and search terms, so they
// never go to Claude. The page title tells it which page this is.
const withoutQueryOrFragment = (url) => {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname;
};

// Exported for the opt-in live eval (evals/classify.eval.js); the app uses classify().
export const callClaude = async (url, pageTitle, pageSnippet, sessionGoal, blockSensitivity) => {
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

const keyHash = (url, sessionGoal, blockSensitivity) =>
    crypto.createHash('sha256').update(`${url}:${sessionGoal}:${blockSensitivity}`).digest('hex');

// Claude's decisions are shared by everyone with the same URL + goal +
// sensitivity (saves API calls). Overrides are personal: they live under a
// per-user key and never touch the shared entry, so one user's "Proceed
// anyway" can't unblock a page for anyone else.
const sharedKey = (url, sessionGoal, blockSensitivity) =>
    `classify:${keyHash(url, sessionGoal, blockSensitivity)}`;
const overrideKey = (userId, url, sessionGoal, blockSensitivity) =>
    `override:${userId}:${keyHash(url, sessionGoal, blockSensitivity)}`;

const DAY_SECONDS = 86400;

export const classify = async (userId, url, pageTitle, pageSnippet, sessionGoal, blockSensitivity) => {
    userId = validateId(userId);
    url = validateURL(url);
    pageTitle = validatePageTitle(pageTitle);
    pageSnippet = validatePageSnippet(pageSnippet);
    sessionGoal = validateSessionGoal(sessionGoal);
    blockSensitivity = effectiveSensitivity(validateBlockSensitivity(blockSensitivity));

    // This user's own override wins over everything
    const overridden = await redis.get(overrideKey(userId, url, sessionGoal, blockSensitivity));
    if (overridden) return JSON.parse(overridden);

    // Check Redis cache for existing classification result
    const cacheKey = sharedKey(url, sessionGoal, blockSensitivity);
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Cache miss, proceed to classify the text. Fail open on any error
    // (network, malformed JSON, etc.) but do NOT cache the fail-open result —
    // a transient failure shouldn't poison the cache for 24h.
    try {
        const decision = await callClaude(url, pageTitle, pageSnippet, sessionGoal, blockSensitivity);
        await redis.set(cacheKey, JSON.stringify(decision), 'EX', DAY_SECONDS);
        return decision;
    } catch (error) {
        // Only the type and status: a full error can carry request contents.
        console.error('Classification API Error:', error?.name ?? 'Unknown', error?.status ?? '');
        return { decision: 'ALLOW', reason: 'Classification error -- defaulting to allow' };
    }
};

// Called when a user overrides a block: allow this page for THIS user (same
// goal + sensitivity) for 24 hours.
export const recordOverride = async (userId, url, sessionGoal, blockSensitivity) => {
    userId = validateId(userId);
    url = validateURL(url);
    sessionGoal = validateSessionGoal(sessionGoal);
    blockSensitivity = effectiveSensitivity(validateBlockSensitivity(blockSensitivity));

    const decision = { decision: 'ALLOW', reason: "User overrode this page's block" };
    await redis.set(overrideKey(userId, url, sessionGoal, blockSensitivity), JSON.stringify(decision), 'EX', DAY_SECONDS);
};
