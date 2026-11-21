import { describe, expect, test } from 'vitest'
import {
  compare, consentManagers, cookies, disclosure, findings, forms, headers, https, legal, legalLinks, resources, serviceOfCookie, serviceOfStorage, serviceOfHost,
  thirdParty, weakCsp, type Result,
} from '../src/checks.ts'
import type { Scan, Visit } from '../src/scan.ts'

const base: Scan = { url: 'https://www.firma.de/', finalUrl: 'https://www.firma.de/', settled: true, requests: [], cookies: [], storage: [], headers: {}, links: [], legal: [], forms: [], resources: [], userAgent: 'test', sandbox: true }
const req = (host: string) => ({ url: `https://${host}/x`, host, type: 'script' })

describe('thirdParty', () => {
  test('subdomains of the own site are not third parties', () => {
    const r = thirdParty({ ...base, requests: [req('www.firma.de'), req('cdn.firma.de'), req('firma.de')] })
    expect(r).toMatchObject({ level: 'green', hosts: [] })
  })

  test('a redirect to another domain leaves the domain asked for the own one', () => {
    const r = thirdParty({ ...base, url: 'https://firma.com/', requests: [req('firma.com'), req('www.firma.de')] })
    expect(r).toMatchObject({ level: 'green', hosts: [] })
  })

  test('other sites are red and counted per host', () => {
    const r = thirdParty({ ...base, requests: [req('fonts.gstatic.com'), req('fonts.gstatic.com'), req('cdn.anders.de')] })
    expect(r.level).toBe('red')
    if (r.check !== 'third-party') throw new Error()
    expect(r.hosts.map(h => [h.host, h.service?.name, h.requests])).toEqual([
      ['cdn.anders.de', undefined, 1],
      ['fonts.gstatic.com', 'Google Fonts', 2],
    ])
  })

  test('registrable domain respects public suffixes', () => {
    const uk = { ...base, finalUrl: 'https://www.firma.co.uk/' }
    expect(thirdParty({ ...uk, requests: [req('shop.firma.co.uk')] }).level).toBe('green')
    expect(thirdParty({ ...uk, requests: [req('andere.co.uk')] }).level).toBe('red')
  })
})

describe('own servers on other sites', () => {
  const own = (scan: Partial<Scan>, ...hosts: string[]) => {
    const r = thirdParty({ ...base, ...scan, requests: hosts.map(req) })
    if (r.check !== 'third-party') throw new Error()
    return Object.fromEntries(r.hosts.map(h => [h.host, h.own ?? null]))
  }

  test('--own names them, subdomains included; they are yellow', () => {
    expect(own({ own: ['ztat.net'] }, 'img01.ztat.net', 'ztat.net', 'notztat.net')).toEqual({ 'img01.ztat.net': 'option', 'ztat.net': 'option', 'notztat.net': null })
    expect(thirdParty({ ...base, own: ['ztat.net'], requests: [req('img01.ztat.net')] }).level).toBe('yellow')
  })

  test('the page’s own certificate names them, if its holder is the page', () => {
    const certificate = { validTo: 0, issuer: 'x', subject: '*.wikipedia.org', names: ['*.wikipedia.org', '*.wikimedia.org', 'wikimedia.org'] }
    const wiki = { url: 'https://de.wikipedia.org/', finalUrl: 'https://de.wikipedia.org/', certificate }
    expect(own(wiki, 'upload.wikimedia.org', 'cdn.anders.de')).toEqual({ 'upload.wikimedia.org': 'certificate', 'cdn.anders.de': null })
    // a hoster's shared certificate names its customers, not the page's servers
    expect(own({ ...wiki, certificate: { ...certificate, subject: 'sni.hoster.example' } }, 'upload.wikimedia.org')).toEqual({ 'upload.wikimedia.org': null })
    expect(own({ ...wiki, certificate: { validTo: 0, issuer: 'x', names: certificate.names } }, 'upload.wikimedia.org')).toEqual({ 'upload.wikimedia.org': null })
  })

  test('a name like the page’s, as a whole word', () => {
    expect(own({ finalUrl: 'https://www.kuketz-blog.de/' }, 'media.kuketz.de')).toEqual({ 'media.kuketz.de': 'name' })
    expect(own({ finalUrl: 'https://www.chefkoch.de/' }, 'img.chefkoch-cdn.de')).toEqual({ 'img.chefkoch-cdn.de': 'name' })
    expect(own({ finalUrl: 'https://www.bild.de/' }, 'a.bildstatic.de')).toEqual({ 'a.bildstatic.de': 'name' })
    // a part of a word, a common word or a short name is no tie
    expect(own({ finalUrl: 'https://www.otto.de/' }, 'cdn.ottonova.de')).toEqual({ 'cdn.ottonova.de': null })
    expect(own({ finalUrl: 'https://mein-shop.de/' }, 'shop-cdn.com', 'cdn.shopify.com')).toEqual({ 'shop-cdn.com': null, 'cdn.shopify.com': null })
    expect(own({ finalUrl: 'https://ab.de/' }, 'ab-cdn.de')).toEqual({ 'ab-cdn.de': null })
  })

  test('a known service never belongs to the page, whatever names it', () => {
    expect(own({ finalUrl: 'https://www.google.de/', own: ['google-analytics.com'] }, 'www.google-analytics.com')).toEqual({ 'www.google-analytics.com': null })
  })

  test('their cookies are yellow, not red, and say why', () => {
    const r = cookies({ ...base, own: ['ztat.net'], cookies: [{ name: 'x', domain: 'ztat.net', expires: -1, secure: true, httpOnly: true }] })
    expect(r).toMatchObject({ level: 'yellow', cookies: [{ thirdParty: true, own: 'option' }] })
  })
})

