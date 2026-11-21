<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo-light.svg" alt="spurlos" height="64">
  </picture>
</h1>

**Deutsch** · [English](README.en.md)

Ruft eine Website so auf wie ein neuer Besucher, der noch nichts angeklickt hat, und zeigt dir:

- **welche fremden Server** dabei angefragt werden, etwa Google Fonts, Tag Manager, YouTube oder ein CDN. Jeder davon erfährt die IP-Adresse des Besuchers.
- **welche Cookies und Einträge im Browser-Speicher** schon vor jeder Einwilligung gesetzt sind, und ob darunter bekannte Tracker oder Cookies fremder Domains sind.
- welcher **Cookie-Banner** geladen wird, etwa Usercentrics, Cookiebot oder Borlabs, und ob Tracker trotzdem schon vorher laden.
- ob **Impressum und Datenschutzerklärung** verlinkt sind und sich öffnen lassen.
- ob **HTTPS** sauber eingerichtet ist: Zertifikat, Weiterleitung von http, HSTS.
- welche **Sicherheits-Header** fehlen, und ob die Content-Security-Policy Skripte doch durchlässt.
- ob **eingebundene Dateien** über unverschlüsseltes http kommen, und ob fremde Skripte und Stylesheets ohne `integrity` eingebunden sind.
- wohin **Formulare** senden: verschlüsselt an die eigene Seite, an einen fremden Server oder unverschlüsselt.
- ob Header oder Seite **die Software dahinter samt Version** verraten, etwa `X-Powered-By: PHP/8.1.2` oder `WordPress 6.2`.

```
npx spurlos beispiel-firma.de
```

Links eine Seite mit Mängeln, rechts eine saubere:

![Farbige Ausgabe von spurlos für eine Seite mit Mängeln und eine saubere Seite](examples/vorschau.png)

Die vollständigen Berichte beider Seiten, als Text auf Deutsch und Englisch und als JSON, liegen in [`examples/`](examples/), dazu je eine HTML-Seite. Beide Seiten stammen aus den Tests und laufen offline unter `https://shop.example`; `pnpm examples` erzeugt alles neu.

spurlos nutzt einen echten Browser (Chromium über Playwright). Es findet also auch Anfragen und Cookies, die erst per JavaScript entstehen. Impressum, Datenschutzerklärung und die http-Adresse ruft es getrennt davon auf; diese Aufrufe zählen nicht zu den Anfragen und Cookies der Seite. Ob http auf https weiterleitet, fragt es direkt beim Server und nicht über den Browser nach, denn Chromium wechselt von sich aus auf https.

## Installation

Mit Docker, ohne Node:

```
docker run --rm ghcr.io/mmohrx/spurlos beispiel-firma.de
```

Oder mit Node.js 22 oder neuer. Beim ersten Mal braucht Playwright seinen Browser:

```
npx playwright install chromium-headless-shell
npx spurlos <url>
```

