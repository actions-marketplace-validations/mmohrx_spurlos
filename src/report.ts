import {
  certLevel, cookieLevel, SEVERITY, disclosureLevel, formLevel, httpLevel, key, legalLevel, numbered, resourceLevel, storageLevel,
  type Comparison, type Level, type Result,
} from './checks.ts'
import { readFileSync } from 'node:fs'
import { styleText } from 'node:util'
import { MESSAGES, type Lang, type Messages } from './lang/index.ts'
import { NO_RESPONSE, VERSION, type Scan } from './scan.ts'

const LIGHT: Record<Level, string> = { green: '🟢', yellow: '🟡', red: '🔴' }

function lifetime(t: Messages, expires: number, now: number): string {
  if (expires < 0) return t.session
  const days = Math.round((expires * 1000 - now) / 86_400_000)
  return days < 1 ? t.underADay : t.days(days)
}

/** one finding: what it is, and after a dash what spurlos makes of it; key: what --baseline knows it by */
type Item = { level: Level; label: string; detail?: string; key: string }
/** a check as the report shows it: a short value next to the title, each finding with its own light, notes under them */
type Section = { value: string; items: Item[]; notes: string[] }

const item = (key: string, level: Level, label: string, detail?: string): Item =>
  detail === undefined ? { key, level, label } : { key, level, label, detail }

/** one page's report; compare: how it differs from the same page in the baseline file, whose results are before */
export type Report = { scan: Scan; results: Result[]; compare?: { file: string; comparison: Comparison; before: Result[] } }

/** the categories of services.json whose embeds can wait for a click */
const EMBEDS = ['video', 'maps', 'social', 'chat']

/** a check as the report shows it, its keys numbered as findings() numbers them, so --baseline finds each one */
function section(t: Messages, r: Result, now: number): Section {
  const s = unkeyed(t, r, now)
  const keys = numbered(s.items.map(i => i.key))
  return { ...s, items: s.items.map((i, n) => ({ ...i, key: keys[n] ?? i.key })) }
}

/**
 * What has gone since the baseline, as the baseline's report named it, in the language of this one. A baseline from
 * an older spurlos may lack what its report needs; then the key stands in.
 */
function goneLabels(t: Messages, compare: NonNullable<Report['compare']>, now: number): string[] {
  const labels = new Map<string, string>()
  for (const r of compare.before) {
    try {
      for (const i of section(t, r, now).items) labels.set(i.key, i.label)
    } catch {
      // the key will do
    }
  }
  return compare.comparison.gone.map(f => labels.get(f.key) ?? f.key)
}

