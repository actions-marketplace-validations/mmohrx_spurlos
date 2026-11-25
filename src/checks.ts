import { getDomain, getDomainWithoutSuffix } from 'tldts'
import knownServices from './services.json' with { type: 'json' }
import type { Access, Cookie, Fingerprint, Form, Link, Resource, Scan, Visit } from './scan.ts'

export type Level = 'green' | 'yellow' | 'red'
/**
 * httpOnly: its cookies hold a session and should be out of reach of JavaScript.
 * paths: parts of a file's path that give the service away where it is hosted on the site itself (Borlabs Cookie).
 * aliases: other names a privacy policy may give it (Facebook for Meta Pixel).
 * headers: a platform that hosts the page itself, known by a response header of the page: a name (x-wix-request-id), or
 * a name and a part of its value (powered-by: Shopify).
 */
export type Service = { name: string; category: string; hosts: string[]; cookies?: string[]; storage?: string[]; paths?: string[]; httpOnly?: boolean; headers?: string[]; aliases?: string[] }

/**
 * Why another site counts as the page's own: named with --own · listed in the page's own certificate · named like
 * the page (media.wetter.de on wetter-blog.de) · it is the platform that hosts the page (Wix's servers on a Wix
 * site). A known service never does, but for the platform's, and on a page that is that service itself (media.doctolib.com
 * on doctolib.de).
 */
export type OwnReason = 'option' | 'certificate' | 'name' | 'platform'
/**
 * preconnect: no request went to it, the page only opened a connection ahead (<link rel="preconnect">, Link header) ·
 * afterMove: every request to it came only once spurlos moved the mouse and scrolled
 */
/**
 * What Google Consent Mode tells Google's tags before any click, by gcs=G1<ads><analytics> in their requests: 1 for
 * granted, 0 for denied. Present only where the page uses Consent Mode.
 */
export type ConsentMode = { gcs: string; ads: 'granted' | 'denied'; analytics: 'granted' | 'denied' }
export type ThirdParty = { host: string; service: Service | undefined; requests: number; own?: OwnReason; preconnect?: true; afterMove?: true }
/**
 * missing: attributes the cookie should have – Secure on an https page, HttpOnly for a session cookie ·
 * own: set on another site's domain that seems to belong to the page · long: it lives longer than 13 months
 */
export type CookieFinding = Cookie & { thirdParty: boolean; service: Service | undefined; missing: ('Secure' | 'HttpOnly')[]; own?: OwnReason; long?: true }
export type StorageFinding = Scan['storage'][number] & { service: Service | undefined }
/** a header or meta tag that names the software behind the page; version: it names its version too */
export type Disclosure = { source: 'header' | 'meta'; name: string; value: string; version: boolean }
export type LegalKind = 'impressum' | 'datenschutz'
export type LegalPage = { kind: LegalKind; link?: Link; visit?: Visit }
/** a service the page loads before any click, and whether the privacy policy names it */
export type PolicyService = { name: string; named: boolean }
/**
 * redirects: http sends on to https · no-redirect: the page answers over plain http · unreachable: nothing answers on http ·
 * refused: http answers with an error (4xx, 5xx), often a bot check, so whether it redirects stays open
 */
export type HttpRedirect = 'redirects' | 'no-redirect' | 'unreachable' | 'refused'
export type FormFinding = Form & { problem?: 'unencrypted' | 'third-party' }
/** insecure: loaded over http on an https page · no-integrity: a script or stylesheet of another site without integrity="…" */
export type ResourceFinding = Resource & { problem: 'insecure' | 'no-integrity' }
/** who called: host the script's, empty for a frame without one (about:blank); thirdParty: on another site than the page */
export type Caller = { host: string; thirdParty: boolean; service: Service | undefined; own?: OwnReason }
export type FingerprintFinding = Fingerprint & Caller
export type AccessFinding = Access & Caller
/**
 * what a server of another site got of the visitor's: an email address, the value of the page's query parameter param,
 * or the ID in the cookie param that the site from set (cookie syncing)
 */
export type Leak = { host: string; what: 'email' | 'query' | 'id'; param?: string; from?: string; requests: number; service: Service | undefined; own?: OwnReason }
/** where the page tells search engines to leave it out: the X-Robots-Tag header or <meta name="robots"> (or googlebot) */
export type Noindex = { source: 'header' | 'meta'; value: string }
/** what of the accessibility basics is missing; statement: the link to an accessibility statement */
export type AccessibilityProblem = 'lang' | 'images' | 'fields' | 'zoom'
/** viewport: no width=device-width, so a phone shows the desktop page shrunk · overflow: the page is wider than the window */
export type MobileProblem = 'viewport' | 'overflow'

export type Result =
  | { check: 'third-party'; level: Level; hosts: ThirdParty[]; consent: string[]; selfHosted: string[]; platform?: string; consentMode?: ConsentMode }
  | { check: 'cookies'; level: Level; cookies: CookieFinding[]; storage: StorageFinding[] }
  | { check: 'legal'; level: Level; pages: LegalPage[] }
  | { check: 'policy'; level: Level; read: boolean; url?: string; services: PolicyService[] }
  | { check: 'https'; level: Level; https: boolean; certDaysLeft?: number; http?: HttpRedirect; hsts: boolean }
  | { check: 'headers'; level: Level; missing: string[]; checked: number; weak: string[] }
  | { check: 'forms'; level: Level; forms: FormFinding[] }
  | { check: 'disclosure'; level: Level; findings: Disclosure[] }
  | { check: 'indexing'; level: Level; noindex: Noindex[] }
  | { check: 'resources'; level: Level; findings: ResourceFinding[] }
  | { check: 'fingerprinting'; level: Level; findings: FingerprintFinding[] }
  | { check: 'access'; level: Level; findings: AccessFinding[] }
  | { check: 'leaks'; level: Level; findings: Leak[] }
  | { check: 'mobile'; level: Level; problems: MobileProblem[]; mobile: boolean; viewport?: string; width: { page: number; window: number } }
  | { check: 'accessibility'; level: Level; problems: AccessibilityProblem[]; images: string[]; fields: string[]; viewport?: string; statement?: Link }

/** worst first */
export const SEVERITY: Level[] = ['red', 'yellow', 'green']
export const worst = (levels: Level[]): Level => SEVERITY.find(l => levels.includes(l)) ?? 'green'

