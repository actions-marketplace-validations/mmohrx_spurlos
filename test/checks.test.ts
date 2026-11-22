import { describe, expect, test } from 'vitest'
import {
  access, accessibility, blocksZoom, compare, load, consentManagers, cookies, disclosure, findings, fingerprinting, forms, headers, https, legal, legalLinks, resources, serviceOfCookie, serviceOfStorage, serviceOfHost,
  thirdParty, weakCsp, type Result,
} from '../src/checks.ts'
import type { Scan, Visit } from '../src/scan.ts'

const base: Scan = { url: 'https://www.firma.de/', finalUrl: 'https://www.firma.de/', settled: true, requests: [], cookies: [], storage: [], headers: {}, links: [], legal: [], forms: [], resources: [], fingerprinting: [], access: [], accessibility: { lang: 'de', images: [], fields: [] }, userAgent: 'test', sandbox: true }
const req = (host: string) => ({ url: `https://${host}/x`, host, type: 'script' })

describe('fingerprinting', () => {
  const fp = (api: 'canvas' | 'webgl' | 'audio', script: string) => ({ api, script })

  test('a foreign script is red, the page\'s own, a captcha and a server of the page yellow', () => {
    const r = fingerprinting({
      ...base,
      own: ['cdn-firma.net'],
      fingerprinting: [
        fp('canvas', 'https://fp.anders.de/fp.js'),
        fp('webgl', 'https://www.firma.de/app.js'),
        fp('audio', 'https://www.recaptcha.net/recaptcha/api.js'),
        fp('canvas', 'https://cdn-firma.net/x.js'),
        fp('canvas', 'about:blank'),
      ],
    })
    if (r.check !== 'fingerprinting') throw new Error()
    expect(r.level).toBe('red')
    expect(r.findings.map(f => [f.host, f.thirdParty, f.own])).toEqual([
      ['fp.anders.de', true, undefined],
      ['www.firma.de', false, undefined],
      ['www.recaptcha.net', true, undefined],
      ['cdn-firma.net', true, 'option'],
      ['', false, undefined],
    ])
    expect(findings(r).map(f => `${f.level} ${f.key}`)).toEqual([
      'red fingerprinting canvas fp.anders.de',
      'yellow fingerprinting webgl www.firma.de',
      'yellow fingerprinting audio recaptcha.net',
      'yellow fingerprinting canvas cdn-firma.net',
      'yellow fingerprinting canvas ',
    ])
  })

  test('nothing read out is green, also for a scan from an older spurlos without the list', () => {
    expect(fingerprinting(base).level).toBe('green')
    const { fingerprinting: _, ...old } = base
    expect(fingerprinting(old as Scan).level).toBe('green')
  })
})

describe('load', () => {
  test('counts requests and bytes, and those to other sites; a request without an answer adds no bytes', () => {
    const at = (host: string, bytes?: number) => ({ url: `https://${host}/x`, host, type: 'script', ...(bytes === undefined ? {} : { bytes }) })
    expect(load({ ...base, requests: [at('www.firma.de', 1000), at('cdn.firma.de', 500), at('fonts.gstatic.com', 300), at('cdn.anders.de')] })).toEqual({
      requests: 4,
      bytes: 1800,
      foreignRequests: 2,
      foreignBytes: 300,
    })
  })
})

describe('accessibility', () => {
  test('each missing basic is yellow; a statement is named, from the own site first', () => {
    const r = accessibility({
      ...base,
      accessibility: { lang: ' ', images: ['https://www.firma.de/a.jpg'], fields: [], viewport: 'width=device-width, maximum-scale=1' },
      links: [
        { text: 'Accessibility', href: 'https://agentur.de/accessibility' },
        { text: 'Erklärung zur Barrierefreiheit', href: 'https://www.firma.de/barrierefreiheit' },
      ],
    })
    expect(r).toMatchObject({ level: 'yellow', problems: ['lang', 'images', 'zoom'], statement: { href: 'https://www.firma.de/barrierefreiheit' } })
    expect(findings(r).map(f => `${f.level} ${f.key}`)).toEqual([
      'yellow accessibility lang',
      'yellow accessibility images',
      'yellow accessibility zoom',
      'green accessibility statement',
    ])
    expect(accessibility(base)).toMatchObject({ level: 'green', problems: [] })
  })

  test('the viewport blocks zooming with user-scalable=no or 0, or a maximum-scale under 2', () => {
    expect(blocksZoom('width=device-width, user-scalable=no')).toBe(true)
    expect(blocksZoom('width=device-width; user-scalable=0')).toBe(true)
    expect(blocksZoom('maximum-scale=1.5')).toBe(true)
    expect(blocksZoom('width=device-width, initial-scale=1, maximum-scale=5')).toBe(false)
    expect(blocksZoom('width=device-width, initial-scale=1')).toBe(false)
  })
})

