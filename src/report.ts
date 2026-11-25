import {
  certLevel, consentModeGranted, load, cookieLevel, leakLevel, accessLevel, fingerprintLevel, legalBlocked, SEVERITY, disclosureLevel, formLevel, httpLevel, hostLevel, key, legalLevel, numbered, resourceLevel, storageLevel, withoutQuery,
  type Comparison, type Level, type Result,
} from './checks.ts'
import { readFileSync } from 'node:fs'
import { styleText } from 'node:util'
import { MESSAGES, type Lang, type Messages } from './lang/index.ts'
import { HOME, NO_RESPONSE, VERSION, type Scan } from './scan.ts'

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
      // the site's own servers give no tips: not the platform it runs on, nor a known service's on its own site
      const categories = new Set(r.hosts.filter(h => !h.own).map(h => h.service?.category))
      const trackers = categories.has('tracking')
      // a tag manager counts nothing itself: it starts trackers when the site is set up to, so it gets a note of its own
      const tagManager = categories.has('tag-manager')
      const before = trackers ? [t.consentButTrackers] : tagManager ? [t.consentButTagManager] : []
      const consent = r.consent.length ? [t.consentFound(r.consent.join(', ')), ...before] : trackers || tagManager ? [t.consentNone] : []
      // a baseline from an older spurlos has none
      const selfHosted = r.selfHosted?.length ? [t.selfHosted(r.selfHosted.join(', '))] : []
      // what Google's tags were told of the visitor's consent; a baseline from an older spurlos has none
      const mode = r.consentMode
      const granted = consentModeGranted(mode)
      const modeItems = mode && granted ? [item(key.consentMode, 'red', `Google Consent Mode (gcs=${mode.gcs})`, t.consentModeGranted(mode.ads === 'granted', mode.analytics === 'granted'))] : []
      const modeNotes = mode ? [granted ? t.consentModeGrantedNote : t.consentModeDenied(mode.gcs)] : []
      if (!r.hosts.length) return { value: t.none, items: modeItems, notes: [t.thirdPartyNone, ...modeNotes, ...selfHosted, ...consent] }
      const hints = [
        categories.has('fonts') ? t.thirdPartyHint.fonts : null,
        categories.has('cdn') ? t.thirdPartyHint.cdn : null,
        categories.has('consent') ? t.thirdPartyHint.consent : null,
        categories.has('captcha') ? t.thirdPartyHint.captcha : null,
        EMBEDS.some(c => categories.has(c)) ? t.thirdPartyHint.embed : null,
        trackers ? t.thirdPartyHint.tracking : null,
        tagManager ? t.thirdPartyHint.tagManager : null,
      ]
      return {
        value: `${r.hosts.length}`,
        items: r.hosts.map(h => {
          const about = [h.service?.name, h.own ? t.ownBy[h.own] : undefined].filter(Boolean).join(', ') || undefined
          const count = h.preconnect ? t.preconnectOnly : t.requests(h.requests) + (h.afterMove ? `, ${t.afterMove}` : '')
          return item(key.host(h.host), hostLevel(h), h.host, about ? `${about} (${count})` : count)
        }).concat(modeItems),
        notes: [
          t.thirdParty,
          ...(r.platform && r.hosts.some(h => h.own === 'platform') ? [t.platformNote(r.platform)] : []),
          ...(r.hosts.some(h => h.own && h.own !== 'platform') ? [t.ownNote] : []),
          ...(r.hosts.some(h => h.preconnect) ? [t.preconnectNote] : []),
          ...(r.hosts.some(h => h.afterMove) ? [t.afterMoveNote] : []),
          ...selfHosted,
          ...consent,
          ...modeNotes,
          ...hints.filter(n => n !== null),
        ],
      }
    }

    case 'cookies': {
      if (!r.cookies.length && !r.storage.length) return { value: t.cookiesNone, items: [], notes: [] }
      const items = [
        ...r.cookies.map(c => {
          const about = [
            c.own ? t.ownBy[c.own] : c.thirdParty ? t.cookieForeign : t.cookieOwn,
            c.service?.name ?? t.unknown,
            lifetime(t, c.expires, now) + (c.long ? ` (${t.cookieLong})` : ''),
            ...(c.afterMove ? [t.afterMove] : []),
            ...(c.missing.length ? [t.cookieMissing(c.missing)] : []),
            // a third-party cookie needs it to be sent at all
            ...(c.sameSite === 'None' && !c.thirdParty ? ['SameSite=None'] : []),
          ]
          return item(key.cookie(c), cookieLevel(c), `Cookie ${c.name} (${c.domain})`, about.join(', '))
        }),
        ...r.storage.map(s => item(key.storage(s), storageLevel(s), `${s.area}: ${s.key}`, s.service?.name ?? t.unknown)),
      ]
      const unknown = r.storage.some(s => !s.service) || r.cookies.some(c => !c.service && !c.thirdParty)
      const note = unknown && r.level !== 'red' ? t.cookiesReview : r.level === 'green' ? t.cookiesNecessary : null
      const missing = r.cookies.some(c => c.missing.length) ? t.cookieMissingNote : null
      const long = r.cookies.some(c => c.long) ? t.cookieLongNote : null
      const sameSite = r.cookies.some(c => c.sameSite === 'None' && !c.thirdParty) ? t.cookieSameSiteNote : null
      const moved = r.cookies.some(c => c.afterMove) ? t.afterMoveNote : null
      return { value: t.cookies(r.cookies.length, r.storage.length), items, notes: [t.cookiesBefore, note, missing, long, sameSite, moved].filter(n => n !== null) }
    }

    case 'legal':
      return {
        value: t.legal(r.level),
        items: r.pages.map(p => {
          if (!p.link) return item(key.legal(p.kind), legalLevel(p), `${t.legalName[p.kind]}: ${t.legalNoLink}`)
          const v = p.visit
          const state = !v ? t.legalNotChecked : 'error' in v ? (legalBlocked(v) ? t.legalTimeout : t.legalUnreachable(v.error === NO_RESPONSE ? t.noResponse : v.error)) : v.status < 300 ? t.legalOk : t.legalStatus(v.status)
          return item(key.legal(p.kind), legalLevel(p), `${t.legalName[p.kind]}: ${t.quote(p.link.text || p.link.href)} → ${p.link.href}`, legalBlocked(v) ? state + t.legalBlocked : state)
        }),
        notes: [],
      }

    case 'policy': {
      if (!r.services.length) return { value: t.policyNothing, items: [], notes: [] }
      if (!r.read) return { value: t.policyUnread, items: [], notes: [t.policyUnreadWhy] }
      const missing = r.services.filter(s => !s.named).length
      return {
        value: missing ? t.policyMissing(missing) : t.policyAllNamed,
        items: r.services.map(s => item(key.policy(s.name), s.named ? 'green' : 'yellow', s.name, s.named ? t.policyNamed : t.policyNotNamed)),
        notes: [t.policyHow],
      }
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
        // shortened: a query is noise here and may hold an API key; --json keeps the full address
        items: r.findings.map(f => item(key.resource(f), resourceLevel(f), `${f.tag} ${withoutQuery(f.url)}${withoutQuery(f.url) === f.url ? '' : '?…'}`, t.resource[f.problem])),
        notes: [...(has('insecure') ? [t.resourcesInsecure] : []), ...(has('no-integrity') ? [t.resourcesIntegrity] : [])],
      }
    }

    case 'leaks': {
      if (!r.findings.length) return { value: t.none, items: [], notes: [t.leakNone] }
      return {
        value: `${r.findings.length}`,
        items: r.findings.map(l => {
          const about = [l.what === 'email' ? t.leakEmail : l.what === 'id' ? t.leakId(l.param ?? '', l.from ?? '') : t.leakQuery(l.param ?? ''), l.service?.name, l.own ? t.ownBy[l.own] : undefined].filter(Boolean).join(', ')
          return item(key.leak(l), leakLevel(l), l.host, `${about} (${t.requests(l.requests)})`)
        }),
        notes: [...(['email', 'id', 'query'] as const).filter(w => r.findings.some(l => l.what === w)).map(w => t.leakNote[w])],
      }
    }

    case 'fingerprinting': {
      if (!r.findings.length) return { value: t.none, items: [], notes: [t.fingerprintNone] }
      return {
        value: `${r.findings.length}`,
        items: r.findings.map(f => {
          const about = [t.fingerprintApi[f.api], f.own ? t.ownBy[f.own] : f.thirdParty ? t.cookieForeign : t.cookieOwn, f.service?.name].filter(Boolean).join(', ')
          const script = withoutQuery(f.script)
          return item(key.fingerprint(f), fingerprintLevel(f), `${script}${script === f.script ? '' : '?…'}`, about)
        }),
        notes: [t.fingerprintWhy, ...(r.findings.some(f => fingerprintLevel(f) === 'yellow') ? [t.fingerprintYellow] : [])],
      }
    }

    case 'access': {
      if (!r.findings.length) return { value: t.none, items: [], notes: [t.accessNone] }
      const asks = r.findings.filter(a => a.api !== 'service-worker').length
      return {
        value: asks ? `${asks}` : t.accessWorkerOnly,
        items: r.findings.map(a => {
          const about = [t.accessApi[a.api], a.own ? t.ownBy[a.own] : a.thirdParty ? t.cookieForeign : t.cookieOwn, a.service?.name].filter(Boolean).join(', ')
          const script = withoutQuery(a.script)
          return item(key.access(a), accessLevel(a), `${script}${script === a.script ? '' : '?…'}`, about)
        }),
        notes: [...(asks ? [t.accessWhy] : []), ...(r.findings.some(a => a.api === 'service-worker') ? [t.accessWorker] : [])],
      }
    }

    case 'mobile': {
      const items = r.problems.map(p =>
        p === 'viewport' ? item(key.mobile(p), 'yellow', t.mobileViewport, r.viewport ? `<meta name="viewport" content="${r.viewport}">` : t.mobileNoViewport)
        : item(key.mobile(p), 'yellow', t.mobileOverflow(r.width.page, r.width.window)),
      )
      return {
        value: r.problems.length ? t.mobileValue(r.problems.length) : t.mobileOk,
        items,
        notes: [...r.problems.map(p => t.mobileWhy[p]), ...(r.mobile ? [] : [t.mobileHint])],
      }
    }

    case 'accessibility': {
      const first = (list: string[]) => list.slice(0, 3).join(', ') + (list.length > 3 ? ', …' : '')
      const items: Item[] = r.problems.map(p =>
        p === 'images' ? item(key.accessibility(p), 'yellow', t.a11yImages(r.images.length), first(r.images.map(withoutQuery)))
        : p === 'fields' ? item(key.accessibility(p), 'yellow', t.a11yFields(r.fields.length), first(r.fields))
        : p === 'zoom' ? item(key.accessibility(p), 'yellow', t.a11yZoom, r.viewport)
        : item(key.accessibility(p), 'yellow', t.a11yLang),
      )
      if (r.statement) items.push(item(key.accessibility('statement'), 'green', `${t.a11yStatement}: ${t.quote(r.statement.text || r.statement.href)} → ${r.statement.href}`))
      return {
        value: r.problems.length ? t.a11yValue(r.problems.length) : t.a11yOk,
        items,
        notes: [...r.problems.map(p => t.a11yWhy[p]), ...(r.statement ? [] : [t.a11yNoStatement]), t.a11yScope],
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

    case 'indexing':
      if (!r.noindex.length) return { value: t.indexingOk, items: [], notes: [t.indexingNone] }
      return {
        value: t.indexingNo,
        items: r.noindex.map(n => item(key.noindex(n), 'yellow', n.source === 'header' ? `Header X-Robots-Tag: ${n.value}` : `<meta name="robots">: ${n.value}`)),
        notes: [t.indexingWhy],
      }

    case 'forms':
      if (!r.forms.length) return { value: t.formsNone, items: [], notes: [] }
    {
      // the same form twice, a search in header and menu, is one line; --json and --baseline keep each
      const same = new Map<string, { form: (typeof r.forms)[number]; count: number }>()
      for (const f of r.forms) {
        const k = `${key.form(f)} ${f.problem ?? 'ok'}`
        const seen = same.get(k)
        if (seen) seen.count++
        else same.set(k, { form: f, count: 1 })
      }
      const items = [...same.values()].map(({ form: f, count }) =>
        item(key.form(f), formLevel(f), `${f.method.toUpperCase()} ${f.action}`, t.form[f.problem ?? 'ok'] + (count > 1 ? ` (${count}×)` : '')),
      )
      return { value: `${r.forms.length}`, items, notes: [] }
    }
  }
}