const services = knownServices as Service[]
// the most specific host wins: maps.googleapis.com before googleapis.com
const byHost = services
  .flatMap(s => s.hosts.map(h => ({ h, s })))
  .sort((a, b) => b.h.length - a.h.length)

/** The site a host belongs to (example.co.uk for www.example.co.uk); IPs and localhost stand for themselves. */
export function site(host: string): string {
  return getDomain(host) ?? host
}

const ownSite = (scan: Scan) => site(new URL(scan.finalUrl).hostname)
/** the site asked for and the one it ended on: a redirect from brand.com to brand.de leaves both the site's own */
const ownSites = (scan: Scan) => new Set([site(new URL(scan.url).hostname), ownSite(scan)])
const isHttps = (scan: Scan) => scan.finalUrl.startsWith('https:')

export function serviceOfHost(host: string): Service | undefined {
  return byHost.find(({ h }) => host === h || host.endsWith('.' + h))?.s
}

/**
 * The host a finding goes by from one scan to the next: for a known service the entry in services.json it matches, as
 * some pick a new subdomain on every visit (Nielsen's <random>.nuid.nmrodam.com); any other host stands for itself.
 */
export function hostKey(host: string): string {
  return byHost.find(({ h }) => host === h || host.endsWith('.' + h))?.h ?? host
}

/**
 * Session and security cookies of common frameworks and proxies, and where a cookie banner keeps the visitor's choice:
 * needed to run the site, not to follow anyone.
 */
const isNecessary = (s: Service | undefined) => s?.category === 'necessary' || s?.category === 'consent'
const isTracker = (s: Service | undefined) => s?.category === 'tracking'

// names in services.json are prefixes (_ga also covers GA4's _ga_ABC123),
// or with a leading * suffixes (*-session covers Laravel's <app>-session)
const matches = (name: string) => (pattern: string) => (pattern.startsWith('*') ? name.endsWith(pattern.slice(1)) : name.startsWith(pattern))

export function serviceOfCookie(name: string): Service | undefined {
  return services.find(s => s.cookies?.some(matches(name)))
}

/** for keys in localStorage and sessionStorage, such as Vue Router's saved scroll positions */
export function serviceOfStorage(key: string): Service | undefined {
  return services.find(s => s.storage?.some(matches(key)))
}

/**
 * For files the site hosts itself: a pattern ending in / is a directory anywhere in the path (Borlabs Cookie lives
 * under /wp-content/plugins/borlabs-cookie/), any other the end of the path (/klaro.js, not /klaro.json).
 */
export function serviceOfPath(url: string): Service | undefined {
  const path = new URL(url).pathname
  return services.find(s => s.paths?.some(p => (p.endsWith('/') ? path.includes(p) : path.endsWith(p))))
}

/** A host's service, unless a path names one more exactly: Google's servers (category other) also serve reCAPTCHA. */
const preferPath = (byHost: Service | undefined, byPath: Service | undefined) =>
  byPath && (!byHost || byHost.category === 'other') ? byPath : byHost

/** The platform the page runs on, by its headers (Wix, Shopify): it serves the page, so it knows the visitor's IP anyway. */
export function platformOf(scan: Scan): Service | undefined {
  return services.find(s =>
    s.headers?.some(h => {
      const [name = '', ...rest] = h.split(':')
      const value = scan.headers[name.trim().toLowerCase()]
      return value !== undefined && value.toLowerCase().includes(rest.join(':').trim().toLowerCase())
    }),
  )
}

/** The cookie banners the page loads, by their servers, files, cookies and storage entries. */
export function consentManagers(scan: Scan): string[] {
  const found = [
    ...scan.requests.flatMap(r => [serviceOfHost(r.host), serviceOfPath(r.url)]),
    ...scan.cookies.map(c => serviceOfCookie(c.name)),
    ...scan.storage.map(e => serviceOfStorage(e.key)),
  ]
  return [...new Set(found.filter(s => s?.category === 'consent').map(s => s?.name ?? ''))]
}

// words too common to tie two names together: shop.de does not own shop-cdn.com
const COMMON = new Set(['blog', 'shop', 'store', 'online', 'news', 'mein', 'meine', 'home', 'info', 'portal', 'service', 'group', 'media', 'site', 'world', 'live', 'digital'])
// what a site adds to its name for the server of its files: zeitungstatic.de, rezeptwelt-cdn.de
const AFFIXES = ['statics', 'static', 'cdn', 'img', 'images', 'media', 'assets', 'files', 'content', 'cache']
const word = (w: string) => w.length >= 4 && !COMMON.has(w)

/** the names a host's site goes by: rezeptwelt-cdn.de as rezeptwelt-cdn and rezeptwelt, zeitungstatic.de as zeitung */
function namesOf(label: string): Set<string> {
  const names = new Set([label, ...label.split('-')])
  for (const a of AFFIXES) {
    if (label.startsWith(a)) names.add(label.slice(a.length))
    if (label.endsWith(a)) names.add(label.slice(0, -a.length))
  }
  return names
}

/** The sites in the page's own certificate, if its holder (CN) is the page's site: a hoster's shared one names strangers. */
function certificateSites(scan: Scan, own: Set<string>): Set<string> {
  const { names, subject } = scan.certificate ?? {}
  const bare = (n: string) => site(n.replace(/^\*\./, ''))
  return names && subject && own.has(bare(subject)) ? new Set(names.map(bare)) : new Set()
}

/** Tells, for a host or cookie domain on another site, whether and why it seems to belong to the page. */
export function ownership(scan: Scan): (host: string) => OwnReason | undefined {
  const own = ownSites(scan)
  const declared = scan.own ?? []
  const certified = certificateSites(scan, own)
  const labels = [...own].map(s => getDomainWithoutSuffix(s) ?? s)
  const platform = platformOf(scan)
  // a page that is a known service itself (doctolib.de) may own that service's other servers (doctolib.com)
  const itself = new Set([...own].map(serviceOfHost))
  return host => {
    const service = serviceOfHost(host)
    if (service && service === platform) return 'platform'
    if (service && !itself.has(service)) return undefined
    if (declared.some(d => host === d || host.endsWith('.' + d))) return 'option'
    if (certified.has(site(host))) return 'certificate'
    const names = namesOf(getDomainWithoutSuffix(host) ?? host)
    if (labels.some(l => (word(l) && names.has(l)) || l.split('-').filter(word).some(w => names.has(w)))) return 'name'
    return undefined
  }
}

