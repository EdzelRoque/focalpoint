// Pure helpers: popup input checks, the elapsed timer format, session expiry.
import { describe, it, expect, beforeAll } from 'vitest';

let popup, sessions;
beforeAll(async () => {
  await import('../../lib/popup-helpers.js');
  await import('../../lib/session-helpers.js');
  popup = globalThis.fpPopupHelpers;
  sessions = globalThis.fpSessionHelpers;
});

describe('formatElapsed', () => {
  it.each([
    [0, '00:00'],
    [59, '00:59'],
    [61, '01:01'],
    [3599, '59:59'],
    [3600, '01:00:00'],
    [8 * 3600 + 5, '08:00:05'],
    [-5, '00:00'],
    [NaN, '00:00'],
    [12.9, '00:12'],
  ])('%s seconds -> %s', (input, out) => {
    expect(popup.formatElapsed(input)).toBe(out);
  });
});

describe('validateLoginFields', () => {
  it('requires both fields (whitespace counts as empty)', () => {
    expect(popup.validateLoginFields('', 'pw').valid).toBe(false);
    expect(popup.validateLoginFields('a@b.co', '   ').valid).toBe(false);
    expect(popup.validateLoginFields('a@b.co', 'pw')).toEqual({ valid: true });
  });
});

describe('validateSessionInput', () => {
  it('requires a goal and trims it', () => {
    expect(popup.validateSessionInput('   ', '').valid).toBe(false);
    expect(popup.validateSessionInput('  Study chem  ', '')).toEqual({ valid: true, goal: 'Study chem', duration: null });
  });

  it.each([
    ['1', 1],
    ['480', 480],
    [' 60 ', 60],
  ])('accepts duration %j as %i minutes', (input, minutes) => {
    expect(popup.validateSessionInput('Study chem', input)).toMatchObject({ valid: true, duration: minutes });
  });

  it.each(['0', '481', '2.5', '1e2', '-5', 'abc', '60min'])('rejects duration %j (whole minutes 1 to 480 only)', (input) => {
    expect(popup.validateSessionInput('Study chem', input).valid).toBe(false);
  });
});

describe('session expiry', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');

  it('a timed session is expired at and after its end time, not before', () => {
    expect(sessions.isSessionExpired({ expectedEndTime: '2026-11-07T12:00:01Z' }, now)).toBe(false);
    expect(sessions.isSessionExpired({ expectedEndTime: '2026-11-07T12:00:00Z' }, now)).toBe(true);
    expect(sessions.isSessionExpired({ expectedEndTime: '2026-11-07T11:00:00Z' }, now)).toBe(true);
  });

  it('an open-ended session never expires; no session is not expired', () => {
    expect(sessions.isSessionExpired({ expectedEndTime: null }, now)).toBe(false);
    expect(sessions.isSessionExpired(null, now)).toBe(false);
  });

  it('finds the active session in a session list', () => {
    const list = [{ _id: 'a', isActive: false }, { _id: 'b', isActive: true }];
    expect(sessions.findActiveSession(list)).toEqual({ _id: 'b', isActive: true });
    expect(sessions.findActiveSession([{ _id: 'a', isActive: false }])).toBeNull();
    expect(sessions.findActiveSession(undefined)).toBeNull();
  });
});
