import { expect, test } from 'vitest'
import { LANGS, MESSAGES, pickLang } from '../src/lang/index.ts'

const lang = (flag: string | undefined, env: NodeJS.ProcessEnv) => pickLang(flag, env).lang

test('without anything set the report is English', () => {
  expect(pickLang(undefined, {})).toEqual({ lang: 'en' })
})

test('the system locale picks the language, LC_ALL before LC_MESSAGES before LANG', () => {
  expect(lang(undefined, { LANG: 'en_US.UTF-8' })).toBe('en')
  expect(lang(undefined, { LC_ALL: 'en_GB.UTF-8', LC_MESSAGES: 'de_DE', LANG: 'de_DE' })).toBe('en')
  expect(lang(undefined, { LC_MESSAGES: 'en_GB', LANG: 'de_DE' })).toBe('en')
})

test('C and POSIX say nothing about a language and let the next variable decide', () => {
  expect(lang(undefined, { LC_ALL: 'C', LANG: 'de_DE.UTF-8' })).toBe('de')
  expect(lang(undefined, { LC_ALL: 'POSIX', LC_MESSAGES: 'C.UTF-8', LANG: 'de_DE' })).toBe('de')
  expect(lang(undefined, { LC_ALL: 'POSIX', LC_MESSAGES: 'C.UTF-8' })).toBe('en')
})

test('--lang and SPURLOS_LANG take a locale like LANG does', () => {
  expect(lang('EN', {})).toBe('en')
  expect(lang(undefined, { SPURLOS_LANG: 'en_US.UTF-8' })).toBe('en')
})

test('a locale without texts falls back to English', () => {
  for (const LANG of ['C.UTF-8', 'POSIX', 'fr_FR.UTF-8']) expect(lang(undefined, { LANG })).toBe('en')
})

test('--lang before SPURLOS_LANG before the locale', () => {
  expect(lang('de', { SPURLOS_LANG: 'en', LANG: 'en_US' })).toBe('de')
  expect(lang(undefined, { SPURLOS_LANG: 'en', LANG: 'de_DE' })).toBe('en')
})

test('an unknown choice is reported, with the language that applies without it', () => {
  expect(pickLang('fr', { LANG: 'de_DE' })).toEqual({ lang: 'de', unknown: { from: '--lang', value: 'fr' } })
  expect(pickLang(undefined, { SPURLOS_LANG: 'fr' })).toEqual({ lang: 'en', unknown: { from: 'SPURLOS_LANG', value: 'fr' } })
})

test('every language has a help naming all options', () => {
  for (const l of LANGS) {
    const usage = MESSAGES[l].usage(LANGS.join('|'))
    for (const option of ['--lang', '--verbose', '--json', '--html', '--pdf', '--output', '--baseline', '--auth', '--user-agent', '--help']) expect(usage).toContain(option)
  }
})
