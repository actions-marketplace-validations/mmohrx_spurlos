import { AUTH_REJECTED, AUTH_REQUIRED, NO_RESPONSE, REFUSED } from '../scan.ts'
import type { Messages } from './de.ts'
import { plural } from './plural.ts'


const en: Messages = {
  usage: langs => `spurlos <url> [<url> …] [--lang ${langs}] [--verbose] [--json | --html | --pdf | --sarif]
        [-o <file> …] [--baseline <file>] [--auth <user:password>]
        [--user-agent <string>] [--own <host> …] [--mobile] [--gpc]
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
  --sarif       the findings as SARIF, e.g. for GitHub code scanning
  -o, --output  into a file instead of the output, the format by its
                extension (.pdf, .html, .json, .sarif, else text): -o report.pdf;
                more than once for several formats from one run, then
                without --json, --html, --pdf and --sarif
  --baseline    compare with an earlier output of --json: the report
                marks new findings, exit code 1 only for new red
                findings
  --auth        login by HTTP basic auth, only to the address checked;
                better through SPURLOS_AUTH, then the password stays out of
                the shell history
  --user-agent  your own user agent for every request
  --own         servers that belong to the site, such as its CDN, with
                their subdomains: --own cdn-company.net; repeated or
                comma-separated. They are then yellow, not red
  --mobile      open the site as a phone: screen, touch and user agent of
                Chrome on Android
  --gpc         open the site with Global Privacy Control (Sec-GPC: 1),
                the signal against selling and sharing the data
  --help        this help

spurlos mcp starts an MCP server over stdio: it lets an AI assistant
check sites itself, setup in the README.

Exit code: 0 without a red finding, 1 with a red finding, 2 on an error.
With --baseline only new red findings count.

Does spurlos help you? https://ko-fi.com/mmohrx`,
  disclaimer: 'Technical pre-check – not legal advice, and no statement on whether the site complies with the GDPR.',
  openedAs: url => `opened as ${url}`,
  asPhone: 'opened as a phone (--mobile)',
  withGpc: 'opened with Global Privacy Control (--gpc)',
  unknownLang: (from, value, langs) => `${from} only knows ${langs}, not ${value}.`,
  invalidUrl: arg => `${arg} is not a valid address.`,
  oneFormat: '--json, --html, --pdf and --sarif only go one at a time.',
  formatWithOutputs: 'With several -o each file’s extension decides its format, without --json, --html, --pdf or --sarif.',
  authOneOrigin: '--auth and SPURLOS_AUTH only apply to one address (scheme, host, port); several addresses have to share it.',
  pdfToTerminal: 'The PDF belongs in a file, not in the terminal: spurlos <url> -o report.pdf',
  written: file => `Report written to ${file}.`,
  cannotWrite: (file, reason) => `${file} could not be written: ${reason}`,
  mcpOnly: flags => `spurlos mcp only takes --lang and --user-agent, not ${flags}.`,
  notBoolean: name => `${name} is true or false.`,
  urlMissing: 'url is missing: the address of the site as a string, e.g. example.com.',
  unknownFormat: value => `format only knows text and json, not ${value}.`,
  load: (n, size, foreign, foreignSize) =>
    `${plural(n, 'request', 'requests')} on load, ${size}; ${foreign ? `${foreign} of them with ${foreignSize} to other domains` : 'none to other domains'}`,
  checkedAt: date => `checked on ${date}`,
  timing: (paint, idle) => `${paint ? `first content after ${paint}, ` : ''}everything loaded after ${idle}`,
  failed: (url, reason) =>
    `${url} could not be checked: ${
      reason === NO_RESPONSE ? 'no response'
      : reason === AUTH_REQUIRED ? 'The page asks for a login. --auth or SPURLOS_AUTH only applies to exactly the address given (scheme, host, port).'
      : reason === AUTH_REJECTED ? 'The login was rejected.'
      : /^page\.goto: Timeout \d+ms exceeded/.test(reason) ? `no answer after ${Number(/(\d+)ms/.exec(reason)?.[1]) / 1000} seconds`
      : /net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH/.test(reason) ? 'The server offers no TLS version and cipher current browsers accept, often only the outdated TLS 1.0 or 1.1. Visitors get an error page.'
      : /net::ERR_CERT_/.test(reason) ? `The certificate is invalid (${/ERR_CERT_\w+/.exec(reason)?.[0]}). Browsers show visitors a warning instead of the page.`
      : reason.startsWith(`${REFUSED} `) ? `The page turned the request away with status ${reason.slice(REFUSED.length + 1)}, often because of a bot check. Its error page says nothing about what visitors get. If it is your site, let spurlos through the bot check.`
      : reason
    }`,
  authFormat: '--auth and SPURLOS_AUTH take user:password.',
  invalidOwn: value => `--own takes a host name like cdn.company.com, not ${value}.`,
  authOverHttp: 'The address is http://, the password goes to the server unencrypted.',
  cannotRead: (file, reason) => `${file} could not be read: ${reason}`,
  notBaseline: file => `${file} is not an output of spurlos --json.`,
  compared: (file, fresh, gone) => `compared with ${file}: ${fresh} new, ${gone} gone`,
  isNew: 'new',
  gone: 'gone',
  shotAlt: 'Screenshot of the page on the first visit',
  shotCaption: 'This is how the page looked on the first visit, before any click.',
  title: {
    'third-party': 'Third-party servers',
    cookies: 'Cookies and storage',
    leaks: 'Data passed on',
    fingerprinting: 'Fingerprinting',
    access: 'Browser access',
    mobile: 'Mobile',
    accessibility: 'Accessibility',
    legal: 'Legal notice and privacy policy',
    https: 'HTTPS',
    headers: 'Security headers',
    forms: 'Forms',
    disclosure: 'Software details',
    indexing: 'Search engines',
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
  afterMove: 'only after the first move',
  afterMoveNote: '“Only after the first move” came when spurlos moved the mouse and scrolled, without clicking. Optimizers such as WP Rocket hold scripts back until then; every real visitor sets them off, long before choosing anything in the cookie banner.',
  preconnectOnly: 'only preconnect, no request',
  preconnectNote: 'With preconnect, the browser sets up the connection in advance; the server learns the IP address then, even if no request follows. If it is not needed, the hint should go.',
  thirdPartyHint: {
    fonts: 'Fonts can be served from the own server, then no request goes out for them.',
    cdn: 'Libraries from a CDN can be served from the own server as well.',
    consent: 'The site needs the cookie banner before anyone can agree. There are also banners to host yourself, then no request goes out for it.',
    captcha: 'A captcha can be embedded so that it only loads with the form, not on every page.',
    embed: 'Videos, maps, chats and social media posts can be embedded so that they only load after a click.',
    tracking: 'Trackers can be embedded so that they only load once someone agrees in the cookie banner.',
  },
  selfHosted: names => `Found on the site’s own servers: ${names}. The IP address stays with the site.`,
  consentFound: names => `Cookie banner found: ${names}.`,
  consentButTrackers: 'The trackers above still load before anyone chooses anything in the banner.',
  consentModeGranted: (ads, analytics) => `tells Google consent was given for ${ads && analytics ? 'ads and analytics' : ads ? 'ads' : 'analytics'} before anyone chose anything`,
  consentModeGrantedNote: 'Google Consent Mode tells Google\'s tags whether the visitor agreed. Set to “granted” up front, they set cookies and use the data as if the visitor had agreed. The usual default is “denied” until the cookie banner reports the choice.',
  consentModeDenied: gcs => `Google Consent Mode reports ads and analytics as denied (gcs=${gcs}). Google's tags still send requests, without cookies, and learn the IP address that way.`,
  consentNone: 'No known cookie banner found.',
  ownBy: {
    option: 'belongs to the site per --own',
    certificate: 'belongs to the site per its certificate',
    name: 'belongs to the site by its name',
    platform: 'belongs to the site’s host',
  },
  platformNote: name =>
    `The site runs on ${name}. Its servers are yellow, not red: they serve the site anyway and so know the IP address already. Apps and trackers on the site still count.`,
  ownNote:
    'Yellow, not red, where a server seems to belong to the site. The IP address still goes to another host; if a provider runs it, the provider learns it too. Name your own servers with --own.',

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
  cookieLong: 'longer than 13 months',
  cookieLongNote: 'Hardly any cookie needs to last longer than 13 months; Chrome cuts every lifetime to 400 days anyway. For trackers it weighs more, as they recognize the visitor over a long time that way.',
  cookieSameSiteNote: 'SameSite=None: the browser sends the cookie along even when other sites embed the site or send requests to it. If it does not need that, SameSite=Lax is the better choice.',
  cookieMissingNote: 'Secure: the cookie also travels over unencrypted http. HttpOnly: scripts on the page can read the session.',
  disclosureNone: 'Neither headers nor the page name the software behind it.',
  disclosure: versions => (versions ? `${plural(versions, 'entry', 'entries')} with a version number` : 'names only, no versions'),
  disclosureWhy: 'A version number allows a targeted search for known holes.',
  disclosureHint: 'Version numbers can usually be switched off, e.g. with expose_php = Off in PHP or server_tokens off in nginx.',
  indexingOk: 'may list the page',
  indexingNo: 'are told not to list the page (noindex)',
  indexingNone: 'Neither X-Robots-Tag nor <meta name="robots"> says noindex.',
  indexingWhy: 'With noindex, search engines leave the page out. Wanted on a staging site, on a public one usually a leftover from before it went live.',
  leakNone: 'No email address and no value from the address of the page in the requests to third-party servers.',
  leakEmail: 'gets an email address',
  leakQuery: param => `gets the value of ${param} from the address`,
  leakEmailNote: 'If an email address is in the address of the page, say on a thank-you page after signing up, analytics and pixels send it along with the page address. It is better kept out of the address altogether.',
  leakQueryNote: 'Values from the address of the page go along with it to the third-party servers, as the page address to analytics, say. If it holds a token, a name or an order number, they learn that too.',
  fingerprintNone: 'No script read out canvas, graphics card, audio or the IP address via WebRTC the way fingerprinting does.',
  fingerprintApi: {
    canvas: 'reads back a canvas with text',
    webgl: 'reads the graphics card via WebGL',
    audio: 'renders audio in an OfflineAudioContext',
    webrtc: 'asks for the IP address via WebRTC',
  },
  fingerprintWhy: 'Such values make up a trait that recognizes the browser without any cookie, before anyone clicks anything.',
  fingerprintYellow: 'Yellow for captchas and the site\'s own scripts: bot and fraud detection read such values too. Check what the script needs them for.',
  accessNone: 'No script asked for location, camera, microphone or notifications, none registered a service worker.',
  accessWorkerOnly: 'only a service worker',
  accessApi: {
    notifications: 'asks whether it may send notifications',
    push: 'subscribes to push messages',
    geolocation: 'asks for the location',
    camera: 'asks for the camera',
    microphone: 'asks for the microphone',
    'service-worker': 'registers a service worker',
  },
  accessWhy: 'Asked right on load, before anyone clicks anything: the visitor does not know what the site wants it for. Firefox does not even show the notification prompt without a click.',
  accessWorker: 'A service worker stays in the browser and can run after the visit too, for push messages, say, or so the site works offline.',
  mobileOk: 'in order',
  mobileValue: n => plural(n, 'note', 'notes'),
  mobileViewport: 'No viewport for phones (width=device-width)',
  mobileNoViewport: 'no <meta name="viewport">',
  mobileOverflow: (page, window) => `The page is ${page} pixels wide, the window ${window}: visitors have to scroll sideways`,
  mobileWhy: {
    viewport: 'Without width=device-width, phones lay the page out 980 pixels wide and shrink it; the text gets tiny. The usual tag is <meta name="viewport" content="width=device-width, initial-scale=1">.',
    overflow: 'Usually an image, a table or an element with a fixed width sticks out over the edge.',
  },
  mobileHint: 'For phones, spurlos checks this with --mobile; some sites also load other trackers and cookie banners there.',
  a11yOk: 'basics in order',
  a11yValue: n => plural(n, 'basic missing', 'basics missing'),
  a11yLang: 'The page does not name its language (lang on <html>)',
  a11yImages: n => `${plural(n, 'image', 'images')} without alt text`,
  a11yFields: n => `${plural(n, 'form field', 'form fields')} without a label`,
  a11yZoom: 'The viewport keeps people from zooming in',
  a11yStatement: 'Accessibility statement',
  a11yWhy: {
    lang: 'Without lang, screen readers may read the text with the pronunciation of another language.',
    images: 'Without alt, screen readers read out the file name. Images that only decorate get alt="".',
    fields: 'Without <label>, aria-label or title, screen readers do not say what goes into a field; a placeholder is no label.',
    zoom: 'With user-scalable=no or a maximum-scale under 2, the page cannot be zoomed to twice its size on a phone.',
  },
  a11yNoStatement: 'No accessibility statement linked.',
  a11yScope: 'These are only basics that can be checked without a click. They do not say whether the site is accessible; that takes tools such as axe and people using it with a screen reader and keyboard.',
  cookiesNecessary: 'Only known entries, as frameworks and proxies set them to run a site.',

  legal: level => ({ green: 'both linked and reachable', yellow: 'both linked, not all checkable', red: 'incomplete' })[level],
  legalName: { impressum: 'Legal notice (Impressum)', datenschutz: 'Privacy policy' },
  legalNoLink: 'no link found on the page',
  legalNotChecked: 'not checked',
  legalUnreachable: error => `not reachable (${error})`,
  noResponse: 'no response',
  noSandbox: 'Note: Chromium ran without its sandbox, as the system allows none. Best check untrusted sites with the Docker image then.',
  legalOk: 'reachable',
  legalStatus: status => `answers with status ${status}`,
  legalTimeout: 'no answer after 15 seconds',
  legalBlocked: ', often because of a bot check; whether visitors can open it could not be checked',

  https: { green: 'fine', yellow: 'with notes', red: 'with problems' },
  noHttps: 'The page is served without HTTPS. Everything visitors enter travels the network unencrypted.',
  certExpired: 'The certificate has expired.',
  certDays: n => `Certificate valid for another ${plural(n, 'day', 'days')}.`,
  certRenew: ' Check that it renews automatically.',
  http: {
    redirects: 'http:// redirects to https://.',
    'no-redirect': 'http:// serves the page without redirecting to https://.',
    unreachable: 'Nothing answers on http://. Browsers mostly try https first, but old links to http:// lead nowhere.',
    refused: 'http:// answers with an error, often because of a bot check. Whether it redirects to https:// could not be checked.',
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
