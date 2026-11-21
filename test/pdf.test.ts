import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from 'vitest'
import { runChecks } from '../src/checks.ts'
import { pdf } from '../src/pdf.ts'
import { html } from '../src/report.ts'
import { scan } from '../src/scan.ts'
import { offline, SITE, staysOnHttp } from './site.ts'

test('the report as PDF', { timeout: 30_000 }, async () => {
  const s = await scan(`${SITE}/tracked.html`, { setup: offline, fetch: staysOnHttp })
  const out = await pdf(html(s, runChecks(s), 'de'))
  expect(out.subarray(0, 5).toString()).toBe('%PDF-')
  expect(out.subarray(-8).toString()).toContain('%%EOF')
})

test('printing the PDF loads nothing, even if something slipped into the report', { timeout: 30_000 }, async () => {
  let hits = 0
  const server = createServer((_, res) => {
    hits++
    res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    const out = await pdf(`<!doctype html><img src="http://127.0.0.1:${port}/x.png"><link rel="stylesheet" href="http://127.0.0.1:${port}/x.css"><script>fetch('http://127.0.0.1:${port}/js')</script>`)
    expect(out.subarray(0, 5).toString()).toBe('%PDF-')
    expect(hits).toBe(0)
  } finally {
    server.close()
  }
})