| Option | |
|---|---|
| `<url> …` | eine oder mehrere Adressen; mehrere prüft spurlos nacheinander, mit je einem Bericht |
| `--lang de\|en` | Sprache des Berichts. Ohne Angabe gilt `SPURLOS_LANG`, dann die Sprache des Systems (`LC_ALL`, `LC_MESSAGES`, `LANG`), sonst `de` |
| `--verbose`, `-v` | Details auch zu den grünen Prüfungen |
| `--json` | vollständiges Ergebnis als JSON |
| `--html` | Bericht als eigenständige HTML-Seite, etwa zum Weiterschicken |
| `--pdf` | Bericht als PDF |
| `-o`, `--output <datei>` | Bericht in eine Datei statt auf die Ausgabe. Ohne `--json`, `--html` oder `--pdf` entscheidet die Endung: `spurlos firma.de -o bericht.pdf` (`.pdf`, `.html`, `.json`, sonst Text). Mehrmals angegeben, schreibt ein Lauf mehrere Formate: `-o bericht.json -o bericht.html`; dann entscheidet bei jeder Datei die Endung, `--json`, `--html` und `--pdf` gehen damit nicht |
| `--baseline <datei>` | mit einer früheren Ausgabe von `--json` vergleichen, siehe [In der CI](#in-der-ci) |
| `--auth <benutzer:passwort>` | Anmeldung per HTTP Basic Auth, etwa für eine Staging-Seite. Besser über `SPURLOS_AUTH`, siehe [Seiten hinter einer Anmeldung](#seiten-hinter-einer-anmeldung) |
| `--user-agent <kennung>` | eigene Browserkennung für alle Aufrufe |
| `--own <host>` | Server, die zur Seite gehören, obwohl sie auf einer anderen Domain liegen, etwa ihr CDN: `--own cdn-firma.net`, samt Subdomains; mehrmals oder mit Komma. Siehe [Eigene Server auf anderen Domains](#eigene-server-auf-anderen-domains) |
| `--help`, `-h` | Hilfe |

Oben steht die Bilanz, darunter die Prüfungen mit den roten zuerst. Rote und gelbe Prüfungen zeigen jeden Befund, grüne nur eine Zeile. Wo es einen gängigen Weg gibt, nennt der Bericht ihn gleich mit, etwa Schriften selbst auszuliefern oder einen Beispielwert für einen fehlenden Header. Das sind technische Hinweise, keine Rechtsberatung. Im Terminal ist der Bericht farbig. Mit `-o`, in einer Pipe oder mit `NO_COLOR` bleibt es reiner Text. `--html` und `--pdf` gehen auch über die Ausgabe (`--pdf > bericht.pdf`), ein PDF schreibt spurlos aber nicht ins Terminal. Mit Docker landet eine Datei von `-o` im Container; dort leitest du besser um: `docker run --rm ghcr.io/mmohrx/spurlos firma.de --pdf > bericht.pdf`.

| Umgebungsvariable | |
|---|---|
| `SPURLOS_LANG` | Sprache des Berichts, wenn `--lang` fehlt |
| `SPURLOS_AUTH` | Anmeldung als `benutzer:passwort`, wenn `--auth` fehlt, siehe [Seiten hinter einer Anmeldung](#seiten-hinter-einer-anmeldung) |
| `SPURLOS_NO_SANDBOX` | `1` startet Chromium gleich ohne Sandbox und ohne Hinweis darauf; das Docker-Image setzt das, dort ist der Container die Grenze |
| `NO_COLOR` | keine Farben, auch im Terminal |

Die Seite selbst darf bis zu 30 Sekunden zum Laden brauchen. Danach wartet spurlos bis zu 10 Sekunden, bis sie nichts mehr nachlädt; lädt sie dann noch, sagt der Bericht das. Impressum, Datenschutzerklärung und die Anfrage über http bekommen je 15 Sekunden.

spurlos selbst meldet nichts nach Hause: keine Telemetrie, keine Statistik. Angefragt wird nur die Seite, die du prüfst, samt allem, was sie selbst nachlädt.

## Ampel

| Prüfung | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| Fremde Server | keine | nur Cookie-Banner und Captchas (Kategorien `consent` und `captcha`): Die Seite braucht sie, sie erfahren die IP-Adresse trotzdem; dazu Server, die zur Seite zu gehören scheinen (`--own`, Zertifikat, Name) | mindestens eine Anfrage an eine andere Domain, die zu keinem Cookie-Banner, keinem Captcha und nicht zur Seite gehört |
| Cookies und Speicher | nichts gesetzt, oder nur bekannte Sitzungs- und Sicherheits-Cookies und solche, in denen der Cookie-Banner die Wahl speichert | eigene Cookies oder Einträge, die spurlos nicht kennt oder die zu einem Dienst wie einem Chat oder Zahlungsanbieter gehören; ein Cookie ohne `Secure` auf einer https-Seite; ein Sitzungs-Cookie ohne `HttpOnly` | Cookie einer fremden Domain, die nicht zur Seite zu gehören scheint, oder eines bekannten Trackers |
| Impressum und Datenschutz | beide verlinkt und erreichbar | – | ein Link fehlt oder die Seite antwortet mit einem Fehler |
| HTTPS | https, http leitet weiter, HSTS, Zertifikat noch 14 Tage oder länger gültig | kein HSTS (oder `max-age=0`), über http antwortet nichts oder nur ein Fehler (4xx, 5xx, oft ein Bot-Schutz), Zertifikat weniger als 14 Tage gültig | kein https, http ohne Weiterleitung, Zertifikat weniger als 7 Tage gültig oder abgelaufen |
| Sicherheits-Header | alle gesetzt | einer oder mehrere fehlen; die CSP lässt Skripte durch | – |
| Eingebundene Dateien | keine Auffälligkeiten | Skript oder Stylesheet eines fremden Servers ohne `integrity`; Bild, Video oder Audio über http auf einer https-Seite | Skript, Stylesheet oder iframe über http auf einer https-Seite |
| Formulare | keine oder alle senden verschlüsselt an die eigene Seite | eines sendet an einen fremden Server | eines sendet unverschlüsselt über http |
| Verratene Details | nichts, oder nur der Name der Software | eine Versionsnummer in `Server`, `X-Powered-By`, `X-AspNet-Version`, `X-AspNetMvc-Version`, `X-Generator` oder `<meta name="generator">` | – |

Geprüft werden bei den Headern `Content-Security-Policy`, `X-Frame-Options` (oder `frame-ancestors` in der CSP), `X-Content-Type-Options: nosniff`, `Referrer-Policy` und `Permissions-Policy`. CSP und Referrer-Policy zählen auch als `<meta>`-Tag, für Hoster wie GitHub Pages, bei denen sich keine Header setzen lassen. Eine CSP lässt Skripte durch, wenn sie für Skripte (`script-src`, sonst `default-src`) `'unsafe-inline'` ohne Nonce oder Hash, `'unsafe-eval'` oder eine Quelle wie `*`, `https:`, `http:` oder `data:` erlaubt (Letztere nicht mit `'strict-dynamic'`), oder wenn sie Skripte gar nicht regelt. Gibt es Header und `<meta>`-Tag, reicht es, wenn eine der beiden Richtlinien dicht ist. Impressum und Datenschutzerklärung erkennt spurlos am Linktext oder an der Adresse, auf Deutsch und Englisch. Ein Link wie „Impressum & Datenschutz“ zählt für beides.

Bei den eingebundenen Dateien zählt, was im HTML steht: `<script src>`, Stylesheets, `<iframe>`, `<img>`, `<video>`, `<audio>` und `<source>`. Über http auf einer https-Seite blockiert der Browser Skripte, Stylesheets und Frames; Bilder und Medien lädt er über https oder gar nicht. Ohne `integrity` kann ein fremder Server ein Skript jederzeit austauschen. Skripte, die nicht laufen, zählen nicht, etwa solche mit `type="text/plain"`, wie Cookie-Banner sie bis zur Einwilligung zurückhalten. Im Bericht stehen die Adressen ohne Query (`…/api/js?…`), denn dort stehen oft API-Schlüssel; `--json` enthält sie vollständig.

Jeder einzelne Befund hat im Bericht seine eigene Ampel, die Prüfung bekommt die schlechteste davon. So sieht man, welcher Eintrag eine Prüfung gelb oder rot macht.

Bekannte Sitzungs- und Sicherheits-Cookies sind zum Beispiel `XSRF-TOKEN` und `<app>-session` von Laravel, `PHPSESSID`, `JSESSIONID`, `csrftoken` von Django und `__cf_bm` von Cloudflare. Im Browser-Speicher kennt spurlos Einträge, die Frameworks selbst anlegen, etwa die Scroll-Positionen von Vue Router (`vue-router:scroll`). Die Liste steht in `src/services.json` (Kategorie `necessary`).

Cookie-Banner erkennt spurlos an ihren Servern, an ihren Dateien auf der eigenen Seite (so auch Borlabs Cookie, Complianz oder Real Cookie Banner unter WordPress), an ihren Cookies und an ihren Einträgen im Browser-Speicher (Kategorie `consent`). Die Prüfung „Fremde Server“ nennt, welcher geladen wird, und sagt, wenn bekannte Tracker trotzdem schon vor jeder Wahl im Banner laden. Ob ein Banner nötig ist oder richtig eingestellt, beurteilt spurlos nicht.

Subdomains zählen zur eigenen Seite (`cdn.firma.de` gehört zu `www.firma.de`), dabei gilt die Public Suffix List (`firma.co.uk`).

### Eigene Server auf anderen Domains

Viele Seiten laden Bilder und Skripte von einer eigenen zweiten Domain, Wikipedia etwa von `wikimedia.org`. Solche Server sind gelb statt rot, wenn spurlos sie der Seite zuordnen kann, und der Bericht sagt, warum:

- **laut --own:** Du nennst sie selbst, `--own cdn-firma.net`. Das ist eindeutig und der richtige Weg für die eigene Seite.
- **laut Zertifikat:** Das TLS-Zertifikat der Seite nennt auch diese Domain, wie das von `wikipedia.org` die Domain `wikimedia.org`. spurlos liest es aus der Verbindung, die Chromium ohnehin hat, und glaubt ihm nur, wenn sein Inhaber (CN) die Seite selbst ist, denn Sammelzertifikate von Hostern nennen fremde Kunden.
- **dem Namen nach:** Die Domain trägt den Namen der Seite als ganzes Wort, `media.kuketz.de` bei `kuketz-blog.de`, `img.chefkoch-cdn.de` bei `chefkoch.de` oder `bildstatic.de` bei `bild.de`. Teile eines Worts zählen nicht (`ottonova.de` gehört nicht zu `otto.de`), kurze Namen und Allerweltswörter wie `shop` oder `blog` auch nicht. Das ist eine Vermutung, prüfe sie.

Ein bekannter Dienst aus `src/services.json` gehört nie zur Seite, auch nicht mit `--own`. Das gilt ebenso für Cookies dieser Domains. Gelb bleibt es, weil die IP-Adresse trotzdem an einen anderen Host geht; betreibt ihn ein Dienstleister, erfährt auch der sie.

## Wie spurlos aufruft

Die Seite selbst öffnet spurlos als normaler Chrome und hängt seinen Namen an die Kennung an:

```
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Safari/537.36 spurlos/0.3.0
```

„HeadlessChrome“ fehlt darin mit Absicht, auch in den Client Hints (`sec-ch-ua`). Viele Cookie-Banner und Tracker laden für Aufrufe, die sie für Bots halten, gar nicht erst. spurlos würde dann eine saubere Seite melden, während echte Besucher getrackt werden. Verstecken will sich spurlos trotzdem nicht: Der eigene Name steht in jeder Kennung, und `navigator.webdriver` bleibt `true`.

Impressum, Datenschutzerklärung und die Weiterleitung von http fragt spurlos offen als Bot ab, denn dort geht es nicht um Tracker, die sich vor Bots verstecken:

```
spurlos/0.3.0 (+https://github.com/mmohrx/spurlos)
```

Manche Bot-Schutzdienste lehnen diese Abfragen ab. Antwortet http:// mit einem Fehler, meldet spurlos das gelb, denn ob der Server weiterleitet, bleibt dann offen. spurlos versucht nicht, den Bot-Schutz zu umgehen.

Weil spurlos fremde Seiten öffnet, läuft Chromium in seiner eigenen Sandbox, wo das System eine erlaubt (macOS, Windows, Linux mit User-Namespaces). Fehlt sie, meldet spurlos das auf stderr. Im Docker-Image läuft Chromium ohne Sandbox, dort ist der Container als Benutzer `node` die Grenze; prüfe unbekannte Seiten unter Linux am besten so. Downloads einer Seite nimmt spurlos nicht an.

Der HTML-Bericht enthält alle Befunde, die grünen Prüfungen zugeklappt, und am Ende ein Bildschirmfoto der Seite, so wie ein Besucher sie zuerst sieht, samt Cookie-Banner. Er lädt nichts nach und enthält kein JavaScript, lässt sich also auch offline öffnen oder per Mail verschicken. Mehrere Adressen stehen in einer Seite untereinander. Das PDF ist derselbe Bericht, gedruckt vom Chromium, das spurlos ohnehin nutzt, im Format A4 und immer hell, jede Adresse ab einer neuen Seite. Das Bildschirmfoto macht spurlos nur für HTML und PDF; in `--json` steht es nicht. Beim Drucken ist JavaScript aus und jede Anfrage gesperrt.

## Für KI-Assistenten (MCP)

`spurlos mcp` startet einen [MCP](https://modelcontextprotocol.io)-Server über stdio. Ein Assistent wie Claude kann damit selbst Seiten prüfen, etwa auf die Bitte „Prüf mal firma.de und erklär mir, was rot ist“. Der Server bietet ein Werkzeug, `scan`, mit `url` und optional `lang` (`de`, `en`), `format` (`text` oder `json`) und `own` (eine Liste von Hostnamen wie bei `--own`). Er läuft auf deinem Rechner, wie die CLI: Der Assistent startet ihn selbst und spricht über stdin und stdout mit ihm. Einen offenen Port gibt es nicht, deshalb braucht er auch kein Token.

In Claude Code:

```
claude mcp add spurlos -- npx spurlos mcp
```

In anderen Clients, etwa Claude Desktop, unter `mcpServers`:

```json
{ "spurlos": { "command": "npx", "args": ["spurlos", "mcp"] } }
```

Mit Docker statt Node: `"command": "docker", "args": ["run", "-i", "--rm", "ghcr.io/mmohrx/spurlos", "mcp"]`.

Die Sprache richtet sich wie bei der CLI nach `--lang`, `SPURLOS_LANG` oder dem System, `--user-agent` gilt für alle Aufrufe. `--auth` gibt es dort nicht, denn die Adressen wählt der Assistent. Höchstens zwei Prüfungen laufen gleichzeitig, weitere warten. Jeder Bericht trägt den Hinweis, dass er keine Rechtsberatung ist.

## Seiten hinter einer Anmeldung

Interne Seiten und Staging-Seiten vor dem Livegang stecken oft hinter HTTP Basic Auth. Die Zugangsdaten gibst du am besten über die Umgebung mit, dann stehen sie nicht in der Shell-Historie und nicht in der Prozessliste:

```
SPURLOS_AUTH='team:geheim' npx spurlos https://staging.firma.de
```

`--auth team:geheim` geht auch und hat Vorrang. Mit Docker gibt `-e SPURLOS_AUTH` die Variable weiter, ohne dass das Passwort im Befehl steht: `docker run --rm -e SPURLOS_AUTH ghcr.io/mmohrx/spurlos https://staging.firma.de`. Das Passwort geht nur an genau die angegebene Adresse (Schema, Host, Port). Fremde Server, die die Seite lädt, bekommen es nie, auch wenn sie nach einer Anmeldung fragen, und Impressum oder Datenschutz nur, wenn sie unter derselben Adresse liegen. Leitet `firma.de` auf `www.firma.de` weiter, gib gleich `www.firma.de` an. Mehrere Adressen gehen mit einer Anmeldung nur, wenn sie dieselbe Adresse teilen (`https://staging.firma.de/` und `https://staging.firma.de/kontakt`); sonst endet spurlos mit Exit-Code `2`, bevor es etwas aufruft. Die Prüfung, ob http auf https weiterleitet, läuft ohne Anmeldung. Ist die Adresse selbst `http://`, geht das Passwort unverschlüsselt; spurlos weist auf stderr darauf hin.

Verlangt die Seite eine Anmeldung und es gibt keine oder die falsche, prüft spurlos nicht die Fehlerseite, sondern endet mit Exit-Code `2` und sagt, woran es lag.

## In der CI

```
npx spurlos https://staging.firma.de || echo "neue Spuren"
```

Exit-Code `0` ohne roten Befund, `1` mit rotem Befund, `2`, wenn sich eine Seite nicht prüfen ließ oder der Aufruf falsch war (unbekannte Option, ungültige URL, unbekannte Sprache, mehr als eines von `--json`, `--html`, `--pdf`, eines davon mit mehreren `-o`, eine Baseline, die sich nicht lesen lässt, eine Anmeldung für Adressen auf verschiedenen Servern, etwas anderes als ein Hostname bei `--own`) oder sich eine Datei von `-o` nicht schreiben ließ. Auch eine fehlende oder abgelehnte Anmeldung endet mit `2`. Bei mehreren Adressen gilt der schlechteste Fall; die Berichte der Seiten, die sich prüfen ließen, schreibt spurlos trotzdem.

Mit `--json` kommt das vollständige Ergebnis als JSON: `scan` enthält die Rohdaten (alle Anfragen, Cookies, Speicher, Header, Zertifikat samt den Namen darin, Links, Formulare, eingebundene Dateien, die Hosts von `--own`), `results` je Prüfung ein Objekt mit `check` (`third-party`, `cookies`, `legal`, `https`, `headers`, `resources`, `forms`, `disclosure`), `level` (`green`, `yellow`, `red`) und den Befunden, `note` den Hinweis auf die fehlende Rechtsberatung. Server und Cookies, die zur Seite zu gehören scheinen, tragen `own` mit dem Grund (`option`, `certificate`, `name`). Bei mehreren Adressen ist es eine Liste solcher Objekte. Die roten Prüfungen etwa:

```
npx spurlos https://staging.firma.de --json | jq -r '.results[] | select(.level == "red") | .check'
```

### Nur neue Spuren melden

Eine Seite ist selten ganz grün. Damit die CI trotzdem anschlägt, wenn etwas dazukommt, etwa ein neuer Tracker oder ein neues Cookie, vergleicht `--baseline` mit einer früheren Ausgabe von `--json`:

```
npx spurlos https://www.firma.de --json -o spurlos-baseline.json   # einmal, dann ins Repository
npx spurlos https://www.firma.de --baseline spurlos-baseline.json
```

Der Bericht markiert dann jeden Befund, der neu ist oder schlechter als vorher, mit `[neu]` und listet, was weggefallen ist. Exit-Code `1` gibt es nur noch bei einem neuen roten Befund. Mit `--json` steht der Vergleich unter `compare` (`baseline`, `new`, `gone`, je Befund `key` und `level`). Die Seiten findet spurlos in der Baseline über ihre Adresse; prüfst du eine einzige Seite gegen eine Baseline mit einer einzigen, gehören die beiden zusammen. Eine Seite, die die Baseline nicht kennt, hat nur neue Befunde.

### GitHub Action

```yaml
name: spurlos
on:
  schedule:
    - cron: "0 6 * * 1"   # jeden Montag
  workflow_dispatch:

jobs:
  spurlos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: mmohrx/spurlos@main   # besser auf ein Release festgelegt: @vX.Y.Z
        with:
          url: https://www.firma.de
          baseline: spurlos-baseline.json
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: spurlos
          path: ${{ runner.temp }}/spurlos/
```

Die Action installiert spurlos und Chromium aus ihrem eigenen Stand, prüft und schreibt den Bericht in die Zusammenfassung des Laufs. Dazu legt sie `report.json`, `report.html` und `report.txt` in `$RUNNER_TEMP/spurlos/` ab; die Pfade stehen auch in den Ausgaben `json` und `html`, der Exit-Code in `exit-code`. Der Schritt schlägt fehl, wie es der Exit-Code sagt.

| Eingabe | |
|---|---|
| `url` | die Adresse, oder mehrere, getrennt durch Leerzeichen oder Zeilenumbrüche |
| `baseline` | eine frühere Ausgabe von `--json` im Repository |
| `lang` | `de` oder `en`; ohne Angabe gelten dieselben Regeln wie in der CLI |
| `auth` | `benutzer:passwort` für HTTP Basic Auth, am besten aus einem Secret: `${{ secrets.STAGING_AUTH }}` |
| `own` | eigene Server auf anderen Domains wie bei `--own`, getrennt durch Leerzeichen oder Zeilenumbrüche |
| `user-agent` | eigene Browserkennung für alle Aufrufe |
| `args` | weitere Optionen, etwa `--verbose`, getrennt an Leerzeichen; ohne `--json`, `--html` und `--pdf`, die Dateien gehen nach ihrer Endung |

## Bekannte Dienste ergänzen

Welche Hosts und Cookies zu welchem Dienst gehören, steht in [`src/services.json`](src/services.json). Hosts gelten samt Subdomains, Cookie-Namen als Anfang (`_ga` deckt auch `_ga_ABC123` ab), mit `*` vorn als Ende (`*-session`). Unter `paths` stehen Teile von Dateipfaden, an denen spurlos einen Dienst auch auf der eigenen Seite erkennt: mit `/` am Ende ein Verzeichnis irgendwo im Pfad (`/wp-content/plugins/borlabs-cookie/`), sonst das Ende des Pfads (`/klaro.js`). Fehlt ein Dienst, freue ich mich über einen Pull Request.

## Was spurlos nicht tut

- Es sucht nicht aktiv nach Lücken. Ausgewertet wird nur, was ein normaler Aufruf der Seite ohnehin liefert; Adressen wie `/.env`, `/.git/` oder `/phpinfo.php` fragt spurlos nicht ab. So lässt es sich gegen jede Seite laufen, ohne sie abzuklopfen.
- Es klickt keinen Cookie-Banner an. Geprüft wird der Zustand vor jeder Entscheidung des Besuchers; welcher Banner geladen wird, nennt spurlos, aber nicht, ob er richtig eingestellt ist.
- Es liest Impressum und Datenschutzerklärung nicht, sondern prüft nur, ob sie verlinkt und erreichbar sind.
- Es gibt keine Rechtsberatung. Ein grüner Bericht heißt nicht, dass eine Seite DSGVO-konform ist, und ein roter nicht, dass sie es nicht ist.

## Entwickeln

```
pnpm install
pnpm exec playwright install chromium-headless-shell
pnpm test        # Unit-Tests und Browser-Tests gegen test/sites, ohne Netz
pnpm typecheck
pnpm build       # nach dist/
node src/cli.ts <url>
```

## Mitmachen

Fehlt ein Dienst, stimmt eine Ampel nicht oder hast du eine Idee: In [`CONTRIBUTING.md`](CONTRIBUTING.md) steht, wie du beiträgst. Sicherheitslücken bitte nicht als Issue, sondern wie in [`SECURITY.md`](SECURITY.md) beschrieben melden.

## Unterstützen

spurlos ist ein Hobbyprojekt. Wenn es dir hilft, kannst du es auf [Ko-fi](https://ko-fi.com/mmohrx) oder über [GitHub Sponsors](https://github.com/sponsors/mmohrx) unterstützen. Die Hilfe (`spurlos --help`) verlinkt in der letzten Zeile auch dorthin; die Berichte nicht, die gehören dir.

## Lizenz

MIT, © 2026 Martin Mohr
