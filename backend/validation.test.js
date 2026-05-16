import { describe, it, expect } from 'vitest';
import {
  validateUsername,
  validateEmail,
  validatePassword,
  validateId,
  validateTimeDuration,
  validateSessionGoal,
  validateURL,
  validatePageTitle,
  validatePageSnippet,
  validateBlockSensitivity,
} from './validation.js';

describe('validateUsername', () => {
  it('returns the trimmed username when valid', () => {
    expect(validateUsername('  jane.doe  ')).toBe('jane.doe');
  });

  it('accepts letters, digits, periods, and underscores', () => {
    expect(validateUsername('alice_99.x')).toBe('alice_99.x');
  });

  it('accepts a 25-character username at the max boundary', () => {
    const name = 'a'.repeat(25);
    expect(validateUsername(name)).toBe(name);
  });

  it('throws when the username is shorter than 3 characters', () => {
    expect(() => validateUsername('ab')).toThrow('Username must be at least 3 characters long');
  });

  it('throws when the username exceeds 25 characters', () => {
    expect(() => validateUsername('a'.repeat(26))).toThrow('Username must be at most 25 characters long');
  });

  it('throws when the username contains a disallowed character', () => {
    expect(() => validateUsername('hi there')).toThrow('Username can only contain letters, numbers, periods, and underscores');
  });
});

describe('validateEmail', () => {
  it('lowercases and returns a valid email', () => {
    expect(validateEmail('Foo@Bar.com')).toBe('foo@bar.com');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateEmail('  user@example.co.uk  ')).toBe('user@example.co.uk');
  });

  it('accepts loosely-shaped emails like "a@b.c" (locked permissive behavior)', () => {
    expect(validateEmail('a@b.c')).toBe('a@b.c');
  });

  it('throws when the value has no "@" symbol', () => {
    expect(() => validateEmail('notanemail')).toThrow('Invalid email format');
  });

  it('throws the helper message when given an empty string', () => {
    expect(() => validateEmail('')).toThrow('You must provide a(n) Email');
  });
});

describe('validatePassword', () => {
  it('returns the password when it meets every rule', () => {
    expect(validatePassword('Abcdef1!')).toBe('Abcdef1!');
  });

  it('treats any non-alphanumeric character as a special character', () => {
    expect(validatePassword('Abcdef1?')).toBe('Abcdef1?');
  });

  it('throws when the password is shorter than 8 characters', () => {
    expect(() => validatePassword('Abc1?')).toThrow('Password must be at least 8 characters long');
  });

  it('throws when the password contains any whitespace', () => {
    expect(() => validatePassword('Abcdef 1?')).toThrow('Password cannot contain spaces');
  });

  it('throws when the password is missing an uppercase letter', () => {
    expect(() => validatePassword('abcdefg1?')).toThrow('Password must contain at least one uppercase letter');
  });

  it('throws when the password is missing a special character', () => {
    expect(() => validatePassword('Abcdefg1')).toThrow('Password must contain at least one special character');
  });
});

describe('validateId', () => {
  it('returns the trimmed id for a valid 24-character hex string', () => {
    expect(validateId('  507f1f77bcf86cd799439011  ')).toBe('507f1f77bcf86cd799439011');
  });

  it('throws for a 12-byte ASCII string even though ObjectId.isValid accepts it', () => {
    expect(() => validateId('abcdefghijkl')).toThrow('Invalid ID');
  });

  it('throws for a 23-character hex string', () => {
    expect(() => validateId('507f1f77bcf86cd79943901')).toThrow('Invalid ID');
  });

  it('throws the helper message when given an empty string', () => {
    expect(() => validateId('')).toThrow('You must provide a(n) ID');
  });
});

describe('validateTimeDuration', () => {
  it('returns a positive number within range', () => {
    expect(validateTimeDuration(25)).toBe(25);
  });

  it('accepts the upper boundary of 1440 minutes (24 hours)', () => {
    expect(validateTimeDuration(1440)).toBe(1440);
  });

  it('throws the "positive" message when given 0', () => {
    expect(() => validateTimeDuration(0)).toThrow('Time duration must be a positive number');
  });

  it('throws when the duration exceeds 1440 minutes', () => {
    expect(() => validateTimeDuration(1441)).toThrow('Time duration must be at most 1440 minutes (24 hours)');
  });

  it('rejects NaN', () => {
    expect(() => validateTimeDuration(Number.NaN)).toThrow('Time duration must be a number');
  });

  it('rejects non-number types', () => {
    expect(() => validateTimeDuration('25')).toThrow('Time duration must be a number');
  });
});

