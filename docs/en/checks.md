# The lights in detail

[Deutsch](../de/checks.md) · **English**

The table of lights is in the [README](../../README.en.md#lights). This is how spurlos decides in detail.

The headers checked are `Content-Security-Policy`, `X-Frame-Options` (or `frame-ancestors` in the CSP), `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy`. CSP and Referrer-Policy also count as a `<meta>` tag, for hosts like GitHub Pages where headers cannot be set. A CSP lets scripts through if, for scripts (`script-src`, else `default-src`), it allows `'unsafe-inline'` without a nonce or hash, `'unsafe-eval'` or a source like `*`, `https:`, `http:` or `data:` (the latter not with `'strict-dynamic'`), or if it does not restrict scripts at all. With both a header and a `<meta>` tag, it is enough for one of the two policies to be tight. spurlos recognizes the legal notice and privacy policy by link text or address, in German and English. A link like “Impressum & Datenschutz” counts for both. If several match, a link on the site itself wins, then one whose text starts with the word (“Datenschutz”, “Privacy Policy”), then one that names it later in its text, last one where only the address matches.

For embedded files, what counts is what the HTML says: `<script src>`, stylesheets, `<iframe>`, `<img>`, `<video>`, `<audio>` and `<source>`. Over http on an https page the browser blocks scripts, stylesheets and frames; images and media it loads over https or not at all. Without `integrity`, a third-party server can swap a script at any time. Scripts that do not run do not count, such as those with `type="text/plain"`, as cookie banners hold them back until consent. The report shows addresses without their query (`…/api/js?…`), as that often holds API keys; `--json` has them in full.

Every finding in the report has its own light, and the check gets the worst of them. That way you see which entry makes a check yellow or red.

Known session and security cookies include `XSRF-TOKEN` and `<app>-session` from Laravel, `PHPSESSID`, `JSESSIONID`, `csrftoken` from Django and `__cf_bm` from Cloudflare. In browser storage, spurlos knows entries that frameworks create themselves, such as Vue Router's scroll positions (`vue-router:scroll`). The list is in `src/services.json` (category `necessary`).

A cookie that lasts longer than 13 months (395 days) is yellow at least, a known session cookie too; in `--json` it carries `long: true`. Chrome cuts every lifetime to at most 400 days, so a cookie set for two years shows 400 days in the report. `SameSite=None` on a first-party cookie the report names without changing the light: the browser then sends it in third-party contexts too, but services such as Cloudflare (`__cf_bm`) need that.

spurlos recognizes cookie banners by their servers, by their files on the site itself (so also Borlabs Cookie, Complianz or Real Cookie Banner on WordPress), by their cookies and by their browser storage entries (category `consent`). The check “Third-party servers” names which one loads, and says when known trackers load before any choice in the banner anyway. Whether a banner is needed or set up correctly, spurlos does not judge.

If the site uses Google Consent Mode, the requests of Google's tags carry the consent state in the parameter `gcs`: `G1` followed by one digit each for ads (`ad_storage`) and analytics (`analytics_storage`), `1` for granted, `0` for denied. Before any click it should say `G100`; the report names that as a note, as the tags still send requests, without cookies. If a request reports consent before that (`G101`, `G110`, `G111`), that is a red finding. spurlos reads `gcs` from every request, also to a tag server on the site's own domain (server-side tagging), and of several takes the one that grants most. In `--json` it is under `consentMode` of `third-party` (`gcs`, `ads`, `analytics`, each `granted` or `denied`).

spurlos recognizes other services by their paths too, such as Matomo (`/matomo.php`) or Sentry (`/envelope/`). Running on the site itself or a subdomain, they change no light, as the IP address stays with the site; the check “Third-party servers” still names them (“Found on the site’s own servers”), in `--json` under `selfHosted`. A third-party host whose name gives nothing away gets named this way too. Services that only load after consent stay unseen: spurlos only checks what happens without a click.

After loading, spurlos waits until the network is quiet (at most 10 seconds), then moves the mouse, scrolls 400 pixels and waits again until no request has come for a second (at most 5 seconds). It never clicks. Optimizers such as WP Rocket (“Delay JavaScript execution”), Perfmatters or Flying Scripts hold scripts back until the first move, scroll or key press, trackers too. What comes only then counts like everything else; the report marks it “only after the first move”, `--json` with `afterMove: true` on the request, on the cookie and on a third-party server all of whose requests came only then.

A WebSocket connection (`ws://`, `wss://`), such as a chat's, counts as a request too: its server learns the IP address all the same. In `--json` it is among the requests with `type: "websocket"`. So do the STUN and TURN servers of a WebRTC connection (`type: "webrtc"`, see fingerprinting) and servers the page opens a connection to in advance with `<link rel="preconnect">` or in the `Link` header: they learn the IP address in the TLS handshake, even if no request follows. The report marks them “only preconnect”, `--json` with `preconnect: true` and `requests: 0`. `dns-prefetch` does not count, as the browser only asks the DNS resolver then.

Subdomains count as the site itself (`cdn.company.com` belongs to `www.company.com`), following the Public Suffix List (`company.co.uk`).

## Privacy policy text

spurlos opens the page it recognizes as the privacy policy (see above) anyway, to see whether it is reachable; while at it, it reads its visible text, without scripts. In it, it looks for the names of the known services whose servers the site contacts before the first click: as whole words, in any case, with a hyphen as with a space (“Google-Fonts”), also without the part in brackets (“Microsoft Advertising”) and under the other names in `aliases` in `src/services.json` (“Facebook” for Meta Pixel). Every service the text does not name is yellow. Not looked for are servers that seem to belong to the site, services needed to run it (category `necessary`), and hosts spurlos cannot match to a service.

If the text has fewer than 200 characters, is a PDF, the link is missing or the page answers with an error, the check is left open and green (“not read”). The same goes for pages that only load their text by JavaScript. spurlos does not keep the text itself; in `--json`, `scan.policy` only holds the address and the names of the services it names. Whether the policy describes the services correctly, the check does not say, and a service may also appear there under a name spurlos does not know, its provider's, say.

## Data passed on

On a first visit, a site knows of the visitor only what is in its address. So spurlos searches the address and body (POST) of every request to a third-party server, URL-encoded too, for email addresses and for the values of the query of the address checked. An email address is red, a value from the query yellow. Campaign parameters and click IDs (`utm_…`, `gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `msclkid`, `ttclid`, `twclid`, `li_fat_id`, `mc_cid`, `mc_eid`, `_ga`, `_gl`, `ref`) and values under six characters do not count. What looks like an email address but follows right after `//`, such as Sentry's DSN (`https://key@o1.ingest.sentry.io`), is none. Checking is worth it above all with addresses that carry data, such as a thank-you page after signing up: `spurlos "https://company.com/thanks?email=test@company.com"`. 

spurlos also compares the values of third-party servers' cookies with the addresses of all requests. If the value of a third-party server's cookie is in the address of a request to yet another one, that is red: this is how ad servers swap their IDs for the same visitor and merge their profiles (cookie syncing). Only values of at least ten characters with a digit in them count. A cookie going back to its own server does not count, nor do the cookies of the site checked, as analytics getting its ID is how analytics works. The values themselves stay out of `--json`.

In `--json`, a request has what it carries under `carries` (`email`, `query:<name>`, `id:<cookie>@<domain>`), the finding under `what` (`email`, `query`, `id`), for an ID with the cookie's name under `param` and its domain under `from`.

## Fingerprinting

While loading, spurlos watches for four ways of measuring the browser, in the page and in every frame:

- **Canvas:** a script reads back a canvas (`toDataURL`, `toBlob`, `convertToBlob` or `getImageData` over at least 16 × 16 pixels) that is at least 16 × 16 pixels in size and on which it first wrote, in one call, text with at least ten different characters. The rule comes from the study by Englehardt and Narayanan (2016). Emoji tests such as WordPress's write fewer characters and so do not count.
- **WebGL:** a script asks for the vendor or model of the graphics card (`UNMASKED_VENDOR_WEBGL`, `UNMASKED_RENDERER_WEBGL`).
- **Audio:** a script renders audio in an `OfflineAudioContext`; browsers do not play sound without a click anyway.
- **WebRTC:** a script sets up an `RTCPeerConnection` and gathers its candidates (`setLocalDescription`). The browser then asks the connection's STUN and TURN servers for its own IP address; those servers count as third-party servers too.

Which script it was, spurlos reads from the stack trace; for code right in the HTML it is the address of the page or frame. A script on another domain makes the finding red. It is yellow for a script of the site itself, a captcha (category `captcha`) and a server that seems to belong to the site (see below), as bot and fraud detection read the same values. Fonts a script probes by measuring text, and other traits such as screen size or time zone, spurlos does not detect, as nearly every page reads those for its layout.

## Browser access

spurlos notes when a script, while the page loads, asks whether it may send notifications (`Notification.requestPermission`), subscribes to push messages (`PushManager.subscribe`), asks for the location (`getCurrentPosition`, `watchPosition`), for camera or microphone (`getUserMedia`), or registers a service worker. Notifications and push are yellow, whoever asks. Location, camera and microphone are red when a script of another domain asks, yellow otherwise; whose a script is, spurlos decides as for fingerprinting. A service worker is green, as that is how push and working offline are done; the report still names it, since it stays in the browser after the visit.

## Search engines

A `noindex` or `none` in the `X-Robots-Tag` header (also for a single crawler, `googlebot: noindex`) or in `<meta name="robots">` or `<meta name="googlebot">` is yellow: search engines then leave the page out. On a staging site that is intended, on a public one often a leftover from before it went live. spurlos does not read `robots.txt`, as no visitor asks for it.

## Mobile

Without `<meta name="viewport">` with `width=device-width`, phones lay a page out 980 pixels wide and shrink it; that is yellow. So is a page wider than its window (`scrollWidth` greater than `innerWidth`), which makes visitors scroll sideways. It is measured in the window spurlos opens the page in: 1280 pixels wide without options, 412 pixels with `--mobile`, like a Pixel 7. For phones, scrolling sideways is thus only told with `--mobile`. Whether text and buttons are large enough, spurlos does not check; locked zooming belongs to accessibility.

## Accessibility

spurlos checks only a few basics that can be told without a click; each one missing is yellow:

- `<html>` has a `lang` attribute.
- Images have an `alt` attribute (`alt=""` too, for images that only decorate). Images with `role="presentation"` or `role="none"`, with `aria-label`, `aria-labelledby` or `title`, invisible ones and those inside `aria-hidden="true"` do not count.
- Form fields (`input`, `select`, `textarea`, without buttons and hidden fields) have a label: a `<label>`, `aria-label`, `aria-labelledby` or `title`. A `placeholder` does not count. Invisible fields, such as honeypots against spam, do not count here either.
- The viewport allows zooming: no `user-scalable=no` (or `0`) and no `maximum-scale` under 2.

A link to an accessibility statement spurlos recognizes by “barrierefrei”, “Zugänglichkeit” or “accessibility” in its text or address, and names it; if there is none, that is only a note, without a light. The check does not say whether the site is accessible, nor whether it needs such a statement.

## Amount of data

Above the checks, the report says how many requests the page makes on first load, how much data that transfers (headers and body, compressed as they go over the wire) and how much of it goes to other domains. There is no light for it. In `--json`, each request has its size under `bytes`.

Below it, the report says how long that took: when the first content showed (First Contentful Paint) and when everything had loaded, that is, when the last request before the first mouse move was done. Under a second in milliseconds. There is no light for this either, as the times depend on your machine and network and vary from run to run. In `--json` they are in milliseconds under `timing` (`firstPaint`, `load` for the end of the `load` event, `idle`).

## Own servers on other domains

Many sites load images and scripts from a second domain of their own, Wikipedia for example from `wikimedia.org`. Such servers are yellow instead of red when spurlos can tie them to the site, and the report says why:

- **per --own:** you name them yourself, `--own cdn-company.net`. That is unambiguous and the right way for your own site.
- **per its certificate:** the site's TLS certificate names that domain too, as the one of `wikipedia.org` names `wikimedia.org`. spurlos reads it from the connection Chromium has anyway, and trusts it only if its holder (CN) is the site itself, since hosters' shared certificates name other customers.
- **by its name:** the domain carries the site's name as a whole word, `media.kuketz.de` on `kuketz-blog.de`, `img.chefkoch-cdn.de` on `chefkoch.de` or `bildstatic.de` on `bild.de`. Parts of a word do not count (`ottonova.de` does not belong to `otto.de`), nor do short names and common words such as `shop` or `blog`. This is a guess; check it.

A known service from `src/services.json` never belongs to the site, not even with `--own`, unless the site is that service itself: on `doctolib.de`, Doctolib’s servers such as `media.doctolib.com` can belong to the site for the reasons above, those of other services cannot. The same goes for cookies of these domains. It stays yellow because the IP address still goes to another host; if a provider runs it, the provider learns it too.

Another exception is the platform the site itself runs on. spurlos knows it by a header of the page: Wix by `x-wix-request-id`, Shopify by `powered-by: Shopify`, Squarespace by `server: Squarespace`, Webflow by `x-wf-region`, IONOS MyWebsite by the cookie `DIY_SB` it sets in `set-cookie`. Its servers are then yellow (“belongs to the site’s host”), its cookies too, since they serve the site anyway and know the IP address already. Apps, trackers and other services on the site stay red. In `--json` the platform is under `platform` in `third-party`.