/**
 * Every request to another site hands the visitor's IP to someone else. A cookie banner has to load before anyone can
 * agree, and a captcha protects a form: yellow, as the site needs them, though they might be hosted or loaded later.
 * A server that seems to belong to the page is yellow too: the IP still goes to another host, maybe a provider's.
 * Anything else red.
 */
export const hostLevel = (h: ThirdParty): Level =>
  h.own || h.service?.category === 'consent' || h.service?.category === 'captcha' ? 'yellow' : 'red'

/**
 * Where the page opens connections ahead: <link rel="preconnect"> in the markup, and in the Link header, as
 * <https://fonts.gstatic.com>; rel=preconnect. Absolute http(s) addresses; dns-prefetch only asks the resolver.
 */
export function preconnects(scan: Scan): string[] {
  const out = [...list(scan.preconnect)]
  for (const m of (scan.headers['link'] ?? '').matchAll(/<([^>]*)>([^,]*)/g)) {
    const rel = /;\s*rel\s*=\s*"?([^";]*)/i.exec(m[2] ?? '')?.[1] ?? ''
    if (!/(^|\s)preconnect(\s|$)/i.test(rel)) continue
    try {
      const u = new URL(m[1] ?? '', scan.finalUrl)
      if (u.protocol === 'http:' || u.protocol === 'https:') out.push(u.href)
    } catch {
      // not an address
    }
  }
  return out
}

/**
 * The consent state Google's tags send, of every request with gcs=G1xx: on the page's own site too, where a tag server
 * of its own (server-side tagging) takes them. Of several, the one that grants most, as anything granted before a click
 * is too much.
 */
export function consentMode(scan: Scan): ConsentMode | undefined {
  let found: ConsentMode | undefined
  let most = -1
  for (const r of list(scan.requests)) {
    let gcs: string | null = null
    try {
      gcs = new URL(r.url).searchParams.get('gcs')
    } catch {
      // a STUN server, say: no query
    }
    const m = /^G1([01])([01])$/.exec(gcs ?? '')
    if (!gcs || !m) continue
    const granted = (m[1] === '1' ? 1 : 0) + (m[2] === '1' ? 1 : 0)
    if (granted <= most) continue
    most = granted
    found = { gcs, ads: m[1] === '1' ? 'granted' : 'denied', analytics: m[2] === '1' ? 'granted' : 'denied' }
  }
  return found
}

/** Consent Mode granting anything before a click is red: Google's tags then set cookies and use the data as if agreed. */
export const consentModeGranted = (c: ConsentMode | undefined): boolean => c !== undefined && (c.ads === 'granted' || c.analytics === 'granted')

/**
 * Every request to another site than the page's own counts. A host no name gives away may by the path asked for
 * (/matomo.php on an agency's server). selfHosted: known services the page runs on its own site, by their paths (a
 * Sentry or Matomo of its own); they change no light, as the IP stays with the site, but the reader learns of them.
 */
export function thirdParty(scan: Scan): Result {
  const { hosts, selfHosted } = thirdPartyFound(scan)
  const platform = platformOf(scan)
  const mode = consentMode(scan)
  const level = worst([...hosts.map(hostLevel), ...(consentModeGranted(mode) ? ['red' as const] : [])])
  return { check: 'third-party', level, hosts, consent: consentManagers(scan), selfHosted, ...(platform ? { platform: platform.name } : {}), ...(mode ? { consentMode: mode } : {}) }
}

const thirdPartyHosts = (scan: Scan) => thirdPartyFound(scan).hosts

function thirdPartyFound(scan: Scan): { hosts: ThirdParty[]; selfHosted: string[] } {
  const own = ownSites(scan)
  const owner = ownership(scan)
  const counts = new Map<string, number>()
  // hosts with a request before the first move
  const early = new Set<string>()
  const byPath = new Map<string, Service>()
  const selfHosted = new Set<string>()
  for (const r of scan.requests) {
    const service = serviceOfPath(r.url)
    if (own.has(site(r.host))) {
      // a cookie banner of its own is named as one already
      if (service && service.category !== 'consent') selfHosted.add(service.name)
      continue
    }
    counts.set(r.host, (counts.get(r.host) ?? 0) + 1)
    if (!r.afterMove) early.add(r.host)
    if (service && !byPath.has(r.host)) byPath.set(r.host, service)
  }
  // a connection opened ahead hands over the IP as well, in the TLS handshake, though no request follows
  const ahead = new Set<string>()
  for (const url of preconnects(scan)) {
    const host = new URL(url).hostname
    if (!own.has(site(host)) && !counts.has(host)) ahead.add(host)
  }
  const hosts = [...counts, ...[...ahead].map(h => [h, 0] as const)]
    .map(([host, requests]): ThirdParty => {
      const reason = owner(host)
      return { host, service: preferPath(serviceOfHost(host), byPath.get(host)), requests, ...(reason ? { own: reason } : {}), ...(requests ? {} : { preconnect: true as const }), ...(requests && !early.has(host) ? { afterMove: true as const } : {}) }
    })
    .sort((a, b) => a.host.localeCompare(b.host))
  return { hosts, selfHosted: [...selfHosted] }
}

const ok = (v: Visit | undefined) => v !== undefined && 'status' in v && v.status >= 200 && v.status < 300

// The level of each single finding; a check's level is the worst of its findings.

/**
 * A third-party cookie or a known tracker's is red, unless the other site seems to belong to the page; a known session,
 * security or consent cookie green, unless it lacks Secure or HttpOnly or lives longer than 13 months; any other yellow,
 * a chat's or a payment provider's too.
 */
export const cookieLevel = (c: CookieFinding): Level =>
  (c.thirdParty && !c.own) || isTracker(c.service) ? 'red' : isNecessary(c.service) && !c.missing.length && !c.long ? 'green' : 'yellow'

/** 13 months, in days: what a cookie should not outlive. Chrome cuts any lifetime to 400 days. */
export const LONG_COOKIE_DAYS = 395
/** a version number tells an attacker which known holes to try; the bare name of the software is only a hint */
export const disclosureLevel = (d: Disclosure): Level => (d.version ? 'yellow' : 'green')
/** what a framework keeps there to run is green; anything else an app stores wants a look */
export const storageLevel = (e: StorageFinding): Level => (isNecessary(e.service) ? 'green' : 'yellow')
/**
 * A page that turns spurlos away (401, 403, 429) or keeps it waiting until the timeout, as bot checks do, may still
 * open for visitors: yellow, as it could not be checked. A missing link, 404 and any other error are red.
 */
