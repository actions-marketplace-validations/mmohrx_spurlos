import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { AUTH_REJECTED, AUTH_REQUIRED, scan } from '../src/scan.ts'

// two local servers, so the test needs no network: the site behind a login, and a third party that asks for one too
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
const sent: Record<'site' | 'other', (string | undefined)[]> = { site: [], other: [] }
let site = ''
let other = ''

const listen = async (handle: (req: IncomingMessage, res: ServerResponse) => void) => {
  const server = createServer(handle)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}
const servers: { close(): void }[] = []

beforeAll(async () => {
  const o = await listen((req, res) => {
    sent.other.push(req.headers.authorization)
    res.writeHead(401, { 'www-authenticate': 'Basic realm="other"' }).end()
  })
  other = o.origin
  const s = await listen((req, res) => {
    sent.site.push(req.headers.authorization)
    if (req.headers.authorization !== basic('team', 'geh:eim')) return res.writeHead(401, { 'www-authenticate': 'Basic realm="staging"' }).end()
    if (req.url === '/impressum') return res.writeHead(200, { 'content-type': 'text/html' }).end('<p>Impressum</p>')
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<img src="${other}/pixel.gif"><a href="/impressum">Impressum</a><a href="${other}/datenschutz">Datenschutz</a>`)
  })
  site = s.origin
  servers.push(o.server, s.server)
})
afterAll(() => servers.forEach(s => s.close()))

describe('basic auth', { timeout: 30_000 }, () => {
  test('a page behind a login says so, instead of checking the login page', async () => {
    await expect(scan(`${site}/`)).rejects.toThrow(AUTH_REQUIRED)
    await expect(scan(`${site}/`, { auth: { username: 'team', password: 'falsch' } })).rejects.toThrow(AUTH_REJECTED)
  })

  test('with the login, the page and its own legal pages open; no other server gets it', async () => {
    sent.site.length = 0
    sent.other.length = 0
    const s = await scan(`${site}/`, { auth: { username: 'team', password: 'geh:eim' } })
    expect(s.requests.map(r => r.url)).toContain(`${other}/pixel.gif`)
    expect(s.legal.find(v => v.url === `${site}/impressum`)).toMatchObject({ status: 200 })
    expect(sent.site).toContain(basic('team', 'geh:eim'))
    // the third party asked for a login, on the page and as the Datenschutz link, and got none
    expect(sent.other.length).toBeGreaterThanOrEqual(2)
    expect(sent.other.every(a => a === undefined)).toBe(true)
  })
})
