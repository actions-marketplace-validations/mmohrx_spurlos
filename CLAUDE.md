# spurlos

CLI, die eine Website wie ein neuer Besucher aufruft und zeigt, was vor dem ersten Klick passiert. Node 22+, TypeScript ohne Build-Schritt für die Entwicklung (`node src/cli.ts`), Playwright mit Chromium. Was es prüft und wie man es nutzt: `README.md` (Englisch, die Startseite auf GitHub und npm) und `README.de.md`. Wie man beiträgt: `CONTRIBUTING.md`.

## Grundsätze

- Nur passive Prüfungen: die Seite aufrufen, einmal die Maus bewegen und scrollen (nie klicken), Impressum und Datenschutz über ihre Links öffnen, http:// einmal anfragen. Keine Abfragen geratener Pfade wie `/.env`, `/.git/` oder `/wp-admin`, kein Ausfüllen von Formularen, keine Last.
- Der Browser gibt sich nicht als Mensch aus: `spurlos/<version>` steht in der Browserkennung, `navigator.webdriver` bleibt `true`.
- Keine Rechtsaussagen. Der Bericht sagt, was technisch passiert, nicht ob die Seite DSGVO-konform ist; der Hinweis „keine Rechtsberatung“ bleibt am Ende jedes Berichts.
- Keine neuen Abhängigkeiten ohne guten Grund. Farben im Terminal kommen aus `node:util`.

## Code

- Prüfungen und ihre Ampel: `src/checks.ts`. Eine neue Prüfung bekommt einen eigenen `check` im Typ `Result`, eine Zeile in der Ampel-Tabelle im README und einen Fall in `test/sites/`.
- Texte: eine Datei je Sprache in `src/lang/` (Bericht, Hilfe, Fehlermeldungen); `src/report.ts` nur die Darstellung. `de.ts` ist die Vorlage, jede andere Sprache ist als `Messages` typisiert, damit `pnpm typecheck` fehlende Texte meldet. Jede Meldung sagt in jeder Sprache dasselbe. Deutsch mit „du“, Anführungszeichen als Paar „…“.
- Sprache: `--lang`, sonst `SPURLOS_LANG`, sonst `LC_ALL`/`LC_MESSAGES`/`LANG`, sonst `en` (`pickLang` in `src/lang/index.ts`). Bericht-Funktionen bekommen die Sprache immer übergeben, damit Tests und `pnpm examples` nicht vom System abhängen.
- Bekannte Dienste: nur in `src/services.json`. Hosts gelten samt Subdomains, Cookie-Namen als Anfang, mit `*` vorn als Ende.
- Paketmanager ist pnpm (`packageManager` in `package.json`), nicht npm.

## Tests

- `pnpm test` läuft ohne Netz: `test/site.ts` liefert `test/sites/` unter `https://shop.example` aus, `test/sites/fremd/<host>/` unter anderen Hosts, und beantwortet alles andere leer. Neue Tests nutzen dasselbe, nie echte Websites.
- Vor jedem Commit: `pnpm typecheck && pnpm test`.
- Commit-Nachrichten auf Englisch (ältere sind Deutsch, die bleiben so).
- Ändert sich der Bericht, danach `pnpm examples` und `examples/` mit committen, damit README-Bild und Beispielberichte zum Code passen.

## Doku

- Ändert sich, was Nutzer sehen oder worauf sie sich verlassen (Optionen, Exit-Codes, Umgebungsvariablen, Ampel-Regeln und Schwellen, geprüfte Header, Felder in `--json`, das MCP-Werkzeug), im selben Commit die Doku anpassen, dazu die Hilfe in `src/lang/`. Das README hat den Überblick (Optionen, Umgebungsvariablen, Ampel-Tabelle, MCP), die Einzelheiten stehen in `docs/de/` und `docs/en/`, je Sprache dieselben Dateien: Ampel-Regeln, Schwellen, geprüfte Header und eigene Server in `checks.md`, Exit-Codes, `--json`, `--baseline` und die Action in `ci.md`, Browserkennung, Bot-Schutz und Anmeldung in `how-it-works.md`. Das README gibt es als `README.md` (Englisch) und `README.de.md` (Deutsch). Beide Sprachen sagen dasselbe.
- Ändert sich, wie man beiträgt (Dienste, Sprachen, Tests), auch `CONTRIBUTING.md`. `CONTRIBUTING.md`, `SECURITY.md` und die Vorlagen in `.github/` sind Englisch.
- Vor dem Commit die Doku gegen den geänderten Code lesen, nicht aus dem Gedächtnis: Namen, Werte und Listen müssen genau stimmen.

## Logo

`scripts/logo.mjs` erzeugt alles in `assets/` (Anleitung im Kopf der Datei). Die Dateien dort nicht von Hand ändern.

## Release

Version in `package.json` erhöhen, Eintrag in `CHANGELOG.md` (ab 0.5.3 auf Englisch, er wird der Text des GitHub-Release; was noch nicht veröffentlicht ist, sammelt sich unter `## Unreleased`, beim Release wird daraus `## X.Y.Z – Datum`), dann Tag `vX.Y.Z` pushen. Der Workflow `release.yml` prüft, dass Tag und Version übereinstimmen, und veröffentlicht das Image auf ghcr, bei öffentlichem Repo auch das Paket auf npm (Trusted Publishing, kein Token) und danach den MCP-Server in der MCP Registry (`server.json`, Version kommt aus dem Tag, Anmeldung über GitHub OIDC), zuletzt das GitHub-Release mit dem Eintrag aus `CHANGELOG.md` (fehlt er, schlägt der Job fehl). Die Action steht im GitHub Marketplace als „spurlos website check“, neue Releases erscheinen dort von selbst. Tags und Releases nur nach Martins Freigabe.