export const legalBlocked = (v: Visit | undefined): boolean =>
  v !== undefined && ('status' in v ? [401, 403, 429].includes(v.status) : /\btimeout\b/i.test(v.error))
export const legalLevel = (p: LegalPage): Level => (ok(p.visit) ? 'green' : legalBlocked(p.visit) ? 'yellow' : 'red')
export const certLevel = (daysLeft: number): Level => (daysLeft < 7 ? 'red' : daysLeft < 14 ? 'yellow' : 'green')
/** nothing on http is yellow: browsers mostly try https first, but old http:// links break; refused is yellow, as it is left open */
export const httpLevel = (h: HttpRedirect): Level => (h === 'no-redirect' ? 'red' : h === 'redirects' ? 'green' : 'yellow')
export const formLevel = (f: FormFinding): Level => (f.problem === 'unencrypted' ? 'red' : f.problem ? 'yellow' : 'green')
/** over http the browser blocks scripts, stylesheets and frames, and upgrades or drops images and media: red, yellow */
export const resourceLevel = (r: ResourceFinding): Level =>
  r.problem === 'insecure' && ['script', 'stylesheet', 'iframe'].includes(r.tag) ? 'red' : 'yellow'
/**
 * Fingerprinting by another site is red, as it follows the visitor without a cookie; a captcha does it to tell people
 * from bots, and the page's own scripts may do it to catch fraud: yellow, they want a look.
 */
export const fingerprintLevel = (f: FingerprintFinding): Level =>
  f.thirdParty && !f.own && f.service?.category !== 'captcha' ? 'red' : 'yellow'
/**
 * A service worker is how a site works offline or sends push: green, the report names it. Asking for notifications
 * before any click is yellow; for location, camera or microphone too, red where a script of another site asks.
 */
export const accessLevel = (a: AccessFinding): Level =>
  a.api === 'service-worker' ? 'green'
  : a.api === 'notifications' || a.api === 'push' || !a.thirdParty || a.own ? 'yellow'
  : 'red'

/**
 * Cookies and storage present before any click. A third-party cookie or a known tracker's is red; known session,
 * security and consent cookies (Laravel's XSRF-TOKEN, PHPSESSID, Cloudflare's __cf_bm …) are green; any other own
 * cookie or storage entry is yellow, as it may be needed to run the site and wants a look. One that lives longer than
 * 13 months is yellow at least.
 */
export function cookies(scan: Scan, now = Date.now()): Result {
  const own = ownSites(scan)
  const owner = ownership(scan)
  const https = isHttps(scan)
  const found = scan.cookies.map((c): CookieFinding => {
    const service = serviceOfCookie(c.name)
    const missing: CookieFinding['missing'] = []
    if (https && !c.secure) missing.push('Secure')
    if (service?.httpOnly && !c.httpOnly) missing.push('HttpOnly')
    const thirdParty = !own.has(site(c.domain))
    const reason = thirdParty ? owner(c.domain) : undefined
    const long = c.expires > 0 && c.expires * 1000 - now > LONG_COOKIE_DAYS * 86_400_000
    return { ...c, thirdParty, service, missing, ...(reason ? { own: reason } : {}), ...(long ? { long: true as const } : {}) }
  })
  const storage = scan.storage.map(e => ({ ...e, service: serviceOfStorage(e.key) }))
  const level = worst([...found.map(cookieLevel), ...storage.map(storageLevel)])
  return { check: 'cookies', level, cookies: found, storage }
}

const LEGAL: Record<LegalKind, RegExp> = {
  impressum: /impressum|imprint|legal[ -]?notice|anbieterkennzeichnung/i,
  datenschutz: /datenschutz|privacy|data[ -]?protection/i,
}

/**
 * How well a link names its kind, best first: its text starts with the word (Datenschutz, Privacy Policy) · names it
 * further on („this Privacy Notice“, but also a teaser like „About Swiss privacy“) · only its address does (a cookie
 * settings page under /privacy/) · not at all.
 */
function legalRank(l: Link, kind: LegalKind): number {
  const text = LEGAL[kind].exec(l.text)
  if (text) return /^[\W\d_]*$/.test(l.text.slice(0, text.index)) ? 0 : 1
  return LEGAL[kind].test(l.href) ? 2 : 3
}

/**
 * The link per kind that names it best, on the page's own site if there is one: a cookie banner's link to
 * policies.google.com/privacy is Google's policy, not the site's. Of equals, the first on the page. A link like
 * „Impressum & Datenschutz“ counts for both.
 */
export function legalLinks(links: Link[], pageUrl?: string): (Link & { kind: LegalKind })[] {
  const own = pageUrl ? site(new URL(pageUrl).hostname) : undefined
  const out: (Link & { kind: LegalKind })[] = []
  for (const kind of ['impressum', 'datenschutz'] as const) {
    const score = (l: Link) => (site(new URL(l.href).hostname) === own ? 0 : 4) + legalRank(l, kind)
    const candidates = links.filter(l => /^https?:/.test(l.href) && legalRank(l, kind) < 3)
    // sort is stable: of equal scores, the first on the page stays first
    const l = candidates.sort((a, b) => score(a) - score(b))[0]
    if (l) out.push({ ...l, kind })
  }
  return out
}

/** Impressum and Datenschutz each need a link on the page that opens without error; turned away, they are left open. */
export function legal(scan: Scan): Result {
  const found = legalLinks(scan.links, scan.finalUrl)
  const pages = (['impressum', 'datenschutz'] as const).map(kind => {
    const link = found.find(l => l.kind === kind)
    const page: LegalPage = { kind }
    if (link) {
      page.link = { text: link.text, href: link.href }
      const visit = scan.legal.find(v => v.url === link.href)
      if (visit) page.visit = visit
    }
    return page
  })
  return { check: 'legal', level: worst(pages.map(legalLevel)), pages }
}

/** a text as words in lower case, hyphens as spaces: „Google-Fonts“ as google fonts */
const words = (text: string) => text.toLowerCase().replace(/[-_\u2010-\u2011]/g, ' ').replace(/\s+/g, ' ')

/**
 * the names a privacy policy may give a service: its name, without what is in brackets, and its aliases; none under three
 * letters. What is in brackets alone is no name: CookieYes (WordPress) is not WordPress.
 */