describe('services', () => {
  test('the most specific host wins', () => {
    expect(serviceOfHost('maps.googleapis.com')?.name).toBe('Google Maps')
    expect(serviceOfHost('www.googleapis.com')?.name).toBe('Google')
    expect(serviceOfHost('region1.google-analytics.com')?.name).toBe('Google Analytics')
    expect(serviceOfHost('notgoogle.com')).toBeUndefined()
  })

  test('cookie names are prefixes', () => {
    expect(serviceOfCookie('_ga_ABC123')?.name).toBe('Google Analytics')
    expect(serviceOfCookie('_hjSessionUser_1')?.name).toBe('Hotjar')
    expect(serviceOfCookie('warenkorb')).toBeUndefined()
    expect(serviceOfCookie('packeroo-session')?.name).toBe('Session')
    expect(serviceOfCookie('laravel_session')?.name).toBe('Session')
    expect(serviceOfCookie('XSRF-TOKEN')?.name).toBe('CSRF-Token')
  })
})

describe('cookies', () => {
  const cookie = (name: string, domain = 'www.firma.de', flags = { secure: true, httpOnly: true }) => ({ name, domain, expires: -1, ...flags })

  test('nothing set is green', () => {
    expect(cookies(base).level).toBe('green')
  })

  test('own cookies and storage without a known tracker are yellow', () => {
    expect(cookies({ ...base, cookies: [cookie('warenkorb')] }).level).toBe('yellow')
    expect(cookies({ ...base, storage: [{ area: 'localStorage', key: 'theme' }] }).level).toBe('yellow')
  })

  test("known session and security cookies are green, like Laravel's", () => {
    expect(cookies({ ...base, cookies: [cookie('XSRF-TOKEN'), cookie('packeroo-session')] }).level).toBe('green')
    expect(cookies({ ...base, cookies: [cookie('PHPSESSID'), cookie('__cf_bm')] }).level).toBe('green')
  })

  test("a framework's own storage entries are green, an app's own ones yellow", () => {
    expect(serviceOfStorage('vue-router:scroll')?.name).toMatch(/^Vue Router/)
    const vue = { ...base, storage: [{ area: 'sessionStorage' as const, key: 'vue-router:scroll' }] }
    expect(cookies(vue).level).toBe('green')
    expect(cookies({ ...vue, storage: [...vue.storage, { area: 'localStorage' as const, key: 'packeroo-theme' }] }).level).toBe('yellow')
  })

  test('next to anything unknown they stay yellow, and from another domain red', () => {
    expect(cookies({ ...base, cookies: [cookie('XSRF-TOKEN')], storage: [{ area: 'localStorage', key: 'theme' }] }).level).toBe('yellow')
    expect(cookies({ ...base, cookies: [cookie('PHPSESSID', 'tracker.net')] }).level).toBe('red')
  })

  test('known tracking cookies are red, even when set on the own domain', () => {
    expect(cookies({ ...base, cookies: [cookie('_ga')] }).level).toBe('red')
  })

  test('a session cookie without HttpOnly or a cookie without Secure on https is yellow', () => {
    const r = cookies({ ...base, cookies: [cookie('laravel_session', 'www.firma.de', { secure: true, httpOnly: false })] })
    expect(r).toMatchObject({ level: 'yellow', cookies: [{ missing: ['HttpOnly'] }] })
    expect(cookies({ ...base, cookies: [cookie('PHPSESSID', 'www.firma.de', { secure: false, httpOnly: true })] })).toMatchObject({
      level: 'yellow',
      cookies: [{ missing: ['Secure'] }],
    })
  })

  test('XSRF-TOKEN may be read by scripts, and on http nobody can ask for Secure', () => {
    expect(cookies({ ...base, cookies: [cookie('XSRF-TOKEN', 'www.firma.de', { secure: true, httpOnly: false })] }).level).toBe('green')
    const http = { ...base, finalUrl: 'http://www.firma.de/' }
    expect(cookies({ ...http, cookies: [cookie('PHPSESSID', 'www.firma.de', { secure: false, httpOnly: true })] }).level).toBe('green')
  })

  test('third-party cookies are red', () => {
    const r = cookies({ ...base, cookies: [cookie('id', 'tracker.net')] })
    expect(r.level).toBe('red')
    if (r.check !== 'cookies') throw new Error()
    expect(r.cookies[0]?.thirdParty).toBe(true)
  })
})

