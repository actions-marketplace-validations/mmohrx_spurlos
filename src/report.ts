import { certLevel, cookieLevel, SEVERITY, disclosureLevel, formLevel, httpLevel, legalLevel, storageLevel, type FormFinding, type HttpRedirect, type LegalKind, type Level, type Result } from './checks.ts'
import { styleText } from 'node:util'
import { NO_RESPONSE, VERSION, type Scan } from './scan.ts'

export type Lang = 'de' | 'en'

const LIGHT: Record<Level, string> = { green: '🟢', yellow: '🟡', red: '🔴' }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const de = {
  disclaimer: 'Technische Vorprüfung – keine Rechtsberatung und keine Aussage darüber, ob die Seite DSGVO-konform ist.',
  openedAs: (url: string) => `aufgerufen als ${url}`,
  invalidUrl: (arg: string) => `${arg} ist keine gültige Adresse.`,
  failed: (url: string, reason: string) => `${url} ließ sich nicht prüfen: ${reason === NO_RESPONSE ? 'keine Antwort' : reason}`,
  title: {
    'third-party': 'Fremde Server',
    cookies: 'Cookies und Speicher',
    legal: 'Impressum und Datenschutz',
    https: 'HTTPS',
    headers: 'Sicherheits-Header',
    forms: 'Formulare',
    disclosure: 'Verratene Details',
  } satisfies Record<Result['check'], string>,
  summary: {
    red: (n: number) => plural(n, 'Mangel', 'Mängel'),
    yellow: (n: number) => plural(n, 'Hinweis', 'Hinweise'),
    green: (n: number) => `${n} in Ordnung`,
  } satisfies Record<Level, (n: number) => string>,
  none: 'keine',
  verbose: 'Details auch zu den grünen Prüfungen: --verbose',
  quote: (s: string) => `„${s}“`,
  unsettled: 'Hinweis: Die Seite lud noch nach, als die Messung endete. Später geladene Anfragen fehlen hier womöglich.',

  thirdPartyNone: 'Beim Aufruf ging keine Anfrage an einen anderen Server.',
  thirdParty: 'Jeder davon erfährt beim Aufruf die IP-Adresse des Besuchers, noch bevor er etwas anklickt.',
  requests: (n: number) => plural(n, 'Anfrage', 'Anfragen'),

  cookiesNone: 'nichts gesetzt',
  cookies: (c: number, s: number) => `${plural(c, 'Cookie', 'Cookies')}, ${plural(s, 'Eintrag', 'Einträge')} im Browser-Speicher`,
  cookiesBefore: 'Gesetzt beim ersten Aufruf, bevor jemand etwas anklickt.',
  cookieOwn: 'eigen',
  cookieForeign: 'fremd',
  session: 'bis Sitzungsende',
  underADay: 'unter 1 Tag',
  days: (n: number) => plural(n, 'Tag', 'Tage'),
  cookiesReview: 'Keine bekannten Tracker. Prüfe bei den gelb markierten Einträgen, ob sie technisch nötig sind.',
  unknown: 'unbekannt',
  cookieMissing: (attrs: string[]) => `ohne ${attrs.join(' und ')}`,
  cookieMissingNote: 'Secure: Das Cookie geht auch über unverschlüsseltes http. HttpOnly: Skripte auf der Seite können die Sitzung auslesen.',
  disclosureNone: 'Weder Header noch Seite nennen die Software dahinter.',
  disclosure: (versions: number) => (versions ? `${plural(versions, 'Angabe', 'Angaben')} mit Versionsnummer` : 'nur Namen, keine Versionen'),
  disclosureWhy: 'Mit der Versionsnummer lässt sich gezielt nach bekannten Lücken suchen.',
  disclosureHint: 'Versionsnummern lassen sich meist abschalten, etwa mit expose_php = Off in PHP oder server_tokens off in nginx.',
  cookiesNecessary: 'Nur bekannte Einträge, wie sie Frameworks und Proxys für den Betrieb setzen.',

  legal: (green: boolean): string => (green ? 'beide verlinkt und erreichbar' : 'nicht vollständig'),
  legalName: { impressum: 'Impressum', datenschutz: 'Datenschutzerklärung' } satisfies Record<LegalKind, string>,
  legalNoLink: 'kein Link auf der Seite gefunden',
  legalNotChecked: 'nicht geprüft',
  legalUnreachable: (error: string) => `nicht erreichbar (${error})`,
  noResponse: 'keine Antwort',
  noSandbox: 'Hinweis: Chromium lief ohne Sandbox, weil das System keine erlaubt. Prüfe fremde Seiten dann am besten im Docker-Image.',
  legalOk: 'erreichbar',
  legalStatus: (status: number) => `antwortet mit Status ${status}`,

  https: { green: 'in Ordnung', yellow: 'mit Hinweisen', red: 'mit Mängeln' } satisfies Record<Level, string>,
  noHttps: 'Die Seite wird ohne HTTPS ausgeliefert. Alles, was Besucher eingeben, geht unverschlüsselt durchs Netz.',
  certExpired: 'Das Zertifikat ist abgelaufen.',
  certDays: (n: number) => `Zertifikat gültig für noch ${plural(n, 'Tag', 'Tage')}.`,
  certRenew: ' Prüfe, ob es automatisch erneuert wird.',
  http: {
    redirects: 'http:// leitet auf https:// weiter.',
    'no-redirect': 'http:// liefert die Seite ohne Weiterleitung auf https:// aus.',
    unreachable: 'Über http:// antwortet nichts. Browser versuchen meist zuerst https, alte Links auf http:// laufen aber ins Leere.',
  } satisfies Record<HttpRedirect, string>,
  noHsts: 'Kein HSTS-Header (Strict-Transport-Security): Browser merken sich nicht, dass sie nur https nutzen sollen.',

  headersOk: 'alle gesetzt',
  headersMissing: (n: number, total: number) => `${n} von ${total} fehlen`,
  headerMissing: (h: string) => `${h} fehlt`,

  formsNone: 'keine auf der Seite',
  form: {
    unencrypted: 'sendet unverschlüsselt über http',
    'third-party': 'sendet an einen fremden Server',
    ok: 'sendet verschlüsselt an die eigene Seite',
  } satisfies Record<NonNullable<FormFinding['problem']> | 'ok', string>,
}

