import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { BrowserContext } from 'playwright'

export const SITE = 'https://shop.example'
const sites = new URL('./sites/', import.meta.url)

const HARDENED = {
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=()',
}

/** what each request to SITE was sent with, newest last */
export const seen: { url: string; ua: string | undefined; ch: string | undefined; gpc: string | undefined }[] = []

/**
 * Serves test/sites under SITE (clean.html as the start page, /impressum as impressum.html, blocked.html with 403),
 * test/sites/fremd/<host>/ under other hosts, and answers anything else with an empty 200 – so no test touches the network.
 */
export async function offline(context: BrowserContext) {
  await context.route('**/*', async route => {
    const u = new URL(route.request().url())
    if (u.origin !== SITE) {
      const foreign = fileURLToPath(new URL(`fremd/${u.hostname}${u.pathname}`, sites))
      return u.pathname !== '/' && existsSync(foreign) ? route.fulfill({ status: 200, path: foreign }) : route.fulfill({ status: 200, body: '' })
    }
    const h = route.request().headers()
    seen.push({ url: u.href, ua: h['user-agent'], ch: h['sec-ch-ua'], gpc: h['sec-gpc'] })
    const name = u.pathname === '/' ? 'clean.html' : u.pathname.slice(1)
    const file = name.includes('.') ? name : `${name}.html`
    const headers: Record<string, string> =
      file === 'tracked.html'
        ? { 'set-cookie': 'session=abc; Path=/; HttpOnly', server: 'Apache/2.4.41 (Ubuntu)', 'x-powered-by': 'PHP/8.1.2' }
        : file === 'clean.html'
          ? HARDENED
          : {}
    // Playwright reads the file and takes the content type from its extension
    const path = fileURLToPath(new URL(file, sites))
    if (!existsSync(path)) return route.fulfill({ status: 404, body: '' })
    // blocked.html stands for a bot check's error page
    return route.fulfill({ status: file === 'blocked.html' ? 403 : 200, path, headers })
  })
}

/** Stands in for the server asked over http://: it answers from `finalUrl`, as if it had redirected there. */
export const fetched: (string | null)[] = []
const answersFrom = (finalUrl: (url: string) => string): typeof fetch => async (input, init) => {
  fetched.push(new Headers(init?.headers).get('user-agent'))
  const r = new Response(null, { status: 200 })
  Object.defineProperty(r, 'url', { value: finalUrl(String(input)) })
  return r
}
export const redirects = answersFrom(u => u.replace(/^http:/, 'https:'))
export const staysOnHttp = answersFrom(u => u)
