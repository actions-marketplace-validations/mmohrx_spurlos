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
- whether scripts measure the browser by **fingerprinting**: canvas, graphics card via WebGL, audio. That recognizes visitors without any cookie.
- whether scripts **ask for location, camera, microphone or notifications** right on load, or register a service worker.
- which **cookie banner** loads, such as Usercentrics, Cookiebot or Borlabs, and whether trackers load before it anyway.
- whether the **legal notice (Impressum) and privacy policy** are linked and open.
- whether **HTTPS** is set up properly: certificate, redirect from http, HSTS.
- which **security headers** are missing, and whether the Content-Security-Policy lets scripts through after all.
- whether **embedded files** come over unencrypted http, and whether third-party scripts and stylesheets are embedded without `integrity`.
- where **forms** send their data: encrypted to the site itself, to a third-party server, or unencrypted.
- whether headers or the page **reveal the software behind it, version included**, e.g. `X-Powered-By: PHP/8.1.2` or `WordPress 6.2`.
- a few **accessibility basics**: the page's language, images without `alt`, form fields without a label, zooming locked, a link to an accessibility statement.

```
npx spurlos example-company.com --lang en
```

On the left a page with problems, on the right a clean one:

![Colored output of spurlos for a page with problems and a clean page](examples/vorschau.png)

The full reports for both pages, as text in German and English and as JSON, are in [`examples/`](examples/), along with an HTML page each. Both pages come from the tests and run offline as `https://shop.example`; `pnpm examples` regenerates everything.

spurlos uses a real browser (Chromium via Playwright), so it also finds requests and cookies that only JavaScript creates. It opens the legal notice, the privacy policy and the http address separately; those visits do not count towards the page's requests and cookies. Whether http redirects to https is asked of the server directly rather than through the browser, since Chromium switches to https on its own.

Which user agent spurlos visits the site with and how it handles bot protection and logins is in [docs/en/how-it-works.md](docs/en/how-it-works.md).

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
| `--baseline <file>` | compare with an earlier output of `--json`, see [In CI](docs/en/ci.md) |
| `--auth <user:password>` | login by HTTP basic auth, e.g. for a staging site. Better through `SPURLOS_AUTH`, see [Sites behind a login](docs/en/how-it-works.md#sites-behind-a-login) |
| `--user-agent <string>` | your own user agent for every request |
| `--own <host>` | servers that belong to the site though on another domain, such as its CDN: `--own cdn-company.net`, subdomains included; repeated or comma-separated. See [Own servers on other domains](docs/en/checks.md#own-servers-on-other-domains) |
| `--help`, `-h` | help |

The summary comes first, then the checks, red ones first. Red and yellow checks list every finding, green ones take a single line. Where there is a common fix, the report names it right away, such as serving fonts yourself or an example value for a missing header. These are technical hints, not legal advice. In a terminal the report is colored; with `-o`, in a pipe or with `NO_COLOR` set, it stays plain text. `--html` and `--pdf` go to the output too (`--pdf > report.pdf`), but spurlos does not write a PDF into the terminal. With Docker a file of `-o` stays in the container; redirect instead: `docker run --rm ghcr.io/mmohrx/spurlos example.com --pdf > report.pdf`.

| Environment variable | |
|---|---|
| `SPURLOS_LANG` | language of the report when `--lang` is missing |
| `SPURLOS_AUTH` | login as `user:password` when `--auth` is missing, see [Sites behind a login](docs/en/how-it-works.md#sites-behind-a-login) |
| `SPURLOS_NO_SANDBOX` | `1` starts Chromium without a sandbox right away, and without a note about it; the Docker image sets it, there the container is the boundary |
| `NO_COLOR` | no colors, even in a terminal |

The page itself may take up to 30 seconds to load. After that spurlos waits up to 10 seconds for it to stop loading more; if it still does, the report says so. Impressum, privacy policy and the request over http get 15 seconds each.

spurlos itself does not phone home: no telemetry, no statistics. It requests only the page you check, plus whatever that page loads itself.

## Lights

| Check | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| Third-party servers | none | only cookie banners and captchas (categories `consent` and `captcha`): the site needs them, they still learn the IP address; and servers that seem to belong to the site (`--own`, certificate, name), and those of the platform it runs on (Wix, Shopify, Squarespace, Webflow, IONOS MyWebsite) | at least one request to another domain that belongs to no cookie banner, no captcha and not to the site |
| Cookies and storage | nothing set, or only known session and security cookies and those in which the cookie banner keeps the choice | first-party cookies or entries spurlos does not know or that belong to a service such as a chat or payment provider; a cookie without `Secure` on an https page; a session cookie without `HttpOnly` | a cookie of another domain that does not seem to belong to the site, or one of a known tracker |
| Fingerprinting | no script reads out canvas, graphics card or audio | a script of the site itself, a captcha or a server that seems to belong to the site reads them out | a script of another domain reads them out |
| Browser access | no script asks for permissions, or only a service worker | a script asks for notifications or push on load; a script of the site itself (or of a server that seems to belong to it) for location, camera or microphone | a script of another domain asks for location, camera or microphone |
| Legal notice and privacy policy | both linked and reachable | a page turns spurlos away (`401`, `403`, `429`) or does not answer before the timeout, often a bot check | a link is missing or the page answers with another error, such as `404`; a PDF counts as reachable |
| HTTPS | https, http redirects, HSTS, certificate valid for 14 days or more | no HSTS (or `max-age=0`), nothing or only an error answers on http (4xx, 5xx, often a bot check), certificate valid for less than 14 days | no https, http without redirect, certificate valid for less than 7 days or expired |
| Security headers | all set | one or more missing; the CSP lets scripts through | – |
| Embedded files | nothing to note | a script or stylesheet from a third-party server without `integrity`; an image, video or audio over http on an https page | a script, stylesheet or iframe over http on an https page |
| Forms | none, or all send encrypted to the site itself | one sends to a third-party server | one sends unencrypted over http |
| Software details | nothing, or only the software's name | a version number in `Server`, `X-Powered-By`, `X-AspNet-Version`, `X-AspNetMvc-Version`, `X-Generator` or `<meta name="generator">` | – |
| Accessibility | `lang` set, images with `alt`, form fields labelled, zooming allowed | one of these basics is missing | – |

The exact rules are in [docs/en/checks.md](docs/en/checks.md): which headers are checked, which cookies spurlos knows, when a server on another domain belongs to the site and how it tells the platform the site runs on.

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

## In CI

```
npx spurlos https://staging.company.com --lang en || echo "new traces"
```

Exit code `0` without a red finding, `1` with one, `2` if a page could not be checked or the call was wrong. All cases, the JSON of `--json`, comparing with a baseline and the GitHub Action are in [docs/en/ci.md](docs/en/ci.md).

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
