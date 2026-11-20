import type { Messages } from './de.ts'
import { plural } from './plural.ts'


const en: Messages = {
  usage: langs => `spurlos <url> [--lang ${langs}] [--verbose] [--json] [--user-agent <string>]

Opens the site like a new visitor who clicks nothing, and shows which
third-party servers it contacts and which cookies it sets.

  --lang        language: ${langs}. Without it, SPURLOS_LANG applies, then
                the system language (LC_ALL, LC_MESSAGES, LANG), else de
  --verbose     details for the green checks too
  --json        the result as JSON instead of text
  --user-agent  your own user agent for every request
  --help        this help

Exit code: 0 without a red finding, 1 with a red finding, 2 on an error.`,
  disclaimer: 'Technical pre-check – not legal advice, and no statement on whether the site complies with the GDPR.',
  openedAs: url => `opened as ${url}`,
  unknownLang: (from, value, langs) => `${from} only knows ${langs}, not ${value}.`,
  invalidUrl: arg => `${arg} is not a valid address.`,
  failed: (url, reason) => `${url} could not be checked: ${reason}`,
  title: {
    'third-party': 'Third-party servers',
    cookies: 'Cookies and storage',
    legal: 'Legal notice and privacy policy',
    https: 'HTTPS',
    headers: 'Security headers',
    forms: 'Forms',
    disclosure: 'Software details',
  },
  summary: {
    red: n => plural(n, 'problem', 'problems'),
    yellow: n => plural(n, 'note', 'notes'),
    green: n => `${n} fine`,
  },
  none: 'none',
  verbose: 'Details for the green checks too: --verbose',
  quote: s => `“${s}”`,
  unsettled: 'Note: the page was still loading when the measurement ended. Requests made later may be missing here.',

  thirdPartyNone: 'Opening the page sent no request to another server.',
  thirdParty: "Each of them learns the visitor's IP address on opening the page, before any click.",
  requests: n => plural(n, 'request', 'requests'),

  cookiesNone: 'nothing set',
  cookies: (c, s) => `${plural(c, 'cookie', 'cookies')}, ${plural(s, 'entry', 'entries')} in browser storage`,
  cookiesBefore: 'Set on the first visit, before any click.',
  cookieOwn: 'first-party',
  cookieForeign: 'third-party',
  session: 'until the session ends',
  underADay: 'under 1 day',
  days: n => plural(n, 'day', 'days'),
  cookiesReview: 'No known trackers. For the entries marked yellow, check whether they are technically necessary.',
  unknown: 'unknown',
  cookieMissing: attrs => `without ${attrs.join(' and ')}`,
  cookieMissingNote: 'Secure: the cookie also travels over unencrypted http. HttpOnly: scripts on the page can read the session.',
  disclosureNone: 'Neither headers nor the page name the software behind it.',
  disclosure: versions => (versions ? `${plural(versions, 'entry', 'entries')} with a version number` : 'names only, no versions'),
  disclosureWhy: 'A version number allows a targeted search for known holes.',
  disclosureHint: 'Version numbers can usually be switched off, e.g. with expose_php = Off in PHP or server_tokens off in nginx.',
  cookiesNecessary: 'Only known entries, as frameworks and proxies set them to run a site.',

  legal: green => (green ? 'both linked and reachable' : 'incomplete'),
  legalName: { impressum: 'Legal notice (Impressum)', datenschutz: 'Privacy policy' },
  legalNoLink: 'no link found on the page',
  legalNotChecked: 'not checked',
  legalUnreachable: error => `not reachable (${error})`,
  noResponse: 'no response',
  noSandbox: 'Note: Chromium ran without its sandbox, as the system allows none. Best check untrusted sites with the Docker image then.',
  legalOk: 'reachable',
  legalStatus: status => `answers with status ${status}`,

  https: { green: 'fine', yellow: 'with notes', red: 'with problems' },
  noHttps: 'The page is served without HTTPS. Everything visitors enter travels the network unencrypted.',
  certExpired: 'The certificate has expired.',
  certDays: n => `Certificate valid for another ${plural(n, 'day', 'days')}.`,
  certRenew: ' Check that it renews automatically.',
  http: {
    redirects: 'http:// redirects to https://.',
    'no-redirect': 'http:// serves the page without redirecting to https://.',
    unreachable: 'Nothing answers on http://. Browsers mostly try https first, but old links to http:// lead nowhere.',
  },
  noHsts: 'No HSTS header (Strict-Transport-Security): browsers do not remember to use https only.',

  headersOk: 'all set',
  headersMissing: (n, total) => `${n} of ${total} missing`,
  headerMissing: h => `${h} missing`,

  formsNone: 'none on the page',
  form: {
    unencrypted: 'sends unencrypted over http',
    'third-party': 'sends to a third-party server',
    ok: 'sends encrypted to the site itself',
  },
}

export default en