function namesOfService(s: Service): string[] {
  const names = [s.name, s.name.replace(/\s*\([^)]*\)\s*/g, ' '), ...(s.aliases ?? [])]
  return [...new Set(names.map(n => words(n).trim()))].filter(n => n.length >= 3)
}

/**
 * The services of services.json a text names, by name or alias, as whole words in any case: what scan.ts keeps of the
 * privacy policy instead of its text. Those needed to run a site (category necessary) are left out: their names
 * (Session, WordPress) say nothing.
 */
export function servicesNamed(text: string): string[] {
  const t = words(text)
  const named = services.filter(
    s => s.category !== 'necessary' && namesOfService(s).some(n => new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(t)),
  )
  return [...new Set(named.map(s => s.name))]
}

/**
 * Whether the privacy policy names the known services that load before any click from other sites: each one it does not
 * name is yellow. Only names are looked for, as text: whether the policy describes them rightly, spurlos does not say.
 * Servers that seem to belong to the page, and services needed to run it, are left out. A policy spurlos could not read
 * as text (no link, unreachable, a PDF, or text that only scripts load) leaves it open: the services are listed, but
 * none is a finding.
 */
export function policy(scan: Scan): Result {
  const names = new Set(
    thirdPartyHosts(scan)
      .filter(h => !h.own && h.service && h.service.category !== 'necessary')
      .map(h => h.service?.name ?? ''),
  )
  const read = scan.policy !== undefined
  const named = new Set(scan.policy?.named ?? [])
  const found: PolicyService[] = [...names].sort((a, b) => a.localeCompare(b)).map(name => ({ name, named: named.has(name) }))
  const level = read && found.some(s => !s.named) ? 'yellow' : 'green'
  return { check: 'policy', level, read, ...(scan.policy ? { url: scan.policy.url } : {}), services: found }
}

/** A page without https, an expired certificate or http left without redirect is red; a certificate close to its end or no HSTS yellow. */
export function https(scan: Scan, now = Date.now()): Result {
  const secure = isHttps(scan)
  // max-age=0 tells browsers to forget HSTS, so it counts as none
  const maxAge = /max-age\s*=\s*"?(\d+)/i.exec(scan.headers['strict-transport-security'] ?? '')?.[1]
  const hsts = Number(maxAge) > 0
  const levels: Level[] = [secure ? 'green' : 'red']
  const r: Extract<Result, { check: 'https' }> = { check: 'https', level: 'green', https: secure, hsts }

  if (scan.certificate) {
    r.certDaysLeft = Math.floor((scan.certificate.validTo * 1000 - now) / 86_400_000)
    levels.push(certLevel(r.certDaysLeft))
  }
  if (scan.http) {
    const h = scan.http
    r.http = 'error' in h ? 'unreachable' : h.finalUrl.startsWith('https:') ? 'redirects' : h.status >= 400 ? 'refused' : 'no-redirect'
    levels.push(httpLevel(r.http))
  }
  if (secure && !hsts) levels.push('yellow')
  r.level = worst(levels)
  return r
}

const STRONG_SOURCE = /^'(nonce|sha256|sha384|sha512)-/

/**
 * What lets scripts through a Content-Security-Policy anyway: 'unsafe-inline' without a nonce or hash (with one,
 * browsers ignore it), 'unsafe-eval', and sources that allow any server (*, https:, http:, data:), which
 * 'strict-dynamic' switches off. A policy with neither script-src nor default-src restricts no scripts at all
 * (no-script-src). Every policy applies, header and meta tag alike, and a header sent twice arrives joined by a
 * comma: one policy without a weakness is enough.
 */
export function weakCsp(policies: string[]): string[] {
  let first: string[] | undefined
  for (const policy of policies.flatMap(p => p.split(','))) {
    const directives = new Map<string, string[]>()
    for (const d of policy.split(';')) {
      const [name, ...sources] = d.trim().toLowerCase().split(/\s+/)
      // of a directive given twice, browsers use the first
      if (name && !directives.has(name)) directives.set(name, sources)
    }
    const sources = directives.get('script-src') ?? directives.get('default-src')
    if (!sources) continue
    const strictDynamic = sources.includes("'strict-dynamic'")
    const weak = [
      ...(sources.includes("'unsafe-inline'") && !sources.some(s => STRONG_SOURCE.test(s)) ? ["'unsafe-inline'"] : []),
      ...(sources.includes("'unsafe-eval'") ? ["'unsafe-eval'"] : []),
      ...(strictDynamic ? [] : ['*', 'https:', 'http:', 'data:'].filter(s => sources.includes(s))),
    ]
    if (!weak.length) return []
    first ??= weak
  }
  return first ?? ['no-script-src']
}

/** Hardening headers of the page; each one missing is yellow, a CSP that lets any script through too. HSTS is part of the https check. */
export function headers(scan: Scan): Result {
  const h = scan.headers
  const csp = h['content-security-policy'] ?? ''
  // a CSP or referrer policy in a <meta> tag counts, but browsers ignore frame-ancestors there
  const checked = [
    !csp && !scan.metaCsp && 'Content-Security-Policy',
    !h['x-frame-options'] && !/frame-ancestors/i.test(csp) && 'X-Frame-Options',
    // a header sent twice arrives joined: "nosniff, nosniff"
    !(h['x-content-type-options'] ?? '').split(',').some(v => v.trim().toLowerCase() === 'nosniff') && 'X-Content-Type-Options',
    !h['referrer-policy'] && !scan.metaReferrer && 'Referrer-Policy',
    !h['permissions-policy'] && 'Permissions-Policy',
  ]
  const missing = checked.filter((m): m is string => typeof m === 'string')
  const policies = [csp, scan.metaCsp ?? ''].filter(p => p)
  const weak = policies.length ? weakCsp(policies) : []
  return { check: 'headers', level: missing.length || weak.length ? 'yellow' : 'green', missing, checked: checked.length, weak }
}

/** A form that sends over plain http is red; one that sends to another site yellow, as the entries go to someone else. */
export function forms(scan: Scan): Result {
  const own = ownSite(scan)
  const found = scan.forms
    .filter(f => /^https?:/.test(f.action))
    .map((f): FormFinding => {
      const u = new URL(f.action)
      if (u.protocol === 'http:') return { ...f, problem: 'unencrypted' }
      if (site(u.hostname) !== own) return { ...f, problem: 'third-party' }
      return f
    })
  const level = worst(found.map(formLevel))
  return { check: 'forms', level, forms: found }
}

const DISCLOSING = ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator']
const VERSION_NUMBER = /\d+\.\d+/

