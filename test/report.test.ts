import { expect, test } from 'vitest'
import { compare, type Result } from '../src/checks.ts'
import { banner, clean, html, htmlReports, json, jsonReports, text } from '../src/report.ts'
import type { Scan } from '../src/scan.ts'

// escapes, so the test shows what it feeds in: ESC, BEL, a right-to-left override, an Arabic letter mark, an 8-bit CSI
const evil = 'WordPress\x1b[2J\x1b]8;;https://evil.example\x07 6.2‮gnp.exe؜\u009b'
const shown = 'WordPress�[2J�]8;;https://evil.example� 6.2�gnp.exe��'

test('what the page says cannot steer the terminal', () => {
  const scan = { url: 'https://shop.example/', finalUrl: 'https://shop.example/\x1b[31m', settled: true } as Scan
  const results: Result[] = [
    { check: 'disclosure', level: 'yellow', findings: [{ source: 'meta', name: 'generator', value: evil, version: true }] },
  ] as Result[]
  for (const color of [false, true]) {
    const report = text(scan, results, 'de', { color })
    expect(report).toContain(shown)
    expect(report).not.toContain('\x1b[2J')
    expect(report).not.toContain('\x07')
    expect(report).not.toContain('‮')
    expect(report).not.toContain('/\x1b[31m')
  }
  // JSON keeps the values as sent, escaped so that printing it is harmless too
  const out = json(scan, results, 'de')
  expect(out).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f؜‪-‮]/)
  expect(JSON.parse(out).results[0].findings[0].value).toBe(evil)
  expect(clean('Größe „ok“ – fine')).toBe('Größe „ok“ – fine')
})

test('what the page says cannot add markup to the HTML report', () => {
  const scan = { url: 'https://shop.example/', finalUrl: 'https://shop.example/"><script>alert(1)</script>', settled: false } as Scan
  const results: Result[] = [
    { check: 'disclosure', level: 'yellow', findings: [{ source: 'meta', name: 'generator', value: `<img src=x onerror=alert(1)> ${evil}`, version: true }] },
    { check: 'headers', level: 'green', missing: [], checked: 5, weak: [] },
  ] as Result[]
  const page = html(scan, results, 'de', { now: Date.UTC(2026, 10, 21, 12), timeZone: 'UTC' })
  expect(page).not.toMatch(/<script|<img/)
  expect(page).toContain('&lt;img src=x onerror=alert(1)&gt; WordPress�[2J')
  expect(page).toContain('/&quot;&gt;&lt;script&gt;')
  expect(page).not.toContain('‮')
  // nothing loads from anywhere, even if something slipped through
  expect(page).toContain(`content="default-src 'none'; style-src 'unsafe-inline'"`)
  // the yellow check open, the green one a single line, the note when the page was still loading, the disclaimer always
  expect(page).toMatch(/<details class="check yellow" open>/)
  expect(page).toMatch(/<div class="check green">/)
  expect(page).toContain('lud noch nach')
  expect(page).toContain('geprüft am 21. November 2026 um 12:00 UTC')
  // the logo inline, for light and dark
  expect(page).toMatch(/<svg class="logo light"[^>]*>.*<svg class="logo dark"/s)
  expect(page).toContain('keine Rechtsberatung')
})

test('the logo for the help: the lights in color only when asked', () => {
  expect(banner()).not.toContain('\x1b')
  expect(banner()).toContain('█ ● ● ● █   spurlos')
  expect(banner(true)).toContain('\x1b[31m●')
})

const page = (finalUrl: string, extra: Partial<Scan> = {}) => ({ url: finalUrl, finalUrl, settled: true, ...extra }) as Scan
const third = (...hosts: string[]): Result => ({ check: 'third-party', level: hosts.length ? 'red' : 'green', hosts: hosts.map(host => ({ host, service: undefined, requests: 1 })), consent: [], selfHosted: [] })

test('new findings since the baseline are marked, gone ones listed', () => {
  const now = [third('a.example', 'b.example')]
  const before = [third('a.example', 'c.example')]
  const c = { file: 'baseline.json', comparison: compare(now, before), before }
  const report = text(page('https://shop.example/'), now, 'de', { compare: c })
  expect(report).toContain('verglichen mit baseline.json: 1 neu, 1 weg')
  expect(report).toContain('🔴 [neu] b.example')
  expect(report).toContain('🔴 a.example')
  expect(report).not.toContain('[neu] a.example')
  // gone, named as the baseline's report named it
  expect(report).toContain('weg: c.example')
  expect(html(page('https://shop.example/'), now, 'en', { compare: c })).toContain('<li class="red"><span class="new">new</span>b.example')
  expect(JSON.parse(json(page('https://shop.example/'), now, 'de', c)).compare).toEqual({
    baseline: 'baseline.json',
    new: [{ key: 'third-party b.example', level: 'red' }],
    gone: [{ key: 'third-party c.example', level: 'red' }],
  })
})

test('the screenshot goes into the HTML report, not into the JSON', () => {
  const shot = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')
  const s = page('https://shop.example/', { screenshot: shot })
  const out = html(s, [third()], 'de')
  expect(out).toContain(`<img src="data:image/jpeg;base64,${shot}"`)
  expect(out).toContain(`content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"`)
  expect(JSON.parse(json(s, [third()], 'de')).scan.screenshot).toBeUndefined()
  // anything but base64 stays out
  expect(html(page('https://shop.example/', { screenshot: '"><script>' }), [third()], 'de')).not.toContain('<img')
})

