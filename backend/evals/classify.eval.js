// OPT-IN live eval: asks the REAL Claude about clear-cut student scenarios to
// catch prompt regressions. Costs a little API money per run; never runs in CI.
//
//   ANTHROPIC_API_KEY=sk-ant-... npm run eval     (or put the key in backend/.env)
//
// Pass bar:
//   - every on-topic / gateway case must be ALLOWed (blocking on-topic is a "never happen")
//   - at least 80% of the distraction cases must be BLOCKed
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { cases } from './cases.js';

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasKey)('live classification eval (real Claude, standard rules)', () => {
  it('never blocks on-topic pages and blocks most clear distractions', async () => {
    const { callClaude } = await import('../data/classification.js');
    const results = [];
    for (const c of cases) {
      let decision;
      try {
        decision = (await callClaude(c.url, c.title, c.snippet, c.goal, 'standard')).decision;
      } catch (e) {
        decision = `ERROR (${e?.name ?? e})`;
      }
      results.push({ ...c, got: decision });
    }

    const wrong = results.filter((r) => r.got !== r.expect);
    console.table(results.map((r) => ({ expect: r.expect, got: r.got, title: r.title.slice(0, 60) })));

    const wronglyBlocked = wrong.filter((r) => r.expect === 'ALLOW');
    expect(wronglyBlocked.map((r) => r.title), 'on-topic pages were blocked').toEqual([]);

    const distractions = results.filter((r) => r.expect === 'BLOCK');
    const caught = distractions.filter((r) => r.got === 'BLOCK').length;
    expect(caught / distractions.length, 'share of distractions blocked').toBeGreaterThanOrEqual(0.8);
  }, 120_000);
});
