import type { FormFinding, HttpRedirect, LegalKind, Level, Result } from '../checks.ts'
import { AUTH_REJECTED, AUTH_REQUIRED, NO_RESPONSE } from '../scan.ts'
import { plural } from './plural.ts'

// The reference language: its shape is the type every other language has to fill (Messages below).
// Deutsch mit „du“, Anführungszeichen als Paar „…“.

const de = {
  usage: (langs: string) => `spurlos <url> [--lang ${langs}] [--verbose] [--json | --html | --pdf] [-o <datei>] [--auth <benutzer:passwort>] [--user-agent <kennung>]
spurlos mcp [--lang ${langs}] [--user-agent <kennung>]

Ruft die Seite wie ein neuer Besucher auf, der nichts anklickt, und zeigt,
welche fremden Server dabei angefragt und welche Cookies gesetzt werden.

  --lang        Sprache: ${langs}. Ohne Angabe gilt SPURLOS_LANG, dann
                die Sprache des Systems (LC_ALL, LC_MESSAGES, LANG), sonst de
  --verbose     Details auch zu den grünen Prüfungen
  --json        Ergebnis als JSON statt als Text
  --html        Bericht als HTML-Seite, etwa: spurlos <url> --html > bericht.html
  --pdf         Bericht als PDF, etwa: spurlos <url> --pdf > bericht.pdf
  -o, --output  in eine Datei statt auf die Ausgabe, das Format nach der
                Endung (.pdf, .html, .json, sonst Text): -o bericht.pdf
  --auth        Anmeldung per HTTP Basic Auth, nur an die geprüfte Adresse;
                besser über SPURLOS_AUTH, dann steht das Passwort nicht in
                der Shell-Historie
  --user-agent  eigene Browserkennung für alle Aufrufe
  --help        diese Hilfe

spurlos mcp startet einen MCP-Server über stdio: Ein KI-Assistent kann
damit selbst Seiten prüfen lassen, Einrichtung im README.

Exit-Code: 0 ohne roten Befund, 1 mit rotem Befund, 2 bei einem Fehler.

Hilft dir spurlos? https://ko-fi.com/mmohrx`,
  disclaimer: 'Technische Vorprüfung – keine Rechtsberatung und keine Aussage darüber, ob die Seite DSGVO-konform ist.',
  openedAs: (url: string) => `aufgerufen als ${url}`,
  unknownLang: (from: string, value: string, langs: string) => `${from} kennt nur ${langs}, nicht ${value}.`,
  invalidUrl: (arg: string) => `${arg} ist keine gültige Adresse.`,
  oneFormat: '--json, --html und --pdf gehen nur einzeln.',
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
      : reason
    }`,
  authFormat: '--auth und SPURLOS_AUTH brauchen benutzer:passwort.',
  authOverHttp: 'Die Adresse ist http://, das Passwort geht unverschlüsselt an den Server.',
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

export type Messages = typeof de
export default de
