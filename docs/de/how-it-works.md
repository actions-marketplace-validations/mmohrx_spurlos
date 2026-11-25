# Wie spurlos aufruft

**Deutsch** · [English](../en/how-it-works.md)

Die Seite selbst öffnet spurlos als normaler Chrome und hängt seinen Namen an die Kennung an:

```
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Safari/537.36 spurlos/0.6.0
```

„HeadlessChrome“ fehlt darin mit Absicht, auch in den Client Hints (`sec-ch-ua`). Viele Cookie-Banner und Tracker laden für Aufrufe, die sie für Bots halten, gar nicht erst. spurlos würde dann eine saubere Seite melden, während echte Besucher getrackt werden. Verstecken will sich spurlos trotzdem nicht: Der eigene Name steht in jeder Kennung, und `navigator.webdriver` bleibt `true`. Um Fingerprinting und Fragen nach Berechtigungen zu bemerken, ersetzt spurlos einige Funktionen von Canvas, WebGL, Audio, WebRTC, Benachrichtigungen, Standort, Kamera und Service Workern durch eigene, die das Original aufrufen, und legt die Funktion `__spurlos` an; beides kann die Seite sehen.

Mit `--mobile` öffnet spurlos die Seite als Smartphone, mit dem Bildschirm eines Pixel 7 (412 × 915 Pixel), Touch und der Kennung von Chrome auf Android, in den Client Hints mit `mobile` und der Plattform `Android`:

```
Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Mobile Safari/537.36 spurlos/0.6.0
```

Mit derselben Kennung fragt spurlos ab, ob http auf https weiterleitet: Manche Server antworten dort einem Bot anders als einem Browser (DuckDuckGo liefert einem Bot die Seite über http aus, einen Browser leitet es weiter). Impressum und Datenschutzerklärung fragt spurlos offen als Bot ab, nur das HTML, ohne Skripte, Bilder oder Schriften, denn dort geht es nicht um Tracker, die sich vor Bots verstecken:

```
spurlos/0.6.0 (+https://github.com/mmohrx/spurlos)
```

Manche Bot-Schutzdienste lehnen diese Abfragen ab. Antwortet http:// mit einem Fehler, meldet spurlos das gelb, denn ob der Server weiterleitet, bleibt dann offen. Ebenso bei Impressum und Datenschutz, wenn sie spurlos abweisen oder hängen lassen. spurlos versucht nicht, den Bot-Schutz zu umgehen.

Weil spurlos fremde Seiten öffnet, läuft Chromium in seiner eigenen Sandbox, wo das System eine erlaubt (macOS, Windows, Linux mit User-Namespaces). Fehlt sie, meldet spurlos das auf stderr. Im Docker-Image läuft Chromium ohne Sandbox, dort ist der Container als Benutzer `node` die Grenze; prüfe unbekannte Seiten unter Linux am besten so. Downloads einer Seite nimmt spurlos nicht an.

Der HTML-Bericht enthält alle Befunde, die grünen Prüfungen zugeklappt, und am Ende ein Bildschirmfoto der Seite, so wie ein Besucher sie zuerst sieht, samt Cookie-Banner. Er lädt nichts nach und enthält kein JavaScript, lässt sich also auch offline öffnen oder per Mail verschicken. Mehrere Adressen stehen in einer Seite untereinander. Das PDF ist derselbe Bericht, gedruckt vom Chromium, das spurlos ohnehin nutzt, im Format A4 und immer hell, jede Adresse ab einer neuen Seite. Das Bildschirmfoto macht spurlos nur für HTML und PDF; in `--json` steht es nicht. Beim Drucken ist JavaScript aus und jede Anfrage gesperrt.

## Global Privacy Control

Mit `--gpc` sendet spurlos bei jeder Anfrage der Seite den Header `Sec-GPC: 1`, und `navigator.globalPrivacyControl` ist `true`, wie bei Firefox, Brave oder DuckDuckGo mit eingeschalteter [Global Privacy Control](https://globalprivacycontrol.org). Damit sagt der Besucher, dass seine Daten nicht verkauft oder weitergegeben werden sollen. Ob eine Seite das beachtet, zeigt der Vergleich zweier Läufe:

```
spurlos firma.de --json -o ohne-gpc.json
spurlos firma.de --gpc --baseline ohne-gpc.json
```

Was mit GPC wegfällt, listet der zweite Bericht unter „weg“. Was sich Server sonst in dem Signal lesen, prüft spurlos nicht; Impressum, Datenschutzerklärung und die Anfrage über http gehen ohne GPC.

## Seiten hinter einer Anmeldung

Interne Seiten und Staging-Seiten vor dem Livegang stecken oft hinter HTTP Basic Auth. Die Zugangsdaten gibst du am besten über die Umgebung mit, dann stehen sie nicht in der Shell-Historie und nicht in der Prozessliste:

```
SPURLOS_AUTH='team:geheim' npx spurlos https://staging.firma.de
```

`--auth team:geheim` geht auch und hat Vorrang. Mit Docker gibt `-e SPURLOS_AUTH` die Variable weiter, ohne dass das Passwort im Befehl steht: `docker run --rm -e SPURLOS_AUTH ghcr.io/mmohrx/spurlos https://staging.firma.de`. Das Passwort geht nur an genau die angegebene Adresse (Schema, Host, Port). Fremde Server, die die Seite lädt, bekommen es nie, auch wenn sie nach einer Anmeldung fragen, und Impressum oder Datenschutz nur, wenn sie unter derselben Adresse liegen. Leitet `firma.de` auf `www.firma.de` weiter, gib gleich `www.firma.de` an. Mehrere Adressen gehen mit einer Anmeldung nur, wenn sie dieselbe Adresse teilen (`https://staging.firma.de/` und `https://staging.firma.de/kontakt`); sonst endet spurlos mit Exit-Code `2`, bevor es etwas aufruft. Die Prüfung, ob http auf https weiterleitet, läuft ohne Anmeldung. Ist die Adresse selbst `http://`, geht das Passwort unverschlüsselt; spurlos weist auf stderr darauf hin.

Verlangt die Seite eine Anmeldung und es gibt keine oder die falsche, prüft spurlos nicht die Fehlerseite, sondern endet mit Exit-Code `2` und sagt, woran es lag.

Genauso bei `403` oder `429` auf die Seite selbst, meist ein Bot-Schutz: Was dessen Fehlerseite lädt, sagt nichts darüber, was Besucher bekommen. spurlos gibt sich nicht als Mensch aus und umgeht keinen Bot-Schutz; ist es deine Seite, lass spurlos dort zu. Manche Bot-Schutz-Dienste antworten auch mit `200` und einer eigenen Prüfseite; die erkennt spurlos nicht und prüft sie wie die Seite.
