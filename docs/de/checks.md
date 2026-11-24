# Ampel im Detail

**Deutsch** · [English](../en/checks.md)

Die Ampel-Tabelle steht im [README](../../README.de.md#ampel). Hier steht, wie spurlos im Einzelnen entscheidet.

Geprüft werden bei den Headern `Content-Security-Policy`, `X-Frame-Options` (oder `frame-ancestors` in der CSP), `X-Content-Type-Options: nosniff`, `Referrer-Policy` und `Permissions-Policy`. CSP und Referrer-Policy zählen auch als `<meta>`-Tag, für Hoster wie GitHub Pages, bei denen sich keine Header setzen lassen. Eine CSP lässt Skripte durch, wenn sie für Skripte (`script-src`, sonst `default-src`) `'unsafe-inline'` ohne Nonce oder Hash, `'unsafe-eval'` oder eine Quelle wie `*`, `https:`, `http:` oder `data:` erlaubt (Letztere nicht mit `'strict-dynamic'`), oder wenn sie Skripte gar nicht regelt. Gibt es Header und `<meta>`-Tag, reicht es, wenn eine der beiden Richtlinien dicht ist. Impressum und Datenschutzerklärung erkennt spurlos am Linktext oder an der Adresse, auf Deutsch und Englisch. Ein Link wie „Impressum & Datenschutz“ zählt für beides. Passen mehrere, gewinnt ein Link auf der eigenen Seite, dann einer, dessen Text mit dem Stichwort beginnt („Datenschutz“, „Privacy Policy“), dann einer, der es später im Text nennt, zuletzt einer, bei dem nur die Adresse passt.

Bei den eingebundenen Dateien zählt, was im HTML steht: `<script src>`, Stylesheets, `<iframe>`, `<img>`, `<video>`, `<audio>` und `<source>`. Über http auf einer https-Seite blockiert der Browser Skripte, Stylesheets und Frames; Bilder und Medien lädt er über https oder gar nicht. Ohne `integrity` kann ein fremder Server ein Skript jederzeit austauschen. Skripte, die nicht laufen, zählen nicht, etwa solche mit `type="text/plain"`, wie Cookie-Banner sie bis zur Einwilligung zurückhalten. Im Bericht stehen die Adressen ohne Query (`…/api/js?…`), denn dort stehen oft API-Schlüssel; `--json` enthält sie vollständig.

Jeder einzelne Befund hat im Bericht seine eigene Ampel, die Prüfung bekommt die schlechteste davon. So sieht man, welcher Eintrag eine Prüfung gelb oder rot macht.

Bekannte Sitzungs- und Sicherheits-Cookies sind zum Beispiel `XSRF-TOKEN` und `<app>-session` von Laravel, `PHPSESSID`, `JSESSIONID`, `csrftoken` von Django und `__cf_bm` von Cloudflare. Im Browser-Speicher kennt spurlos Einträge, die Frameworks selbst anlegen, etwa die Scroll-Positionen von Vue Router (`vue-router:scroll`). Die Liste steht in `src/services.json` (Kategorie `necessary`).

Ein Cookie, das länger als 13 Monate (395 Tage) gilt, ist mindestens gelb, auch ein bekanntes Sitzungs-Cookie; in `--json` trägt es `long: true`. Chrome kürzt jede Laufzeit auf höchstens 400 Tage, ein Cookie für zwei Jahre steht im Bericht also mit 400 Tagen. `SameSite=None` bei einem eigenen Cookie nennt der Bericht, ohne dass sich die Ampel ändert: Der Browser schickt es dann auch in fremden Zusammenhängen mit, aber Dienste wie Cloudflare (`__cf_bm`) brauchen das.

Cookie-Banner erkennt spurlos an ihren Servern, an ihren Dateien auf der eigenen Seite (so auch Borlabs Cookie, Complianz oder Real Cookie Banner unter WordPress), an ihren Cookies und an ihren Einträgen im Browser-Speicher (Kategorie `consent`). Die Prüfung „Fremde Server“ nennt, welcher geladen wird, und sagt, wenn bekannte Tracker trotzdem schon vor jeder Wahl im Banner laden. Ob ein Banner nötig ist oder richtig eingestellt, beurteilt spurlos nicht.

Nutzt die Seite Google Consent Mode, tragen die Anfragen der Google-Tags den Stand der Einwilligung im Parameter `gcs`: `G1` und dann je eine Ziffer für Werbung (`ad_storage`) und Analyse (`analytics_storage`), `1` für erteilt, `0` für abgelehnt. Vor jedem Klick sollte dort `G100` stehen; der Bericht nennt das als Hinweis, denn die Tags senden trotzdem schon, ohne Cookies. Meldet eine Anfrage schon vorher Zustimmung (`G101`, `G110`, `G111`), ist das ein roter Befund. spurlos liest `gcs` aus jeder Anfrage, auch an einen Tag-Server auf der eigenen Domain (serverseitiges Tagging), und nimmt von mehreren die, die am meisten erlaubt. In `--json` steht das bei `third-party` unter `consentMode` (`gcs`, `ads`, `analytics`, je `granted` oder `denied`).

Auch andere Dienste erkennt spurlos an ihren Pfaden, etwa Matomo (`/matomo.php`) oder Sentry (`/envelope/`). Laufen sie auf der eigenen Seite oder einer Subdomain, ändert das keine Ampel, denn die IP-Adresse bleibt bei der Seite; die Prüfung „Fremde Server“ nennt sie trotzdem („Auf eigenen Servern erkannt“), in `--json` unter `selfHosted`. Einen fremden Host, dessen Name nichts verrät, benennt spurlos so ebenfalls. Dienste, die erst nach einer Zustimmung laden, sieht spurlos nicht: Es prüft nur, was ohne Klick passiert.

Nach dem Laden wartet spurlos, bis das Netz ruhig ist (höchstens 10 Sekunden), bewegt dann die Maus, scrollt 400 Pixel und wartet erneut, bis eine Sekunde lang keine Anfrage mehr kommt (höchstens 5 Sekunden). Geklickt wird nie. Optimierungen wie WP Rocket („Delay JavaScript execution“), Perfmatters oder Flying Scripts halten Skripte bis zur ersten Bewegung, zum ersten Scrollen oder Tippen zurück, auch Tracker. Was erst dann kommt, zählt wie alles andere; der Bericht markiert es mit „erst nach der ersten Bewegung“, `--json` mit `afterMove: true` an der Anfrage, am Cookie und an einem fremden Server, an den alle Anfragen erst danach gingen.

Als Anfrage zählt auch eine WebSocket-Verbindung (`ws://`, `wss://`), etwa eines Chats: Ihr Server erfährt die IP-Adresse genauso. In `--json` steht sie unter den Anfragen mit `type: "websocket"`. Ebenso zählen die STUN- und TURN-Server einer WebRTC-Verbindung (`type: "webrtc"`, siehe Fingerprinting) und Server, zu denen die Seite mit `<link rel="preconnect">` oder im `Link`-Header vorab eine Verbindung aufbaut: Beim TLS-Handshake erfahren sie die IP-Adresse, auch wenn keine Anfrage folgt. Der Bericht nennt sie mit „nur preconnect“, `--json` mit `preconnect: true` und `requests: 0`. `dns-prefetch` zählt nicht, denn dabei fragt der Browser nur den DNS-Resolver.

Subdomains zählen zur eigenen Seite (`cdn.firma.de` gehört zu `www.firma.de`), dabei gilt die Public Suffix List (`firma.co.uk`).

## Datenschutzerklärung

Die Seite, die spurlos als Datenschutzerklärung erkennt (siehe oben), öffnet es ohnehin, um zu sehen, ob sie erreichbar ist; dabei liest es ihren sichtbaren Text, ohne Skripte. Darin sucht es nach den Namen der bekannten Dienste, deren Server die Seite vor dem ersten Klick anfragt: als ganze Wörter, ohne Unterschied zwischen Groß und Klein, mit Bindestrich wie mit Leerzeichen („Google-Fonts“), auch ohne den Teil in Klammern („Microsoft Advertising“) und unter den anderen Namen aus `aliases` in `src/services.json` („Facebook“ für Meta Pixel). Jeder Dienst, den der Text nicht nennt, ist gelb. Nicht gesucht werden Server, die zur Seite zu gehören scheinen, Dienste, die zum Betrieb gehören (Kategorie `necessary`), und Hosts, die spurlos keinem Dienst zuordnen kann.

Hat der Text weniger als 200 Zeichen, ist er ein PDF, fehlt der Link oder antwortet die Seite mit einem Fehler, bleibt die Prüfung offen und grün („nicht gelesen“). Das gilt auch für Seiten, die ihren Text erst per JavaScript laden. Den Text selbst behält spurlos nicht, in `--json` stehen unter `scan.policy` nur die Adresse und die Namen der Dienste, die er nennt. Ob die Erklärung die Dienste richtig beschreibt, sagt die Prüfung nicht, und ein Dienst kann dort auch unter einem Namen stehen, den spurlos nicht kennt, etwa dem seines Anbieters.

## Weitergegebene Daten

Beim ersten Aufruf kennt eine Seite vom Besucher nur, was in ihrer Adresse steht. spurlos sucht deshalb in Adresse und Inhalt (POST) jeder Anfrage an einen fremden Server, auch URL-kodiert, nach E-Mail-Adressen und nach den Werten der Query der geprüften Adresse. Eine E-Mail-Adresse ist rot, ein Wert aus der Query gelb. Nicht zählen Kampagnen-Parameter und Klick-IDs (`utm_…`, `gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `msclkid`, `ttclid`, `twclid`, `li_fat_id`, `mc_cid`, `mc_eid`, `_ga`, `_gl`, `ref`) und Werte unter sechs Zeichen. Was nach einer E-Mail-Adresse aussieht, aber direkt auf `//` folgt, etwa der DSN von Sentry (`https://schlüssel@o1.ingest.sentry.io`), ist keine. Prüfen lohnt sich vor allem mit Adressen, die Daten tragen, etwa einer Danke-Seite nach der Anmeldung: `spurlos "https://firma.de/danke?email=test@firma.de"`. 

Außerdem vergleicht spurlos die Werte der Cookies fremder Server mit den Adressen aller Anfragen. Steht der Wert des Cookies eines fremden Servers in der Adresse einer Anfrage an einen dritten, ist das rot: So tauschen Werbe-Server ihre IDs für denselben Besucher aus und führen ihre Profile zusammen (Cookie-Sync). Es zählen nur Werte mit mindestens zehn Zeichen und einer Ziffer darin. Ein Cookie, das zu seinem eigenen Server zurückgeht, zählt nicht, die Cookies der geprüften Seite auch nicht, denn dass etwa Analytics seine ID bekommt, ist dessen Arbeitsweise. Die Werte selbst landen nicht in `--json`.

In `--json` steht an der Anfrage unter `carries`, was sie trägt (`email`, `query:<name>`, `id:<cookie>@<domain>`), beim Befund unter `what` (`email`, `query`, `id`), bei einer ID unter `param` der Name des Cookies und unter `from` seine Domain.

## Fingerprinting

spurlos achtet beim Aufruf auf vier Arten, den Browser zu vermessen, in der Seite und in jedem Frame:

- **Canvas:** Ein Skript liest ein Canvas zurück (`toDataURL`, `toBlob`, `convertToBlob` oder `getImageData` über mindestens 16 × 16 Pixel), das mindestens 16 × 16 Pixel groß ist und auf das es zuvor in einem Aufruf Text mit mindestens zehn verschiedenen Zeichen geschrieben hat. Die Regel stammt aus der Studie von Englehardt und Narayanan (2016). Emoji-Tests wie der von WordPress schreiben weniger Zeichen und zählen deshalb nicht.
- **WebGL:** Ein Skript fragt Hersteller oder Modell der Grafikkarte ab (`UNMASKED_VENDOR_WEBGL`, `UNMASKED_RENDERER_WEBGL`).
- **Audio:** Ein Skript rechnet Audio in einem `OfflineAudioContext`; Abspielen ohne Klick lassen Browser ohnehin nicht zu.
- **WebRTC:** Ein Skript baut eine `RTCPeerConnection` auf und sammelt ihre Kandidaten (`setLocalDescription`). Dabei fragt der Browser die STUN- und TURN-Server der Verbindung nach der eigenen IP-Adresse; die Server zählen zusätzlich als fremde Server.

Welches Skript es war, liest spurlos aus dem Stacktrace; bei Code direkt im HTML ist es die Adresse der Seite oder des Frames. Ist das Skript auf einer fremden Domain, ist der Befund rot. Gelb ist er bei einem eigenen Skript, einem Captcha (Kategorie `captcha`) und einem Server, der zur Seite zu gehören scheint (siehe unten), denn Bot- und Betrugserkennung lesen dieselben Werte. Schriften, die ein Skript über die Breite von Text abtastet, und andere Merkmale wie Bildschirmgröße oder Zeitzone erkennt spurlos nicht, denn die liest fast jede Seite für ihr Layout.

## Browser-Zugriffe

spurlos merkt sich, wenn ein Skript beim Laden fragt, ob es Benachrichtigungen schicken darf (`Notification.requestPermission`), Push-Nachrichten abonniert (`PushManager.subscribe`), nach dem Standort fragt (`getCurrentPosition`, `watchPosition`), nach Kamera oder Mikrofon (`getUserMedia`) oder einen Service Worker registriert. Benachrichtigungen und Push sind gelb, wer auch fragt. Standort, Kamera und Mikrofon sind rot, wenn ein Skript einer fremden Domain fragt, sonst gelb; wem das Skript gehört, entscheidet spurlos wie beim Fingerprinting. Ein Service Worker ist grün, denn so funktionieren Push und Offline-Betrieb; der Bericht nennt ihn trotzdem, weil er auch nach dem Besuch im Browser bleibt.

## Suchmaschinen

Steht `noindex` oder `none` im Header `X-Robots-Tag` (auch für einen einzelnen Crawler, `googlebot: noindex`) oder in `<meta name="robots">` oder `<meta name="googlebot">`, ist das gelb: Suchmaschinen nehmen die Seite dann nicht auf. Auf einer Staging-Seite ist das gewollt, auf einer öffentlichen oft ein Überbleibsel aus der Zeit vor dem Livegang. Die `robots.txt` liest spurlos nicht, denn danach fragt kein Besucher.

## Mobil

Ohne `<meta name="viewport">` mit `width=device-width` legen Smartphones eine Seite 980 Pixel breit an und verkleinern sie; das ist gelb. Gelb ist auch eine Seite, die breiter ist als das Fenster (`scrollWidth` größer als `innerWidth`), sodass Besucher quer scrollen müssen. Gemessen wird im Fenster, in dem spurlos die Seite öffnet: ohne Option 1280 Pixel breit, mit `--mobile` 412 Pixel wie ein Pixel 7. Für Smartphones sagt das Querscrollen also nur etwas mit `--mobile`. Ob Schrift und Schaltflächen groß genug sind, prüft spurlos nicht; gesperrtes Zoomen gehört zur Barrierefreiheit.

## Barrierefreiheit

spurlos prüft nur ein paar Grundlagen, die sich ohne Klick feststellen lassen, jede fehlende ist gelb:

- `<html>` hat ein `lang`-Attribut.
- Bilder haben ein `alt`-Attribut (auch `alt=""` für Bilder, die nur schmücken). Bilder mit `role="presentation"` oder `role="none"`, mit `aria-label`, `aria-labelledby` oder `title`, unsichtbare und solche in `aria-hidden="true"` zählen nicht.
- Formularfelder (`input`, `select`, `textarea`, ohne Buttons und versteckte Felder) haben eine Beschriftung: ein `<label>`, `aria-label`, `aria-labelledby` oder `title`. Ein `placeholder` zählt nicht. Unsichtbare Felder, etwa Honigtöpfe gegen Spam, zählen auch hier nicht.
- Der Viewport lässt Zoomen zu: kein `user-scalable=no` (oder `0`) und kein `maximum-scale` unter 2.

Einen Link auf eine Erklärung zur Barrierefreiheit erkennt spurlos an „barrierefrei“, „Zugänglichkeit“ oder „Accessibility“ in Text oder Adresse und nennt ihn; fehlt er, steht das nur als Hinweis da, ohne Ampel. Ob die Seite barrierefrei ist, sagt die Prüfung nicht, auch nicht, ob sie eine solche Erklärung braucht.

## Datenmenge

Über den Prüfungen steht, wie viele Anfragen die Seite beim ersten Aufruf stellt, wie viele Daten dabei übertragen werden (Header und Inhalt, so komprimiert, wie sie über die Leitung gehen) und wie viel davon an andere Domains geht. Eine Ampel gibt es dafür nicht. In `--json` steht die Größe je Anfrage unter `bytes`.

Darunter steht, wie lange das gedauert hat: wann der erste Inhalt zu sehen war (First Contentful Paint) und wann alles geladen war, also die letzte Anfrage vor der ersten Bewegung der Maus fertig war. Unter einer Sekunde in Millisekunden. Auch dafür gibt es keine Ampel, denn die Zeiten hängen von deinem Rechner und deinem Netz ab und schwanken von Lauf zu Lauf. In `--json` stehen sie in Millisekunden unter `timing` (`firstPaint`, `load` für das Ende des `load`-Events, `idle`).

## Eigene Server auf anderen Domains

Viele Seiten laden Bilder und Skripte von einer eigenen zweiten Domain, Wikipedia etwa von `wikimedia.org`. Solche Server sind gelb statt rot, wenn spurlos sie der Seite zuordnen kann, und der Bericht sagt, warum:

- **laut --own:** Du nennst sie selbst, `--own cdn-firma.net`. Das ist eindeutig und der richtige Weg für die eigene Seite.
- **laut Zertifikat:** Das TLS-Zertifikat der Seite nennt auch diese Domain, wie das von `wikipedia.org` die Domain `wikimedia.org`. spurlos liest es aus der Verbindung, die Chromium ohnehin hat, und glaubt ihm nur, wenn sein Inhaber (CN) die Seite selbst ist, denn Sammelzertifikate von Hostern nennen fremde Kunden.
- **dem Namen nach:** Die Domain trägt den Namen der Seite als ganzes Wort, `media.kuketz.de` bei `kuketz-blog.de`, `img.chefkoch-cdn.de` bei `chefkoch.de` oder `bildstatic.de` bei `bild.de`. Teile eines Worts zählen nicht (`ottonova.de` gehört nicht zu `otto.de`), kurze Namen und Allerweltswörter wie `shop` oder `blog` auch nicht. Das ist eine Vermutung, prüfe sie.

Ein bekannter Dienst aus `src/services.json` gehört nie zur Seite, auch nicht mit `--own`, außer die Seite ist dieser Dienst selbst: Auf `doctolib.de` können die Server von Doctolib wie `media.doctolib.com` aus den Gründen oben zur Seite gehören, die anderer Dienste nicht. Das gilt ebenso für Cookies dieser Domains. Gelb bleibt es, weil die IP-Adresse trotzdem an einen anderen Host geht; betreibt ihn ein Dienstleister, erfährt auch der sie.

Eine weitere Ausnahme ist die Plattform, auf der die Seite selbst läuft. spurlos erkennt sie an einem Header der Seite: Wix an `x-wix-request-id`, Shopify an `powered-by: Shopify`, Squarespace an `server: Squarespace`, Webflow an `x-wf-region`, IONOS MyWebsite am Cookie `DIY_SB`, das es in `set-cookie` setzt. Ihre Server sind dann gelb („gehört zum Hoster der Seite“), ihre Cookies auch, denn sie liefern die Seite ohnehin aus und kennen die IP-Adresse schon. Apps, Tracker und andere Dienste auf der Seite bleiben rot. In `--json` steht die Plattform bei `third-party` unter `platform`.
