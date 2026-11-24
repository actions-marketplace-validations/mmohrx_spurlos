# How spurlos visits

[Deutsch](../de/how-it-works.md) · **English**

spurlos opens the page itself as a regular Chrome and adds its name to the user agent:

```
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Safari/537.36 spurlos/0.5.1
```

“HeadlessChrome” is left out on purpose, in the client hints (`sec-ch-ua`) too. Many cookie banners and trackers do not load at all for visits they take for bots. spurlos would then report a clean page while real visitors get tracked. It does not hide, though: its name is in every user agent, and `navigator.webdriver` stays `true`. To notice fingerprinting and requests for permissions, spurlos replaces a few functions of canvas, WebGL, audio, WebRTC, notifications, location, camera and service workers with its own, which call the original, and adds the function `__spurlos`; the page can see both.

With `--mobile`, spurlos opens the site as a phone, with the screen of a Pixel 7 (412 × 915 pixels), touch and the user agent of Chrome on Android, in the client hints with `mobile` and the platform `Android`:

```
Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Mobile Safari/537.36 spurlos/0.5.1
```

spurlos asks with the same user agent whether http redirects to https: some servers answer a bot there differently from a browser (DuckDuckGo serves a bot the page over http and redirects a browser). The legal notice and the privacy policy are requested openly as a bot, the HTML only, without scripts, images or fonts, since they are not about trackers hiding from bots:

```
spurlos/0.5.1 (+https://github.com/mmohrx/spurlos)
```

Some bot protection services refuse these requests. If http:// answers with an error, spurlos reports it yellow, since whether the server redirects is then left open. The same goes for the legal notice and privacy policy when they turn spurlos away or keep it waiting. spurlos does not try to get around the bot protection.

Because spurlos opens pages it does not know, Chromium runs in its own sandbox wherever the system allows one (macOS, Windows, Linux with user namespaces). Without one, spurlos says so on stderr. In the Docker image Chromium runs without its sandbox, as the container, running as user `node`, is the boundary; on Linux, that is the best way to check unknown sites. spurlos accepts no downloads from a page.

The HTML report holds every finding, with the green checks folded, and at the end a screenshot of the page as a visitor sees it first, cookie banner included. It loads nothing and contains no JavaScript, so it opens offline and can be sent by mail. Several addresses go into one page, one below the other. The PDF is the same report, printed by the Chromium spurlos uses anyway, on A4 and always light, each address starting on a new page. spurlos takes the screenshot only for HTML and PDF; it is not part of `--json`. While printing, JavaScript is off and every request is blocked.

## Global Privacy Control

With `--gpc`, spurlos sends the header `Sec-GPC: 1` with every request of the site, and `navigator.globalPrivacyControl` is `true`, as in Firefox, Brave or DuckDuckGo with [Global Privacy Control](https://globalprivacycontrol.org) switched on. With it, the visitor says their data is not to be sold or shared. Whether a site honours it, a comparison of two runs shows:

```
spurlos example.com --json -o without-gpc.json
spurlos example.com --gpc --baseline without-gpc.json
```

What goes away with GPC, the second report lists under “gone”. What servers otherwise make of the signal, spurlos does not check; the legal notice, the privacy policy and the request over http go without GPC.

## Sites behind a login

Internal sites and staging sites before launch often sit behind HTTP basic auth. Pass the credentials through the environment, so they stay out of the shell history and the process list:

```
SPURLOS_AUTH='team:secret' npx spurlos https://staging.company.com
```

`--auth team:secret` works too and takes precedence. With Docker, `-e SPURLOS_AUTH` passes the variable on without the password in the command: `docker run --rm -e SPURLOS_AUTH ghcr.io/mmohrx/spurlos https://staging.company.com`. The password goes only to exactly the address given (scheme, host, port). Third-party servers the page loads never get it, even when they ask for a login, and Impressum or privacy pages only when they live at the same address. If `company.com` redirects to `www.company.com`, give `www.company.com` right away. Several addresses go with a login only if they share that address (`https://staging.company.com/` and `https://staging.company.com/contact`); otherwise spurlos ends with exit code `2` before opening anything. The check whether http redirects to https runs without the login. If the address itself is `http://`, the password goes unencrypted; spurlos points that out on stderr.

If the page asks for a login and there is none or the wrong one, spurlos does not check the error page but ends with exit code `2` and says why.

The same goes for `403` or `429` on the page itself, mostly a bot check: what its error page loads says nothing about what visitors get. spurlos does not pose as a person and gets around no bot check; if it is your site, let spurlos through there. Some bot check services answer with `200` and a challenge page of their own; spurlos does not recognize those and checks them like the page.
