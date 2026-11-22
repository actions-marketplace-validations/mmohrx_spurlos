# In CI

[Deutsch](../de/ci.md) · **English**

```
npx spurlos https://staging.company.com --lang en || echo "new traces"
```

Exit code `0` without a red finding, `1` with one, `2` if a page could not be checked or the call was wrong (unknown option, invalid URL, unknown language, more than one of `--json`, `--html`, `--pdf`, one of them with several `-o`, a baseline that cannot be read, a login for addresses on different servers, anything but a host name with `--own`) or a file of `-o` could not be written. A missing or rejected login ends with `2` too, and so does a page that turns the request away with `403` or `429`, and one Chromium will not open at all because its certificate is invalid or its server offers only outdated TLS versions such as 1.0 and 1.1; the message then says why. With several addresses the worst case counts; spurlos still writes the reports of the pages it could check.

With `--json` you get the full result as JSON: `scan` holds the raw data (every request with its transferred size, cookies, storage, fingerprinting reads and browser access with their script, the accessibility basics, the width of page and window, `mobile: true` with `--mobile`, headers, certificate with the names in it, links, forms, embedded files, the hosts of `--own`), `results` one object per check with `check` (`third-party`, `cookies`, `fingerprinting`, `access`, `legal`, `https`, `headers`, `resources`, `forms`, `disclosure`, `mobile`, `accessibility`), `level` (`green`, `yellow`, `red`) and the findings, `note` the note that this is not legal advice. Servers and cookies that seem to belong to the site carry `own` with the reason (`option`, `certificate`, `name`, `platform`). Under `third-party`, `selfHosted` lists the known services running on the site itself. With several addresses it is a list of such objects. The red checks, for example:

```
npx spurlos https://staging.company.com --json | jq -r '.results[] | select(.level == "red") | .check'
```

## Only report new traces

A site is rarely all green. To have CI still speak up when something is added, such as a new tracker or a new cookie, `--baseline` compares with an earlier output of `--json`:

```
npx spurlos https://www.company.com --json -o spurlos-baseline.json   # once, then into the repository
npx spurlos https://www.company.com --baseline spurlos-baseline.json
```

The report then marks every finding that is new or worse than before with `[new]` and lists what has gone. Exit code `1` comes only with a new red finding. With `--json` the comparison is under `compare` (`baseline`, `new`, `gone`, each finding with `key` and `level`). spurlos finds the pages in the baseline by their address; checking a single page against a baseline of a single page, the two belong together. A page the baseline does not know has only new findings. The servers of a known service count as one finding, keyed by their entry in `src/services.json` (`third-party nmrodam.com`): some services pick a new subdomain on every visit, and that is nothing new.

## GitHub Action

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
| `args` | further options, such as `--verbose` or `--mobile`, split at spaces; no `--json`, `--html` or `--pdf`, the files go by their extension |
