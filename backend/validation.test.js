import { describe, it, expect } from 'vitest';
import {
    validatePageSnippet,
    validatePassword,
    validateUsername,
    validateEmail,
    validateId,
    validateSessionGoal,
    validateURL,
    validateBlockSensitivity,
    validateTimeDuration,
    validatePageTitle,
} from './validation.js';

describe('#17 — validatePageSnippet length bounds', () => {
    it('rejects strings under 5 characters', () => {
        expect(() => validatePageSnippet('hi')).toThrow('Page snippet must be at least 5 characters long');
    });

    it('rejects strings over 2000 characters', () => {
        const tooLong = 'a'.repeat(2001);
        expect(() => validatePageSnippet(tooLong)).toThrow('Page snippet must be at most 2000 characters long');
    });

    it('accepts a string of exactly 5 characters', () => {
        expect(validatePageSnippet('hello')).toBe('hello');
    });

    it('accepts a string of exactly 2000 characters', () => {
        const max = 'a'.repeat(2000);
        expect(validatePageSnippet(max)).toBe(max);
    });

    it('accepts a normal-length string', () => {
        const normal = 'This is a representative page snippet that the extension would send.';
        expect(validatePageSnippet(normal)).toBe(normal);
    });
});

describe('#1.13 — validatePassword enforces length and char-class requirements', () => {
    it.each([
        ['Ab1!', 'Password must be at least 8 characters long'],
        ['abcdefg1!', 'Password must contain at least one uppercase letter'],
        ['ABCDEFG1!', 'Password must contain at least one lowercase letter'],
        ['Abcdefgh!', 'Password must contain at least one digit'],
        ['Abcdefg1', 'Password must contain at least one special character'],
    ])('rejects %s with %s', (input, expectedError) => {
        expect(() => validatePassword(input)).toThrow(expectedError);
    });

    it('returns the trimmed password when all requirements are met', () => {
        expect(validatePassword('  Abcdef1!  ')).toBe('Abcdef1!');
    });
});

describe('#1.14 — validateUsername', () => {
    it.each([
        [undefined, 'You must provide a Username'],
        ['', 'You must provide a Username'],
        ['ab', 'Username must be at least 3 characters long'],
    ])('rejects %s', (input, expectedError) => {
        expect(() => validateUsername(input)).toThrow(expectedError);
    });

    it('trims surrounding whitespace from a valid username', () => {
        expect(validateUsername('  alice  ')).toBe('alice');
    });
});

describe('#1.14 — validateEmail', () => {
    it.each([
        [undefined, 'You must provide a Email'],
        ['', 'You must provide a Email'],
        ['not-an-email', 'Invalid email format'],
        ['missing@tld', 'Invalid email format'],
    ])('rejects %s', (input, expectedError) => {
        expect(() => validateEmail(input)).toThrow(expectedError);
    });

    it('lowercases and trims a valid email', () => {
        expect(validateEmail('  Foo@Example.COM  ')).toBe('foo@example.com');
    });
});

describe('#1.14 — validateId', () => {
    it.each([
        [undefined, 'You must provide a ID'],
        ['', 'You must provide a ID'],
        ['not-a-valid-objectid', 'Invalid ID'],
    ])('rejects %s', (input, expectedError) => {
        expect(() => validateId(input)).toThrow(expectedError);
    });
});

describe('#1.14 — validateSessionGoal', () => {
    it.each([
        [undefined, 'You must provide a Session Goal'],
        ['', 'You must provide a Session Goal'],
        ['too short', 'Session goal must be at least 10 characters long'],
    ])('rejects %s', (input, expectedError) => {
        expect(() => validateSessionGoal(input)).toThrow(expectedError);
    });

    it('trims surrounding whitespace from a valid session goal', () => {
        expect(validateSessionGoal('  Deep focused work  ')).toBe('Deep focused work');
    });
});

describe('#1.14 — validateURL', () => {
    it.each([
        [undefined, 'You must provide a URL'],
        ['', 'You must provide a URL'],
        ['not a url', 'Invalid URL format'],
        ['ftp://example.com', 'Invalid URL format'],
        ['file:///etc/passwd', 'Invalid URL format'],
    ])('rejects %s', (input, expectedError) => {
        expect(() => validateURL(input)).toThrow(expectedError);
    });

    it('returns the parsed href for a valid http(s) URL', () => {
        expect(validateURL('https://example.com/path')).toBe('https://example.com/path');
    });
});

describe('#1.14 — validateBlockSensitivity', () => {
    it.each([
        [undefined, 'You must provide a Block Sensitivity'],
        ['', 'You must provide a Block Sensitivity'],
        ['aggressive', 'Mode must be lenient, standard, or strict'],
        ['STRICT', 'Mode must be lenient, standard, or strict'],
    ])('rejects %s', (input, expectedError) => {
        expect(() => validateBlockSensitivity(input)).toThrow(expectedError);
    });
});

describe('#1.14 — validateTimeDuration', () => {
    it.each([
        [undefined, 'You must provide a time duration'],
        [0, 'You must provide a time duration'],
        ['25', 'Time duration must be a number'],
        [-5, 'Time duration must be a positive number'],
    ])('rejects %s', (input, expectedError) => {
        expect(() => validateTimeDuration(input)).toThrow(expectedError);
    });
});

describe('#1.14 — validatePageTitle', () => {
    it.each([
        [undefined, 'You must provide a Page Title'],
        ['', 'You must provide a Page Title'],
        ['a', 'Page title must be at least 2 characters long'],
    ])('rejects %s', (input, expectedError) => {
        expect(() => validatePageTitle(input)).toThrow(expectedError);
    });
});
