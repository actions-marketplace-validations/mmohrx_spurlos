# Changelog

## Unveröffentlicht

- `--baseline <datei>`: mit einer früheren Ausgabe von `--json` vergleichen. Der Bericht markiert neue Befunde mit `[neu]` und listet, was weggefallen ist; Exit-Code 1 nur noch bei neuen roten Befunden. In `--json` unter `compare`.
- GitHub Action (`uses: mmohrx/spurlos@…`): prüft, schreibt den Bericht in die Zusammenfassung des Laufs und legt JSON, HTML und Text ab, auf Wunsch gegen eine Baseline.
- Mehrere Adressen in einem Lauf: `spurlos a.de b.de/kontakt`, je ein Bericht; in `--json` dann eine Liste, im HTML und PDF eine Seite mit allen.
- `-o` mehrmals: ein Lauf schreibt mehrere Formate, etwa `-o bericht.json -o bericht.html`; das Format nach der Endung, ohne `--json`, `--html` oder `--pdf`.
- Eine Anmeldung (`--auth`, `SPURLOS_AUTH`) gilt bei mehreren Adressen nur, wenn sie dieselbe Adresse (Schema, Host, Port) teilen.
- Neue Prüfung „Eingebundene Dateien“ (`resources`): Skripte, Stylesheets und Frames über http auf einer https-Seite rot, Bilder und Medien gelb; fremde Skripte und Stylesheets ohne `integrity` gelb.
- Sicherheits-Header: eine CSP, die Skripte durchlässt (`'unsafe-inline'` ohne Nonce oder Hash, `'unsafe-eval'`, `*`, `https:`, `http:`, `data:`, oder gar keine Regel für Skripte), ist gelb.
- Cookie-Banner erkannt (Usercentrics, Cookiebot, OneTrust, Borlabs Cookie, Complianz und weitere), samt Hinweis, wenn Tracker trotzdem vorher laden. Cookies, in denen der Banner die Wahl speichert, sind grün.
- Rot sind bei den Cookies nur noch fremde Domains und bekannte Tracker; bekannte Cookies etwa eines Chats oder Zahlungsanbieters sind gelb.
- Tipps im Bericht: Schriften und Bibliotheken selbst ausliefern, Einbettungen erst nach einem Klick laden, Beispielwerte für fehlende Header und HSTS.
- `src/services.json` kennt rund 130 Dienste statt 25, mit neuen Kategorien (`analytics`, `consent`, `social`, `chat`, `payment`) und `paths` für Dienste auf der eigenen Seite.

- README: Umgebungsvariablen auf einen Blick, Wartezeiten, keine Telemetrie, Basic Auth mit Docker.
- Links zum Unterstützen (Ko-fi, GitHub Sponsors) im README, in der Hilfe, in `package.json` und als Button auf GitHub.

## 0.3.0 – 2026-11-21

- `--html`: der Bericht als eigenständige HTML-Seite mit Logo, ohne JavaScript und ohne Nachladen, zum Weiterschicken.
- `--pdf`: derselbe Bericht als PDF, gedruckt vom vorhandenen Chromium, ohne neue Abhängigkeit. Beim Drucken ist JavaScript aus und jede Anfrage gesperrt.
- `-o`, `--output <datei>`: der Bericht in eine Datei, das Format nach der Endung (`-o bericht.pdf`).
- `--auth <benutzer:passwort>` oder `SPURLOS_AUTH`: Seiten hinter HTTP Basic Auth prüfen, etwa vor dem Livegang. Das Passwort geht nur an die geprüfte Adresse, nie an fremde Server und nicht mit der Prüfung über http. Eine fehlende oder abgelehnte Anmeldung endet mit Exit-Code 2 statt mit einem Bericht über die Fehlerseite.
- Die Hilfe zeigt das Logo, im Terminal mit farbigen Ampelpunkten.
- `spurlos mcp`: ein MCP-Server über stdio mit dem Werkzeug `scan`, damit KI-Assistenten Seiten selbst prüfen können. Ohne neue Abhängigkeit.
- Ohne `--lang` richtet sich die Sprache nach `SPURLOS_LANG`, dann nach der Sprache des Systems (`LC_ALL`, `LC_MESSAGES`, `LANG`), sonst Deutsch.
- Die Hilfe (`--help`) gibt es auch auf Englisch.
- Texte je Sprache in `src/lang/`, damit weitere Sprachen dazukommen können.

## 0.2.0 – 2026-11-20

- Bericht neu gestaltet: Bilanz als Plaketten, Mängel zuerst, Befunde als Baum, grüne Prüfungen einzeilig. `--verbose` (`-v`) zeigt alle Details. Farben nur im Terminal, nicht mit `NO_COLOR`.
- Was von der geprüften Seite stammt (Linktexte, Header, Cookie-Namen, Adressen), kann keine Steuerzeichen mehr ins Terminal schreiben.
- Beispielberichte in `examples/`, Logo in `assets/`.
- CONTRIBUTING, SECURITY, Vorlagen für Issues und Pull Requests.
- Chromium läuft in seiner Sandbox, wo das System eine erlaubt (Playwright schaltet sie sonst ab); ohne Sandbox ein Hinweis auf stderr. Downloads sind abgeschaltet.
- `--json` kommt in einer Pipe vollständig an; eine falsche Option endet mit Exit-Code 2 statt 1.
- Eine Weiterleitung auf eine andere Domain macht die angefragte Domain nicht mehr zum fremden Server.
- HSTS mit `max-age=0` zählt als fehlend, ein doppelt gesendeter `X-Content-Type-Options` als gesetzt.
- Als Datenschutzerklärung zählt zuerst ein Link auf der eigenen Seite, nicht der eines Cookie-Banners.
- Fehlermeldungen der CLI folgen `--lang`.

## 0.1.0 – 2026-11-20

Erste Version mit sieben passiven Prüfungen: fremde Server, Cookies und Speicher, Impressum und Datenschutz, HTTPS, Sicherheits-Header, Formulare, verratene Details. Bericht auf Deutsch und Englisch, `--json`, Exit-Code 0/1/2, Image auf ghcr.
