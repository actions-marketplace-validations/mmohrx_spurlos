import { AUTH_REJECTED, AUTH_REQUIRED } from '../scan.ts'
import type { Messages } from './de.ts'
import { plural } from './plural.ts'


const en: Messages = {
  usage: langs => `spurlos <url> [<url> …] [--lang ${langs}] [--verbose] [--json | --html | --pdf] [-o <file> …]
        [--baseline <file>] [--auth <user:password>] [--user-agent <string>]
spurlos mcp [--lang ${langs}] [--user-agent <string>]

Opens the site like a new visitor who clicks nothing, and shows which
third-party servers it contacts and which cookies it sets.
Several addresses are checked one after the other, with a report each.

  --lang        language: ${langs}. Without it, SPURLOS_LANG applies, then
                the system language (LC_ALL, LC_MESSAGES, LANG), else de
  --verbose     details for the green checks too
  --json        the result as JSON instead of text
  --html        the report as an HTML page, e.g.: spurlos <url> --html > report.html
  --pdf         the report as a PDF, e.g.: spurlos <url> --pdf > report.pdf
  -o, --output  into a file instead of the output, the format by its
                extension (.pdf, .html, .json, else text): -o report.pdf;
                more than once for several formats from one run, then
                without --json, --html and --pdf
  --baseline    compare with an earlier output of --json: the report
                marks new findings, exit code 1 only for new red
                findings
  --auth        login by HTTP basic auth, only to the address checked;
                better through SPURLOS_AUTH, then the password stays out of
                the shell history
  --user-agent  your own user agent for every request
  --help        this help

spurlos mcp starts an MCP server over stdio: it lets an AI assistant
check sites itself, setup in the README.

Exit code: 0 without a red finding, 1 with a red finding, 2 on an error.
With --baseline only new red findings count.

Does spurlos help you? https://ko-fi.com/mmohrx`,
  disclaimer: 'Technical pre-check – not legal advice, and no statement on whether the site complies with the GDPR.',
  openedAs: url => `opened as ${url}`,
  unknownLang: (from, value, langs) => `${from} only knows ${langs}, not ${value}.`,
  invalidUrl: arg => `${arg} is not a valid address.`,
  oneFormat: '--json, --html and --pdf only go one at a time.',
  formatWithOutputs: 'With several -o each file’s extension decides its format, without --json, --html or --pdf.',
  authOneOrigin: '--auth and SPURLOS_AUTH only apply to one address (scheme, host, port); several addresses have to share it.',
  pdfToTerminal: 'The PDF belongs in a file, not in the terminal: spurlos <url> -o report.pdf',
  written: file => `Report written to ${file}.`,
  cannotWrite: (file, reason) => `${file} could not be written: ${reason}`,
  mcpOnly: flags => `spurlos mcp only takes --lang and --user-agent, not ${flags}.`,
  urlMissing: 'url is missing: the address of the site as a string, e.g. example.com.',
  unknownFormat: value => `format only knows text and json, not ${value}.`,
  checkedAt: date => `checked on ${date}`,
  failed: (url, reason) =>
    `${url} could not be checked: ${
      reason === AUTH_REQUIRED ? 'The page asks for a login. --auth or SPURLOS_AUTH only applies to exactly the address given (scheme, host, port).'
      : reason === AUTH_REJECTED ? 'The login was rejected.'
      : reason
    }`,
  authFormat: '--auth and SPURLOS_AUTH take user:password.',
  authOverHttp: 'The address is http://, the password goes to the server unencrypted.',
  cannotRead: (file, reason) => `${file} could not be read: ${reason}`,
  notBaseline: file => `${file} is not an output of spurlos --json.`,
  compared: (file, fresh, gone) => `compared with ${file}: ${fresh} new, ${gone} gone`,
  isNew: 'new',
  gone: 'gone',
  title: {
    'third-party': 'Third-party servers',
    cookies: 'Cookies and storage',
    legal: 'Legal notice and privacy policy',
    https: 'HTTPS',
    headers: 'Security headers',
    forms: 'Forms',
    disclosure: 'Software details',
    resources: 'Embedded files',
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
  thirdPartyHint: {
    fonts: 'Fonts can be served from the own server, then no request goes out for them.',
    cdn: 'Libraries from a CDN can be served from the own server as well.',
    embed: 'Videos, maps, chats and social media posts can be embedded so that they only load after a click.',
    tracking: 'Trackers can be embedded so that they only load once someone agrees in the cookie banner.',
  },
  consentFound: names => `Cookie banner found: ${names}.`,
  consentButTrackers: 'The trackers above still load before anyone chooses anything in the banner.',
  consentNone: 'No known cookie banner found.',

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
  hstsExample: 'e.g. Strict-Transport-Security: max-age=31536000',

  headersOk: 'all set',
  headersMissing: (n, total) => `${n} of ${total} missing`,
  headerMissing: h => `${h} missing`,
  headerExample: {
    'Content-Security-Policy': 'try it as Content-Security-Policy-Report-Only first',
    'X-Frame-Options': 'e.g. SAMEORIGIN, or frame-ancestors in the CSP',
    'X-Content-Type-Options': 'value: nosniff',
    'Referrer-Policy': 'e.g. strict-origin-when-cross-origin',
    'Permissions-Policy': 'e.g. camera=(), microphone=(), geolocation=()',
  },
  cspWeakValue: 'CSP with gaps',
  cspWeak: w => (w === 'no-script-src' ? 'Content-Security-Policy restricts no scripts (neither script-src nor default-src)' : `Content-Security-Policy allows ${w}`),
  cspWeakNote: "With 'unsafe-inline', 'unsafe-eval' or sources like * and https: the CSP hardly stops injected scripts. Nonces or hashes allow only the site's own scripts.",

  resourcesNone: 'fine',
  resource: {
    insecure: 'over http on an https page',
    'no-integrity': 'from a third-party server, without integrity',
  },
  resourcesInsecure: 'On an https page the browser blocks scripts, stylesheets and frames over http, and loads images and videos over https or not at all.',
  resourcesIntegrity:
    'Without an integrity attribute the third-party server can swap the file at any time, and the page runs whatever it sends. For files the provider keeps changing, such as a tag manager, that is not possible; then the only way is to serve them yourself.',

  formsNone: 'none on the page',
  form: {
    unencrypted: 'sends unencrypted over http',
    'third-party': 'sends to a third-party server',
    ok: 'sends encrypted to the site itself',
  },
}

export default en
