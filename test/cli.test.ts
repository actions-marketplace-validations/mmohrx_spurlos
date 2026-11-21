import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// only what the CLI decides before it opens a page: these runs need no network
const cli = (...args: string[]) => spawnSync(process.execPath, ['src/cli.ts', ...args], { encoding: 'utf8', env: { ...process.env, SPURLOS_LANG: 'de' } })
const dir = mkdtempSync(join(tmpdir(), 'spurlos-'))

test('a baseline that is missing or no output of --json ends with exit code 2 before any scan', () => {
  const missing = cli('shop.example', '--baseline', join(dir, 'fehlt.json'))
  expect(missing.status).toBe(2)
  expect(missing.stderr).toContain('ließ sich nicht lesen')

  const file = join(dir, 'kaputt.json')
  writeFileSync(file, '{"scan": {}}')
  expect(cli('shop.example', '--baseline', file)).toMatchObject({ status: 2, stderr: expect.stringContaining('keine Ausgabe von spurlos --json') })
  writeFileSync(file, 'kein json')
  expect(cli('shop.example', '--baseline', file).status).toBe(2)
})

test('a baseline whose findings cannot be read is said to be broken, not the page', () => {
  const file = join(dir, 'leer.json')
  for (const body of ['{"results":[null]}', '{"results":[{"check":"third-party","hosts":[null]}]}']) {
    writeFileSync(file, body)
    expect(cli('shop.example', '--baseline', file)).toMatchObject({ status: 2, stderr: expect.stringContaining('keine Ausgabe von spurlos --json') })
  }
})

test('several -o go by their extensions, without a format flag', () => {
  expect(cli('shop.example', '--json', '-o', join(dir, 'a.json'), '-o', join(dir, 'a.html'))).toMatchObject({ status: 2, stderr: expect.stringContaining('Mit mehreren -o') })
})

test('a login applies to one origin only', () => {
  const r = spawnSync(process.execPath, ['src/cli.ts', 'staging.firma.de', 'www.partner.de'], { encoding: 'utf8', env: { ...process.env, SPURLOS_LANG: 'de', SPURLOS_AUTH: 'team:geheim' } })
  expect(r).toMatchObject({ status: 2, stderr: expect.stringContaining('gelten nur für eine Adresse') })
})

test('every address is checked before the first scan', () => {
  expect(cli('shop.example', 'http://')).toMatchObject({ status: 2, stderr: expect.stringContaining('http:// ist keine gültige Adresse.') })
})

test('--own takes host names only', () => {
  for (const value of ['https://cdn.firma.de', 'cdn', 'cdn.firma.de/bilder']) {
    expect(cli('shop.example', '--own', value)).toMatchObject({ status: 2, stderr: expect.stringContaining('--own braucht einen Hostnamen') })
  }
  expect(cli('shop.example', '--own', 'ztat.net,cdn')).toMatchObject({ status: 2, stderr: expect.stringContaining('nicht cdn.') })
})
