import { getDomain } from 'tldts'
import knownServices from './services.json' with { type: 'json' }
import type { Cookie, Form, Link, Resource, Scan, Visit } from './scan.ts'

export type Level = 'green' | 'yellow' | 'red'
/**
 * httpOnly: its cookies hold a session and should be out of reach of JavaScript.
 * paths: parts of a file's path that give the service away where it is hosted on the site itself (Borlabs Cookie).
 */
export type Service = { name: string; category: string; hosts: string[]; cookies?: string[]; storage?: string[]; paths?: string[]; httpOnly?: boolean }

export type ThirdParty = { host: string; service: Service | undefined; requests: number }
/** missing: attributes the cookie should have – Secure on an https page, HttpOnly for a session cookie */
export type CookieFinding = Cookie & { thirdParty: boolean; service: Service | undefined; missing: ('Secure' | 'HttpOnly')[] }
export type StorageFinding = Scan['storage'][number] & { service: Service | undefined }
/** a header or meta tag that names the software behind the page; version: it names its version too */
export type Disclosure = { source: 'header' | 'meta'; name: string; value: string; version: boolean }
export type LegalKind = 'impressum' | 'datenschutz'
export type LegalPage = { kind: LegalKind; link?: Link; visit?: Visit }
/** redirects: http sends on to https · no-redirect: the page answers over plain http · unreachable: nothing answers on http */
export type HttpRedirect = 'redirects' | 'no-redirect' | 'unreachable'
export type FormFinding = Form & { problem?: 'unencrypted' | 'third-party' }
/** insecure: loaded over http on an https page · no-integrity: a script or stylesheet of another site without integrity="…" */
export type ResourceFinding = Resource & { problem: 'insecure' | 'no-integrity' }

export type Result =
  | { check: 'third-party'; level: Level; hosts: ThirdParty[]; consent: string[] }
  | { check: 'cookies'; level: Level; cookies: CookieFinding[]; storage: StorageFinding[] }
  | { check: 'legal'; level: Level; pages: LegalPage[] }
  | { check: 'https'; level: Level; https: boolean; certDaysLeft?: number; http?: HttpRedirect; hsts: boolean }
  | { check: 'headers'; level: Level; missing: string[]; checked: number; weak: string[] }
  | { check: 'forms'; level: Level; forms: FormFinding[] }
  | { check: 'disclosure'; level: Level; findings: Disclosure[] }
  | { check: 'resources'; level: Level; findings: ResourceFinding[] }

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

/** The cookie banners the page loads, by their servers, files, cookies and storage entries. */
export function consentManagers(scan: Scan): string[] {
  const found = [
    ...scan.requests.flatMap(r => [serviceOfHost(r.host), serviceOfPath(r.url)]),
    ...scan.cookies.map(c => serviceOfCookie(c.name)),
    ...scan.storage.map(e => serviceOfStorage(e.key)),
  ]
  return [...new Set(found.filter(s => s?.category === 'consent').map(s => s?.name ?? ''))]
}

/** Every request to another site than the page's own counts: it hands the visitor's IP to someone else. */
export function thirdParty(scan: Scan): Result {
  const own = ownSites(scan)
  const counts = new Map<string, number>()
  for (const r of scan.requests) if (!own.has(site(r.host))) counts.set(r.host, (counts.get(r.host) ?? 0) + 1)
  const hosts = [...counts]
    .map(([host, requests]) => ({ host, service: serviceOfHost(host), requests }))
    .sort((a, b) => a.host.localeCompare(b.host))
  return { check: 'third-party', level: hosts.length ? 'red' : 'green', hosts, consent: consentManagers(scan) }
}

const ok = (v: Visit | undefined) => v !== undefined && 'status' in v && v.status >= 200 && v.status < 300

// The level of each single finding; a check's level is the worst of its findings.

/**
 * A third-party cookie or a known tracker's is red; a known session, security or consent cookie green, unless it
 * lacks Secure or HttpOnly; any other yellow, a chat's or a payment provider's too.
 */
export const cookieLevel = (c: CookieFinding): Level =>
  c.thirdParty || isTracker(c.service) ? 'red' : isNecessary(c.service) && !c.missing.length ? 'green' : 'yellow'
