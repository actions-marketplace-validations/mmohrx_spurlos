#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { parseArgs } from 'node:util'
import { runChecks } from './checks.ts'
import { LANGS, MESSAGES, pickLang } from './lang/index.ts'
import { serve } from './mcp.ts'
import { pdf } from './pdf.ts'
import { banner, clean, html, json, text } from './report.ts'
import { scan, toUrl } from './scan.ts'

// colors only in a terminal that wants them: tty.hasColors() honours NO_COLOR, FORCE_COLOR and TERM
const color = process.stdout.isTTY && process.stdout.hasColors()

const OPTIONS = {
  json: { type: 'boolean' },
  html: { type: 'boolean' },
  pdf: { type: 'boolean' },
  output: { type: 'string', short: 'o' },
  verbose: { type: 'boolean', short: 'v' },
  lang: { type: 'string' },
  'user-agent': { type: 'string' },
  auth: { type: 'string' },
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
else await check(arg)

async function mcp() {
  // the format is the client's to choose, per call
  const ignored = (['json', 'html', 'pdf', 'output', 'auth', 'verbose'] as const).filter(f => values[f]).map(f => `--${f}`)
  if (ignored.length) {
    console.error(`spurlos: ${say.mcpOnly(ignored.join(', '))}`)
    process.exit(2)
  }
  const ua = values['user-agent']
  await serve(ua ? { lang, userAgent: ua } : { lang })
}

async function check(arg: string) {
  if ([values.json, values.html, values.pdf].filter(Boolean).length > 1) {
    console.error(`spurlos: ${say.oneFormat}`)
    process.exit(2)
  }
  // the format: the flag, else the file's extension with -o, else text
  const file = values.output
  const ext = file ? extname(file).toLowerCase() : ''
  const format = values.json ? 'json' : values.html ? 'html' : values.pdf ? 'pdf' : ext === '.json' ? 'json' : ext === '.html' || ext === '.htm' ? 'html' : ext === '.pdf' ? 'pdf' : 'text'
  // said before the scan, not after: binary in a terminal garbles it
  if (format === 'pdf' && !file && process.stdout.isTTY) {
    console.error(`spurlos: ${say.pdfToTerminal}`)
    process.exit(2)
  }

  const url = toUrl(arg)
  if (!url) {
    console.error(clean(`spurlos: ${say.invalidUrl(arg)}`))
    process.exit(2)
  }

  // user:password, split at the first colon: a password may hold one, a user name may not
  const login = values.auth ?? (process.env.SPURLOS_AUTH || undefined)
  const colon = login?.indexOf(':') ?? -1
  if (login !== undefined && colon < 1) {
    console.error(`spurlos: ${say.authFormat}`)
    process.exit(2)
  }
  const auth = login ? { username: login.slice(0, colon), password: login.slice(colon + 1) } : undefined
  if (auth && url.startsWith('http:')) console.error(`spurlos: ${say.authOverHttp}`)

  try {
    const ua = values['user-agent']
    const s = await scan(url, { ...(ua ? { userAgent: ua } : {}), ...(auth ? { auth } : {}) })
    const results = runChecks(s)
    // on stderr, so it neither ends up in --json nor gets lost; the Docker image sets SPURLOS_NO_SANDBOX and stays quiet
    if (!s.sandbox && process.env.SPURLOS_NO_SANDBOX !== '1') console.error(`spurlos: ${say.noSandbox}`)
    // into a file plain text at the usual width, as when redirected
    const width = file ? 80 : Math.min(process.stdout.columns || 80, 100)
    const report =
      format === 'pdf' ? await pdf(html(s, results, lang))
      : format === 'json' ? json(s, results, lang)
      : format === 'html' ? html(s, results, lang)
      : text(s, results, lang, { color: color && !file, verbose: values.verbose ?? false, width })
    if (file) {
      try {
        await writeFile(file, typeof report === 'string' ? report + '\n' : report)
      } catch (e) {
        console.error(clean(`spurlos: ${say.cannotWrite(file, e instanceof Error ? e.message : String(e))}`))
        process.exitCode = 2
        return
      }
      console.error(clean(`spurlos: ${say.written(file)}`))
    } else if (typeof report === 'string') console.log(report)
    else process.stdout.write(report)
    // exitCode, not exit(): on a pipe stdout is written asynchronously, and exit() would cut a long report short
    process.exitCode = results.some(r => r.level === 'red') ? 1 : 0
  } catch (e) {
    // the first line says what went wrong (Playwright adds a call log below); it may quote what the server sent
    const reason = (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''
    console.error(clean(`spurlos: ${say.failed(url, reason)}`))
    process.exitCode = 2
  }
}