function unkeyed(t: Messages, r: Result, now: number): Section {
  switch (r.check) {
    case 'third-party': {
      const categories = new Set(r.hosts.map(h => h.service?.category))
      const trackers = categories.has('tracking')
      const consent = r.consent.length ? [t.consentFound(r.consent.join(', ')), ...(trackers ? [t.consentButTrackers] : [])] : trackers ? [t.consentNone] : []
      if (!r.hosts.length) return { value: t.none, items: [], notes: [t.thirdPartyNone, ...consent] }
      const hints = [
        categories.has('fonts') ? t.thirdPartyHint.fonts : null,
        categories.has('cdn') ? t.thirdPartyHint.cdn : null,
        EMBEDS.some(c => categories.has(c)) ? t.thirdPartyHint.embed : null,
        trackers ? t.thirdPartyHint.tracking : null,
      ]
      return {
        value: `${r.hosts.length}`,
        items: r.hosts.map(h => item(key.host(h.host), 'red', h.host, h.service ? `${h.service.name} (${t.requests(h.requests)})` : t.requests(h.requests))),
        notes: [t.thirdParty, ...consent, ...hints.filter(n => n !== null)],
      }
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
          return item(key.cookie(c), cookieLevel(c), `Cookie ${c.name} (${c.domain})`, about.join(', '))
        }),
        ...r.storage.map(s => item(key.storage(s), storageLevel(s), `${s.area}: ${s.key}`, s.service?.name ?? t.unknown)),
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
          if (!p.link) return item(key.legal(p.kind), legalLevel(p), `${t.legalName[p.kind]}: ${t.legalNoLink}`)
          const v = p.visit
          const state = !v ? t.legalNotChecked : 'error' in v ? t.legalUnreachable(v.error === NO_RESPONSE ? t.noResponse : v.error) : v.status < 300 ? t.legalOk : t.legalStatus(v.status)
          return item(key.legal(p.kind), legalLevel(p), `${t.legalName[p.kind]}: ${t.quote(p.link.text || p.link.href)} → ${p.link.href}`, state)
        }),
        notes: [],
      }

    case 'https': {
      const items: (Item | null)[] = [
        r.https ? null : item(key.https('https'), 'red', t.noHttps),
        r.certDaysLeft === undefined
          ? null
          : item(key.https('cert'), certLevel(r.certDaysLeft), r.certDaysLeft < 0 ? t.certExpired : t.certDays(r.certDaysLeft) + (r.certDaysLeft < 14 ? t.certRenew : '')),
        r.http ? item(key.https('http'), httpLevel(r.http), t.http[r.http]) : null,
        r.https && !r.hsts ? item(key.https('hsts'), 'yellow', t.noHsts, t.hstsExample) : null,
      ]
      return { value: t.https[r.level], items: items.filter(i => i !== null), notes: [] }
    }

    case 'headers': {
      const examples: Record<string, string | undefined> = t.headerExample
      const items = [
        ...r.missing.map(m => item(key.header(m), 'yellow', t.headerMissing(m), examples[m])),
        ...r.weak.map(w => item(key.csp(w), 'yellow', t.cspWeak(w))),
      ]
      if (!items.length) return { value: t.headersOk, items: [], notes: [] }
      return { value: r.missing.length ? t.headersMissing(r.missing.length, r.checked) : t.cspWeakValue, items, notes: r.weak.length ? [t.cspWeakNote] : [] }
    }

    case 'resources': {
      if (!r.findings.length) return { value: t.resourcesNone, items: [], notes: [] }
      const has = (p: string) => r.findings.some(f => f.problem === p)
      return {
        value: `${r.findings.length}`,
        items: r.findings.map(f => item(key.resource(f), resourceLevel(f), `${f.tag} ${f.url}`, t.resource[f.problem])),
        notes: [...(has('insecure') ? [t.resourcesInsecure] : []), ...(has('no-integrity') ? [t.resourcesIntegrity] : [])],
      }
    }

    case 'disclosure': {
      if (!r.findings.length) return { value: t.none, items: [], notes: [t.disclosureNone] }
      const versions = r.findings.filter(d => d.version).length
      return {
        value: t.disclosure(versions),
        items: r.findings.map(d => item(key.disclosure(d), disclosureLevel(d), d.source === 'header' ? `Header ${d.name}: ${d.value}` : `<meta name="generator">: ${d.value}`)),
        notes: versions ? [t.disclosureWhy, t.disclosureHint] : [],
      }
    }

    case 'forms':
      if (!r.forms.length) return { value: t.formsNone, items: [], notes: [] }
      return { value: `${r.forms.length}`, items: r.forms.map(f => item(key.form(f), formLevel(f), `${f.method.toUpperCase()} ${f.action}`, t.form[f.problem ?? 'ok'])), notes: [] }
  }
}

/** The logo for the help, as the terminal can draw it: the magnifier with the three lights, name and version beside it. */
export function banner(color = false): string {
  const style = (format: Parameters<typeof styleText>[0], s: string) => (color ? styleText(format, s, { validateStream: false }) : s)
  const lights = (['red', 'yellow', 'green'] as const).map(l => style(l, '●')).join(' ')
  return [
    '   ▄▄▄▄▄',
    ' ▄▀     ▀▄',
    ` █ ${lights} █   ${style('bold', 'spurlos')} ${style('dim', VERSION)}`,
    ' ▀▄     ▄▀',
    '   ▀▀▀▀▀ ▀▄',
    '          ▀▄',
  ].join('\n')
}

/** in a terminal with colors the lights become colored marks, which line up better than emoji */
const MARK: Record<Level, string> = { red: '✖', yellow: '▲', green: '✔' }
const BADGE = { red: ['bgRed', 'white', 'bold'], yellow: ['bgYellow', 'black', 'bold'], green: ['bgGreen', 'black', 'bold'] } as const