/** Headers and the generator meta tag that name the software behind the page – passive: only what the page sends anyway. */
export function disclosure(scan: Scan): Result {
  const findings: Disclosure[] = DISCLOSING.filter(h => scan.headers[h]).map(h => {
    const value = scan.headers[h] ?? ''
    return { source: 'header', name: h, value, version: VERSION_NUMBER.test(value) }
  })
  if (scan.generator) findings.push({ source: 'meta', name: 'generator', value: scan.generator, version: VERSION_NUMBER.test(scan.generator) })
  return { check: 'disclosure', level: worst(findings.map(disclosureLevel)), findings }
}

/** noindex, or none, which means noindex and nofollow; for every robot or, as in X-Robots-Tag: googlebot: noindex, one */
const NOINDEX = /(^|[\s,:])(noindex|none)(?=$|[\s,;])/i

/**
 * Whether search engines may take the page in: a noindex in the X-Robots-Tag header or in <meta name="robots"> (or
 * googlebot) is yellow. Wanted on a staging site, an oversight on a public one, often left over from before it went live.
 */
export function indexing(scan: Scan): Result {
  const noindex: Noindex[] = [
    ...(NOINDEX.test(scan.headers['x-robots-tag'] ?? '') ? [{ source: 'header' as const, value: scan.headers['x-robots-tag'] ?? '' }] : []),
    ...(NOINDEX.test(scan.metaRobots ?? '') ? [{ source: 'meta' as const, value: scan.metaRobots ?? '' }] : []),
  ]
  return { check: 'indexing', level: noindex.length ? 'yellow' : 'green', noindex }
}

/**
 * Files the page embeds: over http on an https page, or a script or stylesheet of another site without
 * integrity="…", so that site may change it at will and the page runs whatever it sends.
 */
export function resources(scan: Scan): Result {
  const own = ownSites(scan)
  const https = isHttps(scan)
  const seen = new Set<string>()
  const findings: ResourceFinding[] = []
  for (const r of scan.resources) {
    const u = new URL(r.url)
    const problem =
      https && u.protocol === 'http:' ? 'insecure'
      : (r.tag === 'script' || r.tag === 'stylesheet') && !r.integrity && !own.has(site(u.hostname)) ? 'no-integrity'
      : undefined
    if (!problem || seen.has(`${problem} ${r.url}`)) continue
    seen.add(`${problem} ${r.url}`)
    findings.push({ ...r, problem })
  }
  return { check: 'resources', level: worst(findings.map(resourceLevel)), findings }
}

// what a link or ad sets on every visit, and the page's address carries to analytics anyway: no data of the visitor's
const CAMPAIGN = /^(utm_\w+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|ttclid|twclid|li_fat_id|mc_cid|mc_eid|_ga|_gl|ref)$/i
// a local part not right after a word, a dot or a slash: https://key@o1.ingest.sentry.io is a Sentry DSN, no address
const EMAIL = /(?<![\w.%+\-/])[\w.%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?![\w-])/i

/** a text as it may arrive encoded, once or twice: name%2540firma.de */
function decoded(text: string): string {
  let out = text.replace(/\+/g, ' ')
  for (let i = 0; i < 2; i++) {
    try {
      out = decodeURIComponent(out)
    } catch {
      break
    }
  }
  return out
}

/**
 * What a request carries of the visitor's, in its address or body: an email address (email), and the values of the
 * query of the page asked for, as query:<name> – a token, a name, an order number. Campaign parameters (utm_…, gclid …)
 * and values under six characters do not count; a value that is an email address counts as email.
 */
export function carried(url: string, body: string | undefined, pageUrl: string): string[] {
  const text = `${decoded(url)}\n${body === undefined ? '' : decoded(body)}`
  const out = EMAIL.test(text) ? ['email'] : []
  let query: URLSearchParams
  try {
    query = new URL(pageUrl).searchParams
  } catch {
    return out
  }
  for (const [name, value] of query) {
    if (CAMPAIGN.test(name) || value.length < 6 || EMAIL.test(value)) continue
    if (text.includes(value) && !out.includes(`query:${name}`)) out.push(`query:${name}`)
  }
  return out
}

/**
 * The IDs other sites hand on to a third (cookie syncing): the value of a cookie of another site than the page's, at
 * least ten characters with a digit in them, in the address of a request to a third site. As carried entries
 * id:<name>@<domain> of the cookie. A site's own cookie going back to it is none, nor is the page's own cookie: that
 * its analytics gets its ID is how analytics works.
 */
