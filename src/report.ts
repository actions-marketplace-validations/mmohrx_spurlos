import { certLevel, cookieLevel, SEVERITY, disclosureLevel, formLevel, httpLevel, legalLevel, storageLevel, type Level, type Result } from './checks.ts'
import { styleText } from 'node:util'
import { MESSAGES, type Lang, type Messages } from './lang/index.ts'
import { NO_RESPONSE, VERSION, type Scan } from './scan.ts'

const LIGHT: Record<Level, string> = { green: '🟢', yellow: '🟡', red: '🔴' }

function lifetime(t: Messages, expires: number, now: number): string {
  if (expires < 0) return t.session
  const days = Math.round((expires * 1000 - now) / 86_400_000)
  return days < 1 ? t.underADay : t.days(days)
}

/** one finding: what it is, and after a dash what spurlos makes of it */
type Item = { level: Level; label: string; detail?: string }
/** a check as the report shows it: a short value next to the title, each finding with its own light, notes under them */
type Section = { value: string; items: Item[]; notes: string[] }

const item = (level: Level, label: string, detail?: string): Item => (detail === undefined ? { level, label } : { level, label, detail })

function section(t: Messages, r: Result, now: number): Section {
  switch (r.check) {
    case 'third-party':
      if (!r.hosts.length) return { value: t.none, items: [], notes: [t.thirdPartyNone] }
      return {
        value: `${r.hosts.length}`,
        items: r.hosts.map(h => item('red', h.host, h.service ? `${h.service.name} (${t.requests(h.requests)})` : t.requests(h.requests))),
        notes: [t.thirdParty],
      }

    case 'cookies': {
      if (!r.cookies.length && !r.storage.length) return { value: t.cookiesNone, items: [], notes: [] }
      const items = [
        ...r.cookies.map(c => {
          const about = [
            c.thirdParty ? t.cookieForeign : t.cookieOwn,
            c.service?.name ?? t.unknown,
            lifetime(t, c.expires, now),
            ...(c.missing.length ? [t.cookieMissing(c.missing)] : []),
          ]
          return item(cookieLevel(c), `Cookie ${c.name} (${c.domain})`, about.join(', '))
        }),
        ...r.storage.map(s => item(storageLevel(s), `${s.area}: ${s.key}`, s.service?.name ?? t.unknown)),
      ]
      const unknown = r.storage.some(s => !s.service) || r.cookies.some(c => !c.service && !c.thirdParty)
      const note = unknown && r.level !== 'red' ? t.cookiesReview : r.level === 'green' ? t.cookiesNecessary : null
      const missing = r.cookies.some(c => c.missing.length) ? t.cookieMissingNote : null
      return { value: t.cookies(r.cookies.length, r.storage.length), items, notes: [t.cookiesBefore, note, missing].filter(n => n !== null) }
    }

    case 'legal':
      return {
        value: t.legal(r.level === 'green'),
        items: r.pages.map(p => {
          if (!p.link) return item(legalLevel(p), `${t.legalName[p.kind]}: ${t.legalNoLink}`)
          const v = p.visit
          const state = !v ? t.legalNotChecked : 'error' in v ? t.legalUnreachable(v.error === NO_RESPONSE ? t.noResponse : v.error) : v.status < 300 ? t.legalOk : t.legalStatus(v.status)
          return item(legalLevel(p), `${t.legalName[p.kind]}: ${t.quote(p.link.text || p.link.href)} → ${p.link.href}`, state)
        }),
        notes: [],
      }

    case 'https': {
      const items: (Item | null)[] = [
        r.https ? null : item('red', t.noHttps),
        r.certDaysLeft === undefined
          ? null
          : item(certLevel(r.certDaysLeft), r.certDaysLeft < 0 ? t.certExpired : t.certDays(r.certDaysLeft) + (r.certDaysLeft < 14 ? t.certRenew : '')),
        r.http ? item(httpLevel(r.http), t.http[r.http]) : null,
        r.https && !r.hsts ? item('yellow', t.noHsts) : null,
      ]
      return { value: t.https[r.level], items: items.filter(i => i !== null), notes: [] }
    }

    case 'headers':
      if (!r.missing.length) return { value: t.headersOk, items: [], notes: [] }
      return { value: t.headersMissing(r.missing.length, r.checked), items: r.missing.map(m => item('yellow', t.headerMissing(m))), notes: [] }

    case 'disclosure': {
      if (!r.findings.length) return { value: t.none, items: [], notes: [t.disclosureNone] }
      const versions = r.findings.filter(d => d.version).length
      return {
        value: t.disclosure(versions),
        items: r.findings.map(d => item(disclosureLevel(d), d.source === 'header' ? `Header ${d.name}: ${d.value}` : `<meta name="generator">: ${d.value}`)),
        notes: versions ? [t.disclosureWhy, t.disclosureHint] : [],
      }
    }

    case 'forms':
      if (!r.forms.length) return { value: t.formsNone, items: [], notes: [] }
      return { value: `${r.forms.length}`, items: r.forms.map(f => item(formLevel(f), `${f.method.toUpperCase()} ${f.action}`, t.form[f.problem ?? 'ok'])), notes: [] }
  }
}

