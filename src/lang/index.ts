import de, { type Messages } from './de.ts'
import en from './en.ts'

/**
 * Every language of the report. A new one: a file next to de.ts typed as Messages, and an entry here.
 * The keys are two-letter language codes: they are matched against the system locale and used as BCP 47 tags.
 */
export const MESSAGES = { de, en } satisfies Record<string, Messages>

export type Lang = keyof typeof MESSAGES
export type { Messages }

export const LANGS = Object.keys(MESSAGES) as Lang[]
export const DEFAULT_LANG: Lang = 'en'

export const isLang = (s: string): s is Lang => Object.hasOwn(MESSAGES, s)
/** the language part of a code or locale: en_US.UTF-8, en-GB and EN all mean en */
const code = (s: string) => s.split(/[_.@-]/)[0]?.toLowerCase() ?? ''

/**
 * The language: --lang (flag), then SPURLOS_LANG, then the system locale, else DEFAULT_LANG.
 * The locale goes by POSIX: the first of LC_ALL, LC_MESSAGES, LANG that is set wins, so de_DE.UTF-8 means de.
 * C and POSIX say nothing about a language (LC_ALL=C is common in scripts and CI) and are skipped;
 * a locale spurlos has no texts for (fr_FR) falls back to DEFAULT_LANG.
 * An unknown --lang or SPURLOS_LANG comes back as unknown, for the CLI to reject; lang is then
 * what applies without it, so the rejection can be said in a language the reader knows.
 */
export function pickLang(flag: string | undefined, env: NodeJS.ProcessEnv = process.env): { lang: Lang; unknown?: { from: string; value: string } } {
  const locale = code([env.LC_ALL, env.LC_MESSAGES, env.LANG].find(v => v && code(v) !== 'c' && code(v) !== 'posix') ?? '')
  const system = isLang(locale) ? locale : DEFAULT_LANG
  for (const [from, value] of [['--lang', flag], ['SPURLOS_LANG', env.SPURLOS_LANG]] as const) {
    if (!value) continue
    const wanted = code(value)
    return isLang(wanted) ? { lang: wanted } : { lang: system, unknown: { from, value } }
  }
  return { lang: system }
}
