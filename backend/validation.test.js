import { describe, it, expect } from 'vitest';
import { validatePageSnippet } from './validation.js';

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
