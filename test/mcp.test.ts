import { PassThrough } from 'node:stream'
import { describe, expect, test } from 'vitest'
import { handle, serve, type Context } from '../src/mcp.ts'
import { scan } from '../src/scan.ts'
import { offline, redirects, SITE, staysOnHttp } from './site.ts'

const context: Context = { lang: 'de', scan: url => scan(url, { setup: offline, fetch: url.includes('tracked') ? staysOnHttp : redirects }) }
const request = (id: number, method: string, params?: object) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })
const toolCall = async (args: object) => {
  const answer = await handle(request(1, 'tools/call', { name: 'scan', arguments: args }), context)
  return (answer as { result: { content: { text: string }[]; isError: boolean } }).result
}

test('initialize names spurlos and agrees on a protocol version', async () => {
  const answer = await handle(request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }), context)
  expect(answer).toMatchObject({ id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'spurlos' } } })
  // a version it does not know: it offers its newest
  const other = await handle(request(2, 'initialize', { protocolVersion: '1999-01-01' }), context)
  expect(other).toMatchObject({ result: { protocolVersion: '2025-11-25' } })
})

test('one tool, read-only, that takes a url', async () => {
  const answer = (await handle(request(1, 'tools/list'), context)) as { result: { tools: { name: string; inputSchema: { required: string[] }; annotations: object }[] } }
  expect(answer.result.tools).toHaveLength(1)
  expect(answer.result.tools[0]).toMatchObject({ name: 'scan', inputSchema: { required: ['url'] }, annotations: { readOnlyHint: true } })
})

test('notifications get no answer, unknown methods an error', async () => {
  expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, context)).toBeUndefined()
  expect(await handle(request(3, 'resources/list'), context)).toMatchObject({ id: 3, error: { code: -32601 } })
  expect(await handle({ hello: 'world' }, context)).toMatchObject({ id: null, error: { code: -32600 } })
  expect(await handle(request(4, 'tools/call', { name: 'other' }), context)).toMatchObject({ id: 4, error: { code: -32602 } })
})

test('wrong arguments come back as a tool error the model can read', async () => {
  const says = async (args: object) => {
    const result = await toolCall(args)
    expect(result.isError).toBe(true)
    return result.content[0]?.text
  }
  expect(await says({ url: 'http://' })).toBe('http:// ist keine gültige Adresse.')
  expect(await says({})).toBe('url fehlt: die Adresse der Seite als Text, etwa firma.de.')
  expect(await says({ url: { href: 'firma.de' } })).toContain('url fehlt')
  expect(await says({ url: 'shop.example', lang: 'fr' })).toBe('lang kennt nur de|en, nicht "fr".')
  expect(await says({ url: 'shop.example', format: 'xml', lang: 'en' })).toBe('format only knows text and json, not "xml".')
})

describe('scan over MCP', { timeout: 30_000 }, () => {
  test('the report with every finding, in the language asked for', async () => {
    const result = await toolCall({ url: `${SITE}/tracked.html`, lang: 'en' })
    expect(result.isError).toBe(false)
    const report = result.content[0]?.text ?? ''
    expect(report).toContain('fonts.googleapis.com')
    expect(report).toContain('not legal advice')
    expect(report).not.toMatch(/\x1b/)
  })

  test('json on request', async () => {
    const result = await toolCall({ url: `${SITE}/`, format: 'json' })
    const parsed = JSON.parse(result.content[0]?.text ?? '')
    expect(parsed.results.every((r: { level: string }) => r.level === 'green')).toBe(true)
    expect(parsed.note).toContain('keine Rechtsberatung')
  })

  test('a site that cannot be opened is a tool error', async () => {
    const failing: Context = { lang: 'de', scan: () => Promise.reject(new Error('net::ERR_NAME_NOT_RESOLVED at https://nix.example/\nCall log: …')) }
    const answer = await handle(request(1, 'tools/call', { name: 'scan', arguments: { url: 'nix.example' } }), failing)
    expect(answer).toMatchObject({
      result: { isError: true, content: [{ text: 'https://nix.example/ ließ sich nicht prüfen: net::ERR_NAME_NOT_RESOLVED at https://nix.example/' }] },
    })
  })
})

test('at most two scans at a time, the rest wait their turn', async () => {
  let open = 0
  let most = 0
  const slow: Context = {
    lang: 'de',
    scan: async () => {
      most = Math.max(most, ++open)
      await new Promise(r => setTimeout(r, 20))
      open--
      throw new Error('done')
    },
  }
  const calls = Array.from({ length: 5 }, (_, i) => handle(request(i, 'tools/call', { name: 'scan', arguments: { url: `s${i}.example` } }), slow))
  expect(await Promise.all(calls)).toHaveLength(5)
  expect(most).toBe(2)
})

test('serve speaks one message per line and ends with its input', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  const lines: unknown[] = []
  output.on('data', (chunk: Buffer) => lines.push(...chunk.toString().trim().split('\n').map(l => JSON.parse(l))))
  const done = serve(context, input, output)
  input.write(JSON.stringify(request(1, 'ping')) + '\n')
  input.write('{ not json\n')
  input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n\n')
  input.end(JSON.stringify(request(2, 'tools/list')) + '\n')
  await done
  // answers come as they are ready, not in order; the ids tell them apart
  expect(lines).toHaveLength(3)
  expect(lines).toEqual(expect.arrayContaining([
    { jsonrpc: '2.0', id: 1, result: {} },
    { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    expect.objectContaining({ id: 2 }),
  ]))
})

test('own goes to the scan as host names; anything else back to the model', async () => {
  let given: string[] | undefined
  const seeing: Context = { lang: 'de', scan: async (_url, options) => ((given = options.own), Promise.reject(new Error('done'))) }
  await handle(request(1, 'tools/call', { name: 'scan', arguments: { url: 'firma.de', own: ['*.ztat.net', 'Bücher.de'] } }), seeing)
  expect(given).toEqual(['ztat.net', 'xn--bcher-kva.de'])
  const wrong = await handle(request(2, 'tools/call', { name: 'scan', arguments: { url: 'firma.de', own: ['https://x.de'] } }), seeing)
  expect(wrong).toMatchObject({ result: { isError: true, content: [{ text: expect.stringContaining('--own braucht einen Hostnamen') }] } })
})
