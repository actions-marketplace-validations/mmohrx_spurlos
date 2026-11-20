#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { runChecks } from './checks.ts'
import { LANGS, MESSAGES, pickLang } from './lang/index.ts'
import { clean, json, text } from './report.ts'
import { scan } from './scan.ts'

// colors only in a terminal that wants them: tty.hasColors() honours NO_COLOR, FORCE_COLOR and TERM
const color = process.stdout.isTTY && process.stdout.hasColors()

const OPTIONS = {
  json: { type: 'boolean' },
  verbose: { type: 'boolean', short: 'v' },
  lang: { type: 'string' },
  'user-agent': { type: 'string' },
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
  console.log(say.usage(langList))
  process.exit(values.help ? 0 : 2)
}

if (unknown) {
  console.error(clean(`spurlos: ${say.unknownLang(unknown.from, unknown.value, langList)}`))
  process.exit(2)
}

let url: string
try {
  url = new URL(/^https?:\/\//i.test(arg) ? arg : `https://${arg}`).href
} catch {
  console.error(clean(`spurlos: ${say.invalidUrl(arg)}`))
  process.exit(2)
}

try {
  const ua = values['user-agent']
  const s = await scan(url, ua ? { userAgent: ua } : {})
  const results = runChecks(s)
  // on stderr, so it neither ends up in --json nor gets lost; the Docker image sets SPURLOS_NO_SANDBOX and stays quiet
  if (!s.sandbox && process.env.SPURLOS_NO_SANDBOX !== '1') console.error(`spurlos: ${say.noSandbox}`)
  const width = Math.min(process.stdout.columns || 80, 100)
  console.log(values.json ? json(s, results, lang) : text(s, results, lang, { color, verbose: values.verbose ?? false, width }))
  // exitCode, not exit(): on a pipe stdout is written asynchronously, and exit() would cut a long report short
  process.exitCode = results.some(r => r.level === 'red') ? 1 : 0
} catch (e) {
  // the first line says what went wrong (Playwright adds a call log below); it may quote what the server sent
  const reason = (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''
  console.error(clean(`spurlos: ${say.failed(url, reason)}`))
  process.exitCode = 2
}
