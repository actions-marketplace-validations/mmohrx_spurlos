# The lights in detail

[Deutsch](../de/checks.md) · **English**

The table of lights is in the [README](../../README.en.md#lights). This is how spurlos decides in detail.

The headers checked are `Content-Security-Policy`, `X-Frame-Options` (or `frame-ancestors` in the CSP), `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy`. CSP and Referrer-Policy also count as a `<meta>` tag, for hosts like GitHub Pages where headers cannot be set. A CSP lets scripts through if, for scripts (`script-src`, else `default-src`), it allows `'unsafe-inline'` without a nonce or hash, `'unsafe-eval'` or a source like `*`, `https:`, `http:` or `data:` (the latter not with `'strict-dynamic'`), or if it does not restrict scripts at all. With both a header and a `<meta>` tag, it is enough for one of the two policies to be tight. spurlos recognizes the legal notice and privacy policy by link text or address, in German and English. A link like “Impressum & Datenschutz” counts for both. If several match, a link on the site itself wins, then one whose text starts with the word (“Datenschutz”, “Privacy Policy”), then one that names it later in its text, last one where only the address matches.

For embedded files, what counts is what the HTML says: `<script src>`, stylesheets, `<iframe>`, `<img>`, `<video>`, `<audio>` and `<source>`. Over http on an https page the browser blocks scripts, stylesheets and frames; images and media it loads over https or not at all. Without `integrity`, a third-party server can swap a script at any time. Scripts that do not run do not count, such as those with `type="text/plain"`, as cookie banners hold them back until consent. The report shows addresses without their query (`…/api/js?…`), as that often holds API keys; `--json` has them in full.

Every finding in the report has its own light, and the check gets the worst of them. That way you see which entry makes a check yellow or red.

Known session and security cookies include `XSRF-TOKEN` and `<app>-session` from Laravel, `PHPSESSID`, `JSESSIONID`, `csrftoken` from Django and `__cf_bm` from Cloudflare. In browser storage, spurlos knows entries that frameworks create themselves, such as Vue Router's scroll positions (`vue-router:scroll`). The list is in `src/services.json` (category `necessary`).

spurlos recognizes cookie banners by their servers, by their files on the site itself (so also Borlabs Cookie, Complianz or Real Cookie Banner on WordPress), by their cookies and by their browser storage entries (category `consent`). The check “Third-party servers” names which one loads, and says when known trackers load before any choice in the banner anyway. Whether a banner is needed or set up correctly, spurlos does not judge.

spurlos recognizes other services by their paths too, such as Matomo (`/matomo.php`) or Sentry (`/envelope/`). Running on the site itself or a subdomain, they change no light, as the IP address stays with the site; the check “Third-party servers” still names them (“Found on the site’s own servers”), in `--json` under `selfHosted`. A third-party host whose name gives nothing away gets named this way too. Services that only load after consent stay unseen: spurlos only checks what happens without a click.

Subdomains count as the site itself (`cdn.company.com` belongs to `www.company.com`), following the Public Suffix List (`company.co.uk`).

## Fingerprinting

While loading, spurlos watches for three ways of measuring the browser, in the page and in every frame:

- **Canvas:** a script reads back a canvas (`toDataURL`, `toBlob`, `convertToBlob` or `getImageData` over at least 16 × 16 pixels) that is at least 16 × 16 pixels in size and on which it first wrote, in one call, text with at least ten different characters. The rule comes from the study by Englehardt and Narayanan (2016). Emoji tests such as WordPress's write fewer characters and so do not count.
- **WebGL:** a script asks for the vendor or model of the graphics card (`UNMASKED_VENDOR_WEBGL`, `UNMASKED_RENDERER_WEBGL`).
- **Audio:** a script renders audio in an `OfflineAudioContext`; browsers do not play sound without a click anyway.

Which script it was, spurlos reads from the stack trace; for code right in the HTML it is the address of the page or frame. A script on another domain makes the finding red. It is yellow for a script of the site itself, a captcha (category `captcha`) and a server that seems to belong to the site (see below), as bot and fraud detection read the same values. Fonts a script probes by measuring text, and other traits such as screen size or time zone, spurlos does not detect, as nearly every page reads those for its layout.

## Own servers on other domains

Many sites load images and scripts from a second domain of their own, Wikipedia for example from `wikimedia.org`. Such servers are yellow instead of red when spurlos can tie them to the site, and the report says why:

- **per --own:** you name them yourself, `--own cdn-company.net`. That is unambiguous and the right way for your own site.
- **per its certificate:** the site's TLS certificate names that domain too, as the one of `wikipedia.org` names `wikimedia.org`. spurlos reads it from the connection Chromium has anyway, and trusts it only if its holder (CN) is the site itself, since hosters' shared certificates name other customers.
- **by its name:** the domain carries the site's name as a whole word, `media.kuketz.de` on `kuketz-blog.de`, `img.chefkoch-cdn.de` on `chefkoch.de` or `bildstatic.de` on `bild.de`. Parts of a word do not count (`ottonova.de` does not belong to `otto.de`), nor do short names and common words such as `shop` or `blog`. This is a guess; check it.

A known service from `src/services.json` never belongs to the site, not even with `--own`, unless the site is that service itself: on `doctolib.de`, Doctolib’s servers such as `media.doctolib.com` can belong to the site for the reasons above, those of other services cannot. The same goes for cookies of these domains. It stays yellow because the IP address still goes to another host; if a provider runs it, the provider learns it too.

Another exception is the platform the site itself runs on. spurlos knows it by a header of the page: Wix by `x-wix-request-id`, Shopify by `powered-by: Shopify`, Squarespace by `server: Squarespace`, Webflow by `x-wf-region`, IONOS MyWebsite by the cookie `DIY_SB` it sets in `set-cookie`. Its servers are then yellow (“belongs to the site’s host”), its cookies too, since they serve the site anyway and know the IP address already. Apps, trackers and other services on the site stay red. In `--json` the platform is under `platform` in `third-party`.
