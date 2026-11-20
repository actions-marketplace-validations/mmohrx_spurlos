import { expect, test } from 'vitest'
import type { Result } from '../src/checks.ts'
import { clean, json, text } from '../src/report.ts'
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
  const out = json(scan, results)
  expect(out).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f؜‪-‮]/)
  expect(JSON.parse(out).results[0].findings[0].value).toBe(evil)
  expect(clean('Größe „ok“ – fine')).toBe('Größe „ok“ – fine')
})
