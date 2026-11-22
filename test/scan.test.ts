import { describe, expect, test } from 'vitest'
import { hostLevel, runChecks, type Result } from '../src/checks.ts'
import { text } from '../src/report.ts'
import { MESSAGES } from '../src/lang/index.ts'
import { BOT_AGENT, PHONE, REFUSED, scan } from '../src/scan.ts'
import { fetched, offline, redirects, seen, SITE, staysOnHttp } from './site.ts'

const pick = <C extends Result['check']>(results: Result[], check: C) => {
  const r = results.find(r => r.check === check)
  if (!r) throw new Error(`no ${check} result`)
  return r as Extract<Result, { check: C }>
}

describe('scan', { timeout: 30_000 }, () => {
  test('a clean page passes every check', async () => {
    const s = await scan(`${SITE}/`, { setup: offline, fetch: redirects })
    const results = runChecks(s)
    expect(Object.fromEntries(results.map(r => [r.check, r.level]))).toEqual({
      'third-party': 'green',
      cookies: 'green',
      fingerprinting: 'green',
      access: 'green',
      legal: 'green',
      https: 'green',
      headers: 'green',
      resources: 'green',
      forms: 'green',
      disclosure: 'green',
      mobile: 'green',
      accessibility: 'green',
    })
    expect(pick(results, 'https').http).toBe('redirects')
    expect(pick(results, 'accessibility').statement?.href).toBe(`${SITE}/barrierefreiheit`)
    expect(s.legal.map(v => v.url)).toEqual([`${SITE}/impressum`, `${SITE}/datenschutz`])
    expect(s).toMatchObject({ metaCsp: "default-src 'self'", metaReferrer: 'no-referrer' })

    // green checks take one line each; their findings show with verbose
    const short = text(s, results, 'de')
    expect(short).toMatch(/^beim Aufruf \d+ Anfragen, [\d,]+ kB; keine an andere Domains$/m)
    expect(short).not.toContain('Impressum: „Impressum“')
    expect(short).toContain('--verbose')
    const long = text(s, results, 'de', { verbose: true })
    expect(long).toContain('Impressum: „Impressum“')
    expect(long).not.toContain('--verbose')
  })

  test('links and forms inside shadow roots count', async () => {
    const s = await scan(`${SITE}/components.html`, { setup: offline, fetch: redirects })
    const results = runChecks(s)
    expect(pick(results, 'legal').level).toBe('green')
    expect(s.legal.map(v => v.url)).toEqual([`${SITE}/impressum`, `${SITE}/datenschutz`])
    expect(pick(results, 'forms').forms.map(f => [f.action, f.problem])).toEqual([['http://shop.example/newsletter', 'unencrypted']])
  })

  test('a page that turns spurlos away, as bot checks do, says so instead of checking the error page', async () => {
    await expect(scan(`${SITE}/blocked.html`, { setup: offline, fetch: redirects })).rejects.toThrow(`${REFUSED} 403`)
    expect(MESSAGES.de.failed('https://shop.example/', `${REFUSED} 403`)).toContain('mit Status 403 abgewiesen, oft wegen eines Bot-Schutzes')
    expect(MESSAGES.en.failed('https://shop.example/', `${REFUSED} 429`)).toContain('turned the request away with status 429')
    expect(MESSAGES.de.failed('https://a.example/', 'page.goto: Timeout 30000ms exceeded.')).toBe('https://a.example/ ließ sich nicht prüfen: keine Antwort nach 30 Sekunden')
    expect(MESSAGES.en.failed('https://a.example/', 'page.goto: Timeout 30000ms exceeded.')).toBe('https://a.example/ could not be checked: no answer after 30 seconds')
    // what Chromium says when it will not connect at all
    expect(MESSAGES.de.failed('https://a.example/', 'page.goto: net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH at https://a.example/')).toContain('oft nur das veraltete TLS 1.0 oder 1.1')
    expect(MESSAGES.en.failed('https://a.example/', 'page.goto: net::ERR_CERT_DATE_INVALID at https://a.example/')).toContain('The certificate is invalid (ERR_CERT_DATE_INVALID).')
  })

  test('a privacy policy as a PDF opens as a download, and counts as reachable; a script in its link is no text', async () => {
    const s = await scan(`${SITE}/pdf.html`, { setup: offline, fetch: redirects })
    expect(s.legal.find(v => v.url === `${SITE}/datenschutz.pdf`)).toMatchObject({ status: 200 })
    // a script inside the link is not part of its text
    expect(s.links.find(l => l.href === `${SITE}/datenschutz.pdf`)?.text).toBe('Datenschutz')
    expect(pick(runChecks(s), 'legal').level).toBe('green')
  })

  test('a server that refuses http://, often a bot check, leaves the redirect open', async () => {
    const refuses: typeof fetch = async input => {
      const r = new Response(null, { status: 403 })
      Object.defineProperty(r, 'url', { value: String(input) })
      return r
    }
    const s = await scan(`${SITE}/`, { setup: offline, fetch: refuses })
    expect(pick(runChecks(s), 'https')).toMatchObject({ level: 'yellow', http: 'refused' })
  })

  test('a page with fonts, tag manager, video, cookies and leaky forms', async () => {
    const s = await scan(`${SITE}/tracked.html`, { setup: offline, fetch: staysOnHttp })
    const results = runChecks(s)

    const third = pick(results, 'third-party')
    expect(third.level).toBe('red')
    expect(third.hosts.map(h => h.host)).toEqual(
      expect.arrayContaining(['fonts.googleapis.com', 'www.googletagmanager.com', 'www.youtube.com', 'cdn.unbekannt.example']),
    )
    // the second browser that opens the legal pages and http:// must not add to the scan
    expect(s.requests.some(r => r.url.includes('/rechtliches'))).toBe(false)

    const cookies = pick(results, 'cookies')
    expect(cookies.level).toBe('red')
    expect(cookies.cookies.map(c => c.name).sort()).toEqual(['_ga', 'session'])
    expect(cookies.storage).toEqual([{ area: 'localStorage', key: 'theme', service: undefined }])

    const legal = pick(results, 'legal')
    expect(legal.level).toBe('red')
    expect(legal.pages.map(p => [p.kind, p.visit && 'status' in p.visit ? p.visit.status : undefined])).toEqual([
      ['impressum', 404],
      ['datenschutz', undefined],
    ])

    expect(pick(results, 'https')).toMatchObject({ level: 'red', hsts: false, http: 'no-redirect' })
    expect(pick(results, 'headers').missing).toHaveLength(5)
    // the script over http is blocked, but still in the markup; the third-party ones lack integrity
    const res = pick(results, 'resources')
    expect(res.level).toBe('red')
    expect(res.findings.map(f => `${f.problem} ${f.url}`)).toEqual(
      expect.arrayContaining(['insecure http://shop.example/alt.js', 'no-integrity https://www.googletagmanager.com/gtag/js?id=G-TEST', 'no-integrity https://fonts.googleapis.com/css2?family=Inter',
        // integrity="" protects nothing
        'no-integrity https://cdn.jsdelivr.net/npm/slider.js']),
    )
    // held back by the cookie banner: it does not run, so it is no finding
    expect(res.findings.some(f => f.url.includes('maps.googleapis.com'))).toBe(false)
    expect(pick(results, 'third-party').consent).toEqual(['Usercentrics'])
    // the banner yellow, the trackers red
    const hostLights = Object.fromEntries(third.hosts.map(h => [h.host, hostLevel(h)]))
    expect(hostLights).toMatchObject({ 'app.usercentrics.eu': 'yellow', 'www.googletagmanager.com': 'red', 'fonts.googleapis.com': 'red' })
    expect(pick(results, 'forms').forms.map(f => f.problem)).toEqual(['unencrypted', 'third-party'])
    expect(pick(results, 'disclosure').findings.map(d => `${d.name}: ${d.value}`)).toEqual([
      'server: Apache/2.4.41 (Ubuntu)',
      'x-powered-by: PHP/8.1.2',
      'generator: WordPress 6.2',
    ])
    // the foreign script reads canvas, audio and, where Chromium has WebGL, the graphics card; the inline emoji test is none
    const fp = pick(results, 'fingerprinting')
    expect(fp.level).toBe('red')
    expect(fp.findings.map(f => f.api)).toEqual(expect.arrayContaining(['canvas', 'audio']))
    expect(new Set(fp.findings.map(f => f.script))).toEqual(new Set(['https://fp.unbekannt.example/fp.js']))
    // the page's own inline script asks for location and notifications, and registers a service worker
    const access = pick(results, 'access')
    expect(access.level).toBe('yellow')
    expect(access.findings.map(a => [a.api, a.script, a.thirdParty])).toEqual(
      expect.arrayContaining([
        ['geolocation', `${SITE}/tracked.html`, false],
        ['notifications', `${SITE}/tracked.html`, false],
        ['service-worker', `${SITE}/tracked.html`, false],
      ]),
    )
    // the image without alt, both newsletter fields without a label, the viewport that locks zooming
    expect(pick(results, 'accessibility')).toMatchObject({
      level: 'yellow',
      problems: ['images', 'fields', 'zoom'],
      images: [`${SITE}/team.jpg`],
      fields: ['input mail', 'input mail'],
    })
    // the table of fixed width sticks out of the window
    expect(pick(results, 'mobile')).toMatchObject({ level: 'yellow', problems: ['overflow'], mobile: false })
    // set without Secure on an https page
    expect(pick(results, 'cookies').cookies.find(c => c.name === 'session')?.missing).toEqual(['Secure'])

    const report = text(s, results, 'de')
    expect(report).toContain('Google Fonts')
    expect(report).toMatch(/^beim Aufruf \d+ Anfragen, [\d,]+ kB; davon \d+ mit [\d,]+ kB an andere Domains$/m)
    expect(report).toContain('🔴 https://fp.unbekannt.example/fp.js – liest ein Canvas mit Text aus, fremd')
    expect(report).toContain('🟡 https://shop.example/tracked.html – fragt nach dem Standort, eigen')
    expect(report).toContain('🟢 https://shop.example/tracked.html – registriert einen Service Worker, eigen')
    // each finding carries its own light, so the reader sees which one makes the check red or yellow
    expect(report).toContain('🔴 Cookie _ga (shop.example) – eigen, Google Analytics')
    expect(report).toContain('🟡 Cookie session (shop.example) – eigen, unbekannt, bis Sitzungsende, ohne Secure')
    expect(report).toContain('🟡 Header x-powered-by: PHP/8.1.2')
    expect(report).toContain('🟡 localStorage: theme – unbekannt')
    expect(report).toContain('Datenschutzerklärung: kein Link auf der Seite gefunden')
    expect(report).toContain('http://shop.example/newsletter – sendet unverschlüsselt über http')
    expect(report).toContain('Cookie-Banner erkannt: Usercentrics.')
    expect(report).toContain('Die Tracker oben laden trotzdem schon')
    expect(report).toContain('Schriften lassen sich vom eigenen Server ausliefern')
    expect(report).toContain('Referrer-Policy fehlt – etwa strict-origin-when-cross-origin')
    // the summary comes first, the worst checks lead, and without color the text holds no escape codes
    const lines = report.split('\n')
    expect(lines.slice(0, 3)).toContainEqual(expect.stringMatching(/^\d+ Mängel · \d+ Hinweise?$/))
    const lights = lines.filter(l => /^\S/.test(l) && /^(🔴|🟡|🟢)/.test(l)).map(l => l.slice(0, 2))
    expect(lights).toEqual([...lights].sort((a, b) => ['🔴', '🟡', '🟢'].indexOf(a) - ['🔴', '🟡', '🟢'].indexOf(b)))
    expect(report).not.toContain('\x1b[')
    expect(text(s, results, 'de', { color: true })).toContain('\x1b[1m')

    const english = text(s, results, 'en')
    expect(english).toContain('Privacy policy: no link found on the page')
    expect(english).toContain('Cookie _ga (shop.example) – first-party, Google Analytics')
    expect(english).toContain('http:// serves the page without redirecting to https://.')
    expect(english).not.toMatch(/[äöüß„]/)
  })

  test('a WebSocket, a STUN server and a preconnect count as third parties, though no http request goes to them', async () => {
    const s = await scan(`${SITE}/socket.html`, { setup: offline, fetch: redirects })
    expect(s.requests).toContainEqual({ url: 'ws://127.0.0.1:9/chat', host: '127.0.0.1', type: 'websocket' })
    expect(s.requests).toContainEqual({ url: 'stun:127.0.0.3:9', host: '127.0.0.3', type: 'webrtc' })
    const results = runChecks(s)
    // dns-prefetch only asks the resolver: no host
    expect(pick(results, 'third-party')).toMatchObject({
      level: 'red',
      hosts: [
        { host: '127.0.0.1', requests: 1 },
        { host: '127.0.0.2', requests: 0, preconnect: true },
        { host: '127.0.0.3', requests: 1 },
      ],
    })
    // the page's own inline script: yellow
    expect(pick(results, 'fingerprinting')).toMatchObject({ level: 'yellow', findings: [{ api: 'webrtc', script: `${SITE}/socket.html` }] })
    expect(text(s, results, 'de')).toContain('127.0.0.2 – nur preconnect, keine Anfrage')
  })

  test('--mobile opens the page as a phone: its screen, touch, and Chrome on Android with spurlos in the user agent', async () => {
    seen.length = 0
    const s = await scan(`${SITE}/`, { setup: offline, fetch: redirects, mobile: true })
    expect(s.mobile).toBe(true)
    expect(s.width.window).toBe(PHONE.width)
    expect(s.userAgent).toMatch(/^Mozilla\/5\.0 \(Linux; Android 10; K\) .* Mobile Safari\/537\.36 spurlos\/\d+\.\d+\.\d+$/)
    expect(seen.find(r => r.url === `${SITE}/`)?.ua).toBe(s.userAgent)
    const results = runChecks(s)
    expect(pick(results, 'mobile')).toMatchObject({ level: 'green', mobile: true })
    expect(text(s, results, 'de')).toContain('als Smartphone aufgerufen (--mobile)')
    // the table of fixed width is far too wide for a phone
    const wide = await scan(`${SITE}/tracked.html`, { setup: offline, fetch: staysOnHttp, mobile: true })
    expect(pick(runChecks(wide), 'mobile')).toMatchObject({ problems: ['overflow'], width: { window: PHONE.width } })
  })

  test('a screenshot only when asked for', async () => {
    expect((await scan(`${SITE}/`, { setup: offline, fetch: redirects })).screenshot).toBeUndefined()
    const s = await scan(`${SITE}/`, { setup: offline, fetch: redirects, screenshot: true })
    // a JPEG, in base64
    expect(Buffer.from(s.screenshot ?? '', 'base64').subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  })

  test('the page sees a regular Chrome with spurlos added, the side requests an open bot', async () => {
    seen.length = 0
    fetched.length = 0
    const s = await scan(`${SITE}/`, { setup: offline, fetch: redirects })

    expect(s.userAgent).toMatch(/^Mozilla\/5\.0 \(.+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36 spurlos\/\d+\.\d+\.\d+$/)
    const page = seen.find(r => r.url === `${SITE}/`)
    expect(page?.ua).toBe(s.userAgent)
    expect(page?.ch).toMatch(/"Chromium"/)
    expect(page?.ch).not.toMatch(/Headless/)

    expect(seen.find(r => r.url === `${SITE}/impressum`)?.ua).toBe(BOT_AGENT)
    // http:// as the page: DuckDuckGo serves a bot the page there, a browser a redirect
    expect(fetched).toEqual([s.userAgent])
    expect(BOT_AGENT).toMatch(/^spurlos\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/mmohrx\/spurlos\)$/)
  })

  test('--user-agent replaces every one of them', async () => {
    seen.length = 0
    fetched.length = 0
    await scan(`${SITE}/`, { setup: offline, fetch: redirects, userAgent: 'Test/1' })
    expect(new Set(seen.map(r => r.ua))).toEqual(new Set(['Test/1']))
    expect(fetched).toEqual(['Test/1'])
  })
})