const en: typeof de = {
  disclaimer: 'Technical pre-check – not legal advice, and no statement on whether the site complies with the GDPR.',
  openedAs: url => `opened as ${url}`,
  invalidUrl: arg => `${arg} is not a valid address.`,
  failed: (url, reason) => `${url} could not be checked: ${reason}`,
  title: {
    'third-party': 'Third-party servers',
    cookies: 'Cookies and storage',
    legal: 'Legal notice and privacy policy',
    https: 'HTTPS',
    headers: 'Security headers',
    forms: 'Forms',
    disclosure: 'Software details',
  },
  summary: {
    red: n => plural(n, 'problem', 'problems'),
    yellow: n => plural(n, 'note', 'notes'),
    green: n => `${n} fine`,
  },
  none: 'none',
  verbose: 'Details for the green checks too: --verbose',
  quote: s => `“${s}”`,
  unsettled: 'Note: the page was still loading when the measurement ended. Requests made later may be missing here.',

  thirdPartyNone: 'Opening the page sent no request to another server.',
  thirdParty: "Each of them learns the visitor's IP address on opening the page, before any click.",
  requests: n => plural(n, 'request', 'requests'),

  cookiesNone: 'nothing set',
  cookies: (c, s) => `${plural(c, 'cookie', 'cookies')}, ${plural(s, 'entry', 'entries')} in browser storage`,
  cookiesBefore: 'Set on the first visit, before any click.',
  cookieOwn: 'first-party',
  cookieForeign: 'third-party',
  session: 'until the session ends',
  underADay: 'under 1 day',
  days: n => plural(n, 'day', 'days'),
  cookiesReview: 'No known trackers. For the entries marked yellow, check whether they are technically necessary.',
  unknown: 'unknown',
  cookieMissing: attrs => `without ${attrs.join(' and ')}`,
  cookieMissingNote: 'Secure: the cookie also travels over unencrypted http. HttpOnly: scripts on the page can read the session.',
  disclosureNone: 'Neither headers nor the page name the software behind it.',
  disclosure: versions => (versions ? `${plural(versions, 'entry', 'entries')} with a version number` : 'names only, no versions'),
  disclosureWhy: 'A version number allows a targeted search for known holes.',
  disclosureHint: 'Version numbers can usually be switched off, e.g. with expose_php = Off in PHP or server_tokens off in nginx.',
  cookiesNecessary: 'Only known entries, as frameworks and proxies set them to run a site.',

  legal: green => (green ? 'both linked and reachable' : 'incomplete'),
  legalName: { impressum: 'Legal notice (Impressum)', datenschutz: 'Privacy policy' },
  legalNoLink: 'no link found on the page',
  legalNotChecked: 'not checked',
  legalUnreachable: error => `not reachable (${error})`,
  noResponse: 'no response',
  noSandbox: 'Note: Chromium ran without its sandbox, as the system allows none. Best check untrusted sites with the Docker image then.',
  legalOk: 'reachable',
  legalStatus: status => `answers with status ${status}`,

  https: { green: 'fine', yellow: 'with notes', red: 'with problems' },
  noHttps: 'The page is served without HTTPS. Everything visitors enter travels the network unencrypted.',
  certExpired: 'The certificate has expired.',
  certDays: n => `Certificate valid for another ${plural(n, 'day', 'days')}.`,
  certRenew: ' Check that it renews automatically.',
  http: {
    redirects: 'http:// redirects to https://.',
    'no-redirect': 'http:// serves the page without redirecting to https://.',
    unreachable: 'Nothing answers on http://. Browsers mostly try https first, but old links to http:// lead nowhere.',
  },
  noHsts: 'No HSTS header (Strict-Transport-Security): browsers do not remember to use https only.',

  headersOk: 'all set',
  headersMissing: (n, total) => `${n} of ${total} missing`,
  headerMissing: h => `${h} missing`,

  formsNone: 'none on the page',
  form: {
    unencrypted: 'sends unencrypted over http',
    'third-party': 'sends to a third-party server',
    ok: 'sends encrypted to the site itself',
  },
}

const MESSAGES: Record<Lang, typeof de> = { de, en }

/** the messages the CLI prints around the report */
export const cliMessages = (lang: Lang) => ({ invalidUrl: MESSAGES[lang].invalidUrl, failed: MESSAGES[lang].failed, noSandbox: MESSAGES[lang].noSandbox })

function lifetime(t: typeof de, expires: number, now: number): string {
  if (expires < 0) return t.session
  const days = Math.round((expires * 1000 - now) / 86_400_000)
  return days < 1 ? t.underADay : t.days(days)
}

/** one finding: what it is, and after a dash what spurlos makes of it */
type Item = { level: Level; label: string; detail?: string }
/** a check as the report shows it: a short value next to the title, each finding with its own light, notes under them */
type Section = { value: string; items: Item[]; notes: string[] }

const item = (level: Level, label: string, detail?: string): Item => (detail === undefined ? { level, label } : { level, label, detail })

function section(t: typeof de, r: Result, now: number): Section {
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
export function json(scan: Scan, results: Result[], lang: Lang = 'de'): string {
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
export function text(scan: Scan, results: Result[], lang: Lang = 'de', options: TextOptions = {}): string {
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
