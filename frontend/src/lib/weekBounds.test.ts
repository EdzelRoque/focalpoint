import { describe, it, expect } from 'vitest';
import { getWeekBounds } from '@/lib/weekBounds';

describe('getWeekBounds', () => {
  it('returns Monday 00:00 local for a Wednesday input', () => {
    const wed = new Date(2026, 3, 22, 14, 30); // Wed Apr 22 2026 14:30 local
    const { start } = getWeekBounds(wed);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(3);
    expect(start.getDate()).toBe(20); // Mon Apr 20 2026
    expect(start.getDay()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('treats Sunday 23:59 as belonging to the current week (start = previous Monday)', () => {
    const sun = new Date(2026, 3, 26, 23, 59); // Sun Apr 26 2026 23:59 local
    const { start, end } = getWeekBounds(sun);
    expect(start.getDate()).toBe(20);
    expect(start.getDay()).toBe(1);
    expect(sun.getTime()).toBeLessThan(end.getTime());
    expect(sun.getTime()).toBeGreaterThanOrEqual(start.getTime());
  });

  it('is idempotent on Monday 00:00', () => {
    const mon = new Date(2026, 3, 20, 0, 0, 0, 0);
    const { start } = getWeekBounds(mon);
    expect(start.getTime()).toBe(mon.getTime());
  });

  it('end is exclusive next-Monday 00:00 local', () => {
    const wed = new Date(2026, 3, 22, 14, 30);
    const { start, end } = getWeekBounds(wed);
    expect(end.getDay()).toBe(1);
    expect(end.getHours()).toBe(0);
    expect(end.getMinutes()).toBe(0);
    expect(end.getDate()).toBe(27); // Mon Apr 27 2026
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('handles a DST spring-forward week without drifting off Monday 00:00', () => {
    // March 8 2026 is the US DST spring-forward Sunday; Wed of that week is Mar 11.
    const dstWed = new Date(2026, 2, 11, 12, 0);
    const { start, end } = getWeekBounds(dstWed);
    expect(start.getDay()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(9); // Mon Mar 9 2026
    expect(end.getDay()).toBe(1);
    expect(end.getHours()).toBe(0);
    expect(end.getDate()).toBe(16); // Mon Mar 16 2026
  });
});
