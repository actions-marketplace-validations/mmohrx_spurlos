<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo-light.svg" alt="spurlos" height="64">
  </picture>
</h1>

[Deutsch](README.md) · **English**

*spurlos* is German for “without a trace”. It opens a website the way a first-time visitor does, before clicking anything, and shows you:

- **which third-party servers** get requests, such as Google Fonts, Tag Manager, YouTube or a CDN. Each of them learns the visitor's IP address.
- **which cookies and browser storage entries** are set before any consent, and whether known trackers or third-party cookies are among them.
- which **cookie banner** loads, such as Usercentrics, Cookiebot or Borlabs, and whether trackers load before it anyway.
- whether the **legal notice (Impressum) and privacy policy** are linked and open.
- whether **HTTPS** is set up properly: certificate, redirect from http, HSTS.
- which **security headers** are missing, and whether the Content-Security-Policy lets scripts through after all.
- whether **embedded files** come over unencrypted http, and whether third-party scripts and stylesheets are embedded without `integrity`.
- where **forms** send their data: encrypted to the site itself, to a third-party server, or unencrypted.
- whether headers or the page **reveal the software behind it, version included**, e.g. `X-Powered-By: PHP/8.1.2` or `WordPress 6.2`.

```
npx spurlos example-company.com --lang en
```

On the left a page with problems, on the right a clean one:

![Colored output of spurlos for a page with problems and a clean page](examples/vorschau.png)

The full reports for both pages, as text in German and English and as JSON, are in [`examples/`](examples/), along with an HTML page each. Both pages come from the tests and run offline as `https://shop.example`; `pnpm examples` regenerates everything.

spurlos uses a real browser (Chromium via Playwright), so it also finds requests and cookies that only JavaScript creates. It opens the legal notice, the privacy policy and the http address separately; those visits do not count towards the page's requests and cookies. Whether http redirects to https is asked of the server directly rather than through the browser, since Chromium switches to https on its own.

## Installation

With Docker, no Node needed:

```
docker run --rm ghcr.io/mmohrx/spurlos example-company.com --lang en
```

Or with Node.js 22 or later. The first time, Playwright needs its browser:

```
npx playwright install chromium-headless-shell
npx spurlos <url> --lang en
```

