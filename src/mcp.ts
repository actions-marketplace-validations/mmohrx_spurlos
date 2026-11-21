import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { runChecks } from './checks.ts'
import { LANGS, MESSAGES, type Lang } from './lang/index.ts'
import { clean, json, text } from './report.ts'
import { scan, toUrl, VERSION, type Scan } from './scan.ts'

/**
 * A Model Context Protocol server over stdio, so an AI assistant can run spurlos itself: one JSON-RPC message
 * per line in, one per line out, nothing else on stdout. It offers a single tool, scan, which is all the
 * protocol spurlos needs; that is small enough to do without the SDK and its dependencies.
 */

/** the protocol versions spurlos speaks, newest first; it only uses what all of them have */
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const TOOL = {
  name: 'scan',
  title: 'spurlos: check a website',
  description:
    'Opens a website in a fresh browser like a first-time visitor who clicks nothing, and reports what happens before any consent: ' +
    'requests to third-party servers, which cookie banner loads, cookies and browser storage, whether Impressum and privacy policy are ' +
    'linked and reachable, HTTPS and certificate, security headers and how tight the CSP is, files embedded over http or without ' +
    'integrity, where forms send to, and software versions the site discloses. ' +
    'Each check gets a traffic light (red, yellow, green). Passive only: it loads the page, opens the legal pages via their links ' +
    'and asks http:// once. It is a technical pre-check, not legal advice: say so when passing the result on. Takes 5 to 30 seconds.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The site to check, e.g. example.com or https://example.com/page; https:// is assumed.' },
      lang: { type: 'string', enum: LANGS, description: 'Language of the report. Defaults to the language the server was started with.' },
      format: {
        type: 'string',
        enum: ['text', 'json'],
        description: 'text (default): the report with every finding. json: the full result, including every request the page made.',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}

type Id = string | number | null
type Message = { jsonrpc: '2.0'; id: Id } & ({ result: unknown } | { error: { code: number; message: string } })

export type Context = {
  /** the language when a call names none: --lang, SPURLOS_LANG or the system's */
  lang: Lang
  /** --user-agent, for every scan */
  userAgent?: string
  /** for tests: opens a URL; spurlos' own scan otherwise */
  scan?: (url: string) => Promise<Scan>
}

/**
 * Every scan starts its own Chromium. An assistant may fire many calls at once; this many run at a time,
 * the rest wait their turn, so the machine the server runs on is not swamped.
 */
const PARALLEL = 2
let running = 0
const waiting: (() => void)[] = []
async function inTurn<T>(task: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL) await new Promise<void>(go => waiting.push(go))
  else running++
  try {
    return await task()
  } finally {
    // hand the slot straight to the next in line, or free it
    const next = waiting.shift()
    if (next) next()
    else running--
  }
}

const ok = (id: Id, result: unknown): Message => ({ jsonrpc: '2.0', id, result })
const fail = (id: Id, code: number, message: string): Message => ({ jsonrpc: '2.0', id, error: { code, message } })
/** a tool result the model gets to see; isError tells it the check did not run */
const reply = (s: string | string[], isError = false) => ({ content: [s].flat().map(text => ({ type: 'text', text })), isError })

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

async function call(params: Record<string, unknown>, context: Context) {
  const args = isObject(params.arguments) ? params.arguments : {}
  const lang = typeof args.lang === 'string' && (LANGS as string[]).includes(args.lang) ? (args.lang as Lang) : context.lang
  const say = MESSAGES[lang]
  // wrong arguments go back to the model as a tool error, so it can correct them
  if (args.lang !== undefined && lang !== args.lang) return reply(clean(say.unknownLang('lang', JSON.stringify(args.lang), LANGS.join('|'))), true)
  if (args.format !== undefined && args.format !== 'text' && args.format !== 'json') return reply(clean(say.unknownFormat(JSON.stringify(args.format))), true)
  if (typeof args.url !== 'string') return reply(say.urlMissing, true)
  const url = toUrl(args.url)
  if (!url) return reply(clean(say.invalidUrl(args.url)), true)

  try {
    const open = context.scan ?? (u => scan(u, context.userAgent ? { userAgent: context.userAgent } : {}))
    const s = await inTurn(() => open(url))
    const results = runChecks(s)
    const report = args.format === 'json' ? json(s, results, lang) : text(s, results, lang, { verbose: true, width: 100 })
    // in either format, so the model can pass it on
    return reply(!s.sandbox && process.env.SPURLOS_NO_SANDBOX !== '1' ? [report, say.noSandbox] : report)
  } catch (e) {
    const reason = (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''
    return reply(clean(say.failed(url, reason)), true)
  }
}

/** One message in, the answer out; nothing for a notification. Never throws. */
export async function handle(message: unknown, context: Context): Promise<Message | undefined> {
  if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return fail(null, -32600, 'Invalid Request')
  const { id, method } = message
  // a notification (no id) gets no answer, whatever it says
  if (id === undefined) return undefined
  if (typeof id !== 'string' && typeof id !== 'number') return fail(null, -32600, 'Invalid Request')
  const params = isObject(message.params) ? message.params : {}
  try {
    switch (method) {
      case 'initialize': {
        const wanted = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
        return ok(id, {
          protocolVersion: PROTOCOLS.includes(wanted) ? wanted : PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'spurlos', version: VERSION },
        })
      }
      case 'ping':
        return ok(id, {})
      case 'tools/list':
        return ok(id, { tools: [TOOL] })
      case 'tools/call':
        if (params.name !== TOOL.name) return fail(id, -32602, `Unknown tool: ${String(params.name)}`)
        return ok(id, await call(params, context))
      default:
        return fail(id, -32601, `Method not found: ${method}`)
    }
  } catch (e) {
    return fail(id, -32603, e instanceof Error ? e.message : String(e))
  }
}

/** Reads messages from input line by line and answers on output until input closes; calls run side by side. */
export function serve(context: Context, input: Readable = process.stdin, output: Writable = process.stdout): Promise<void> {
  const pending = new Set<Promise<void>>()
  const lines = createInterface({ input, crlfDelay: Infinity })
  lines.on('line', line => {
    if (!line.trim()) return
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      output.write(JSON.stringify(fail(null, -32700, 'Parse error')) + '\n')
      return
    }
    const p = handle(message, context).then(answer => {
      if (answer) output.write(JSON.stringify(answer) + '\n')
    })
    pending.add(p)
    void p.finally(() => pending.delete(p))
  })
  return new Promise(resolve => lines.on('close', () => void Promise.all(pending).then(() => resolve())))
}