export function cookieIds(url: string, cookies: { name: string; domain: string; value: string }[], pageUrls: string[]): string[] {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return []
  }
  const own = new Set(pageUrls.map(u => site(new URL(u).hostname)))
  const to = site(host)
  if (own.has(to)) return []
  const text = decoded(url)
  const out: string[] = []
  for (const c of cookies) {
    const domain = c.domain.replace(/^\./, '')
    const from = site(domain)
    if (own.has(from) || from === to) continue
    const value = decoded(c.value)
    if (value.length < 10 || !/\d/.test(value) || !text.includes(value)) continue
    const id = `id:${c.name}@${domain}`
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/**
 * An email address that goes to another site is red: its owner can tie the visit to a person. A value from the page's
 * query is yellow, as it may be a token or a name, or harmless. An ID of another site's cookie is red: two trackers tie
 * their profiles of the visitor together. Yellow too where the server seems to belong to the page.
 */
export const leakLevel = (l: Leak): Level => ((l.what === 'email' || l.what === 'id') && !l.own ? 'red' : 'yellow')

/** What requests to other sites carry of the visitor's, per server and kind; IDs per server and cookie. */
export function leaks(scan: Scan): Result {
  const own = ownSites(scan)
  const owner = ownership(scan)
  const found = new Map<string, Leak>()
  for (const r of list(scan.requests)) {
    if (own.has(site(r.host))) continue
    for (const c of list(r.carries)) {
      const what = c === 'email' ? 'email' : c.startsWith('id:') ? 'id' : 'query'
      // id:<name>@<domain>: a cookie name may hold an @, a domain not
      const at = c.lastIndexOf('@')
      const param = what === 'query' ? c.slice('query:'.length) : what === 'id' ? c.slice('id:'.length, at) : undefined
      const from = what === 'id' ? c.slice(at + 1) : undefined
      const k = `${r.host} ${c}`
      const seen = found.get(k)
      if (seen) {
        seen.requests++
        continue
      }
      const reason = owner(r.host)
      found.set(k, { host: r.host, what, ...(param !== undefined ? { param } : {}), ...(from !== undefined ? { from } : {}), requests: 1, service: serviceOfHost(r.host), ...(reason ? { own: reason } : {}) })
    }
  }
  const findings = [...found.values()].sort((a, b) => a.host.localeCompare(b.host) || a.what.localeCompare(b.what))
  return { check: 'leaks', level: worst(findings.map(leakLevel)), findings }
}

/** Tells, for the address of a script, whose it is. */
function callers(scan: Scan): (script: string) => Caller {
  const own = ownSites(scan)
  const owner = ownership(scan)
  return script => {
    let host = ''
    try {
      host = new URL(script).hostname
    } catch {
      // no address: the frame's own code
    }
    const thirdParty = host !== '' && !own.has(site(host))
    const reason = thirdParty ? owner(host) : undefined
    const service = host ? preferPath(serviceOfHost(host), serviceOfPath(script)) : undefined
    return { host, thirdParty, service, ...(reason ? { own: reason } : {}) }
  }
}

/** Scripts that read out canvas, graphics card, audio stack or the IP address by WebRTC before any click, as scan.ts notes them. */
export function fingerprinting(scan: Scan): Result {
  const caller = callers(scan)
  const findings = list(scan.fingerprinting).map((f): FingerprintFinding => ({ ...f, ...caller(f.script) }))
  return { check: 'fingerprinting', level: worst(findings.map(fingerprintLevel)), findings }
}

/** What scripts asked the browser for before any click: permissions and service workers. */
export function access(scan: Scan): Result {
  const caller = callers(scan)
  const findings = list(scan.access).map((a): AccessFinding => ({ ...a, ...caller(a.script) }))
  return { check: 'access', level: worst(findings.map(accessLevel)), findings }
}

/**
 * Whether the viewport keeps people from zooming in: user-scalable=no (or 0), or a maximum-scale under 2, as WCAG asks
 * for 200 %.
 */
export function blocksZoom(viewport: string): boolean {
  const props = new Map(
    viewport.toLowerCase().split(/[,;]/).map((p): [string, string] => {
      const [name = '', value = ''] = p.split('=')
      return [name.trim(), value.trim()]
    }),
  )
  const scalable = props.get('user-scalable')
  const max = Number(props.get('maximum-scale'))
  return scalable === 'no' || scalable === '0' || (props.has('maximum-scale') && Number.isFinite(max) && max < 2)
}

const STATEMENT = /barrierefrei|accessibility|zugänglichkeit/i

/** The link to an accessibility statement, by its text, else its address; one on the page's own site first. */
export function statementLink(links: Link[], pageUrl: string): Link | undefined {
  const own = site(new URL(pageUrl).hostname)
  const rank = (l: Link) => (site(new URL(l.href).hostname) === own ? 0 : 2) + (STATEMENT.test(l.text) ? 0 : 1)
  return links.filter(l => /^https?:/.test(l.href) && (STATEMENT.test(l.text) || STATEMENT.test(l.href))).sort((a, b) => rank(a) - rank(b))[0]
}

/**
 * The basics of accessibility a machine can tell without a click: the page names its language, images have an alt
 * text, form fields a label, the viewport lets people zoom. Each missing is yellow: whether a page is accessible takes
 * far more than this. A link to an accessibility statement is named, its absence only noted.
 */
export function accessibility(scan: Scan): Result {
  const a = scan.accessibility
  const zoom = a.viewport !== undefined && blocksZoom(a.viewport)
  const problems: AccessibilityProblem[] = [
    ...(a.lang?.trim() ? [] : ['lang' as const]),
    ...(a.images.length ? ['images' as const] : []),
    ...(a.fields.length ? ['fields' as const] : []),
    ...(zoom ? ['zoom' as const] : []),
  ]
  const link = statementLink(scan.links, scan.finalUrl)
  return {
    check: 'accessibility',
    level: problems.length ? 'yellow' : 'green',
    problems,
    images: a.images,
    fields: a.fields,
    ...(zoom && a.viewport ? { viewport: a.viewport } : {}),
    ...(link ? { statement: { text: link.text, href: link.href } } : {}),
  }
}

/** How much the page loaded before any click, and how much of it from other sites: no light, the report only names it. */
export type Load = { requests: number; bytes: number; foreignRequests: number; foreignBytes: number }

export function load(scan: Scan): Load {
  const own = ownSites(scan)
  const out: Load = { requests: 0, bytes: 0, foreignRequests: 0, foreignBytes: 0 }
  // a scan put together by hand, as in the tests, may lack them
  for (const r of list(scan.requests)) {
    out.requests++
    out.bytes += r.bytes ?? 0
    if (own.has(site(r.host))) continue
    out.foreignRequests++
    out.foreignBytes += r.bytes ?? 0
  }
  return out
}

/**
 * Whether the page suits a phone: a viewport with width=device-width, else phones lay it out 980 pixels wide and shrink
 * it; and no scrolling sideways, as a page wider than the window makes visitors do. Measured in the window the page was
 * opened in, so only --mobile tells about phones; each missing is yellow.
 */
export function mobile(scan: Scan): Result {
  const viewport = scan.accessibility.viewport
  const width = scan.width ?? { page: 0, window: 0 }
  const fits = viewport !== undefined && /(^|[\s,;])width\s*=\s*device-width/i.test(viewport)
  // a pixel of rounding is no scrolling
  const problems: MobileProblem[] = [...(fits ? [] : ['viewport' as const]), ...(width.page > width.window + 1 ? ['overflow' as const] : [])]
  return { check: 'mobile', level: problems.length ? 'yellow' : 'green', problems, mobile: scan.mobile === true, ...(viewport !== undefined ? { viewport } : {}), width }
}

export function runChecks(scan: Scan, now = Date.now()): Result[] {
  return [thirdParty(scan), cookies(scan, now), leaks(scan), fingerprinting(scan), access(scan), legal(scan), policy(scan), https(scan, now), headers(scan), resources(scan), forms(scan), disclosure(scan), indexing(scan), mobile(scan), accessibility(scan)]
}

/**
 * What identifies a finding from one scan to the next, whatever the language: the report marks findings by it, and
 * --baseline compares by it.
 */
export const key = {
  /** hosts of a known service share one key: see hostKey */
  host: (host: string) => `third-party ${hostKey(host)}`,
  consentMode: 'consent-mode granted',
  cookie: (c: { name: string; domain: string }) => `cookie ${c.name} ${c.domain}`,
  storage: (e: { area: string; key: string }) => `storage ${e.area} ${e.key}`,
  legal: (kind: LegalKind) => `legal ${kind}`,
  policy: (name: string) => `policy ${name}`,
  https: (what: 'https' | 'cert' | 'http' | 'hsts') => `https ${what}`,
  header: (name: string) => `header ${name}`,
  csp: (weakness: string) => `csp ${weakness}`,
  form: (f: { method: string; action: string }) => `form ${f.method} ${f.action}`,
  disclosure: (d: { name: string }) => `disclosure ${d.name}`,
  noindex: (n: { source: string }) => `indexing ${n.source}`,
  /** by host, not by script: a fingerprinting service may serve its script under a new path on every visit */
  fingerprint: (f: { api: string; host: string }) => `fingerprinting ${f.api} ${hostKey(f.host)}`,
  access: (a: { api: string; host: string }) => `access ${a.api} ${hostKey(a.host)}`,
  accessibility: (what: AccessibilityProblem | 'statement') => `accessibility ${what}`,
  mobile: (what: MobileProblem) => `mobile ${what}`,
  leak: (l: { host: string; what: string; param?: string }) => `leak ${l.what}${l.param === undefined ? '' : ` ${l.param}`} ${hostKey(l.host)}`,
  // without the query: a cache buster like ?ver=6.4.2 changes with every update, the file stays the same
  resource: (r: { problem: string; url: string }) => `resource ${r.problem} ${withoutQuery(r.url)}`,
}

/** an address without query and fragment, which may hold API keys and cache busters: https://cdn.example/app.js */
export function withoutQuery(url: string): string {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch {
    return url
  }
}

export type Finding = { key: string; level: Level }

// a baseline is a JSON file, maybe from an older spurlos: a list missing from it counts as empty
const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : [])

