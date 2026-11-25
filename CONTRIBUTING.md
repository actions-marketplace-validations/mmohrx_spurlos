# Contributing

Thanks for wanting to make spurlos better. Issues and pull requests are welcome in English or German.

## Most common: a service is missing

spurlos reports a host or a cookie as “unknown”, but you know what it belongs to? Add the service to [`src/services.json`](src/services.json):

```json
{ "name": "Matomo", "category": "tracking", "hosts": ["matomo.cloud"], "cookies": ["_pk_id", "_pk_ses"] }
```

- `category`: `fonts`, `tracking` (cookies red), `session-replay` (tools that record the visit, such as Hotjar or Microsoft Clarity: trackers, with a note of their own in the report), `tag-manager` (Google Tag Manager and the like: they count nothing themselves but start trackers, so the report has a note of their own for them), `analytics` (statistics without cookies, such as Plausible), `consent` (cookie banners: yellow as a third-party server, their cookies green), `video`, `maps`, `social`, `chat`, `payment`, `captcha` (yellow as a third-party server), `cdn`, `necessary` (needed to run the site, such as a CSRF token, cookies green) or `other`. The category decides the light of a cookie and the tips in the report.
- `hosts` include their subdomains, `cookies` match the start of the name (`_pk_id` also covers `_pk_id.1.abcd`), with a leading `*` the end (`*-session`). Entries in browser storage go under `storage`. Parts of file paths, for services that sit on the site itself, on an unknown host, or on a host whose entry only names the provider in general (such as WordPress plugins, a self-hosted Matomo, or reCAPTCHA on `www.google.com`), go under `paths`; they win over a host entry of category `other`: ending in `/` a directory anywhere in the path, otherwise the end of the path. `country` is where the provider has its seat, as ISO 3166 code: that of the parent company (Contentsquare's `FR` for Hotjar), not where its servers stand or the EU branch that signs the contract. Leave it out if you are not sure. Make cookie prefixes long enough not to match other names (`*_posthog` rather than `ph_`).
- `aliases` lists other names privacy policies use for the service, such as a former name (`Webtrekk`) or the provider's name (`Facebook` for `Meta Pixel`). Only names that mean nothing else: `Meta` would also match “Meta-Daten”.
- A platform that sites run on (Wix, Shopify) gets the header that identifies its sites under `headers`: just the name (`x-wix-request-id`) or the name and part of the value (`powered-by: Shopify`). Its hosts are then yellow instead of red on its own sites. Name a site that sends the header in the pull request.
- Name a source in the pull request, such as the provider's documentation, that shows the host or cookie.

`pnpm sites` shows what spurlos does not know on real sites: it checks the sites in [`scripts/sites.txt`](scripts/sites.txt) again, compares with the last run and lists unknown hosts, cookies and storage entries, the most common first. The results are kept in `~/.cache/spurlos-sites/`, not in the repository. The sites are real, so the script needs the network and is not part of `pnpm test`.

## Bugs and ideas

Open an issue with the template. For a bug, the output of `spurlos <url> --json` helps; cut out whatever you would rather not share.

New checks have to stay passive: spurlos opens the page the way a visitor does and does not guess paths like `/.env` or `/wp-admin`. Ideas that go beyond that are not taken up, even if they would be useful.

## Development

```
pnpm install
pnpm exec playwright install chromium-headless-shell
node src/cli.ts <url>
```

Before the pull request:

```
pnpm typecheck
pnpm test       # runs offline against test/sites
```

- A new check gets a case in `test/sites/` (files of third-party servers under `test/sites/fremd/<host>/`, such as a script that does fingerprinting), a row in the table of lights in the README (both languages: `README.md` and `README.de.md`) and, where needed, the exact rule in `docs/en/checks.md` and `docs/de/checks.md`.
- Every message exists in every language, one file each in [`src/lang/`](src/lang/).
- A new language: copy `src/lang/de.ts`, for example to `fr.ts`, type it as `const fr: Messages`, translate it and add it to `MESSAGES` in `src/lang/index.ts`. `pnpm typecheck` shows every text still missing. Then add it to `--lang` in the README and run `pnpm examples`.
- If the report changes, run `pnpm examples` and commit `examples/` along with it.

## License

By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).
