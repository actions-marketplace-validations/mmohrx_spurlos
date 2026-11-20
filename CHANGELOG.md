# Changelog

## Unveröffentlicht

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