/** the second of two findings with the same key gets #2, so both count: two forms posting to the same address */
export function numbered(keys: string[]): string[] {
  const seen = new Map<string, number>()
  return keys.map(k => {
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return n === 1 ? k : `${k} #${n}`
  })
}

/** Each finding of a check with its own light, in the order the report lists them; keys unique within the check. */
export function findings(r: Result): Finding[] {
  const found = unnumbered(r)
  const keys = numbered(found.map(f => f.key))
  return found.map((f, i) => ({ key: keys[i] ?? f.key, level: f.level }))
}

function unnumbered(r: Result): Finding[] {
  switch (r.check) {
    case 'third-party':
      // the hosts of one service are one finding, at their worst
      const byKey = new Map<string, Level[]>()
      for (const h of list(r.hosts)) byKey.set(key.host(h.host), [...(byKey.get(key.host(h.host)) ?? []), hostLevel(h)])
      return [...[...byKey].map(([k, levels]) => ({ key: k, level: worst(levels) })), ...(consentModeGranted(r.consentMode) ? [{ key: key.consentMode, level: 'red' as const }] : [])]
    case 'cookies':
      return [
        ...list(r.cookies).map(c => ({ key: key.cookie(c), level: cookieLevel({ ...c, missing: list(c.missing) }) })),
        ...list(r.storage).map(e => ({ key: key.storage(e), level: storageLevel(e) })),
      ]
    case 'legal':
      return list(r.pages).map(p => ({ key: key.legal(p.kind), level: legalLevel(p) }))
    case 'policy':
      return r.read ? list(r.services).map(s => ({ key: key.policy(s.name), level: s.named ? ('green' as const) : ('yellow' as const) })) : []
    case 'https':
      return [
        ...(r.https ? [] : [{ key: key.https('https'), level: 'red' as const }]),
        ...(r.certDaysLeft === undefined ? [] : [{ key: key.https('cert'), level: certLevel(r.certDaysLeft) }]),
        ...(r.http ? [{ key: key.https('http'), level: httpLevel(r.http) }] : []),
        ...(r.https && !r.hsts ? [{ key: key.https('hsts'), level: 'yellow' as const }] : []),
      ]
    case 'headers':
      return [...list(r.missing).map(h => ({ key: key.header(h), level: 'yellow' as const })), ...list(r.weak).map(w => ({ key: key.csp(w), level: 'yellow' as const }))]
    case 'resources':
      return list(r.findings).map(f => ({ key: key.resource(f), level: resourceLevel(f) }))
    case 'fingerprinting':
      return list(r.findings).map(f => ({ key: key.fingerprint(f), level: fingerprintLevel(f) }))
    case 'access':
      return list(r.findings).map(a => ({ key: key.access(a), level: accessLevel(a) }))
    case 'leaks':
      return list(r.findings).map(l => ({ key: key.leak(l), level: leakLevel(l) }))
    case 'mobile':
      return list(r.problems).map(p => ({ key: key.mobile(p), level: 'yellow' as const }))
    case 'accessibility':
      return [
        ...list(r.problems).map(p => ({ key: key.accessibility(p), level: 'yellow' as const })),
        ...(r.statement ? [{ key: key.accessibility('statement'), level: 'green' as const }] : []),
      ]
    case 'forms':
      return list(r.forms).map(f => ({ key: key.form(f), level: formLevel(f) }))
    case 'disclosure':
      return list(r.findings).map(d => ({ key: key.disclosure(d), level: disclosureLevel(d) }))
    case 'indexing':
      return list(r.noindex).map(n => ({ key: key.noindex(n), level: 'yellow' as const }))
    default:
      return []
  }
}

/** fresh: findings that are red or yellow now and were not, or were milder, before · gone: red or yellow before, and not now */
export type Comparison = { fresh: Finding[]; gone: Finding[] }

/** Compares the results of a scan with those of an earlier one, the baseline. */
export function compare(now: Result[], before: Result[]): Comparison {
  const flagged = (results: Result[]) => results.flatMap(findings).filter(f => f.level !== 'green')
  const was = new Map(flagged(before).map(f => [f.key, f.level]))
  const is = new Set(flagged(now).map(f => f.key))
  const milder = (a: Level, b: Level) => SEVERITY.indexOf(a) > SEVERITY.indexOf(b)
  const fresh = flagged(now).filter(f => {
    const old = was.get(f.key)
    return old === undefined || milder(old, f.level)
  })
  return { fresh, gone: flagged(before).filter(f => !is.has(f.key)) }
}
