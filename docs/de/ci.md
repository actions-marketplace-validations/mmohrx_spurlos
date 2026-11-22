# In der CI

**Deutsch** · [English](../en/ci.md)

```
npx spurlos https://staging.firma.de || echo "neue Spuren"
```

Exit-Code `0` ohne roten Befund, `1` mit rotem Befund, `2`, wenn sich eine Seite nicht prüfen ließ oder der Aufruf falsch war (unbekannte Option, ungültige URL, unbekannte Sprache, mehr als eines von `--json`, `--html`, `--pdf`, eines davon mit mehreren `-o`, eine Baseline, die sich nicht lesen lässt, eine Anmeldung für Adressen auf verschiedenen Servern, etwas anderes als ein Hostname bei `--own`) oder sich eine Datei von `-o` nicht schreiben ließ. Auch eine fehlende oder abgelehnte Anmeldung endet mit `2`, ebenso eine Seite, die den Aufruf mit `403` oder `429` abweist, und eine, die Chromium gar nicht öffnet, weil ihr Zertifikat ungültig ist oder ihr Server nur veraltete TLS-Versionen wie 1.0 und 1.1 anbietet; die Meldung sagt dann, woran es lag. Bei mehreren Adressen gilt der schlechteste Fall; die Berichte der Seiten, die sich prüfen ließen, schreibt spurlos trotzdem.

Mit `--json` kommt das vollständige Ergebnis als JSON: `scan` enthält die Rohdaten (alle Anfragen samt übertragener Größe, Cookies, Speicher, ausgelesene Fingerprinting-Werte und Browser-Zugriffe samt Skript, die Grundlagen der Barrierefreiheit, Header, Zertifikat samt den Namen darin, Links, Formulare, eingebundene Dateien, die Hosts von `--own`), `results` je Prüfung ein Objekt mit `check` (`third-party`, `cookies`, `fingerprinting`, `access`, `legal`, `https`, `headers`, `resources`, `forms`, `disclosure`, `accessibility`), `level` (`green`, `yellow`, `red`) und den Befunden, `note` den Hinweis auf die fehlende Rechtsberatung. Server und Cookies, die zur Seite zu gehören scheinen, tragen `own` mit dem Grund (`option`, `certificate`, `name`, `platform`). Bei `third-party` stehen unter `selfHosted` die bekannten Dienste, die auf der eigenen Seite laufen. Bei mehreren Adressen ist es eine Liste solcher Objekte. Die roten Prüfungen etwa:

```
npx spurlos https://staging.firma.de --json | jq -r '.results[] | select(.level == "red") | .check'
```

## Nur neue Spuren melden

Eine Seite ist selten ganz grün. Damit die CI trotzdem anschlägt, wenn etwas dazukommt, etwa ein neuer Tracker oder ein neues Cookie, vergleicht `--baseline` mit einer früheren Ausgabe von `--json`:

```
npx spurlos https://www.firma.de --json -o spurlos-baseline.json   # einmal, dann ins Repository
npx spurlos https://www.firma.de --baseline spurlos-baseline.json
```

Der Bericht markiert dann jeden Befund, der neu ist oder schlechter als vorher, mit `[neu]` und listet, was weggefallen ist. Exit-Code `1` gibt es nur noch bei einem neuen roten Befund. Mit `--json` steht der Vergleich unter `compare` (`baseline`, `new`, `gone`, je Befund `key` und `level`). Die Seiten findet spurlos in der Baseline über ihre Adresse; prüfst du eine einzige Seite gegen eine Baseline mit einer einzigen, gehören die beiden zusammen. Eine Seite, die die Baseline nicht kennt, hat nur neue Befunde. Die Server eines bekannten Dienstes zählen dabei als ein Befund, mit dem Eintrag aus `src/services.json` als Schlüssel (`third-party nmrodam.com`): Manche Dienste nutzen bei jedem Aufruf eine neue Subdomain, und das ist nichts Neues.

## GitHub Action

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