| Option | |
|---|---|
| `<url> …` | one or more addresses; several are checked one after the other, with a report each |
| `--lang de\|en` | language of the report. Without it, `SPURLOS_LANG` applies, then the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`), else `de` |
| `--verbose`, `-v` | details for the green checks too |
| `--json` | the full result as JSON |
| `--html` | the report as a self-contained HTML page, e.g. to pass on |
| `--pdf` | the report as a PDF |
| `-o`, `--output <file>` | the report into a file instead of the output. Without `--json`, `--html` or `--pdf` the extension decides: `spurlos example.com -o report.pdf` (`.pdf`, `.html`, `.json`, else text). Given more than once, one run writes several formats: `-o report.json -o report.html`; then each file's extension decides, and `--json`, `--html` and `--pdf` do not go with it |
| `--baseline <file>` | compare with an earlier output of `--json`, see [In CI](#in-ci) |
| `--auth <user:password>` | login by HTTP basic auth, e.g. for a staging site. Better through `SPURLOS_AUTH`, see [Sites behind a login](#sites-behind-a-login) |
| `--user-agent <string>` | your own user agent for every request |
| `--own <host>` | servers that belong to the site though on another domain, such as its CDN: `--own cdn-company.net`, subdomains included; repeated or comma-separated. See [Own servers on other domains](#own-servers-on-other-domains) |
| `--help`, `-h` | help |

The summary comes first, then the checks, red ones first. Red and yellow checks list every finding, green ones take a single line. Where there is a common fix, the report names it right away, such as serving fonts yourself or an example value for a missing header. These are technical hints, not legal advice. In a terminal the report is colored; with `-o`, in a pipe or with `NO_COLOR` set, it stays plain text. `--html` and `--pdf` go to the output too (`--pdf > report.pdf`), but spurlos does not write a PDF into the terminal. With Docker a file of `-o` stays in the container; redirect instead: `docker run --rm ghcr.io/mmohrx/spurlos example.com --pdf > report.pdf`.

| Environment variable | |
|---|---|
| `SPURLOS_LANG` | language of the report when `--lang` is missing |
| `SPURLOS_AUTH` | login as `user:password` when `--auth` is missing, see [Sites behind a login](#sites-behind-a-login) |
| `SPURLOS_NO_SANDBOX` | `1` starts Chromium without a sandbox right away, and without a note about it; the Docker image sets it, there the container is the boundary |
| `NO_COLOR` | no colors, even in a terminal |

The page itself may take up to 30 seconds to load. After that spurlos waits up to 10 seconds for it to stop loading more; if it still does, the report says so. Impressum, privacy policy and the request over http get 15 seconds each.

spurlos itself does not phone home: no telemetry, no statistics. It requests only the page you check, plus whatever that page loads itself.

## Lights

| Check | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| Third-party servers | none | only cookie banners and captchas (categories `consent` and `captcha`): the site needs them, they still learn the IP address; and servers that seem to belong to the site (`--own`, certificate, name), and those of the platform it runs on (Wix, Shopify, Squarespace) | at least one request to another domain that belongs to no cookie banner, no captcha and not to the site |
| Cookies and storage | nothing set, or only known session and security cookies and those in which the cookie banner keeps the choice | first-party cookies or entries spurlos does not know or that belong to a service such as a chat or payment provider; a cookie without `Secure` on an https page; a session cookie without `HttpOnly` | a cookie of another domain that does not seem to belong to the site, or one of a known tracker |
| Legal notice and privacy policy | both linked and reachable | a page turns spurlos away (`401`, `403`, `429`) or does not answer before the timeout, often a bot check | a link is missing or the page answers with another error, such as `404`; a PDF counts as reachable |
| HTTPS | https, http redirects, HSTS, certificate valid for 14 days or more | no HSTS (or `max-age=0`), nothing or only an error answers on http (4xx, 5xx, often a bot check), certificate valid for less than 14 days | no https, http without redirect, certificate valid for less than 7 days or expired |
| Security headers | all set | one or more missing; the CSP lets scripts through | – |
| Embedded files | nothing to note | a script or stylesheet from a third-party server without `integrity`; an image, video or audio over http on an https page | a script, stylesheet or iframe over http on an https page |
| Forms | none, or all send encrypted to the site itself | one sends to a third-party server | one sends unencrypted over http |
| Software details | nothing, or only the software's name | a version number in `Server`, `X-Powered-By`, `X-AspNet-Version`, `X-AspNetMvc-Version`, `X-Generator` or `<meta name="generator">` | – |

The headers checked are `Content-Security-Policy`, `X-Frame-Options` (or `frame-ancestors` in the CSP), `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy`. CSP and Referrer-Policy also count as a `<meta>` tag, for hosts like GitHub Pages where headers cannot be set. A CSP lets scripts through if, for scripts (`script-src`, else `default-src`), it allows `'unsafe-inline'` without a nonce or hash, `'unsafe-eval'` or a source like `*`, `https:`, `http:` or `data:` (the latter not with `'strict-dynamic'`), or if it does not restrict scripts at all. With both a header and a `<meta>` tag, it is enough for one of the two policies to be tight. spurlos recognizes the legal notice and privacy policy by link text or address, in German and English. A link like “Impressum & Datenschutz” counts for both. If several match, a link on the site itself wins, then one whose text starts with the word (“Datenschutz”, “Privacy Policy”), then one that names it later in its text, last one where only the address matches.

For embedded files, what counts is what the HTML says: `<script src>`, stylesheets, `<iframe>`, `<img>`, `<video>`, `<audio>` and `<source>`. Over http on an https page the browser blocks scripts, stylesheets and frames; images and media it loads over https or not at all. Without `integrity`, a third-party server can swap a script at any time. Scripts that do not run do not count, such as those with `type="text/plain"`, as cookie banners hold them back until consent. The report shows addresses without their query (`…/api/js?…`), as that often holds API keys; `--json` has them in full.

Every finding in the report has its own light, and the check gets the worst of them. That way you see which entry makes a check yellow or red.

Known session and security cookies include `XSRF-TOKEN` and `<app>-session` from Laravel, `PHPSESSID`, `JSESSIONID`, `csrftoken` from Django and `__cf_bm` from Cloudflare. In browser storage, spurlos knows entries that frameworks create themselves, such as Vue Router's scroll positions (`vue-router:scroll`). The list is in `src/services.json` (category `necessary`).

spurlos recognizes cookie banners by their servers, by their files on the site itself (so also Borlabs Cookie, Complianz or Real Cookie Banner on WordPress), by their cookies and by their browser storage entries (category `consent`). The check “Third-party servers” names which one loads, and says when known trackers load before any choice in the banner anyway. Whether a banner is needed or set up correctly, spurlos does not judge.

spurlos recognizes other services by their paths too, such as Matomo (`/matomo.php`) or Sentry (`/envelope/`). Running on the site itself or a subdomain, they change no light, as the IP address stays with the site; the check “Third-party servers” still names them (“Found on the site’s own servers”), in `--json` under `selfHosted`. A third-party host whose name gives nothing away gets named this way too. Services that only load after consent stay unseen: spurlos only checks what happens without a click.

Subdomains count as the site itself (`cdn.company.com` belongs to `www.company.com`), following the Public Suffix List (`company.co.uk`).

### Own servers on other domains

Many sites load images and scripts from a second domain of their own, Wikipedia for example from `wikimedia.org`. Such servers are yellow instead of red when spurlos can tie them to the site, and the report says why:

- **per --own:** you name them yourself, `--own cdn-company.net`. That is unambiguous and the right way for your own site.
- **per its certificate:** the site's TLS certificate names that domain too, as the one of `wikipedia.org` names `wikimedia.org`. spurlos reads it from the connection Chromium has anyway, and trusts it only if its holder (CN) is the site itself, since hosters' shared certificates name other customers.
- **by its name:** the domain carries the site's name as a whole word, `media.kuketz.de` on `kuketz-blog.de`, `img.chefkoch-cdn.de` on `chefkoch.de` or `bildstatic.de` on `bild.de`. Parts of a word do not count (`ottonova.de` does not belong to `otto.de`), nor do short names and common words such as `shop` or `blog`. This is a guess; check it.

A known service from `src/services.json` never belongs to the site, not even with `--own`. The same goes for cookies of these domains. It stays yellow because the IP address still goes to another host; if a provider runs it, the provider learns it too.

The exception is the platform the site itself runs on. spurlos knows it by a header of the page: Wix by `x-wix-request-id`, Shopify by `powered-by: Shopify`, Squarespace by `server: Squarespace`. Its servers are then yellow (“belongs to the site’s host”), its cookies too, since they serve the site anyway and know the IP address already. Apps, trackers and other services on the site stay red. In `--json` the platform is under `platform` in `third-party`.

## How spurlos visits

spurlos opens the page itself as a regular Chrome and adds its name to the user agent:

```
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Safari/537.36 spurlos/0.3.0
```

“HeadlessChrome” is left out on purpose, in the client hints (`sec-ch-ua`) too. Many cookie banners and trackers do not load at all for visits they take for bots. spurlos would then report a clean page while real visitors get tracked. It does not hide, though: its name is in every user agent, and `navigator.webdriver` stays `true`.

spurlos asks with the same user agent whether http redirects to https: some servers answer a bot there differently from a browser (DuckDuckGo serves a bot the page over http and redirects a browser). The legal notice and the privacy policy are requested openly as a bot, since they are not about trackers hiding from bots:

```
spurlos/0.3.0 (+https://github.com/mmohrx/spurlos)
```

Some bot protection services refuse these requests. If http:// answers with an error, spurlos reports it yellow, since whether the server redirects is then left open. The same goes for the legal notice and privacy policy when they turn spurlos away or keep it waiting. spurlos does not try to get around the bot protection.

Because spurlos opens pages it does not know, Chromium runs in its own sandbox wherever the system allows one (macOS, Windows, Linux with user namespaces). Without one, spurlos says so on stderr. In the Docker image Chromium runs without its sandbox, as the container, running as user `node`, is the boundary; on Linux, that is the best way to check unknown sites. spurlos accepts no downloads from a page.

The HTML report holds every finding, with the green checks folded, and at the end a screenshot of the page as a visitor sees it first, cookie banner included. It loads nothing and contains no JavaScript, so it opens offline and can be sent by mail. Several addresses go into one page, one below the other. The PDF is the same report, printed by the Chromium spurlos uses anyway, on A4 and always light, each address starting on a new page. spurlos takes the screenshot only for HTML and PDF; it is not part of `--json`. While printing, JavaScript is off and every request is blocked.

## For AI assistants (MCP)

`spurlos mcp` starts an [MCP](https://modelcontextprotocol.io) server over stdio. An assistant like Claude can then check sites itself, e.g. when asked “Check example.com and explain what is red”. The server offers one tool, `scan`, with `url` and optionally `lang` (`de`, `en`), `format` (`text` or `json`) and `own` (a list of host names, as with `--own`). It runs on your machine, like the CLI: the assistant starts it itself and talks to it over stdin and stdout. There is no open port, so it needs no token either.

In Claude Code:

```
claude mcp add spurlos -- npx spurlos mcp
```

In other clients, e.g. Claude Desktop, under `mcpServers`:

```json
{ "spurlos": { "command": "npx", "args": ["spurlos", "mcp"] } }
```

With Docker instead of Node: `"command": "docker", "args": ["run", "-i", "--rm", "ghcr.io/mmohrx/spurlos", "mcp"]`.

As with the CLI, the language follows `--lang`, `SPURLOS_LANG` or the system, and `--user-agent` applies to every request. There is no `--auth` there, as the assistant picks the addresses. At most two checks run at a time, others wait. Every report carries the note that it is not legal advice.

## Sites behind a login

Internal sites and staging sites before launch often sit behind HTTP basic auth. Pass the credentials through the environment, so they stay out of the shell history and the process list:

```
SPURLOS_AUTH='team:secret' npx spurlos https://staging.company.com
```

`--auth team:secret` works too and takes precedence. With Docker, `-e SPURLOS_AUTH` passes the variable on without the password in the command: `docker run --rm -e SPURLOS_AUTH ghcr.io/mmohrx/spurlos https://staging.company.com`. The password goes only to exactly the address given (scheme, host, port). Third-party servers the page loads never get it, even when they ask for a login, and Impressum or privacy pages only when they live at the same address. If `company.com` redirects to `www.company.com`, give `www.company.com` right away. Several addresses go with a login only if they share that address (`https://staging.company.com/` and `https://staging.company.com/contact`); otherwise spurlos ends with exit code `2` before opening anything. The check whether http redirects to https runs without the login. If the address itself is `http://`, the password goes unencrypted; spurlos points that out on stderr.

If the page asks for a login and there is none or the wrong one, spurlos does not check the error page but ends with exit code `2` and says why.

The same goes for `403` or `429` on the page itself, mostly a bot check: what its error page loads says nothing about what visitors get. spurlos does not pose as a person and gets around no bot check; if it is your site, let spurlos through there. Some bot check services answer with `200` and a challenge page of their own; spurlos does not recognize those and checks them like the page.

## In CI

```
npx spurlos https://staging.company.com --lang en || echo "new traces"
```

Exit code `0` without a red finding, `1` with one, `2` if a page could not be checked or the call was wrong (unknown option, invalid URL, unknown language, more than one of `--json`, `--html`, `--pdf`, one of them with several `-o`, a baseline that cannot be read, a login for addresses on different servers, anything but a host name with `--own`) or a file of `-o` could not be written. A missing or rejected login ends with `2` too, and so does a page that turns the request away with `403` or `429`. With several addresses the worst case counts; spurlos still writes the reports of the pages it could check.

With `--json` you get the full result as JSON: `scan` holds the raw data (every request, cookies, storage, headers, certificate with the names in it, links, forms, embedded files, the hosts of `--own`), `results` one object per check with `check` (`third-party`, `cookies`, `legal`, `https`, `headers`, `resources`, `forms`, `disclosure`), `level` (`green`, `yellow`, `red`) and the findings, `note` the note that this is not legal advice. Servers and cookies that seem to belong to the site carry `own` with the reason (`option`, `certificate`, `name`, `platform`). Under `third-party`, `selfHosted` lists the known services running on the site itself. With several addresses it is a list of such objects. The red checks, for example:

```
npx spurlos https://staging.company.com --json | jq -r '.results[] | select(.level == "red") | .check'
```

### Only report new traces

A site is rarely all green. To have CI still speak up when something is added, such as a new tracker or a new cookie, `--baseline` compares with an earlier output of `--json`:

```
npx spurlos https://www.company.com --json -o spurlos-baseline.json   # once, then into the repository
npx spurlos https://www.company.com --baseline spurlos-baseline.json
```

The report then marks every finding that is new or worse than before with `[new]` and lists what has gone. Exit code `1` comes only with a new red finding. With `--json` the comparison is under `compare` (`baseline`, `new`, `gone`, each finding with `key` and `level`). spurlos finds the pages in the baseline by their address; checking a single page against a baseline of a single page, the two belong together. A page the baseline does not know has only new findings. The servers of a known service count as one finding, keyed by their entry in `src/services.json` (`third-party nmrodam.com`): some services pick a new subdomain on every visit, and that is nothing new.

### GitHub Action

```yaml
name: spurlos
on:
  schedule:
    - cron: "0 6 * * 1"   # every Monday
  workflow_dispatch:

jobs:
  spurlos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: mmohrx/spurlos@main   # better pinned to a release: @vX.Y.Z
        with:
          url: https://www.company.com
          baseline: spurlos-baseline.json
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: spurlos
          path: ${{ runner.temp }}/spurlos/
```

The action installs spurlos and Chromium from its own checkout, checks, and writes the report into the run's summary. It also puts `report.json`, `report.html` and `report.txt` into `$RUNNER_TEMP/spurlos/`; the paths are in the outputs `json` and `html` too, the exit code in `exit-code`. The step fails as the exit code says.

| Input | |
|---|---|
| `url` | the address, or several, separated by spaces or new lines |
| `baseline` | an earlier output of `--json` in the repository |
| `lang` | `de` or `en`; without it the same rules as on the command line apply |
| `auth` | `user:password` for HTTP basic auth, best from a secret: `${{ secrets.STAGING_AUTH }}` |
| `own` | own servers on other domains as with `--own`, separated by spaces or new lines |
| `user-agent` | your own user agent for every request |
| `args` | further options, such as `--verbose`, split at spaces; no `--json`, `--html` or `--pdf`, the files go by their extension |

## Adding known services

Which hosts and cookies belong to which service is in [`src/services.json`](src/services.json). Hosts include their subdomains, cookie names match as a prefix (`_ga` also covers `_ga_ABC123`), with a leading `*` as a suffix (`*-session`). `paths` holds parts of file paths by which spurlos recognizes a service on the site itself or on an unknown host too: ending in `/`, a directory anywhere in the path (`/wp-content/plugins/borlabs-cookie/`), otherwise the end of the path (`/klaro.js`). If a service is missing, a pull request is welcome.

## What spurlos does not do

- It does not actively look for holes. It only evaluates what a normal visit to the page returns anyway; it never requests addresses like `/.env`, `/.git/` or `/phpinfo.php`. So you can run it against any site without probing it.
- It does not click the cookie banner. What it checks is the state before the visitor decides anything; spurlos names which banner loads, but not whether it is set up correctly.
- It does not read the legal notice or privacy policy, it only checks that they are linked and reachable.
- It is not legal advice. A green report does not mean a site complies with the GDPR, and a red one does not mean it doesn't.

## Development

```
pnpm install
pnpm exec playwright install chromium-headless-shell
pnpm test        # unit and browser tests against test/sites, no network
pnpm typecheck
pnpm build       # to dist/
node src/cli.ts <url>
```

## Contributing

A service is missing, a light seems wrong, or you have an idea: [`CONTRIBUTING.md`](CONTRIBUTING.md) explains how to contribute (in German; issues and pull requests in English are welcome). Please report security holes not as an issue but as described in [`SECURITY.md`](SECURITY.md).

## Support

spurlos is a hobby project. If it helps you, you can support it on [Ko-fi](https://ko-fi.com/mmohrx) or through [GitHub Sponsors](https://github.com/sponsors/mmohrx). The help (`spurlos --help`) links there in its last line too; the reports do not, they are yours.

## License

MIT, © 2026 Martin Mohr