/** The line on what the page loaded: requests and size, and how much of it from other sites. */
function loadLine(t: Messages, lang: Lang, scan: Scan): string {
  const l = load(scan)
  const size = (bytes: number) => {
    const mb = bytes >= 1_000_000
    return new Intl.NumberFormat(lang, { style: 'unit', unit: mb ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(bytes / (mb ? 1_000_000 : 1000))
  }
  return t.load(l.requests, size(l.bytes), l.foreignRequests, size(l.foreignBytes))
}

/** The line on how long the page took: to show its first content, and until everything before the first move had loaded. */
function timingLine(t: Messages, lang: Lang, scan: Scan): string | undefined {
  if (!scan.timing) return undefined
  // under a second in ms, as 0.0 s says nothing; the SI symbols, as Intl writes „Sek.“ in German
  const s = (ms: number) =>
    ms < 1000 ? `${new Intl.NumberFormat(lang).format(ms)} ms` : `${new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ms / 1000)} s`
  return t.timing(scan.timing.firstPaint === undefined ? undefined : s(scan.timing.firstPaint), s(scan.timing.idle))
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

/**
 * The findings as SARIF 2.1.0, for GitHub code scanning and other tools that read it: one rule per check, one result
 * per red (error) or yellow (warning) finding, located at the page's address. The finding's key, with the address
 * asked for, is its fingerprint, so the tools follow it from one run to the next; with a baseline, baselineState says
 * whether it is new. Texts in the language of the report, from the page cleaned as in the text report.
 */
export function sarifReports(reports: Report[], lang: Lang, now = Date.now()): string {
  const t = MESSAGES[lang]
  const checks = [...new Set(reports.flatMap(r => r.results.map(x => x.check)))]
  const results = reports.flatMap(({ scan, results, compare }) => {
    const fresh = new Set(compare?.comparison.fresh.map(f => f.key))
    return results.flatMap(r =>
      section(t, r, now)
        .items.filter(i => i.level !== 'green')
        .map(i => ({
          ruleId: r.check,
          level: i.level === 'red' ? 'error' : 'warning',
          message: { text: clean(i.detail === undefined ? i.label : `${i.label} – ${i.detail}`) },
          locations: [{ physicalLocation: { artifactLocation: { uri: scan.finalUrl } } }],
          partialFingerprints: { 'spurlos/v1': `${scan.url} ${i.key}` },
          ...(compare ? { baselineState: fresh.has(i.key) ? 'new' : 'unchanged' } : {}),
        })),
    )
  })
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'spurlos',
            version: VERSION,
            informationUri: HOME,
            rules: checks.map(c => ({ id: c, name: c, shortDescription: { text: t.title[c] }, helpUri: `${HOME}/blob/main/docs/${lang}/checks.md` })),
          },
        },
        results,
        properties: { note: t.disclaimer },
      },
    ],
  }
  return JSON.stringify(sarif, null, 2).replace(UNSAFE_IN_JSON, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
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
    ...(scan.mobile ? [style('dim', t.asPhone)] : []),
    ...(scan.gpc ? [style('dim', t.withGpc)] : []),
    ...(compare ? [style('dim', clean(t.compared(compare.file, compare.comparison.fresh.length, compare.comparison.gone.length)))] : []),
    style('dim', loadLine(t, lang, scan)),
    ...[timingLine(t, lang, scan)].filter(l => l !== undefined).map(l => style('dim', l)),
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
      ...(scan.mobile ? [t.asPhone] : []),
      ...(scan.gpc ? [t.withGpc] : []),
      t.checkedAt(date),
      loadLine(t, lang, scan),
      ...[timingLine(t, lang, scan)].filter(l => l !== undefined),
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