/** a version number tells an attacker which known holes to try; the bare name of the software is only a hint */
export const disclosureLevel = (d: Disclosure): Level => (d.version ? 'yellow' : 'green')
/** what a framework keeps there to run is green; anything else an app stores wants a look */
export const storageLevel = (e: StorageFinding): Level => (isNecessary(e.service) ? 'green' : 'yellow')
export const legalLevel = (p: LegalPage): Level => (ok(p.visit) ? 'green' : 'red')
export const certLevel = (daysLeft: number): Level => (daysLeft < 7 ? 'red' : daysLeft < 14 ? 'yellow' : 'green')
/** nothing on http is yellow: browsers mostly try https first, but old http:// links break */
export const httpLevel = (h: HttpRedirect): Level => (h === 'no-redirect' ? 'red' : h === 'unreachable' ? 'yellow' : 'green')
export const formLevel = (f: FormFinding): Level => (f.problem === 'unencrypted' ? 'red' : f.problem ? 'yellow' : 'green')
/** over http the browser blocks scripts, stylesheets and frames, and upgrades or drops images and media: red, yellow */
export const resourceLevel = (r: ResourceFinding): Level =>
  r.problem === 'insecure' && ['script', 'stylesheet', 'iframe'].includes(r.tag) ? 'red' : 'yellow'

/**
 * Cookies and storage present before any click. A third-party cookie or a known tracker's is red; known session,
 * security and consent cookies (Laravel's XSRF-TOKEN, PHPSESSID, Cloudflare's __cf_bm …) are green; any other own
 * cookie or storage entry is yellow, as it may be needed to run the site and wants a look.
 */
export function cookies(scan: Scan): Result {
  const own = ownSites(scan)
  const https = isHttps(scan)
  const found = scan.cookies.map((c): CookieFinding => {
    const service = serviceOfCookie(c.name)
    const missing: CookieFinding['missing'] = []
    if (https && !c.secure) missing.push('Secure')
    if (service?.httpOnly && !c.httpOnly) missing.push('HttpOnly')
    return { ...c, thirdParty: !own.has(site(c.domain)), service, missing }
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
 * The first link per kind whose text or address names it, on the page's own site if there is one: a cookie banner's
 * link to policies.google.com/privacy is Google's policy, not the site's. A link like „Impressum & Datenschutz“
 * counts for both.
 */
export function legalLinks(links: Link[], pageUrl?: string): (Link & { kind: LegalKind })[] {
  const own = pageUrl ? site(new URL(pageUrl).hostname) : undefined
  const out: (Link & { kind: LegalKind })[] = []
  for (const kind of ['impressum', 'datenschutz'] as const) {
    const candidates = links.filter(l => /^https?:/.test(l.href) && (LEGAL[kind].test(l.text) || LEGAL[kind].test(l.href)))
    const l = candidates.find(l => site(new URL(l.href).hostname) === own) ?? candidates[0]
    if (l) out.push({ ...l, kind })
  }
  return out
}

/** Impressum and Datenschutz each need a link on the page that opens without error. */
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
    r.http = 'error' in scan.http ? 'unreachable' : scan.http.finalUrl.startsWith('https:') ? 'redirects' : 'no-redirect'
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

export function runChecks(scan: Scan, now = Date.now()): Result[] {
  return [thirdParty(scan), cookies(scan), legal(scan), https(scan, now), headers(scan), resources(scan), forms(scan), disclosure(scan)]
}

/**
 * What identifies a finding from one scan to the next, whatever the language: the report marks findings by it, and
 * --baseline compares by it.
 */
export const key = {
  host: (host: string) => `third-party ${host}`,
  cookie: (c: { name: string; domain: string }) => `cookie ${c.name} ${c.domain}`,
  storage: (e: { area: string; key: string }) => `storage ${e.area} ${e.key}`,
  legal: (kind: LegalKind) => `legal ${kind}`,
  https: (what: 'https' | 'cert' | 'http' | 'hsts') => `https ${what}`,
  header: (name: string) => `header ${name}`,
  csp: (weakness: string) => `csp ${weakness}`,
  form: (f: { method: string; action: string }) => `form ${f.method} ${f.action}`,
  disclosure: (d: { name: string }) => `disclosure ${d.name}`,
  resource: (r: { problem: string; url: string }) => `resource ${r.problem} ${r.url}`,
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
      return list(r.hosts).map(h => ({ key: key.host(h.host), level: 'red' }))
    case 'cookies':
      return [
        ...list(r.cookies).map(c => ({ key: key.cookie(c), level: cookieLevel({ ...c, missing: list(c.missing) }) })),
        ...list(r.storage).map(e => ({ key: key.storage(e), level: storageLevel(e) })),
      ]
    case 'legal':
      return list(r.pages).map(p => ({ key: key.legal(p.kind), level: legalLevel(p) }))
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
    case 'forms':
      return list(r.forms).map(f => ({ key: key.form(f), level: formLevel(f) }))
    case 'disclosure':
      return list(r.findings).map(d => ({ key: key.disclosure(d), level: disclosureLevel(d) }))
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
