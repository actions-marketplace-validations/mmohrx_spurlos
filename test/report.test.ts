import { expect, test } from 'vitest'
import type { Result } from '../src/checks.ts'
import { banner, clean, html, json, text } from '../src/report.ts'
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
    { check: 'headers', level: 'green', missing: [], checked: 5 },
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
