import { describe, it, expect } from 'vitest';
import './privacy.js';

const { isNeverSend, stripUrl, normalizeDomain } = globalThis.fpPrivacy;

describe('isNeverSend', () => {
  it.each([
    ['a listed bank', 'https://chase.com/accounts'],
    ['a subdomain of a listed bank', 'https://secure.chase.com/login'],
    ['a listed email service', 'https://mail.google.com/mail/u/0'],
    ['a listed patient portal', 'https://www.mychart.com/portal'],
    ['a listed password manager', 'https://vault.bitwarden.com/'],
    ['a US government site', 'https://www.irs.gov/refunds'],
    ['a UK government site', 'https://www.gov.uk/tax'],
    ['localhost', 'http://localhost:3000/admin'],
    ['a .localhost name', 'http://app.localhost/'],
    ['a .local name', 'http://printer.local/'],
    ['a .internal name', 'https://wiki.corp.internal/'],
    ['loopback IPv4', 'http://127.0.0.1:8080/'],
    ['a 10.x address', 'http://10.1.2.3/'],
    ['a 192.168.x address', 'http://192.168.1.1/'],
    ['a 172.16-31.x address', 'http://172.20.0.1/'],
    ['a link-local address', 'http://169.254.1.1/'],
    ['loopback IPv6', 'http://[::1]:3000/'],
    ['a private IPv6 address', 'http://[fd00::1]/'],
    ['a non-web page', 'file:///C:/private/notes.html'],
    ['an unreadable address', 'not a url'],
  ])('is true for %s', (_label, url) => {
    expect(isNeverSend(url)).toBe(true);
  });

  it.each([
    ['an ordinary site', 'https://www.wikipedia.org/wiki/Focus'],
    ['a lookalike that ends with another domain', 'https://chase.com.evil.example/'],
    ['a domain containing a listed name', 'https://notchase.com/'],
    ['a public address beside the private 172 range', 'http://172.32.0.1/'],
    ['the rest of a domain whose mail subdomain is listed', 'https://www.google.com/search'],
  ])('is false for %s', (_label, url) => {
    expect(isNeverSend(url)).toBe(false);
  });

  it('is true for a domain on the private list, including its subdomains', () => {
    expect(isNeverSend('https://portal.mytherapist.example/', ['mytherapist.example'])).toBe(true);
  });

  it('ignores the private list for other domains', () => {
    expect(isNeverSend('https://www.wikipedia.org/', ['mytherapist.example'])).toBe(false);
  });
});

describe('stripUrl', () => {
  it('removes the query string and fragment', () => {
    expect(stripUrl('https://example.com/reset?token=abc#top')).toBe('https://example.com/reset');
  });

  it('keeps the port and path', () => {
    expect(stripUrl('http://example.test:4311/a/b.html?x=1')).toBe('http://example.test:4311/a/b.html');
  });
});

describe('normalizeDomain', () => {
  it.each([
    ['a plain domain', 'example.com', 'example.com'],
    ['capitals and spaces', '  Example.COM ', 'example.com'],
    ['a pasted address', 'https://www.example.com/path?x=1', 'example.com'],
    ['a subdomain', 'portal.example.com', 'portal.example.com'],
  ])('accepts %s', (_label, input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each([
    ['empty text', '   '],
    ['a word with no dot', 'example'],
    ['text with spaces', 'not a domain.com'],
    ['a bare top-level domain', '.com'],
  ])('rejects %s', (_label, input) => {
    expect(normalizeDomain(input)).toBeNull();
  });
});
