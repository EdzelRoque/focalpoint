// Pure privacy rules. Classic script (no export statements) so popup.html can
// load it with a plain <script> tag and background.js can import it for its
// side effect; published on globalThis so vitest can import the same file.

// Matches each domain and all of its subdomains. This list can never be
// complete, which the consent screen and privacy policy both say.
const NEVER_SEND_DOMAINS = [
  // Banking and payments
  'americanexpress.com', 'bankofamerica.com', 'barclays.co.uk', 'capitalone.com',
  'chase.com', 'citi.com', 'discover.com', 'fidelity.com', 'hsbc.com', 'paypal.com',
  'pnc.com', 'schwab.com', 'tdbank.com', 'usbank.com', 'vanguard.com', 'venmo.com',
  'wellsfargo.com',
  // Health
  'aetna.com', 'anthem.com', 'cigna.com', 'followmyhealth.com', 'kp.org', 'mychart.com',
  'uhc.com',
  // Email
  'mail.google.com', 'mail.proton.me', 'mail.yahoo.com', 'outlook.live.com',
  'outlook.office.com',
  // Passwords and sign-in
  '1password.com', 'accounts.google.com', 'bitwarden.com', 'dashlane.com', 'lastpass.com',
  'login.microsoftonline.com',
  // Government (these also match every site under the suffix)
  'gov', 'mil', 'gov.uk',
];

const LOCAL_SUFFIXES = ['localhost', 'local', 'internal', 'lan', 'intranet'];

const matchesDomain = (hostname, domain) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

const isPrivateIPv4 = (hostname) => {
  const match = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (!match) return false;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

const isPrivateIPv6 = (hostname) => {
  if (!hostname.startsWith('[')) return false;
  const address = hostname.slice(1, -1);
  return address === '::1' || /^f[cd]/.test(address) || /^fe[89ab]/.test(address);
};

// When in doubt, withhold: anything unreadable or non-web is never sent.
const isNeverSend = (url, privateDomains = []) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;

  const hostname = parsed.hostname.toLowerCase();
  return (
    isPrivateIPv4(hostname) ||
    isPrivateIPv6(hostname) ||
    LOCAL_SUFFIXES.some((suffix) => matchesDomain(hostname, suffix)) ||
    NEVER_SEND_DOMAINS.some((domain) => matchesDomain(hostname, domain)) ||
    privateDomains.some((domain) => matchesDomain(hostname, domain))
  );
};

const stripUrl = (url) => {
  const parsed = new URL(url);
  return parsed.origin + parsed.pathname;
};

// Turns what a user typed or pasted into a bare domain, or null if it isn't one.
const normalizeDomain = (input) => {
  const text = input.trim().toLowerCase();
  if (!text || /\s/.test(text)) return null;

  let hostname;
  try {
    hostname = new URL(text.includes('://') ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }

  hostname = hostname.replace(/^www\./, '');
  return /^[^.]+(\.[^.]+)+$/.test(hostname) ? hostname : null;
};

globalThis.fpPrivacy = { isNeverSend, stripUrl, normalizeDomain };