/** in a terminal with colors the lights become colored marks, which line up better than emoji */
const MARK: Record<Level, string> = { red: '✖', yellow: '▲', green: '✔' }
const BADGE = { red: ['bgRed', 'white', 'bold'], yellow: ['bgYellow', 'black', 'bold'], green: ['bgGreen', 'black', 'bold'] } as const

export type TextOptions = { now?: number; color?: boolean; verbose?: boolean; width?: number }

/**
 * Link texts, header values, cookie names and addresses come from the page. Control characters in them could
 * move the cursor, recolor or rewrite the terminal, bidi overrides could reorder what the reader sees; both become a visible �.
 */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g
export const clean = (s: string) => s.replace(UNSAFE, '\ufffd')
// what JSON.stringify leaves as it is: DEL, C1 and the bidi marks; C0 it escapes itself, and its own line breaks must stay
const UNSAFE_IN_JSON = /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g

/**
 * The full result as JSON. The values stay as the page sent them; JSON.stringify escapes C0 control characters,
 * the rest of UNSAFE is escaped here, so printing the JSON cannot steer the terminal either.
 */
export function json(scan: Scan, results: Result[], lang: Lang): string {
  return JSON.stringify({ scan, results, note: MESSAGES[lang].disclaimer }, null, 2).replace(UNSAFE_IN_JSON, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** words to lines of at most max characters; a longer word keeps a line of its own */
function wrap(s: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of s.split(' ')) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  return [...lines, line]
}

/**
 * The report as text: the summary on top, then the checks, the worst first.
 * Red and yellow checks show their findings as a tree, green ones a single line unless verbose.
 * Explanations wrap to the width; findings keep one line each, so names and addresses stay whole.
 * With color, for a terminal: colored marks and badges; without, the same layout with emoji lights.
 */
export function text(scan: Scan, results: Result[], lang: Lang, options: TextOptions = {}): string {
  const { now = Date.now(), color = false, verbose = false, width = 80 } = options
  const t = MESSAGES[lang]
  type Format = Parameters<typeof styleText>[0]
  const style = (format: Format, s: string) => (color ? styleText(format, s, { validateStream: false }) : s)
  const mark = (l: Level) => (color ? style([l, 'bold'], MARK[l]) : LIGHT[l])
  const dot = (l: Level) => (color ? style(l, '●') : LIGHT[l])
  const titleWidth = Math.max(...Object.values(t.title).map(s => s.length))

  const counts = SEVERITY.map(level => [level, results.filter(r => r.level === level).length] as const).filter(([, n]) => n)
  const summary = color
    ? counts.map(([l, n]) => style(BADGE[l], ` ${t.summary[l](n).toLocaleUpperCase(lang)} `)).join(' ')
    : counts.map(([l, n]) => t.summary[l](n)).join(' · ')

  // everything from the page goes through clean() here, in one place, before it reaches the terminal
  const block = (r: Result, s: Section): string[] => {
    const head = `${mark(r.level)} ${style('bold', t.title[r.check].padEnd(titleWidth))}  ${style(r.level, clean(s.value))}`
    if (r.level === 'green' && !verbose) return [head]
    const tree = s.items.map(({ level, label, detail }, i) => {
      // the thing itself stands out, what spurlos makes of it is dimmed
      const about = detail === undefined ? '' : style('dim', ` – ${clean(detail)}`)
      return `  ${style('dim', i === s.items.length - 1 ? '└─' : '├─')} ${dot(level)} ${clean(label)}${about}`
    })
    const indent = s.items.length ? '     ' : '  '
    const notes = s.notes.flatMap(note =>
      wrap(clean(note), width - indent.length - 2).map((line, i) => `${indent}${style('dim', `${i ? ' ' : '→'} ${line}`)}`),
    )
    return [head, ...tree, ...notes]
  }

  // the worst first, so a reader sees at once what to fix; checks with the same light keep their order
  const sorted = results.map(r => ({ r, s: section(t, r, now) })).sort((a, b) => SEVERITY.indexOf(a.r.level) - SEVERITY.indexOf(b.r.level))
  const blocks = sorted.map(({ r, s }) => block(r, s))
  // single lines stay together, anything longer gets air around it
  const body = blocks.flatMap((b, i) => (b.length > 1 || (blocks[i + 1]?.length ?? 0) > 1 || i === blocks.length - 1 ? [...b, ''] : b))
  // green checks that would have shown more with --verbose
  const hidden = !verbose && sorted.some(({ r, s }) => r.level === 'green' && s.items.length)

  return [
    `${style('bold', 'spurlos')} ${style('dim', VERSION)}  ${style('cyan', clean(scan.finalUrl))}`,
    ...(scan.finalUrl !== scan.url ? [style('dim', t.openedAs(clean(scan.url)))] : []),
    summary,
    '',
    ...body,
    ...(scan.settled ? [] : [...wrap(t.unsettled, width).map(l => style('yellow', l)), '']),
    ...(hidden ? [style('dim', t.verbose)] : []),
    ...wrap(t.disclaimer, width).map(l => style('dim', l)),
  ].join('\n')
}