describe('legal', () => {
  const links = [
    { text: 'Start', href: 'https://www.firma.de/' },
    { text: 'Impressum', href: 'https://www.firma.de/impressum' },
    { text: 'Privacy', href: 'https://www.firma.de/en/privacy' },
  ]
  const visit = (url: string, status = 200) => ({ url, status, finalUrl: url })

  test('finds links by text or address, one per kind', () => {
    expect(legalLinks(links).map(l => [l.kind, l.href])).toEqual([
      ['impressum', 'https://www.firma.de/impressum'],
      ['datenschutz', 'https://www.firma.de/en/privacy'],
    ])
    expect(legalLinks([{ text: 'Rechtliches', href: 'https://www.firma.de/datenschutz.html' }])[0]?.kind).toBe('datenschutz')
  })

  test('a link on the own site wins over a third party policy that comes first', () => {
    const page = [{ text: 'Privacy', href: 'https://policies.google.com/privacy' }, ...links]
    expect(legalLinks(page, 'https://www.firma.de/').find(l => l.kind === 'datenschutz')?.href).toBe('https://www.firma.de/en/privacy')
    // without one of its own, the other link still counts, so the report can show where it leads
    expect(legalLinks(page.slice(0, 1), 'https://www.firma.de/')[0]?.href).toBe('https://policies.google.com/privacy')
  })

  test('a link that names both counts for both', () => {
    const both = [{ text: 'Impressum & Datenschutz', href: 'https://www.firma.de/impressum/' }]
    expect(legalLinks(both).map(l => l.kind)).toEqual(['impressum', 'datenschutz'])
    expect(legal({ ...base, links: both, legal: [visit('https://www.firma.de/impressum/')] }).level).toBe('green')
  })

  test('both linked and reachable is green', () => {
    const scan = { ...base, links, legal: [visit('https://www.firma.de/impressum'), visit('https://www.firma.de/en/privacy')] }
    expect(legal(scan).level).toBe('green')
  })

  test('a missing link or a broken page is red', () => {
    expect(legal({ ...base, links: links.slice(0, 2), legal: [visit('https://www.firma.de/impressum')] }).level).toBe('red')
    const broken = { ...base, links, legal: [visit('https://www.firma.de/impressum'), visit('https://www.firma.de/en/privacy', 404)] }
    expect(legal(broken).level).toBe('red')
  })

  test('turned away or kept waiting, as by a bot check, is yellow; a missing page and other errors stay red', () => {
    const impressum = visit('https://www.firma.de/impressum')
    const privacy = (v: Visit) => legal({ ...base, links, legal: [impressum, v] }).level
    for (const status of [401, 403, 429]) expect(privacy(visit('https://www.firma.de/en/privacy', status))).toBe('yellow')
    expect(privacy({ url: 'https://www.firma.de/en/privacy', error: 'page.goto: Timeout 15000ms exceeded.' })).toBe('yellow')
    for (const status of [404, 410, 500, 503]) expect(privacy(visit('https://www.firma.de/en/privacy', status))).toBe('red')
    expect(privacy({ url: 'https://www.firma.de/en/privacy', error: 'net::ERR_NAME_NOT_RESOLVED' })).toBe('red')
  })
})

