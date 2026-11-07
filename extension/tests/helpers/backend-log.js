// global-setup.js records every /api/classify response to a file, which gives
// journeys "did classification actually run?" observability from real network
// traffic, with no test-only code in the backend. Tests seed a distinctive
// reason per journey and grep for it here.

import fs from 'node:fs';

export const backendLog = () =>
  fs.readFileSync(process.env.FP_BACKEND_LOG, 'utf8');

export const waitForBackendLog = async (needle, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (backendLog().includes(needle)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Backend log never contained ${JSON.stringify(needle)} within ${timeoutMs}ms`);
};