/** compare: how the page differs from the baseline, to mark new findings */
export type TextOptions = { now?: number; color?: boolean; verbose?: boolean; width?: number; compare?: Report['compare'] }

/**
 * Link texts, header values, cookie names and addresses come from the page. Control characters in them could
 * move the cursor, recolor or rewrite the terminal, bidi overrides could reorder what the reader sees; both become a visible �.
 */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g
export const clean = (s: string) => s.replace(UNSAFE, '\ufffd')
// what JSON.stringify leaves as it is: DEL, C1 and the bidi marks; C0 it escapes itself, and its own line breaks must stay
const UNSAFE_IN_JSON = /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g

/** what --json holds for one page: the screenshot stays out, it is only for the eye */
function data({ scan, results, compare }: Report, lang: Lang) {
  const { screenshot: _, ...raw } = scan
  const diff = compare ? { compare: { baseline: compare.file, new: compare.comparison.fresh, gone: compare.comparison.gone } } : {}
  return { scan: raw, results, ...diff, note: MESSAGES[lang].disclaimer }
}

/**
 * The full result as JSON: one object for one page, a list of them for several. The values stay as the page sent
 * them; JSON.stringify escapes C0 control characters, the rest of UNSAFE is escaped here, so printing the JSON cannot
 * steer the terminal either.
 */
export function json(scan: Scan, results: Result[], lang: Lang, compare?: Report['compare']): string {
  return jsonReports([{ scan, results, ...(compare ? { compare } : {}) }], lang)
}

