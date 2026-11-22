#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { parseArgs } from 'node:util'
import { compare, findings, runChecks, type Result } from './checks.ts'
import { LANGS, MESSAGES, pickLang } from './lang/index.ts'
import { serve } from './mcp.ts'
import { pdf } from './pdf.ts'
import { banner, clean, htmlReports, jsonReports, text, type Report } from './report.ts'
import { ownHost, scan, toUrl } from './scan.ts'

// colors only in a terminal that wants them: tty.hasColors() honours NO_COLOR, FORCE_COLOR and TERM
const color = process.stdout.isTTY && process.stdout.hasColors()

const OPTIONS = {
  json: { type: 'boolean' },
  html: { type: 'boolean' },
  pdf: { type: 'boolean' },
  output: { type: 'string', short: 'o', multiple: true },
  baseline: { type: 'string' },
  verbose: { type: 'boolean', short: 'v' },
  lang: { type: 'string' },
  'user-agent': { type: 'string' },
  auth: { type: 'string' },
  own: { type: 'string', multiple: true },
  mobile: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const

const langList = LANGS.join('|')

let parsed
try {
  parsed = parseArgs({ allowPositionals: true, options: OPTIONS })
} catch (e) {
  // a wrong option is a usage error (2), not a red finding (1)
  console.error(`spurlos: ${e instanceof Error ? e.message : String(e)}\n\n${MESSAGES[pickLang(undefined).lang].usage(langList)}`)
  process.exit(2)
}
const { values, positionals } = parsed

const { lang, unknown } = pickLang(values.lang)
const say = MESSAGES[lang]

// the help comes even with an unknown language, in the one that applies without it
const arg = positionals[0]
if (values.help || !arg) {
  console.log(`${banner(color)}\n\n${say.usage(langList)}`)
  process.exit(values.help ? 0 : 2)
}

if (unknown) {
  console.error(clean(`spurlos: ${say.unknownLang(unknown.from, unknown.value, langList)}`))
  process.exit(2)
}

// spurlos mcp: a server for AI assistants on stdin and stdout; it ends when stdin closes
if (arg === 'mcp') await mcp()
else await check(positionals)

async function mcp() {
  // the format is the client's to choose, per call
  const ignored = (['json', 'html', 'pdf', 'output', 'baseline', 'auth', 'verbose', 'own', 'mobile'] as const).filter(f => values[f]).map(f => `--${f}`)
  if (ignored.length) {
    console.error(`spurlos: ${say.mcpOnly(ignored.join(', '))}`)
    process.exit(2)
  }
  const ua = values['user-agent']
  await serve(ua ? { lang, userAgent: ua } : { lang })
}

type Format = 'text' | 'json' | 'html' | 'pdf'

/** the format of a report: the flag, else the file's extension with -o, else text */
function formatOf(file: string | undefined): Format {
  if (values.json) return 'json'
  if (values.html) return 'html'
  if (values.pdf) return 'pdf'
  const ext = file ? extname(file).toLowerCase() : ''
  return ext === '.json' ? 'json' : ext === '.html' || ext === '.htm' ? 'html' : ext === '.pdf' ? 'pdf' : 'text'
}

/**
 * The results per page of an earlier --json: one object for one page, a list for several. Pages are found by the
 * address asked for, else by the one they ended on (firma.de and www.firma.de may both end on www.firma.de, so the
 * address asked for goes first); a baseline of a single page fits a single page whatever its address.
 */
async function readBaseline(file: string): Promise<(url: string, finalUrl: string, single: boolean) => Result[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch (e) {
    console.error(clean(`spurlos: ${e instanceof SyntaxError ? say.notBaseline(file) : say.cannotRead(file, e instanceof Error ? e.message : String(e))}`))
    process.exit(2)
  }
  type Entry = { scan?: { url?: unknown; finalUrl?: unknown }; results?: unknown }
  const entries = (Array.isArray(parsed) ? parsed : [parsed]) as Entry[]
  // read every finding now, so a broken file is said to be one, and not blamed on the page checked
  const valid = (e: Entry) =>
    typeof e === 'object' && e !== null && Array.isArray(e.results) && e.results.every(r => typeof r === 'object' && r !== null && typeof r.check === 'string')
  let readable = entries.length > 0 && entries.every(valid)
  try {
    if (readable) entries.forEach(e => (e.results as Result[]).forEach(findings))
  } catch {
    readable = false
  }
  if (!readable) {
    console.error(clean(`spurlos: ${say.notBaseline(file)}`))
    process.exit(2)
  }
  return (url, finalUrl, single) => {
    const found = single && entries.length === 1 ? entries[0] : (entries.find(e => e.scan?.url === url) ?? entries.find(e => e.scan?.finalUrl === finalUrl))
    // a page the baseline does not know: everything on it is new
    return (found?.results ?? []) as Result[]
  }
}

async function check(args: string[]) {
  if ([values.json, values.html, values.pdf].filter(Boolean).length > 1) {
    console.error(`spurlos: ${say.oneFormat}`)
    process.exit(2)
  }
  // one scan, as many reports as files; without -o one on the output
  // a flag names the format of every file; with several, the extensions decide
  if ((values.output?.length ?? 0) > 1 && (values.json || values.html || values.pdf)) {
    console.error(`spurlos: ${say.formatWithOutputs}`)
    process.exit(2)
  }
  const targets: { file?: string; format: Format }[] = values.output?.length ? values.output.map(file => ({ file, format: formatOf(file) })) : [{ format: formatOf(undefined) }]
  // said before the scan, not after: binary in a terminal garbles it
  if (targets.some(t => t.format === 'pdf' && !t.file) && process.stdout.isTTY) {
    console.error(`spurlos: ${say.pdfToTerminal}`)
    process.exit(2)
  }

  const urls: string[] = []
  for (const arg of args) {
    const url = toUrl(arg)
    if (!url) {
      console.error(clean(`spurlos: ${say.invalidUrl(arg)}`))
      process.exit(2)
    }
    urls.push(url)
  }

  // user:password, split at the first colon: a password may hold one, a user name may not
  const login = values.auth ?? (process.env.SPURLOS_AUTH || undefined)
  const colon = login?.indexOf(':') ?? -1
  if (login !== undefined && colon < 1) {
    console.error(`spurlos: ${say.authFormat}`)
    process.exit(2)
  }
  const auth = login ? { username: login.slice(0, colon), password: login.slice(colon + 1) } : undefined
  // the password goes to the address checked only: with several, they must share one origin
  if (auth && new Set(urls.map(u => new URL(u).origin)).size > 1) {
    console.error(`spurlos: ${say.authOneOrigin}`)
    process.exit(2)
  }
  if (auth && urls.some(u => u.startsWith('http:'))) console.error(`spurlos: ${say.authOverHttp}`)

  // host names only, as the browser writes them (Bücher.de as xn--bcher-kva.de); *.cdn.de means cdn.de and its subdomains
  const own: string[] = []
  for (const value of (values.own ?? []).flatMap(v => v.split(','))) {
    const host = ownHost(value)
    if (!host) {
      console.error(clean(`spurlos: ${say.invalidOwn(value)}`))
      process.exit(2)
    }
    own.push(host)
  }

  const baselineFile = values.baseline
  const baseline = baselineFile ? await readBaseline(baselineFile) : undefined

  const ua = values['user-agent']
  // the picture only goes into HTML and PDF
  const screenshot = targets.some(t => t.format === 'html' || t.format === 'pdf')
  const reports: Report[] = []
  let failed = false
  // one after the other: each scan starts its own Chromium
  for (const url of urls) {
    try {
      const s = await scan(url, { ...(ua ? { userAgent: ua } : {}), ...(auth ? { auth } : {}), ...(screenshot ? { screenshot } : {}), ...(own.length ? { own } : {}), ...(values.mobile ? { mobile: true } : {}) })
      const results = runChecks(s)
      const before = baseline?.(s.url, s.finalUrl, urls.length === 1)
      reports.push({ scan: s, results, ...(before && baselineFile ? { compare: { file: baselineFile, comparison: compare(results, before), before } } : {}) })
      // on stderr, so it neither ends up in --json nor gets lost; the Docker image sets SPURLOS_NO_SANDBOX and stays quiet
      if (!s.sandbox && process.env.SPURLOS_NO_SANDBOX !== '1' && reports.length === 1) console.error(`spurlos: ${say.noSandbox}`)
    } catch (e) {
      // the first line says what went wrong (Playwright adds a call log below); it may quote what the server sent
      const reason = (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''
      console.error(clean(`spurlos: ${say.failed(url, reason)}`))
      failed = true
    }
  }
  if (!reports.length) {
    process.exitCode = 2
    return
  }

  for (const { file, format } of targets) {
    // into a file plain text at the usual width, as when redirected
    const width = file ? 80 : Math.min(process.stdout.columns || 80, 100)
    const report =
      format === 'pdf' ? await pdf(htmlReports(reports, lang))
      : format === 'json' ? jsonReports(reports, lang)
      : format === 'html' ? htmlReports(reports, lang)
      : reports.map(r => text(r.scan, r.results, lang, { color: color && !file, verbose: values.verbose ?? false, width, ...(r.compare ? { compare: r.compare } : {}) })).join('\n\n\n')
    if (file) {
      try {
        await writeFile(file, typeof report === 'string' ? report + '\n' : report)
      } catch (e) {
        console.error(clean(`spurlos: ${say.cannotWrite(file, e instanceof Error ? e.message : String(e))}`))
        failed = true
        continue
      }
      console.error(clean(`spurlos: ${say.written(file)}`))
    } else if (typeof report === 'string') console.log(report)
    else process.stdout.write(report)
  }
  // with a baseline only what is new counts: a site with known problems can still keep watch for new ones
  const red = reports.some(r => (r.compare ? r.compare.comparison.fresh : r.results).some(f => f.level === 'red'))
  // exitCode, not exit(): on a pipe stdout is written asynchronously, and exit() would cut a long report short
  process.exitCode = failed ? 2 : red ? 1 : 0
}
