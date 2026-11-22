# Ampel im Detail

**Deutsch** · [English](../en/checks.md)

Die Ampel-Tabelle steht im [README](../../README.md#ampel). Hier steht, wie spurlos im Einzelnen entscheidet.

Geprüft werden bei den Headern `Content-Security-Policy`, `X-Frame-Options` (oder `frame-ancestors` in der CSP), `X-Content-Type-Options: nosniff`, `Referrer-Policy` und `Permissions-Policy`. CSP und Referrer-Policy zählen auch als `<meta>`-Tag, für Hoster wie GitHub Pages, bei denen sich keine Header setzen lassen. Eine CSP lässt Skripte durch, wenn sie für Skripte (`script-src`, sonst `default-src`) `'unsafe-inline'` ohne Nonce oder Hash, `'unsafe-eval'` oder eine Quelle wie `*`, `https:`, `http:` oder `data:` erlaubt (Letztere nicht mit `'strict-dynamic'`), oder wenn sie Skripte gar nicht regelt. Gibt es Header und `<meta>`-Tag, reicht es, wenn eine der beiden Richtlinien dicht ist. Impressum und Datenschutzerklärung erkennt spurlos am Linktext oder an der Adresse, auf Deutsch und Englisch. Ein Link wie „Impressum & Datenschutz“ zählt für beides. Passen mehrere, gewinnt ein Link auf der eigenen Seite, dann einer, dessen Text mit dem Stichwort beginnt („Datenschutz“, „Privacy Policy“), dann einer, der es später im Text nennt, zuletzt einer, bei dem nur die Adresse passt.

Bei den eingebundenen Dateien zählt, was im HTML steht: `<script src>`, Stylesheets, `<iframe>`, `<img>`, `<video>`, `<audio>` und `<source>`. Über http auf einer https-Seite blockiert der Browser Skripte, Stylesheets und Frames; Bilder und Medien lädt er über https oder gar nicht. Ohne `integrity` kann ein fremder Server ein Skript jederzeit austauschen. Skripte, die nicht laufen, zählen nicht, etwa solche mit `type="text/plain"`, wie Cookie-Banner sie bis zur Einwilligung zurückhalten. Im Bericht stehen die Adressen ohne Query (`…/api/js?…`), denn dort stehen oft API-Schlüssel; `--json` enthält sie vollständig.

Jeder einzelne Befund hat im Bericht seine eigene Ampel, die Prüfung bekommt die schlechteste davon. So sieht man, welcher Eintrag eine Prüfung gelb oder rot macht.

Bekannte Sitzungs- und Sicherheits-Cookies sind zum Beispiel `XSRF-TOKEN` und `<app>-session` von Laravel, `PHPSESSID`, `JSESSIONID`, `csrftoken` von Django und `__cf_bm` von Cloudflare. Im Browser-Speicher kennt spurlos Einträge, die Frameworks selbst anlegen, etwa die Scroll-Positionen von Vue Router (`vue-router:scroll`). Die Liste steht in `src/services.json` (Kategorie `necessary`).

Cookie-Banner erkennt spurlos an ihren Servern, an ihren Dateien auf der eigenen Seite (so auch Borlabs Cookie, Complianz oder Real Cookie Banner unter WordPress), an ihren Cookies und an ihren Einträgen im Browser-Speicher (Kategorie `consent`). Die Prüfung „Fremde Server“ nennt, welcher geladen wird, und sagt, wenn bekannte Tracker trotzdem schon vor jeder Wahl im Banner laden. Ob ein Banner nötig ist oder richtig eingestellt, beurteilt spurlos nicht.

Auch andere Dienste erkennt spurlos an ihren Pfaden, etwa Matomo (`/matomo.php`) oder Sentry (`/envelope/`). Laufen sie auf der eigenen Seite oder einer Subdomain, ändert das keine Ampel, denn die IP-Adresse bleibt bei der Seite; die Prüfung „Fremde Server“ nennt sie trotzdem („Auf eigenen Servern erkannt“), in `--json` unter `selfHosted`. Einen fremden Host, dessen Name nichts verrät, benennt spurlos so ebenfalls. Dienste, die erst nach einer Zustimmung laden, sieht spurlos nicht: Es prüft nur, was ohne Klick passiert.

Als Anfrage zählt auch eine WebSocket-Verbindung (`ws://`, `wss://`), etwa eines Chats: Ihr Server erfährt die IP-Adresse genauso. In `--json` steht sie unter den Anfragen mit `type: "websocket"`. Ebenso zählen die STUN- und TURN-Server einer WebRTC-Verbindung (`type: "webrtc"`, siehe Fingerprinting) und Server, zu denen die Seite mit `<link rel="preconnect">` oder im `Link`-Header vorab eine Verbindung aufbaut: Beim TLS-Handshake erfahren sie die IP-Adresse, auch wenn keine Anfrage folgt. Der Bericht nennt sie mit „nur preconnect“, `--json` mit `preconnect: true` und `requests: 0`. `dns-prefetch` zählt nicht, denn dabei fragt der Browser nur den DNS-Resolver.

Subdomains zählen zur eigenen Seite (`cdn.firma.de` gehört zu `www.firma.de`), dabei gilt die Public Suffix List (`firma.co.uk`).

## Fingerprinting

spurlos achtet beim Aufruf auf vier Arten, den Browser zu vermessen, in der Seite und in jedem Frame:

- **Canvas:** Ein Skript liest ein Canvas zurück (`toDataURL`, `toBlob`, `convertToBlob` oder `getImageData` über mindestens 16 × 16 Pixel), das mindestens 16 × 16 Pixel groß ist und auf das es zuvor in einem Aufruf Text mit mindestens zehn verschiedenen Zeichen geschrieben hat. Die Regel stammt aus der Studie von Englehardt und Narayanan (2016). Emoji-Tests wie der von WordPress schreiben weniger Zeichen und zählen deshalb nicht.
- **WebGL:** Ein Skript fragt Hersteller oder Modell der Grafikkarte ab (`UNMASKED_VENDOR_WEBGL`, `UNMASKED_RENDERER_WEBGL`).
- **Audio:** Ein Skript rechnet Audio in einem `OfflineAudioContext`; Abspielen ohne Klick lassen Browser ohnehin nicht zu.
- **WebRTC:** Ein Skript baut eine `RTCPeerConnection` auf und sammelt ihre Kandidaten (`setLocalDescription`). Dabei fragt der Browser die STUN- und TURN-Server der Verbindung nach der eigenen IP-Adresse; die Server zählen zusätzlich als fremde Server.

Welches Skript es war, liest spurlos aus dem Stacktrace; bei Code direkt im HTML ist es die Adresse der Seite oder des Frames. Ist das Skript auf einer fremden Domain, ist der Befund rot. Gelb ist er bei einem eigenen Skript, einem Captcha (Kategorie `captcha`) und einem Server, der zur Seite zu gehören scheint (siehe unten), denn Bot- und Betrugserkennung lesen dieselben Werte. Schriften, die ein Skript über die Breite von Text abtastet, und andere Merkmale wie Bildschirmgröße oder Zeitzone erkennt spurlos nicht, denn die liest fast jede Seite für ihr Layout.

## Browser-Zugriffe

spurlos merkt sich, wenn ein Skript beim Laden fragt, ob es Benachrichtigungen schicken darf (`Notification.requestPermission`), Push-Nachrichten abonniert (`PushManager.subscribe`), nach dem Standort fragt (`getCurrentPosition`, `watchPosition`), nach Kamera oder Mikrofon (`getUserMedia`) oder einen Service Worker registriert. Benachrichtigungen und Push sind gelb, wer auch fragt. Standort, Kamera und Mikrofon sind rot, wenn ein Skript einer fremden Domain fragt, sonst gelb; wem das Skript gehört, entscheidet spurlos wie beim Fingerprinting. Ein Service Worker ist grün, denn so funktionieren Push und Offline-Betrieb; der Bericht nennt ihn trotzdem, weil er auch nach dem Besuch im Browser bleibt.

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

## Eigene Server auf anderen Domains

Viele Seiten laden Bilder und Skripte von einer eigenen zweiten Domain, Wikipedia etwa von `wikimedia.org`. Solche Server sind gelb statt rot, wenn spurlos sie der Seite zuordnen kann, und der Bericht sagt, warum:

- **laut --own:** Du nennst sie selbst, `--own cdn-firma.net`. Das ist eindeutig und der richtige Weg für die eigene Seite.
- **laut Zertifikat:** Das TLS-Zertifikat der Seite nennt auch diese Domain, wie das von `wikipedia.org` die Domain `wikimedia.org`. spurlos liest es aus der Verbindung, die Chromium ohnehin hat, und glaubt ihm nur, wenn sein Inhaber (CN) die Seite selbst ist, denn Sammelzertifikate von Hostern nennen fremde Kunden.
- **dem Namen nach:** Die Domain trägt den Namen der Seite als ganzes Wort, `media.kuketz.de` bei `kuketz-blog.de`, `img.chefkoch-cdn.de` bei `chefkoch.de` oder `bildstatic.de` bei `bild.de`. Teile eines Worts zählen nicht (`ottonova.de` gehört nicht zu `otto.de`), kurze Namen und Allerweltswörter wie `shop` oder `blog` auch nicht. Das ist eine Vermutung, prüfe sie.

Ein bekannter Dienst aus `src/services.json` gehört nie zur Seite, auch nicht mit `--own`, außer die Seite ist dieser Dienst selbst: Auf `doctolib.de` können die Server von Doctolib wie `media.doctolib.com` aus den Gründen oben zur Seite gehören, die anderer Dienste nicht. Das gilt ebenso für Cookies dieser Domains. Gelb bleibt es, weil die IP-Adresse trotzdem an einen anderen Host geht; betreibt ihn ein Dienstleister, erfährt auch der sie.

Eine weitere Ausnahme ist die Plattform, auf der die Seite selbst läuft. spurlos erkennt sie an einem Header der Seite: Wix an `x-wix-request-id`, Shopify an `powered-by: Shopify`, Squarespace an `server: Squarespace`, Webflow an `x-wf-region`, IONOS MyWebsite am Cookie `DIY_SB`, das es in `set-cookie` setzt. Ihre Server sind dann gelb („gehört zum Hoster der Seite“), ihre Cookies auch, denn sie liefern die Seite ohnehin aus und kennen die IP-Adresse schon. Apps, Tracker und andere Dienste auf der Seite bleiben rot. In `--json` steht die Plattform bei `third-party` unter `platform`.