describe('https', () => {
  const NOW = Date.UTC(2026, 10, 20)
  const days = (n: number) => ({ validTo: NOW / 1000 + n * 86_400, issuer: 'R3' })
  const good = {
    ...base,
    headers: { 'strict-transport-security': 'max-age=31536000' },
    certificate: days(60),
    http: { url: 'http://www.firma.de/', status: 200, finalUrl: 'https://www.firma.de/' },
  }

  test('https with redirect, HSTS and a fresh certificate is green', () => {
    expect(https(good, NOW)).toMatchObject({ level: 'green', certDaysLeft: 60, http: 'redirects', hsts: true })
  })

  test('the certificate decides near its end', () => {
    expect(https({ ...good, certificate: days(10) }, NOW).level).toBe('yellow')
    expect(https({ ...good, certificate: days(3) }, NOW).level).toBe('red')
    expect(https({ ...good, certificate: days(-1) }, NOW).level).toBe('red')
  })

  test('no HSTS or nothing on http is yellow, http without redirect red', () => {
    expect(https({ ...good, headers: {} }, NOW).level).toBe('yellow')
    expect(https({ ...good, http: { url: 'http://www.firma.de/', status: 200, finalUrl: 'http://www.firma.de/' } }, NOW)).toMatchObject({ level: 'red', http: 'no-redirect' })
    expect(https({ ...good, http: { url: 'http://www.firma.de/', error: 'refused' } }, NOW)).toMatchObject({ level: 'yellow', http: 'unreachable' })
  })

  test('an error on http, often a bot check, leaves the redirect open: yellow, not red', () => {
    expect(https({ ...good, http: { url: 'http://www.firma.de/', status: 403, finalUrl: 'http://www.firma.de/' } }, NOW)).toMatchObject({ level: 'yellow', http: 'refused' })
    expect(https({ ...good, http: { url: 'http://www.firma.de/', status: 503, finalUrl: 'http://www.firma.de/' } }, NOW)).toMatchObject({ level: 'yellow', http: 'refused' })
  })

  test('a page over plain http is red', () => {
    expect(https({ ...base, finalUrl: 'http://www.firma.de/' }, NOW)).toMatchObject({ level: 'red', https: false })
  })

  test('HSTS with max-age=0 switches it off and counts as none', () => {
    expect(https({ ...good, headers: { 'strict-transport-security': 'max-age=0' } }, NOW)).toMatchObject({ level: 'yellow', hsts: false })
    expect(https({ ...good, headers: { 'strict-transport-security': 'includeSubDomains; max-age="600"' } }, NOW)).toMatchObject({ hsts: true })
  })
})

