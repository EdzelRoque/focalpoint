import { describe, it, expect } from 'vitest';
import './popup-helpers.js';

const { formatElapsed, validateLoginFields, validateSessionInput } =
  globalThis.fpPopupHelpers;

describe('formatElapsed', () => {
  it('formats seconds under an hour as MM:SS', () => {
    expect(formatElapsed(125)).toBe('02:05');
  });

  it('stays in MM:SS at the last second before the hour', () => {
    expect(formatElapsed(3599)).toBe('59:59');
  });

  it('switches to HH:MM:SS at exactly one hour', () => {
    expect(formatElapsed(3600)).toBe('01:00:00');
  });

  it('lets the hours field grow past two digits without wrapping', () => {
    expect(formatElapsed(90000)).toBe('25:00:00');
  });

  it('clamps negative elapsed to 00:00', () => {
    expect(formatElapsed(-5)).toBe('00:00');
  });

  it('clamps NaN elapsed to 00:00', () => {
    expect(formatElapsed(NaN)).toBe('00:00');
  });
});

describe('validateLoginFields', () => {
  it('accepts a non-empty email and password', () => {
    expect(validateLoginFields('a@b.com', 'hunter22')).toEqual({
      valid: true,
    });
  });

  it('rejects a whitespace-only password', () => {
    expect(validateLoginFields('a@b.com', '   ')).toEqual({
      valid: false,
      error: 'Please fill in all fields.',
    });
  });

  it('rejects when both fields are empty', () => {
    expect(validateLoginFields('', '')).toEqual({
      valid: false,
      error: 'Please fill in all fields.',
    });
  });
});

describe('validateSessionInput', () => {
  it('accepts a goal with a numeric duration', () => {
    expect(validateSessionInput('write essay', '25')).toEqual({
      valid: true,
      goal: 'write essay',
      duration: 25,
    });
  });

  it('treats an empty duration as optional (null)', () => {
    expect(validateSessionInput('write essay', '')).toEqual({
      valid: true,
      goal: 'write essay',
      duration: null,
    });
  });

  it('accepts the inclusive bounds 1 and 480', () => {
    expect(validateSessionInput('write essay', '1').valid).toBe(true);
    expect(validateSessionInput('write essay', '480').valid).toBe(true);
  });

  it('rejects durations outside 1-480', () => {
    expect(validateSessionInput('write essay', '0').valid).toBe(false);
    expect(validateSessionInput('write essay', '481').valid).toBe(false);
  });

  it('rejects a whitespace-only goal', () => {
    expect(validateSessionInput('   ', '25')).toEqual({
      valid: false,
      error: 'Please enter a goal for your focus session.',
    });
  });

  it('rejects non-digit durations like exponent and decimal notation', () => {
    expect(validateSessionInput('write essay', '1e2').valid).toBe(false);
    expect(validateSessionInput('write essay', '2.5').valid).toBe(false);
  });
});