describe('validateSessionGoal', () => {
  it('returns a trimmed goal of valid length', () => {
    expect(validateSessionGoal('finish my essay')).toBe('finish my essay');
  });

  it('accepts exactly 10 characters', () => {
    expect(validateSessionGoal('abcdefghij')).toBe('abcdefghij');
  });

  it('accepts exactly 500 characters', () => {
    const goal = 'a'.repeat(500);
    expect(validateSessionGoal(goal)).toBe(goal);
  });

  it('throws when the goal is shorter than 10 characters', () => {
    expect(() => validateSessionGoal('too short')).toThrow('Session goal must be at least 10 characters long');
  });

  it('throws when the goal exceeds 500 characters', () => {
    expect(() => validateSessionGoal('a'.repeat(501))).toThrow('Session goal must be at most 500 characters long');
  });
});

describe('validateURL', () => {
  it('returns the normalized href for a valid https URL', () => {
    expect(validateURL('https://example.com/path')).toBe('https://example.com/path');
  });

  it('adds a trailing slash to bare-host URLs via URL normalization', () => {
    expect(validateURL('http://example.com')).toBe('http://example.com/');
  });

  it('trims whitespace before parsing', () => {
    expect(validateURL('  https://example.com  ')).toBe('https://example.com/');
  });

  it('throws for file: protocol', () => {
    expect(() => validateURL('file:///etc/passwd')).toThrow('Invalid URL format');
  });

  it('throws for javascript: protocol', () => {
    expect(() => validateURL('javascript:alert(1)')).toThrow('Invalid URL format');
  });

  it('throws for unparseable strings', () => {
    expect(() => validateURL('not a url')).toThrow('Invalid URL format');
  });
});

describe('validatePageTitle', () => {
  it('returns a trimmed title of valid length', () => {
    expect(validatePageTitle('Google')).toBe('Google');
  });

  it('accepts the minimum length of 2 characters', () => {
    expect(validatePageTitle('ab')).toBe('ab');
  });

  it('throws when the title is shorter than 2 characters', () => {
    expect(() => validatePageTitle('a')).toThrow('Page title must be at least 2 characters long');
  });

  it('throws the helper message when given an empty string', () => {
    expect(() => validatePageTitle('')).toThrow('You must provide a(n) Page Title');
  });
});

describe('validatePageSnippet', () => {
  it('returns a trimmed snippet of valid length', () => {
    expect(validatePageSnippet('hello world')).toBe('hello world');
  });

  it('accepts exactly 5 characters', () => {
    expect(validatePageSnippet('hello')).toBe('hello');
  });

  it('accepts exactly 2000 characters', () => {
    const snippet = 'a'.repeat(2000);
    expect(validatePageSnippet(snippet)).toBe(snippet);
  });

  it('throws when the snippet is shorter than 5 characters', () => {
    expect(() => validatePageSnippet('hi!a')).toThrow('Page snippet must be at least 5 characters long');
  });

  it('throws when the snippet exceeds 2000 characters', () => {
    expect(() => validatePageSnippet('a'.repeat(2001))).toThrow('Page snippet must be at most 2000 characters long');
  });
});

describe('validateBlockSensitivity', () => {
  it('returns "standard" unchanged', () => {
    expect(validateBlockSensitivity('standard')).toBe('standard');
  });

  it('trims surrounding whitespace', () => {
    expect(validateBlockSensitivity('  strict  ')).toBe('strict');
  });

  it('accepts "lenient"', () => {
    expect(validateBlockSensitivity('lenient')).toBe('lenient');
  });

  it('rejects values whose case does not match exactly', () => {
    expect(() => validateBlockSensitivity('Strict')).toThrow('Mode must be lenient, standard, or strict');
  });

  it('rejects unrecognized values', () => {
    expect(() => validateBlockSensitivity('medium')).toThrow('Mode must be lenient, standard, or strict');
  });

  it('throws the helper message when given an empty string', () => {
    expect(() => validateBlockSensitivity('')).toThrow('You must provide a(n) Block Sensitivity');
  });
});
