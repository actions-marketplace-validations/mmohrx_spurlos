/**
 * Prüft die Seiten aus scripts/sites.txt erneut und vergleicht mit dem letzten Lauf: Was ließ sich nicht prüfen, wo
 * hat sich eine Ampel geändert, welche Befunde sind neu oder weg. Dazu, über alle Seiten, was spurlos nicht kennt
 * (Hosts, Cookies, Speicher), als Vorschläge für src/services.json.
 *
 *   pnpm sites                             alle Seiten aus sites.txt
 *   pnpm sites zeit.de n26.com             nur diese
 *   pnpm sites --jobs 4                    vier Seiten gleichzeitig (Standard 3)
 *
 * Die Ergebnisse liegen in ~/.cache/spurlos-sites/<datum>/ (anders mit SPURLOS_SITES_DIR): je Seite das JSON von
 * spurlos, dazu summary.md mit dem, was auch auf der Ausgabe steht. Der Exit-Code ist 1, wenn sich eine Seite nicht
 * prüfen ließ, die es beim letzten Mal noch tat.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compare, findings, type Result } from '../src/checks.ts'

const ROOT = process.env.SPURLOS_SITES_DIR ?? join(homedir(), '.cache', 'spurlos-sites')
const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const LIST = fileURLToPath(new URL('./sites.txt', import.meta.url))
const TIMEOUT = 180_000
const LIGHT = { red: '🔴', yellow: '🟡', green: '🟢' } as const
const ORDER = ['third-party', 'cookies', 'legal', 'https', 'headers', 'resources', 'forms', 'disclosure'] as const

type Run = { site: string; file: string; code: number; error?: string; results?: Result[] }

const args = process.argv.slice(2)
const jobsAt = args.indexOf('--jobs')
const jobs = jobsAt >= 0 ? Number(args.splice(jobsAt, 2)[1]) || 3 : 3
const sites = args.length ? args : readFileSync(LIST, 'utf8').split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean)

/** a file name for a site: ikea.com/de/de as ikea.com_de_de */
const fileOf = (site: string) => site.replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/[^a-z0-9.-]+/gi, '_') + '.json'

function check(site: string, dir: string): Promise<Run> {
  const file = fileOf(site)
  return new Promise(resolve => {
    const child = spawn(process.execPath, [CLI, site, '-o', join(dir, file)], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, SPURLOS_LANG: 'de' } })
    let stderr = ''
    child.stderr.on('data', d => (stderr += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT)
    child.on('close', code => {
      clearTimeout(timer)
      const run: Run = { site, file, code: code ?? -1 }
      const path = join(dir, file)
      if (run.code <= 1 && existsSync(path)) run.results = JSON.parse(readFileSync(path, 'utf8')).results
      else run.error = code === null ? `nach ${TIMEOUT / 1000} s abgebrochen` : stderr.replace(/^spurlos: /gm, '').split('\n').filter(l => l && !l.includes('geschrieben')).join(' ') || `Exit-Code ${code}`
      resolve(run)
    })
  })
}

async function all(dir: string): Promise<Run[]> {
  const runs: Run[] = []
  let next = 0
  const worker = async () => {
    while (next < sites.length) {
      const site = sites[next++]!
      const run = await check(site, dir)
      runs.push(run)
      console.error(`${String(runs.length).padStart(3)}/${sites.length} ${run.error ? '❌' : '  '} ${site}`)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker))
  return runs.sort((a, b) => sites.indexOf(a.site) - sites.indexOf(b.site))
}

/** the results of a site in an earlier run, if it could be checked then */
function before(dir: string | undefined, site: string): Result[] | undefined | null {
  if (!dir) return undefined
  const path = join(ROOT, dir, fileOf(site))
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')).results
}

const lights = (results: Result[]) => ORDER.map(c => LIGHT[results.find(r => r.check === c)?.level ?? 'green']).join('')

/** what spurlos could not name, over all sites: host or name → the sites it showed up on */
function unknowns(runs: Run[]) {
  const found = { hosts: new Map<string, Set<string>>(), cookies: new Map<string, Set<string>>(), storage: new Map<string, Set<string>>() }
  const add = (m: Map<string, Set<string>>, k: string, site: string) => m.set(k, (m.get(k) ?? new Set()).add(site))
  for (const run of runs) {
    for (const r of run.results ?? []) {
      if (r.check === 'third-party') for (const h of r.hosts) if (!h.service && !h.own) add(found.hosts, h.host, run.site)
      if (r.check === 'cookies') {
        for (const c of r.cookies) if (!c.service) add(found.cookies, c.name, run.site)
        for (const s of r.storage) if (!s.service) add(found.storage, s.key, run.site)
      }
    }
  }
  const top = (m: Map<string, Set<string>>) =>
    [...m].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).slice(0, 25).map(([k, s]) => `  ${String(s.size).padStart(2)}× ${k}  (${[...s].slice(0, 4).join(', ')}${s.size > 4 ? ', …' : ''})`)
  return [
    'Unbekannte Hosts, am häufigsten zuerst:', ...top(found.hosts),
    '', 'Unbekannte Cookies:', ...top(found.cookies),
    '', 'Unbekannte Einträge im Browser-Speicher:', ...top(found.storage),
  ]
}

// local time, so the folders sort and read as the day they ran: 2026-11-21_13-08
const now = new Date()
const stamp = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
mkdirSync(ROOT, { recursive: true })
const previous = readdirSync(ROOT).filter(d => /^\d{4}-\d\d-\d\d_/.test(d) && d < stamp).sort().at(-1)
const dir = join(ROOT, stamp)
mkdirSync(dir, { recursive: true })
console.error(`spurlos: ${sites.length} Seiten nach ${dir}${previous ? `, Vergleich mit ${previous}` : ''}`)

const runs = await all(dir)
const out: string[] = [`# Lauf ${stamp}`, '', `Ampeln je Seite: ${ORDER.join(' · ')}`, '']
let broke = false
for (const run of runs) {
  const old = before(previous, run.site)
  if (run.error) {
    // null: the site had no result last time either
    const fresh = old !== null && old !== undefined
    if (fresh) broke = true
    out.push(`❌ ${run.site}: ${run.error}${fresh ? '  ← beim letzten Mal ging es noch' : ''}`)
    continue
  }
  const results = run.results ?? []
  const changes: string[] = []
  if (old === null) changes.push('ließ sich beim letzten Mal nicht prüfen')
  if (old) {
    for (const c of ORDER) {
      const was = old.find(r => r.check === c)?.level
      const is = results.find(r => r.check === c)?.level
      if (was && is && was !== is) changes.push(`${c} ${LIGHT[was]}→${LIGHT[is]}`)
    }
    const { fresh, gone } = compare(results, old)
    if (fresh.length) changes.push(`neu: ${fresh.map(f => f.key).join(', ')}`)
    if (gone.length) changes.push(`weg: ${gone.map(f => f.key).join(', ')}`)
  }
  const reds = results.flatMap(findings).filter(f => f.level === 'red').length
  out.push(`${lights(results)} ${run.site} (${reds} rot)${changes.length ? `\n      ${changes.join('\n      ')}` : ''}`)
}
out.push('', ...unknowns(runs))

const summary = out.join('\n')
writeFileSync(join(dir, 'summary.md'), summary + '\n')
console.log(summary)
console.error(`\nspurlos: Zusammenfassung in ${join(dir, 'summary.md')}`)
process.exit(broke ? 1 : 0)
