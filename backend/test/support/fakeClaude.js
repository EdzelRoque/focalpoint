// A stand-in for api.anthropic.com. The backend's real Anthropic SDK talks to
// it over HTTP (via ANTHROPIC_BASE_URL), so tests see the exact request the
// app would send to Claude and can script any reply, including failures.
import { createServer } from 'node:http';

const requests = [];
let replies = [];

const messageBody = (text) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-4-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  requests.push({ method: req.method, path: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });

  const reply = replies.length > 0 ? replies.shift() : { decision: 'ALLOW', reason: 'default fake reply' };
  if (reply.status) {
    res.writeHead(reply.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'scripted failure' } }));
    return;
  }
  const text = reply.rawText ?? JSON.stringify(reply);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(messageBody(text)));
});

export const startFakeClaude = () =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));

export const fakeClaude = {
  /** Queue replies: {decision, reason} | {rawText: '...'} | {status: 400} */
  reply: (...next) => { replies.push(...next); },
  requests: () => requests,
  /** The user-message text of the Nth request (default: last). */
  promptText: (n = requests.length - 1) => requests[n]?.body?.messages?.[0]?.content,
  systemText: (n = requests.length - 1) => requests[n]?.body?.system,
  reset: () => { requests.length = 0; replies = []; },
};
