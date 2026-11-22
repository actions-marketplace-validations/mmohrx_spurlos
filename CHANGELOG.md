# Changelog

## Unveröffentlicht

- Neue Prüfung „Fingerprinting“ (`fingerprinting`): Skripte, die vor jedem Klick ein Canvas mit Text, die Grafikkarte über WebGL oder Audio im `OfflineAudioContext` auslesen. Rot bei einem fremden Skript, gelb bei einem eigenen, einem Captcha oder einem Server, der zur Seite zu gehören scheint. In `--json` unter `scan.fingerprinting` die Rohdaten.
- Neue Prüfung „Browser-Zugriffe“ (`access`): Skripte, die beim Laden nach Benachrichtigungen, Push, Standort, Kamera oder Mikrofon fragen oder einen Service Worker registrieren. Benachrichtigungen und Push gelb, Standort, Kamera und Mikrofon rot bei einem fremden Skript, sonst gelb; ein Service Worker grün.
- Neue Prüfung „Barrierefreiheit“ (`accessibility`): `lang` am `<html>`, Bilder ohne `alt`, Formularfelder ohne Beschriftung, ein Viewport, der Zoomen sperrt, je gelb; ein Link auf eine Erklärung zur Barrierefreiheit wird genannt. Nur Grundlagen, keine Aussage darüber, ob die Seite barrierefrei ist.

## 0.4.0 – 2026-11-21