describe('access', () => {
  test('a service worker is green, notifications yellow, location, camera and microphone red only for a foreign script', () => {
    const r = access({
      ...base,
      access: [
        { api: 'service-worker', script: 'https://www.firma.de/app.js' },
        { api: 'notifications', script: 'https://push.anders.de/sdk.js' },
        { api: 'geolocation', script: 'https://www.firma.de/app.js' },
        { api: 'camera', script: 'https://chat.anders.de/widget.js' },
      ],
    })
    expect(findings(r).map(f => `${f.level} ${f.key}`)).toEqual([
      'green access service-worker www.firma.de',
      'yellow access notifications push.anders.de',
      'yellow access geolocation www.firma.de',
      'red access camera chat.anders.de',
    ])
    expect(r.level).toBe('red')
    expect(access(base).level).toBe('green')
  })
})

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

  test('known services on the own site are named by their paths, and change no light', () => {
    const at = (url: string) => ({ url, host: new URL(url).hostname, type: 'fetch' })
    const r = thirdParty({
      ...base,
      requests: [
        at('https://errors.firma.de/api/65/envelope/?sentry_key=abc'),
        at('https://www.firma.de/stats/matomo.js'),
        at('https://www.firma.de/stats/matomo.php?idsite=1'),
        // a cookie banner is named as one, not as self-hosted
        at('https://www.firma.de/wp-content/plugins/borlabs-cookie/borlabs.js'),
        at('https://www.firma.de/js/app.js'),
      ],
    })
    expect(r).toMatchObject({ level: 'green', hosts: [], selfHosted: ['Sentry', 'Matomo'], consent: ['Borlabs Cookie'] })
    expect(serviceOfStorage('sentryReplaySession')?.name).toBe('Sentry')
  })

  test('a host of another site no name gives away is named by its path', () => {
    const r = thirdParty({ ...base, requests: [{ url: 'https://stats.agentur.de/matomo.php?idsite=3', host: 'stats.agentur.de', type: 'ping' }] })
    if (r.check !== 'third-party') throw new Error()
    expect(r.level).toBe('red')
    expect(r.hosts.map(h => [h.host, h.service?.name])).toEqual([['stats.agentur.de', 'Matomo']])
    expect(r.selfHosted).toEqual([])
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

  test('the servers of the platform the page runs on, known by its headers; its apps and trackers stay red', () => {
    const wix = { headers: { 'x-wix-request-id': '1795266227.34' } }
    expect(own(wix, 'static.parastorage.com', 'frog.wix.com', 'www.googletagmanager.com')).toEqual({
      'static.parastorage.com': 'platform',
      'frog.wix.com': 'platform',
      'www.googletagmanager.com': null,
    })
    // without the header the same servers are anyone's
    expect(own({}, 'static.parastorage.com')).toEqual({ 'static.parastorage.com': null })
    // a header with a value has to say the platform's name
    expect(own({ headers: { 'powered-by': 'Shopify' } }, 'cdn.shopify.com', 'static.parastorage.com')).toEqual({ 'cdn.shopify.com': 'platform', 'static.parastorage.com': null })
    expect(own({ headers: { 'powered-by': 'Something else' } }, 'cdn.shopify.com')).toEqual({ 'cdn.shopify.com': null })
    // Squarespace says so in its server header, whatever the case
    expect(own({ headers: { server: 'squarespace' } }, 'static1.squarespace.com', 'images.squarespace-cdn.com')).toEqual({ 'static1.squarespace.com': 'platform', 'images.squarespace-cdn.com': 'platform' })
    // Webflow by a header of its own
    expect(own({ headers: { 'x-wf-region': 'us-east-1' } }, 'cdn.prod.website-files.com', 'd3e54v103j8qbb.cloudfront.net')).toEqual({ 'cdn.prod.website-files.com': 'platform', 'd3e54v103j8qbb.cloudfront.net': 'platform' })
    // IONOS MyWebsite sets its session cookie on every page
    expect(own({ headers: { 'set-cookie': 'DIY_SB=13eff9fe; path=/;SameSite=None; secure' } }, 'cdn.website-start.de')).toEqual({ 'cdn.website-start.de': 'platform' })
    const r = thirdParty({ ...base, ...wix, requests: [req('static.parastorage.com')] })
    expect(r).toMatchObject({ level: 'yellow', platform: 'Wix' })
    // a cookie on the platform's domain is the site's too
    const c = cookies({ ...base, headers: { 'powered-by': 'Shopify' }, cookies: [{ name: '_shop_app_essential', domain: 'shop.app', expires: -1, secure: true, httpOnly: false }] })
    if (c.check !== 'cookies') throw new Error()
    expect(c.cookies[0]).toMatchObject({ thirdParty: true, own: 'platform' })
  })

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

  test('a page that is a known service itself owns that service’s servers, by the usual reasons', () => {
    const doctolib = { url: 'https://www.doctolib.de/', finalUrl: 'https://www.doctolib.de/' }
    expect(own(doctolib, 'media.doctolib.com', 'www.googletagmanager.com')).toEqual({ 'media.doctolib.com': 'name', 'www.googletagmanager.com': null })
    const c = cookies({ ...base, ...doctolib, cookies: [{ name: 'x', domain: 'doctolib.com', expires: -1, secure: true, httpOnly: true }] })
    expect(c).toMatchObject({ level: 'yellow', cookies: [{ thirdParty: true, own: 'name' }] })
    // wix.com runs on Wix: its servers stay the platform's
    expect(own({ url: 'https://www.wix.com/', finalUrl: 'https://www.wix.com/', headers: { 'x-wix-request-id': '1' } }, 'static.parastorage.com')).toEqual({ 'static.parastorage.com': 'platform' })
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

  test('services that share a prefix keep apart: Snowplow’s _sp_id., Sourcepoint’s _sp_su', () => {
    expect(serviceOfCookie('_sp_id.5b99')?.name).toBe('Snowplow')
    expect(serviceOfStorage('_sp_ses.27f6.expires')?.name).toBe('Snowplow')
    expect(serviceOfCookie('_sp_su')?.name).toBe('Sourcepoint')
    expect(serviceOfStorage('_sp_user_consent_4987')?.name).toBe('Sourcepoint')
    expect(serviceOfHost('tt.omtrdc.net')?.name).toBe('Adobe Target')
    expect(serviceOfHost('accounts.google.com')?.name).toBe('Google Sign-In')
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

  test('a link whose text starts with the word wins over one that names it later, and both over the address alone', () => {
    const datenschutz = (page: { text: string; href: string }[]) => legalLinks(page, 'https://proton.me/').find(l => l.kind === 'datenschutz')?.href
    // proton.me: a blog teaser comes first, the policy later
    expect(datenschutz([
      { text: 'About Swiss privacy', href: 'https://proton.me/blog/switzerland' },
      { text: 'Privacy Policy', href: 'https://proton.me/legal/privacy' },
    ])).toBe('https://proton.me/legal/privacy')
    // mozilla.org: cookie settings under /privacy/ come first, the notice later
    expect(datenschutz([
      { text: 'Cookie settings', href: 'https://proton.me/privacy/websites/cookie-settings/' },
      { text: 'this Privacy Notice', href: 'https://proton.me/privacy/websites/' },
    ])).toBe('https://proton.me/privacy/websites/')
    expect(datenschutz([{ text: 'Mehr zum Datenschutz', href: 'https://proton.me/blog' }, { text: '» Datenschutz', href: 'https://proton.me/ds' }])).toBe('https://proton.me/ds')
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
  const third = (...hosts: string[]): Result => ({ check: 'third-party', level: hosts.length ? 'red' : 'green', hosts: hosts.map(host => ({ host, service: undefined, requests: 1 })), consent: [], selfHosted: [] })
  const disc = (version: boolean): Result => ({ check: 'disclosure', level: version ? 'yellow' : 'green', findings: [{ source: 'header', name: 'server', value: version ? 'nginx/1.2' : 'nginx', version }] })

  test('findings carry a key that stays the same across scans', () => {
    expect(findings(third('a.example'))).toEqual([{ key: 'third-party a.example', level: 'red' }])
    // a file without its query: a new cache buster is no new finding
    const file = (url: string) => findings(resources({ ...base, resources: [{ tag: 'script', url, integrity: false }] }))
    expect(file('https://cdn.jsdelivr.net/x.js?ver=1')).toEqual(file('https://cdn.jsdelivr.net/x.js?ver=2'))
  })

  test('the hosts of a known service are one finding: a new random subdomain is nothing new', () => {
    expect(findings(third('abc.nuid.nmrodam.com', 'secure-eu.nmrodam.com', 'cdn.anders.example'))).toEqual([
      { key: 'third-party nmrodam.com', level: 'red' },
      { key: 'third-party cdn.anders.example', level: 'red' },
    ])
    expect(compare([third('xyz.nuid.nmrodam.com')], [third('abc.nuid.nmrodam.com')])).toEqual({ fresh: [], gone: [] })
    // a host no service claims stands for itself
    expect(compare([third('b.anders.example')], [third('a.anders.example')]).fresh).toEqual([{ key: 'third-party b.anders.example', level: 'red' }])
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
