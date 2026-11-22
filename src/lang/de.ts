import type { AccessApi, FingerprintApi } from '../scan.ts'
import type { AccessibilityProblem, FormFinding, HttpRedirect, LegalKind, Level, OwnReason, ResourceFinding, Result } from '../checks.ts'
import { AUTH_REJECTED, AUTH_REQUIRED, NO_RESPONSE, REFUSED } from '../scan.ts'
import { plural } from './plural.ts'

// The reference language: its shape is the type every other language has to fill (Messages below).
// Deutsch mit „du“, Anführungszeichen als Paar „…“.

const de = {
  usage: (langs: string) => `spurlos <url> [<url> …] [--lang ${langs}] [--verbose] [--json | --html | --pdf] [-o <datei> …]
        [--baseline <datei>] [--auth <benutzer:passwort>] [--user-agent <kennung>]
        [--own <host> …]
spurlos mcp [--lang ${langs}] [--user-agent <kennung>]

Ruft die Seite wie ein neuer Besucher auf, der nichts anklickt, und zeigt,
welche fremden Server dabei angefragt und welche Cookies gesetzt werden.
Mehrere Adressen prüft spurlos nacheinander, mit je einem Bericht.

  --lang        Sprache: ${langs}. Ohne Angabe gilt SPURLOS_LANG, dann
                die Sprache des Systems (LC_ALL, LC_MESSAGES, LANG), sonst de
  --verbose     Details auch zu den grünen Prüfungen
  --json        Ergebnis als JSON statt als Text
  --html        Bericht als HTML-Seite, etwa: spurlos <url> --html > bericht.html
  --pdf         Bericht als PDF, etwa: spurlos <url> --pdf > bericht.pdf
  -o, --output  in eine Datei statt auf die Ausgabe, das Format nach der
                Endung (.pdf, .html, .json, sonst Text): -o bericht.pdf;
                mehrmals für mehrere Formate aus einem Lauf, dann ohne
                --json, --html und --pdf
  --baseline    mit einer früheren Ausgabe von --json vergleichen: Der
                Bericht markiert neue Befunde, Exit-Code 1 nur bei neuen
                roten Befunden
  --auth        Anmeldung per HTTP Basic Auth, nur an die geprüfte Adresse;
                besser über SPURLOS_AUTH, dann steht das Passwort nicht in
                der Shell-Historie
  --user-agent  eigene Browserkennung für alle Aufrufe
  --own         Server, die zur Seite gehören, etwa ihr CDN, samt
                Subdomains: --own cdn-firma.net; mehrmals oder mit Komma.
                Sie sind dann gelb statt rot
  --help        diese Hilfe

spurlos mcp startet einen MCP-Server über stdio: Ein KI-Assistent kann
damit selbst Seiten prüfen lassen, Einrichtung im README.

Exit-Code: 0 ohne roten Befund, 1 mit rotem Befund, 2 bei einem Fehler.
Mit --baseline zählen nur neue rote Befunde.

Hilft dir spurlos? https://ko-fi.com/mmohrx`,
  disclaimer: 'Technische Vorprüfung – keine Rechtsberatung und keine Aussage darüber, ob die Seite DSGVO-konform ist.',
  openedAs: (url: string) => `aufgerufen als ${url}`,
  unknownLang: (from: string, value: string, langs: string) => `${from} kennt nur ${langs}, nicht ${value}.`,
  invalidUrl: (arg: string) => `${arg} ist keine gültige Adresse.`,
  oneFormat: '--json, --html und --pdf gehen nur einzeln.',
  formatWithOutputs: 'Mit mehreren -o entscheidet die Endung jeder Datei über ihr Format, ohne --json, --html oder --pdf.',
  authOneOrigin: '--auth und SPURLOS_AUTH gelten nur für eine Adresse (Schema, Host, Port); mehrere Adressen müssen sie teilen.',
  pdfToTerminal: 'Das PDF gehört in eine Datei, nicht ins Terminal: spurlos <url> -o bericht.pdf',
  written: (file: string) => `Bericht in ${file} geschrieben.`,
  cannotWrite: (file: string, reason: string) => `${file} ließ sich nicht schreiben: ${reason}`,
  mcpOnly: (flags: string) => `spurlos mcp nimmt nur --lang und --user-agent, nicht ${flags}.`,
  urlMissing: 'url fehlt: die Adresse der Seite als Text, etwa firma.de.',
  unknownFormat: (value: string) => `format kennt nur text und json, nicht ${value}.`,
  checkedAt: (date: string) => `geprüft am ${date}`,
  failed: (url: string, reason: string) =>
    `${url} ließ sich nicht prüfen: ${
      reason === NO_RESPONSE ? 'keine Antwort'
      : reason === AUTH_REQUIRED ? 'Die Seite verlangt eine Anmeldung. --auth oder SPURLOS_AUTH gilt nur für genau die angegebene Adresse (Schema, Host, Port).'
      : reason === AUTH_REJECTED ? 'Die Anmeldung wurde abgelehnt.'
      : /^page\.goto: Timeout \d+ms exceeded/.test(reason) ? `keine Antwort nach ${Number(/(\d+)ms/.exec(reason)?.[1]) / 1000} Sekunden`
      : reason.startsWith(`${REFUSED} `) ? `Die Seite hat den Aufruf mit Status ${reason.slice(REFUSED.length + 1)} abgewiesen, oft wegen eines Bot-Schutzes. Ihre Fehlerseite sagt nichts darüber, was Besucher bekommen. Ist es deine Seite, lass spurlos im Bot-Schutz zu.`
      : reason
    }`,
  authFormat: '--auth und SPURLOS_AUTH brauchen benutzer:passwort.',
  invalidOwn: (value: string) => `--own braucht einen Hostnamen wie cdn.firma.de, nicht ${value}.`,
  authOverHttp: 'Die Adresse ist http://, das Passwort geht unverschlüsselt an den Server.',
  cannotRead: (file: string, reason: string) => `${file} ließ sich nicht lesen: ${reason}`,
  notBaseline: (file: string) => `${file} ist keine Ausgabe von spurlos --json.`,
  compared: (file: string, fresh: number, gone: number) => `verglichen mit ${file}: ${fresh} neu, ${gone} weg`,
  isNew: 'neu',
  gone: 'weg',
  shotAlt: 'Bildschirmfoto der Seite beim ersten Aufruf',
  shotCaption: 'So sah die Seite beim ersten Aufruf aus, bevor jemand etwas anklickte.',
  title: {
    'third-party': 'Fremde Server',
    cookies: 'Cookies und Speicher',
    fingerprinting: 'Fingerprinting',
    access: 'Browser-Zugriffe',
    accessibility: 'Barrierefreiheit',
    legal: 'Impressum und Datenschutz',
    https: 'HTTPS',
    headers: 'Sicherheits-Header',
    forms: 'Formulare',
    disclosure: 'Verratene Details',
    resources: 'Eingebundene Dateien',
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
  thirdPartyHint: {
    fonts: 'Schriften lassen sich vom eigenen Server ausliefern, dann geht dafür keine Anfrage nach außen.',
    cdn: 'Bibliotheken von einem CDN lassen sich ebenso vom eigenen Server ausliefern.',
    consent: 'Den Cookie-Banner braucht die Seite, bevor jemand zustimmen kann. Es gibt auch Banner zum Selbsthosten, dann geht dafür keine Anfrage nach außen.',
    captcha: 'Ein Captcha lässt sich so einbinden, dass es erst mit dem Formular lädt, nicht auf jeder Seite.',
    embed: 'Videos, Karten, Chats und Beiträge aus sozialen Netzwerken lassen sich so einbinden, dass sie erst nach einem Klick laden.',
    tracking: 'Tracker lassen sich so einbinden, dass sie erst laden, wenn jemand im Cookie-Banner zustimmt.',
  },
  selfHosted: (names: string) => `Auf eigenen Servern erkannt: ${names}. Die IP-Adresse bleibt dabei bei der Seite.`,
  consentFound: (names: string) => `Cookie-Banner erkannt: ${names}.`,
  consentButTrackers: 'Die Tracker oben laden trotzdem schon, bevor jemand im Banner etwas wählt.',
  consentNone: 'Keinen bekannten Cookie-Banner erkannt.',
  ownBy: {
    option: 'gehört laut --own zur Seite',
    certificate: 'gehört laut Zertifikat zur Seite',
    name: 'gehört dem Namen nach zur Seite',
    platform: 'gehört zum Hoster der Seite',
  } satisfies Record<OwnReason, string>,
  platformNote: (name: string) =>
    `Die Seite läuft auf ${name}. Dessen Server sind gelb statt rot: Sie liefern die Seite ohnehin aus und kennen die IP-Adresse damit schon. Apps und Tracker auf der Seite zählen trotzdem.`,
  ownNote:
    'Gelb statt rot, wo ein Server zur Seite zu gehören scheint. Die IP-Adresse geht trotzdem an einen anderen Host; betreibt ihn ein Dienstleister, erfährt auch der sie. Eigene Server nennst du mit --own.',

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
  fingerprintNone: 'Kein Skript las Canvas, Grafikkarte oder Audio so aus, wie es Fingerprinting tut.',
  fingerprintApi: {
    canvas: 'liest ein Canvas mit Text aus',
    webgl: 'liest die Grafikkarte über WebGL aus',
    audio: 'rechnet Audio im OfflineAudioContext',
  } satisfies Record<FingerprintApi, string>,
  fingerprintWhy: 'Aus solchen Werten lässt sich ein Merkmal bilden, das den Browser auch ohne Cookie wiedererkennt, noch bevor jemand etwas anklickt.',
  fingerprintYellow: 'Gelb bei Captchas und eigenen Skripten: Bot- und Betrugserkennung lesen solche Werte auch. Prüfe, wozu das Skript sie braucht.',
  accessNone: 'Kein Skript fragte nach Standort, Kamera, Mikrofon oder Benachrichtigungen, keines registrierte einen Service Worker.',
  accessWorkerOnly: 'nur ein Service Worker',
  accessApi: {
    notifications: 'fragt, ob es Benachrichtigungen schicken darf',
    push: 'abonniert Push-Nachrichten',
    geolocation: 'fragt nach dem Standort',
    camera: 'fragt nach der Kamera',
    microphone: 'fragt nach dem Mikrofon',
    'service-worker': 'registriert einen Service Worker',
  } satisfies Record<AccessApi, string>,
  accessWhy: 'Gefragt schon beim Laden, bevor jemand etwas anklickt: Der Besucher weiß dann nicht, wozu die Seite das will. Firefox zeigt die Frage nach Benachrichtigungen ohne Klick gar nicht erst an.',
  accessWorker: 'Ein Service Worker bleibt im Browser und kann auch nach dem Besuch laufen, etwa für Push-Nachrichten oder damit die Seite offline geht.',
  a11yOk: 'Grundlagen in Ordnung',
  a11yValue: (n: number) => plural(n, 'Grundlage fehlt', 'Grundlagen fehlen'),
  a11yLang: 'Die Seite nennt ihre Sprache nicht (lang am <html>)',
  a11yImages: (n: number) => `${plural(n, 'Bild', 'Bilder')} ohne alt-Text`,
  a11yFields: (n: number) => `${plural(n, 'Formularfeld', 'Formularfelder')} ohne Beschriftung`,
  a11yZoom: 'Der Viewport verhindert das Vergrößern',
  a11yStatement: 'Erklärung zur Barrierefreiheit',
  a11yWhy: {
    lang: 'Ohne lang lesen Screenreader den Text womöglich mit der Aussprache einer anderen Sprache vor.',
    images: 'Ohne alt lesen Screenreader den Dateinamen vor. Bilder, die nur schmücken, bekommen alt="".',
    fields: 'Ohne <label>, aria-label oder title sagen Screenreader nicht, was in ein Feld gehört; ein placeholder ersetzt keine Beschriftung.',
    zoom: 'Mit user-scalable=no oder maximum-scale unter 2 lässt sich die Seite auf dem Handy nicht auf das Doppelte vergrößern.',
  } satisfies Record<AccessibilityProblem, string>,
  a11yNoStatement: 'Keine Erklärung zur Barrierefreiheit verlinkt.',
  a11yScope: 'Das sind nur Grundlagen, die sich ohne Klick prüfen lassen. Ob die Seite barrierefrei ist, sagt das nicht; dafür braucht es Werkzeuge wie axe und Menschen, die sie mit Screenreader und Tastatur bedienen.',
  cookiesNecessary: 'Nur bekannte Einträge, wie sie Frameworks und Proxys für den Betrieb setzen.',

  legal: (level: Level): string => ({ green: 'beide verlinkt und erreichbar', yellow: 'beide verlinkt, nicht alles prüfbar', red: 'nicht vollständig' })[level],
  legalName: { impressum: 'Impressum', datenschutz: 'Datenschutzerklärung' } satisfies Record<LegalKind, string>,
  legalNoLink: 'kein Link auf der Seite gefunden',
  legalNotChecked: 'nicht geprüft',
  legalUnreachable: (error: string) => `nicht erreichbar (${error})`,
  noResponse: 'keine Antwort',
  noSandbox: 'Hinweis: Chromium lief ohne Sandbox, weil das System keine erlaubt. Prüfe fremde Seiten dann am besten im Docker-Image.',
  legalOk: 'erreichbar',
  legalStatus: (status: number) => `antwortet mit Status ${status}`,
  legalTimeout: 'keine Antwort nach 15 Sekunden',
  legalBlocked: ', oft wegen eines Bot-Schutzes; ob Besucher sie öffnen können, ließ sich nicht prüfen',

  https: { green: 'in Ordnung', yellow: 'mit Hinweisen', red: 'mit Mängeln' } satisfies Record<Level, string>,
  noHttps: 'Die Seite wird ohne HTTPS ausgeliefert. Alles, was Besucher eingeben, geht unverschlüsselt durchs Netz.',
  certExpired: 'Das Zertifikat ist abgelaufen.',
  certDays: (n: number) => `Zertifikat gültig für noch ${plural(n, 'Tag', 'Tage')}.`,
  certRenew: ' Prüfe, ob es automatisch erneuert wird.',
  http: {
    redirects: 'http:// leitet auf https:// weiter.',
    'no-redirect': 'http:// liefert die Seite ohne Weiterleitung auf https:// aus.',
    unreachable: 'Über http:// antwortet nichts. Browser versuchen meist zuerst https, alte Links auf http:// laufen aber ins Leere.',
    refused: 'http:// antwortet mit einem Fehler, oft wegen eines Bot-Schutzes. Ob es auf https:// weiterleitet, ließ sich nicht prüfen.',
  } satisfies Record<HttpRedirect, string>,
  noHsts: 'Kein HSTS-Header (Strict-Transport-Security): Browser merken sich nicht, dass sie nur https nutzen sollen.',
  hstsExample: 'etwa Strict-Transport-Security: max-age=31536000',

  headersOk: 'alle gesetzt',
  headersMissing: (n: number, total: number) => `${n} von ${total} fehlen`,
  headerMissing: (h: string) => `${h} fehlt`,
  headerExample: {
    'Content-Security-Policy': 'erst als Content-Security-Policy-Report-Only ausprobieren',
    'X-Frame-Options': 'etwa SAMEORIGIN, oder frame-ancestors in der CSP',
    'X-Content-Type-Options': 'Wert: nosniff',
    'Referrer-Policy': 'etwa strict-origin-when-cross-origin',
    'Permissions-Policy': 'etwa camera=(), microphone=(), geolocation=()',
  } satisfies Record<string, string>,
  cspWeakValue: 'CSP mit Lücken',
  cspWeak: (w: string) => (w === 'no-script-src' ? 'Content-Security-Policy regelt keine Skripte (weder script-src noch default-src)' : `Content-Security-Policy erlaubt ${w}`),
  cspWeakNote: "Mit 'unsafe-inline', 'unsafe-eval' oder Quellen wie * und https: hält die CSP eingeschleuste Skripte kaum auf. Nonces oder Hashes lassen nur die eigenen Skripte zu.",

  resourcesNone: 'in Ordnung',
  resource: {
    insecure: 'über http auf einer https-Seite',
    'no-integrity': 'von einem fremden Server, ohne integrity',
  } satisfies Record<ResourceFinding['problem'], string>,
  resourcesInsecure: 'Skripte, Stylesheets und Frames über http blockiert der Browser auf einer https-Seite, Bilder und Videos lädt er über https oder gar nicht.',
  resourcesIntegrity:
    'Ohne integrity-Attribut kann der fremde Server die Datei jederzeit austauschen, und die Seite führt aus, was er liefert. Bei Dateien, die der Anbieter laufend ändert, etwa einem Tag Manager, geht das nicht; dann hilft nur, sie selbst auszuliefern.',

  formsNone: 'keine auf der Seite',
  form: {
    unencrypted: 'sendet unverschlüsselt über http',
    'third-party': 'sendet an einen fremden Server',
    ok: 'sendet verschlüsselt an die eigene Seite',
  } satisfies Record<NonNullable<FormFinding['problem']> | 'ok', string>,
}

export type Messages = typeof de
export default de