- Doku: Das README gibt den Überblick, die Einzelheiten zur Ampel, zur CI und dazu, wie spurlos aufruft, stehen in `docs/`.
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
- Bildschirmfoto der Seite beim ersten Aufruf im HTML- und PDF-Bericht.
- Fremde Server: Cookie-Banner und Captchas sind gelb statt rot, denn die Seite braucht sie; alle anderen bleiben rot.
- Eingebundene Dateien: Skripte, die nicht laufen (`type="text/plain"`, wie Cookie-Banner sie zurückhalten, oder `nomodule`), zählen nicht; Adressen im Bericht ohne Query, in der etwa API-Schlüssel stehen.
- `src/services.json` kennt rund 200 Dienste statt 25, mit neuen Kategorien (`analytics`, `consent`, `social`, `chat`, `payment`) und `paths` für Dienste auf der eigenen Seite.
- HTTPS: Antwortet http:// mit einem Fehler (4xx, 5xx), oft wegen eines Bot-Schutzes, ist das gelb statt rot; in `--json` als `http: "refused"`.
- Eigene Server auf anderen Domains (etwa `wikimedia.org` bei Wikipedia) sind gelb statt rot, ihre Cookies auch: mit `--own <host>`, laut Zertifikat der Seite oder dem Namen nach. Der Bericht nennt den Grund, `--json` ihn als `own`. Auch im MCP-Werkzeug (`own`) und in der Action (`own`). Bekannte Dienste gehören nie dazu, außer die Seite ist der Dienst selbst (`media.doctolib.com` auf `doctolib.de`).
- Impressum und Datenschutz: Weist die Seite spurlos ab (`401`, `403`, `429`) oder antwortet sie nicht vor dem Timeout, oft wegen eines Bot-Schutzes, ist das gelb statt rot; `404` und andere Fehler bleiben rot.
- Gleiche Formulare stehen im Bericht einmal, mit Anzahl (`2×`); `--json` und `--baseline` zählen weiter jedes.
- Links, Formulare und eingebundene Dateien im Shadow DOM zählen mit; vorher fehlten etwa Impressum und Datenschutz in Footern aus Web Components.
- Weist die Seite selbst den Aufruf mit `403` oder `429` ab, meist ein Bot-Schutz, prüft spurlos nicht die Fehlerseite, sondern endet mit Exit-Code 2 und sagt, woran es lag.
- Impressum oder Datenschutz als PDF zählen als erreichbar; vorher brach das Öffnen als Download ab.
- Bekannte Dienste auf der eigenen Seite, an ihren Pfaden erkannt (Matomo, Sentry, Plausible), nennt die Prüfung „Fremde Server“, ohne dass sich die Ampel ändert; in `--json` unter `selfHosted`. Fremde Hosts ohne bekannten Namen benennt spurlos so ebenfalls.
- HTTPS: Ob http auf https weiterleitet, fragt spurlos mit derselben Kennung ab wie die Seite, nicht mehr als Bot; DuckDuckGo etwa liefert einem Bot die Seite über http aus und meldete so zu Unrecht rot.
- `src/services.json`: Sentry, HolaCDN, Contentful, Bynder, Verint, Centinel, Tealium, Adobe Target und Experience Platform Tags, Mapp Intelligence (Webtrekk), Snowplow, Kameleoon, Dynamic Yield, trbo, Amazon Ads, Ogury, Commanders Act TrustCommander, Dynatrace, Statsig, Cloudinary, Contentstack, Builder.io, AWS WAF, Radware Bot Manager, Amazon Consent Signal, Permutive, Nielsen, Demandbase, Varify, Akamai mPulse, Datadog RUM, ipify, Google Sign-In, i18next, upscore, Braze, iSpot.tv, CleverPush, Queue-it, Wix und Shopify samt den Cookies, die sie selbst als nötig einstufen, Klaviyo, Mailchimp, Visitor Analytics, Ahrefs Web Analytics, Pandectes, Gist, Seal Subscriptions, Avada, RevenueHunt, CDNFonts, FuPa, Instafeed, Reputon, Wir sind Handwerk, straitpublish, COCO, Squarespace samt Statistik, Weglot, Elfsight, GloriaFood, Jimdo, Doctolib, DocMedico, ein Matomo bei vb-tool.de, Nuxt i18n, Triptease, GlobeRes, ReserveCloud, Marker.io, Promptwatch, ein Umami bei The Orange Studio, Plyr, DigitalOcean Spaces, Cloudflare Trace, Webflow, IONOS MyWebsite, OpenTable, Quandoo, Molzait, Matterport, Elementor, Polylang, eRecht24 Consent, instant.page, DSGVO All in One; Cookies von YouTube und ColdFusion; mehr Cookies und Speicher-Einträge von Pinterest, Complianz, WordPress, Adobe, Sourcepoint, Usercentrics, consentmanager, OneTrust, Snowplow, Cloudflare, Akamai und Centinel; alle `bm_`-Cookies des Akamai Bot Managers, das Cookie von reCAPTCHA.
- Impressum und Datenschutz: Ein Link, dessen Text mit dem Stichwort beginnt („Datenschutz“, „Privacy Policy“), geht einem vor, der es erst später nennt („About Swiss privacy“), und beide einem, bei dem nur die Adresse passt (Cookie-Einstellungen unter `/privacy/`). Skripte im Link zählen nicht mehr zu seinem Text.
- Fremde Server: Läuft die Seite auf Wix, Shopify, Squarespace, Webflow oder IONOS MyWebsite (erkannt an einem Header der Seite), sind deren Server und Cookies gelb statt rot, mit dem Grund „gehört zum Hoster der Seite“; sie liefern die Seite ohnehin aus. Apps und Tracker bleiben rot. In `--json` als `own: "platform"` und `platform` bei `third-party`; in `services.json` das Feld `headers`.
- `--baseline`: Die Server eines bekannten Dienstes zählen als ein Befund (Schlüssel `third-party nmrodam.com`), sodass eine neue zufällige Subdomain etwa von Nielsen oder Akamai mPulse nicht mehr als neuer roter Befund gilt. Der Bericht nennt die Hosts weiter einzeln.
- Antwortet die Seite gar nicht, sagt die Meldung „keine Antwort nach 30 Sekunden“ statt der Meldung von Playwright.

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