export function jsonReports(reports: Report[], lang: Lang): string {
  const out = reports.length === 1 && reports[0] ? data(reports[0], lang) : reports.map(r => data(r, lang))
  return JSON.stringify(out, null, 2).replace(UNSAFE_IN_JSON, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
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
  const { now = Date.now(), color = false, verbose = false, width = 80, compare } = options
  const t = MESSAGES[lang]
  type Format = Parameters<typeof styleText>[0]
  const style = (format: Format, s: string) => (color ? styleText(format, s, { validateStream: false }) : s)
  const mark = (l: Level) => (color ? style([l, 'bold'], MARK[l]) : LIGHT[l])
  const dot = (l: Level) => (color ? style(l, '●') : LIGHT[l])
  const titleWidth = Math.max(...Object.values(t.title).map(s => s.length))
  const fresh = new Set(compare?.comparison.fresh.map(f => f.key))

  const counts = SEVERITY.map(level => [level, results.filter(r => r.level === level).length] as const).filter(([, n]) => n)
  const summary = color
    ? counts.map(([l, n]) => style(BADGE[l], ` ${t.summary[l](n).toLocaleUpperCase(lang)} `)).join(' ')
    : counts.map(([l, n]) => t.summary[l](n)).join(' · ')

  // everything from the page goes through clean() here, in one place, before it reaches the terminal
  const block = (r: Result, s: Section): string[] => {
    const head = `${mark(r.level)} ${style('bold', t.title[r.check].padEnd(titleWidth))}  ${style(r.level, clean(s.value))}`
    if (r.level === 'green' && !verbose) return [head]
    const tree = s.items.map(({ key, level, label, detail }, i) => {
      // the thing itself stands out, what spurlos makes of it is dimmed
      const about = detail === undefined ? '' : style('dim', ` – ${clean(detail)}`)
      const mark = fresh.has(key) ? `${style(['cyan', 'bold'], `[${t.isNew}]`)} ` : ''
      return `  ${style('dim', i === s.items.length - 1 ? '└─' : '├─')} ${dot(level)} ${mark}${clean(label)}${about}`
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
    ...(compare ? [style('dim', clean(t.compared(compare.file, compare.comparison.fresh.length, compare.comparison.gone.length)))] : []),
    summary,
    '',
    ...body,
    ...(compare?.comparison.gone.length ? [...goneLabels(t, compare, now).map(l => style('dim', `${t.gone}: ${clean(l)}`)), ''] : []),
    ...(scan.settled ? [] : [...wrap(t.unsettled, width).map(l => style('yellow', l)), '']),
    ...(hidden ? [style('dim', t.verbose)] : []),
    ...wrap(t.disclaimer, width).map(l => style('dim', l)),
  ].join('\n')
}

const escape = (s: string) =>
  clean(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

const CSS = `
:root { color-scheme: light dark; --bg: #fff; --fg: #1e1f24; --dim: #6b6d78; --line: #e4e4e8; --card: #f7f7f9;
  --red: #d93036; --yellow: #b58a00; --green: #218358; --red-bg: #e5484d; --yellow-bg: #f2c94c; --green-bg: #30a46c }
@media (prefers-color-scheme: dark) { :root { --bg: #1e1f24; --fg: #e6e6ea; --dim: #8b8d98; --line: #33343b; --card: #26272d;
  --red: #ff6b6b; --yellow: #f2c94c; --green: #4cd17a } }
* { box-sizing: border-box }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif }
main { max-width: 820px; margin: 0 auto; padding: 32px 20px 48px }
.top { display: flex; gap: 16px 24px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap-reverse }
.brand { margin: 0; text-align: right; color: var(--dim); font-size: 12px }
.logo { display: block; height: 30px; width: auto; margin-bottom: 2px } .logo.dark { display: none }
@media (prefers-color-scheme: dark) { .logo.light { display: none } .logo.dark { display: block } }
h1 { margin: 0 0 4px; font-size: 22px; overflow-wrap: anywhere }
.meta { margin: 0; color: var(--dim); font-size: 13px; overflow-wrap: anywhere }
.summary { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0 24px }
.badge { padding: 2px 10px; border-radius: 6px; font-weight: 700; font-size: 13px; text-transform: uppercase; color: #1e1f24 }
.badge.red { background: var(--red-bg); color: #fff } .badge.yellow { background: var(--yellow-bg) } .badge.green { background: var(--green-bg) }
.check { border: 1px solid var(--line); border-radius: 10px; margin: 10px 0; background: var(--card) }
.head { display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; margin: 0; list-style: none }
summary.head { cursor: pointer } summary.head::-webkit-details-marker { display: none }
summary.head::after { content: "▸"; margin-left: auto; color: var(--dim) } details[open] > summary.head::after { content: "▾" }
.title { font-weight: 700 } .value { overflow-wrap: anywhere }
.red > .head .mark, .red > .head .value, li.red::before { color: var(--red) }
.yellow > .head .mark, .yellow > .head .value, li.yellow::before { color: var(--yellow) }
.green > .head .mark, .green > .head .value, li.green::before { color: var(--green) }
ul { margin: 0; padding: 0 14px 4px 40px; list-style: none }
.new { margin-right: 6px; padding: 0 5px; border-radius: 4px; background: #0b6bcb; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase }
.shot { margin: 24px 0 0 } .shot img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 10px }
.shot figcaption { margin-top: 6px; color: var(--dim); font-size: 13px }
.report + .report { margin-top: 40px; padding-top: 28px; border-top: 2px solid var(--line) }
li { position: relative; padding: 3px 0; overflow-wrap: anywhere }
li::before { content: "●"; position: absolute; left: -18px }
.detail { color: var(--dim) }
.note { margin: 0; padding: 4px 14px 10px 40px; color: var(--dim); font-size: 14px }
.warn { color: var(--yellow) }
footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--dim); font-size: 13px }
@media print { main { max-width: none; padding: 0 } .check, .shot { break-inside: avoid } .report + .report { break-before: page; border: 0 }
  summary.head::after, details[open] > summary.head::after { content: none } }
`

/** the logo from assets/, made by scripts/logo.mjs; inline, so the report loads nothing. Package and image ship it. */
const logo = (scheme: 'light' | 'dark') =>
  readFileSync(new URL(`../assets/logo-${scheme}.svg`, import.meta.url), 'utf8').replace('<svg ', `<svg class="logo ${scheme}" `)

/** now: when the report says it was checked; timeZone: the zone it says that in, the system's by default */
export type HtmlOptions = { now?: number; timeZone?: string; compare?: Report['compare'] }

/** what our own screenshot holds; anything else stays out of the page */
const BASE64 = /^[A-Za-z0-9+/]+=*$/

/**
 * The report as a self-contained HTML page: no scripts, no requests, so it can be mailed or opened offline.
 * Like the text, everything from the page passes clean() and is escaped; the page's own CSP forbids anything
 * but its inline style and the screenshot inside it, in case something slipped through. All findings are in it:
 * red and yellow checks open, green ones folded. Addresses from the page are shown, not linked.
 */
export function html(scan: Scan, results: Result[], lang: Lang, options: HtmlOptions = {}): string {
  const { compare, ...rest } = options
  return htmlReports([{ scan, results, ...(compare ? { compare } : {}) }], lang, rest)
}

/** Several pages' reports in one HTML page, one after the other; printed, each starts on a page of its own. */
export function htmlReports(reports: Report[], lang: Lang, options: Omit<HtmlOptions, 'compare'> = {}): string {
  const { now = Date.now(), timeZone } = options
  const t = MESSAGES[lang]
  // with the zone named, so a report sent on stays clear to readers elsewhere
  const date = new Intl.DateTimeFormat(lang, {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', ...(timeZone ? { timeZone } : {}),
  }).format(now)

  const report = ({ scan, results, compare }: Report, first: boolean): string => {
    const counts = SEVERITY.map(level => [level, results.filter(r => r.level === level).length] as const).filter(([, n]) => n)
    const fresh = new Set(compare?.comparison.fresh.map(f => f.key))
    const block = (r: Result, s: Section): string => {
      const head = `<span class="mark">${MARK[r.level]}</span><span class="title">${escape(t.title[r.check])}</span><span class="value">${escape(s.value)}</span>`
      if (!s.items.length && !s.notes.length) return `<div class="check ${r.level}"><p class="head">${head}</p></div>`
      const items = s.items.map(({ key, level, label, detail }) => {
        const mark = fresh.has(key) ? `<span class="new">${escape(t.isNew)}</span>` : ''
        return `<li class="${level}">${mark}${escape(label)}${detail === undefined ? '' : `<span class="detail"> – ${escape(detail)}</span>`}</li>`
      })
      const list = items.length ? `<ul>${items.join('')}</ul>` : ''
      const notes = s.notes.map(n => `<p class="note">${escape(n)}</p>`).join('')
      return `<details class="check ${r.level}"${r.level === 'green' ? '' : ' open'}><summary class="head">${head}</summary>${list}${notes}</details>`
    }
    const sorted = results.map(r => ({ r, s: section(t, r, now) })).sort((a, b) => SEVERITY.indexOf(a.r.level) - SEVERITY.indexOf(b.r.level))
    const meta = [
      ...(scan.finalUrl !== scan.url ? [t.openedAs(scan.url)] : []),
      t.checkedAt(date),
      ...(compare ? [t.compared(compare.file, compare.comparison.fresh.length, compare.comparison.gone.length)] : []),
      ...(compare ? goneLabels(t, compare, now).map(l => `${t.gone}: ${l}`) : []),
    ]
    const shot = scan.screenshot && BASE64.test(scan.screenshot)
      ? `<figure class="shot"><img src="data:image/jpeg;base64,${scan.screenshot}" alt="${escape(t.shotAlt)}"><figcaption>${escape(t.shotCaption)}</figcaption></figure>\n`
      : ''
    return `<section class="report">
<header>
<div class="top">
<div>
<h1>${escape(scan.finalUrl)}</h1>
${meta.map(m => `<p class="meta">${escape(m)}</p>`).join('\n')}
</div>
${first ? `<p class="brand">${logo('light')}${logo('dark')}${escape(VERSION)}</p>\n` : ''}</div>
<p class="summary">${counts.map(([l, n]) => `<span class="badge ${l}">${escape(t.summary[l](n))}</span>`).join(' ')}</p>
</header>
${sorted.map(({ r, s }) => block(r, s)).join('\n')}
${scan.settled ? '' : `<p class="warn">${escape(t.unsettled)}</p>\n`}${shot}</section>`
  }

  // the screenshots are inline images: the CSP allows them, and nothing else, only where there is one
  const images = reports.some(r => r.scan.screenshot) ? '; img-src data:' : ''
  return `<!doctype html>
<html lang="${lang}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'${images}">
<meta name="referrer" content="no-referrer">
<title>spurlos · ${escape(reports.map(r => r.scan.finalUrl).join(', '))}</title>
<style>${CSS}</style>
<main>
${reports.map((r, i) => report(r, i === 0)).join('\n')}
<footer>${escape(t.disclaimer)}</footer>
</main>
</html>
`
}
