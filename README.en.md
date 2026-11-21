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
- whether the **legal notice (Impressum) and privacy policy** are linked and open.
- whether **HTTPS** is set up properly: certificate, redirect from http, HSTS.
- which **security headers** are missing.
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
| `--lang de\|en` | language of the report. Without it, `SPURLOS_LANG` applies, then the system language (`LANG`), else `de` |
| `--verbose`, `-v` | details for the green checks too |
| `--json` | the full result as JSON |
| `--html` | the report as a self-contained HTML page, e.g. to pass on: `spurlos example.com --html > report.html` |
| `--user-agent <string>` | your own user agent for every request |

The summary comes first, then the checks, red ones first. Red and yellow checks list every finding, green ones take a single line. In a terminal the report is colored; redirected to a file or a pipe, or with `NO_COLOR` set, it stays plain text.

## Lights

| Check | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| Third-party servers | none | – | at least one request to another domain |
| Cookies and storage | nothing set, or only known session and security cookies | first-party cookies or entries spurlos does not know; a cookie without `Secure` on an https page; a session cookie without `HttpOnly` | a third-party cookie or one of a known tracker |
| Legal notice and privacy policy | both linked and reachable | – | a link is missing or the page answers with an error |
| HTTPS | https, http redirects, HSTS, certificate valid for 14 days or more | no HSTS, nothing answers on http, certificate valid for less than 14 days | no https, http without redirect, certificate valid for less than 7 days or expired |
| Security headers | all set | one or more missing | – |
| Forms | none, or all send encrypted to the site itself | one sends to a third-party server | one sends unencrypted over http |
| Software details | nothing, or only the software's name | a version number in `Server`, `X-Powered-By`, `X-AspNet-Version`, `X-Generator` or `<meta name="generator">` | – |

The headers checked are `Content-Security-Policy`, `X-Frame-Options` (or `frame-ancestors` in the CSP), `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy`. CSP and Referrer-Policy also count as a `<meta>` tag, for hosts like GitHub Pages where headers cannot be set. spurlos recognizes the legal notice and privacy policy by link text or address, in German and English. A link like “Impressum & Datenschutz” counts for both.

Every finding in the report has its own light, and the check gets the worst of them. That way you see which entry makes a check yellow or red.

Known session and security cookies include `XSRF-TOKEN` and `<app>-session` from Laravel, `PHPSESSID`, `JSESSIONID`, `csrftoken` from Django and `__cf_bm` from Cloudflare. In browser storage, spurlos knows entries that frameworks create themselves, such as Vue Router's scroll positions (`vue-router:scroll`). The list is in `src/services.json` (category `necessary`).

Subdomains count as the site itself (`cdn.company.com` belongs to `www.company.com`), following the Public Suffix List (`company.co.uk`).

## How spurlos visits

spurlos opens the page itself as a regular Chrome and adds its name to the user agent:

```
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0.0.0 Safari/537.36 spurlos/0.2.0
```

“HeadlessChrome” is left out on purpose, in the client hints (`sec-ch-ua`) too. Many cookie banners and trackers do not load at all for visits they take for bots. spurlos would then report a clean page while real visitors get tracked. It does not hide, though: its name is in every user agent, and `navigator.webdriver` stays `true`.

The legal notice, the privacy policy and the http redirect are requested openly as a bot, since bot detection changes nothing there:

```
spurlos/0.2.0 (+https://github.com/mmohrx/spurlos)
```

Because spurlos opens pages it does not know, Chromium runs in its own sandbox wherever the system allows one (macOS, Windows, Linux with user namespaces). Without one, spurlos says so on stderr. In the Docker image Chromium runs without its sandbox, as the container, running as user `node`, is the boundary; on Linux, that is the best way to check unknown sites. spurlos accepts no downloads from a page.

The HTML report holds every finding, with the green checks folded. It loads nothing and contains no JavaScript, so it opens offline and can be sent by mail.

## For AI assistants (MCP)

`spurlos mcp` starts an [MCP](https://modelcontextprotocol.io) server over stdio. An assistant like Claude can then check sites itself, e.g. when asked “Check example.com and explain what is red”. The server offers one tool, `scan`, with `url` and optionally `lang` (`de`, `en`) and `format` (`text` or `json`). It runs on your machine, like the CLI.

In Claude Code:

```
claude mcp add spurlos -- npx spurlos mcp
```

In other clients, e.g. Claude Desktop, under `mcpServers`:

```json
{ "spurlos": { "command": "npx", "args": ["spurlos", "mcp"] } }
```

With Docker instead of Node: `"command": "docker", "args": ["run", "-i", "--rm", "ghcr.io/mmohrx/spurlos", "mcp"]`.

As with the CLI, the language follows `--lang`, `SPURLOS_LANG` or the system, and `--user-agent` applies to every request. At most two checks run at a time, others wait. Every report carries the note that it is not legal advice.

## In CI

```
npx spurlos https://staging.company.com --lang en || echo "new traces"
```

Exit code `0` without a red finding, `1` with one, `2` if the page could not be checked. With `--json` you get the full result, every request included.

## Adding known services

Which hosts and cookies belong to which service is in [`src/services.json`](src/services.json). Hosts include their subdomains, cookie names match as a prefix (`_ga` also covers `_ga_ABC123`), with a leading `*` as a suffix (`*-session`). If a service is missing, a pull request is welcome.

## What spurlos does not do

- It does not actively look for holes. It only evaluates what a normal visit to the page returns anyway; it never requests addresses like `/.env`, `/.git/` or `/phpinfo.php`. So you can run it against any site without probing it.
- It does not click the cookie banner. What it checks is the state before the visitor decides anything.
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

## License

MIT, © 2026 Martin Mohr