test('several pages: one HTML page with a section each, a JSON list', () => {
  const reports = [{ scan: page('https://a.example/'), results: [third()] }, { scan: page('https://b.example/'), results: [third('x.example')] }]
  const out = htmlReports(reports, 'de')
  expect(out.match(/<section class="report">/g)).toHaveLength(2)
  // the logo once, the disclaimer once
  expect(out.match(/<svg class="logo light"/g)).toHaveLength(1)
  expect(out.match(/keine Rechtsberatung/g)).toHaveLength(1)
  const list = JSON.parse(jsonReports(reports, 'de'))
  expect(list.map((r: { scan: Scan }) => r.scan.finalUrl)).toEqual(['https://a.example/', 'https://b.example/'])
})

test('a server of the page on another site says why it counts as the page’s own', () => {
  const scan = { url: 'https://de.wikipedia.org/', finalUrl: 'https://de.wikipedia.org/', settled: true } as Scan
  const results = [
    { check: 'third-party', level: 'yellow', consent: [], hosts: [{ host: 'upload.wikimedia.org', service: undefined, requests: 2, own: 'certificate' }] },
    { check: 'cookies', level: 'yellow', storage: [], cookies: [{ name: 'WMF-Uniq', domain: 'upload.wikimedia.org', expires: -1, secure: true, httpOnly: true, thirdParty: true, service: undefined, missing: [], own: 'certificate' }] },
  ] as Result[]
  const de = text(scan, results, 'de')
  expect(de).toContain('🟡 upload.wikimedia.org – gehört laut Zertifikat zur Seite (2 Anfragen)')
  expect(de).toContain('🟡 Cookie WMF-Uniq (upload.wikimedia.org) – gehört laut Zertifikat zur Seite, unbekannt')
  expect(de).toContain('Gelb statt rot, wo ein Server zur Seite zu gehören scheint.')
  expect(text(scan, results, 'en')).toContain('belongs to the site per its certificate (2 requests)')
})

test('the same form twice is one line with its count', () => {
  const scan = { url: 'https://www.firma.de/', finalUrl: 'https://www.firma.de/', settled: true } as Scan
  const search = { action: 'https://www.firma.de/suche', method: 'get' }
  const results = [{ check: 'forms', level: 'green', forms: [search, { action: 'https://www.firma.de/', method: 'get' }, search] }] as Result[]
  const report = text(scan, results, 'de', { verbose: true })
  expect(report.match(/GET https:\/\/www\.firma\.de\/suche/g)).toHaveLength(1)
  expect(report).toContain('GET https://www.firma.de/suche – sendet verschlüsselt an die eigene Seite (2×)')
  expect(report).toContain('Formulare                  3')
})

test('a legal page that turns spurlos away says it could not be checked', () => {
  const scan = { url: 'https://www.firma.de/', finalUrl: 'https://www.firma.de/', settled: true } as Scan
  const results = [
    {
      check: 'legal', level: 'yellow', pages: [
        { kind: 'impressum', link: { text: 'Impressum', href: 'https://www.firma.de/impressum' }, visit: { url: 'https://www.firma.de/impressum', status: 403, finalUrl: 'https://www.firma.de/impressum' } },
        { kind: 'datenschutz', link: { text: 'Datenschutz', href: 'https://www.firma.de/datenschutz' }, visit: { url: 'https://www.firma.de/datenschutz', error: 'page.goto: Timeout 15000ms exceeded.' } },
      ],
    },
  ] as Result[]
  const de = text(scan, results, 'de')
  expect(de).toContain('beide verlinkt, nicht alles prüfbar')
  expect(de).toContain('🟡 Impressum: „Impressum“ → https://www.firma.de/impressum – antwortet mit Status 403, oft wegen eines Bot-Schutzes')
  expect(de).toContain('🟡 Datenschutzerklärung: „Datenschutz“ → https://www.firma.de/datenschutz – keine Antwort nach 15 Sekunden, oft wegen eines Bot-Schutzes')
  expect(text(scan, results, 'en')).toContain('answers with status 403, often because of a bot check')
})

test('services the site runs itself are named, in either language; an older baseline has none', () => {
  const r: Result = { check: 'third-party', level: 'green', hosts: [], consent: [], selfHosted: ['Sentry', 'Matomo'] }
  expect(text(page('https://shop.example/'), [r], 'de', { verbose: true })).toContain('Auf eigenen Servern erkannt: Sentry, Matomo.')
  expect(text(page('https://shop.example/'), [r], 'en', { verbose: true })).toContain('Found on the site’s own servers: Sentry, Matomo.')
  const old = { check: 'third-party', level: 'green', hosts: [], consent: [] } as unknown as Result
  expect(text(page('https://shop.example/'), [old], 'de', { verbose: true })).not.toContain('Auf eigenen Servern')
})

test('the platform the site runs on is named, and gives no tips for its own servers', () => {
  const r: Result = {
    check: 'third-party',
    level: 'red',
    hosts: [
      { host: 'cdn.shopify.com', service: { name: 'Shopify', category: 'cdn', hosts: ['cdn.shopify.com'] }, requests: 3, own: 'platform' },
      { host: 'www.googletagmanager.com', service: { name: 'Google Tag Manager', category: 'tracking', hosts: ['googletagmanager.com'] }, requests: 1 },
    ],
    consent: [],
    selfHosted: [],
    platform: 'Shopify',
  }
  const de = text(page('https://shop.example/'), [r], 'de')
  expect(de).toContain('🟡 cdn.shopify.com – Shopify, gehört zum Hoster der Seite (3 Anfragen)')
  expect(de).toContain('Die Seite läuft auf Shopify.')
  // the CDN tip is for libraries a site can serve itself, not for its host
  expect(de).not.toContain('Bibliotheken von einem CDN')
  expect(de).not.toContain('Eigene Server nennst du mit --own')
  expect(text(page('https://shop.example/'), [r], 'en')).toContain('The site runs on Shopify.')
})