describe('headers', () => {
  test('all set is green', () => {
    const h = {
      'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=()',
    }
    expect(headers({ ...base, headers: h })).toEqual({ check: 'headers', level: 'green', missing: [], checked: 5, weak: [] })
  })

  test('a CSP or referrer policy in a meta tag counts, frame-ancestors there does not', () => {
    const r = headers({ ...base, metaCsp: "default-src 'self'; frame-ancestors 'none'", metaReferrer: 'no-referrer' })
    expect(r).toMatchObject({ missing: ['X-Frame-Options', 'X-Content-Type-Options', 'Permissions-Policy'] })
  })

  test('a header sent twice still counts', () => {
    const r = headers({ ...base, headers: { 'x-content-type-options': 'nosniff, nosniff' } })
    expect(r.check === 'headers' && r.missing).not.toContain('X-Content-Type-Options')
  })

  test('frame-ancestors in the CSP stands in for X-Frame-Options, otherwise each missing one is listed', () => {
    expect(headers({ ...base, headers: { 'x-frame-options': 'DENY' } })).toMatchObject({
      level: 'yellow',
      missing: ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy'],
    })
  })
})

describe('csp', () => {
  test('a policy that keeps scripts to known sources is fine', () => {
    expect(weakCsp(["default-src 'self'"])).toEqual([])
    expect(weakCsp(["script-src 'self' https://cdn.firma.de; style-src 'unsafe-inline'"])).toEqual([])
    // with a nonce or hash browsers ignore 'unsafe-inline', with 'strict-dynamic' also wide sources
    expect(weakCsp(["script-src 'nonce-abc' 'unsafe-inline' 'strict-dynamic' https:"])).toEqual([])
    expect(weakCsp(["script-src 'sha256-abc=' 'unsafe-inline'"])).toEqual([])
  })

  test("'unsafe-inline', 'unsafe-eval' and wide sources let scripts through", () => {
    expect(weakCsp(["default-src 'self' 'unsafe-inline' 'unsafe-eval'"])).toEqual(["'unsafe-inline'", "'unsafe-eval'"])
    expect(weakCsp(["script-src * data:; default-src 'self'"])).toEqual(['*', 'data:'])
    // script-src wins over default-src
    expect(weakCsp(["default-src 'self'; script-src https:"])).toEqual(['https:'])
  })

  test('a policy without script-src or default-src restricts no scripts', () => {
    expect(weakCsp(["frame-ancestors 'none'"])).toEqual(['no-script-src'])
  })

  test('header and meta tag both apply: one strong policy is enough', () => {
    expect(weakCsp(["frame-ancestors 'none'", "default-src 'self'"])).toEqual([])
    // a header sent twice arrives joined by a comma: two policies, not one
    expect(weakCsp(["default-src 'self', script-src *"])).toEqual([])
  })

  test('of a directive given twice, the first counts', () => {
    expect(weakCsp(["script-src 'self'; script-src *"])).toEqual([])
    expect(weakCsp(["script-src *; script-src 'self'"])).toEqual(['*'])
  })

  test('a weak CSP makes the headers check yellow', () => {
    const h = { 'content-security-policy': "default-src * 'unsafe-inline'", 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=()' }
    expect(headers({ ...base, headers: h })).toMatchObject({ level: 'yellow', missing: [], weak: ["'unsafe-inline'", '*'] })
  })
})

describe('resources', () => {
  const res = (tag: string, url: string, integrity = false) => ({ tag, url, integrity })

  test('own files and third-party files with integrity are fine', () => {
    const r = resources({ ...base, resources: [res('script', 'https://www.firma.de/app.js'), res('script', 'https://cdn.jsdelivr.net/x.js', true), res('img', 'https://cdn.anders.de/a.png')] })
    expect(r).toMatchObject({ level: 'green', findings: [] })
  })

  test('a script or stylesheet of another site without integrity is yellow', () => {
    const r = resources({ ...base, resources: [res('script', 'https://cdn.jsdelivr.net/x.js'), res('stylesheet', 'https://fonts.googleapis.com/css'), res('script', 'https://cdn.jsdelivr.net/x.js')] })
    expect(r).toMatchObject({ level: 'yellow', findings: [{ problem: 'no-integrity', tag: 'script' }, { problem: 'no-integrity', tag: 'stylesheet' }] })
  })

  test('over http on an https page: scripts, stylesheets and frames red, images yellow', () => {
    expect(resources({ ...base, resources: [res('img', 'http://www.firma.de/a.png')] })).toMatchObject({ level: 'yellow', findings: [{ problem: 'insecure' }] })
    expect(resources({ ...base, resources: [res('script', 'http://www.firma.de/a.js', true)] })).toMatchObject({ level: 'red', findings: [{ problem: 'insecure' }] })
    // on an http page nothing is mixed
    expect(resources({ ...base, finalUrl: 'http://www.firma.de/', resources: [res('script', 'http://www.firma.de/a.js')] }).level).toBe('green')
  })
})

describe('cookie banners', () => {
  test('found by their server, a file on the own site, a cookie or a storage entry', () => {
    expect(consentManagers({ ...base, requests: [req('consent.cookiebot.com')] })).toEqual(['Cookiebot'])
    const borlabs = { url: 'https://www.firma.de/wp-content/plugins/borlabs-cookie/assets/borlabs.js', host: 'www.firma.de', type: 'script' }
    expect(consentManagers({ ...base, requests: [borlabs] })).toEqual(['Borlabs Cookie'])
    expect(consentManagers({ ...base, cookies: [{ name: 'OptanonConsent', domain: 'www.firma.de', expires: -1, secure: true, httpOnly: false }] })).toEqual(['OneTrust'])
    expect(consentManagers({ ...base, storage: [{ area: 'localStorage', key: 'uc_settings' }] })).toEqual(['Usercentrics'])
    expect(consentManagers({ ...base, requests: [req('fonts.gstatic.com')] })).toEqual([])
    // a file name counts at the end of the path only
    const klaro = (path: string) => consentManagers({ ...base, requests: [{ url: `https://www.firma.de${path}`, host: 'www.firma.de', type: 'script' }] })
    expect(klaro('/js/klaro.js')).toEqual(['Klaro'])
    expect(klaro('/js/klaro.json')).toEqual([])
  })

  test('the third-party check names them', () => {
    expect(thirdParty({ ...base, requests: [req('app.usercentrics.eu'), req('app.usercentrics.eu')] })).toMatchObject({ level: 'yellow', consent: ['Usercentrics'] })
  })

  test('cookie banners and captchas are yellow, anything else on another site red', () => {
    expect(thirdParty({ ...base, requests: [req('consent.cookiebot.com'), req('challenges.cloudflare.com')] }).level).toBe('yellow')
    expect(thirdParty({ ...base, requests: [req('consent.cookiebot.com'), req('fonts.gstatic.com')] }).level).toBe('red')
    expect(thirdParty({ ...base, requests: [req('js.stripe.com')] }).level).toBe('red')
  })

  test("the banner's own cookie is green, a chat's yellow, a tracker's red", () => {
    const c = (name: string) => ({ name, domain: 'www.firma.de', expires: -1, secure: true, httpOnly: false })
    expect(cookies({ ...base, cookies: [c('CookieConsent'), c('euconsent-v2')] }).level).toBe('green')
    expect(cookies({ ...base, cookies: [c('intercom-id-abc')] }).level).toBe('yellow')
    expect(cookies({ ...base, cookies: [c('_ttp')] }).level).toBe('red')
  })
})

describe('compare', () => {
  const third = (...hosts: string[]): Result => ({ check: 'third-party', level: hosts.length ? 'red' : 'green', hosts: hosts.map(host => ({ host, service: undefined, requests: 1 })), consent: [] })
  const disc = (version: boolean): Result => ({ check: 'disclosure', level: version ? 'yellow' : 'green', findings: [{ source: 'header', name: 'server', value: version ? 'nginx/1.2' : 'nginx', version }] })

  test('findings carry a key that stays the same across scans', () => {
    expect(findings(third('a.example'))).toEqual([{ key: 'third-party a.example', level: 'red' }])
    // a file without its query: a new cache buster is no new finding
    const file = (url: string) => findings(resources({ ...base, resources: [{ tag: 'script', url, integrity: false }] }))
    expect(file('https://cdn.jsdelivr.net/x.js?ver=1')).toEqual(file('https://cdn.jsdelivr.net/x.js?ver=2'))
  })

  test('two findings with the same key both count', () => {
    const form = (action: string): Result => forms({ ...base, forms: [{ action: 'https://www.firma.de/suche', method: 'get' }, { action, method: 'get' }] })
    expect(findings(form('http://www.firma.de/suche')).map(f => f.key)).toEqual(['form get https://www.firma.de/suche', 'form get http://www.firma.de/suche'])
    const twice = form('https://www.firma.de/suche')
    expect(findings(twice).map(f => f.key)).toEqual(['form get https://www.firma.de/suche', 'form get https://www.firma.de/suche #2'])
  })

  test('a known cookie prefix does not catch a site’s own cookie', () => {
    expect(serviceOfCookie('ph_session_pref')).toBeUndefined()
    expect(serviceOfCookie('ph_phc_abc123_posthog')?.name).toBe('PostHog')
  })

  test('new is what was not flagged before, or milder; gone what is no longer flagged', () => {
    const r = compare([third('a.example', 'b.example'), disc(true)], [third('a.example', 'c.example'), disc(false)])
    expect(r.fresh.map(f => f.key)).toEqual(['third-party b.example', 'disclosure server'])
    expect(r.gone.map(f => f.key)).toEqual(['third-party c.example'])
  })

  test('the same findings compare as nothing new', () => {
    expect(compare([third('a.example')], [third('a.example')])).toEqual({ fresh: [], gone: [] })
  })

  test('a baseline from an older spurlos, with lists missing, does not throw', () => {
    const old = [{ check: 'headers', level: 'yellow', missing: ['Permissions-Policy'], checked: 5 }] as unknown as Result[]
    expect(compare([third()], old)).toEqual({ fresh: [], gone: [{ key: 'header Permissions-Policy', level: 'yellow' }] })
  })
})

describe('forms', () => {
  const form = (action: string) => ({ action, method: 'post' })

  test('own https forms are green, foreign ones yellow, http ones red', () => {
    expect(forms({ ...base, forms: [form('https://www.firma.de/kontakt')] }).level).toBe('green')
    expect(forms({ ...base, forms: [form('https://formspree.io/f/abc')] })).toMatchObject({ level: 'yellow', forms: [{ problem: 'third-party' }] })
    expect(forms({ ...base, forms: [form('http://www.firma.de/kontakt')] })).toMatchObject({ level: 'red', forms: [{ problem: 'unencrypted' }] })
  })

  test('no forms, or only javascript ones, is green', () => {
    expect(forms(base).level).toBe('green')
    expect(forms({ ...base, forms: [form('javascript:void(0)')] })).toMatchObject({ level: 'green', forms: [] })
  })
})

describe('disclosure', () => {
  test('versions in headers or the generator tag are yellow, bare names green', () => {
    const r = disclosure({
      ...base,
      headers: { server: 'Apache/2.4.41 (Ubuntu)', 'x-powered-by': 'PHP/8.1.2' },
      generator: 'WordPress 6.2',
    })
    expect(r).toMatchObject({ level: 'yellow' })
    if (r.check !== 'disclosure') throw new Error()
    expect(r.findings.map(d => [d.name, d.version])).toEqual([
      ['server', true],
      ['x-powered-by', true],
      ['generator', true],
    ])
    expect(disclosure({ ...base, headers: { server: 'nginx' } })).toMatchObject({ level: 'green', findings: [{ name: 'server', version: false }] })
  })

  test('nothing named is green', () => {
    expect(disclosure({ ...base, headers: { 'content-type': 'text/html' } })).toEqual({ check: 'disclosure', level: 'green', findings: [] })
  })
})
