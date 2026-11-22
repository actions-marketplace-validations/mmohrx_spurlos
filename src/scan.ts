import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page, type Request as PlaywrightRequest, type Response as PlaywrightResponse } from 'playwright'
import { carried, cookieIds, legalLinks } from './checks.ts'

// src/ and dist/ both sit next to package.json
export const VERSION: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
export const HOME = 'https://github.com/mmohrx/spurlos'

/** Open about itself, for the requests where a bot check changes nothing: the legal pages. */
export const BOT_AGENT = `spurlos/${VERSION} (+${HOME})`

/** how Chrome names the platform, in the user agent and in the client hints */
const PLATFORM: Record<string, { ua: string; ch: string }> = {
  darwin: { ua: 'Macintosh; Intel Mac OS X 10_15_7', ch: 'macOS' },
  win32: { ua: 'Windows NT 10.0; Win64; x64', ch: 'Windows' },
}
const LINUX = { ua: 'X11; Linux x86_64', ch: 'Linux' }

/**
 * Chromium still names itself HeadlessChrome in its client hints (sec-ch-ua, navigator.userAgentData), whatever the
 * user agent says; this sets them to plain Chromium, to match. navigator.webdriver stays true on purpose: spurlos
 * does not pretend to be a person.
 */
async function plainBrands(context: BrowserContext, page: Page, userAgent: string, chromeVersion: string, mobile = false) {
  const major = chromeVersion.split('.')[0] ?? ''
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent,
    acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8',
    userAgentMetadata: {
      brands: [
        { brand: 'Chromium', version: major },
        { brand: 'Not/A)Brand', version: '8' },
      ],
      fullVersion: chromeVersion,
      platform: mobile ? 'Android' : (PLATFORM[process.platform] ?? LINUX).ch,
      platformVersion: '',
      architecture: '',
      model: '',
      mobile,
    },
  })
}

/**
 * For the page itself: a regular Chrome, with spurlos added but no URL. Many cookie banners and trackers stay away
 * from what they take for a bot – HeadlessChrome or a URL in the user agent – and the scan would miss what real
 * visitors get. The page still sees spurlos in its logs.
 */
export function browserAgent(chromeVersion: string, platform = process.platform, mobile = false): string {
  const major = chromeVersion.split('.')[0]
  // as Chrome on Android names itself, with the reduced device part it sends everywhere
  if (mobile) return `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36 spurlos/${VERSION}`
  return `Mozilla/5.0 (${(PLATFORM[platform] ?? LINUX).ua}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 spurlos/${VERSION}`
}

/**
 * type: as Playwright names it (script, image, fetch …), websocket for a WebSocket and webrtc for a STUN or TURN
 * server, which Playwright does not report as requests; url is then the server's address as the page gave it.
 * bytes: what went over the wire for the answer, headers and encoded body; missing where none came.
 * afterMove: it came only once spurlos moved the mouse and scrolled, as scripts held back until then do.
 * carries: what of the visitor's it sends along, in its address or body: email, query:<name> for a value from the
 * query of the page asked for (see carried in checks.ts), id:<name>@<domain> for the ID in another site's cookie (see
 * cookieIds)
 */
export type Request = { url: string; host: string; type: string; bytes?: number; afterMove?: true; carries?: string[] }
/** expires: in seconds since 1970, -1 for a session cookie; sameSite: missing in a scan of an older spurlos */
export type Cookie = { name: string; domain: string; expires: number; secure: boolean; httpOnly: boolean; sameSite?: 'Strict' | 'Lax' | 'None'; afterMove?: true }
export type StorageEntry = { area: 'localStorage' | 'sessionStorage'; key: string }
export type Link = { text: string; href: string }
export type Form = { action: string; method: string }
/** a file the page embeds by its markup; tag: script, stylesheet, iframe, img, video, audio or source */
export type Resource = { tag: string; url: string; integrity: boolean }
/**
 * what a fingerprinting script reads out: a canvas with text drawn on it, the graphics card by WebGL, the audio stack,
 * the visitor's IP address by WebRTC
 */
export type FingerprintApi = 'canvas' | 'webgl' | 'audio' | 'webrtc'
/** script: the address of the script that read it, the frame's own for inline code */
export type Fingerprint = { api: FingerprintApi; script: string }
/** what a script asks the browser for: a permission the visitor has to grant, or a service worker that stays */
export type AccessApi = 'notifications' | 'push' | 'geolocation' | 'camera' | 'microphone' | 'service-worker'
export type Access = { api: AccessApi; script: string }
/**
 * Basics of accessibility a machine can tell: lang of <html>, the viewport meta tag, images without alt (their
 * address) and form fields without a label (tag and name), both only where visible and not hidden from screen readers.
 */
export type Accessibility = { lang?: string; viewport?: string; images: string[]; fields: string[] }
const FINGERPRINT_APIS: readonly string[] = ['canvas', 'webgl', 'audio', 'webrtc'] satisfies FingerprintApi[]
const ACCESS_APIS: readonly string[] = ['notifications', 'push', 'geolocation', 'camera', 'microphone', 'service-worker'] satisfies AccessApi[]

/** The host of a STUN or TURN server: stun.example.com of stun:stun.example.com:3478?transport=udp. */
export function iceHost(url: string): string | undefined {
  const m = /^(?:stuns?|turns?):(?:[^@/]*@)?(\[[^\]]+\]|[^:?/]+)/i.exec(url.trim())
  return m?.[1]?.toLowerCase()
}

/** the name of the function the init script reports to; the page can see it, as it sees navigator.webdriver */
const BINDING = '__spurlos'

/**
 * Runs in every frame before the page's own scripts and notes, once per API and script, the reads that serve
 * fingerprinting: a canvas read back after text with at least ten different characters went on it, at least 16 × 16
 * pixels (the rule of Englehardt and Narayanan, 2016: emoji tests such as WordPress's draw fewer); the graphics card's
 * unmasked vendor or renderer from WebGL; an OfflineAudioContext rendered; a WebRTC connection that gathers its
 * candidates, which asks STUN and TURN servers for the visitor's IP, with those servers. And what a script asks the browser for:
 * notifications, push, location, camera, microphone, a service worker. Never breaks the page: each wrapper calls the
 * original whatever happens.
 */
function watchApis(binding: string) {
  const sent = new Set<string>()
  const report = (api: string, servers: string[] = []) => {
    // the innermost frame with an address is the script that called; the wrappers here have none
    const script = /https?:\/\/[^\s()]+?(?=:\d+:\d+)/.exec(new Error().stack ?? '')?.[0] ?? location.href
    const seen = `${api} ${script} ${servers.join(' ')}`
    if (sent.has(seen)) return
    sent.add(seen)
    const send = (window as unknown as Record<string, unknown>)[binding]
    if (typeof send === 'function') Promise.resolve(send(api, script, servers)).catch(() => {})
  }
  const wrap = (proto: object | undefined, name: string, before: (self: any, args: any[]) => void) => {
    const original = proto && Object.getOwnPropertyDescriptor(proto, name)
    if (!proto || !original || typeof original.value !== 'function') return
    const fn = original.value as (...args: unknown[]) => unknown
    Object.defineProperty(proto, name, {
      ...original,
      value: function (this: unknown, ...args: unknown[]) {
        try {
          before(this, args)
        } catch {
          // the page goes first
        }
        return fn.apply(this, args)
      },
    })
  }
  const w = window as any
  // the most different characters one call drew on a canvas
  const drawn = new WeakMap<object, number>()
  const readBack = (canvas: { width: number; height: number } | null) => {
    if (canvas && canvas.width >= 16 && canvas.height >= 16 && (drawn.get(canvas) ?? 0) >= 10) report('canvas')
  }
  for (const proto of [w.CanvasRenderingContext2D?.prototype, w.OffscreenCanvasRenderingContext2D?.prototype]) {
    for (const name of ['fillText', 'strokeText']) {
      wrap(proto, name, (ctx, [text]) => {
        const distinct = new Set(String(text)).size
        if (distinct > (drawn.get(ctx.canvas) ?? 0)) drawn.set(ctx.canvas, distinct)
      })
    }
    wrap(proto, 'getImageData', (ctx, [, , sw, sh]) => {
      if (Math.abs(sw) >= 16 && Math.abs(sh) >= 16) readBack(ctx.canvas)
    })
  }
  wrap(w.HTMLCanvasElement?.prototype, 'toDataURL', readBack)
  wrap(w.HTMLCanvasElement?.prototype, 'toBlob', readBack)
  wrap(w.OffscreenCanvas?.prototype, 'convertToBlob', readBack)
  // UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL of WEBGL_debug_renderer_info
  for (const proto of [w.WebGLRenderingContext?.prototype, w.WebGL2RenderingContext?.prototype]) {
    wrap(proto, 'getParameter', (_, [p]) => {
      if (p === 0x9245 || p === 0x9246) report('webgl')
    })
  }
  wrap(w.OfflineAudioContext?.prototype, 'startRendering', () => report('audio'))
  // the servers a connection was made with; it asks them once it gathers candidates, after setLocalDescription
  const Peer = w.RTCPeerConnection
  if (typeof Peer === 'function') {
    const servers = new WeakMap<object, string[]>()
    const Watched = new Proxy(Peer, {
      construct(target, args, newTarget) {
        const connection = Reflect.construct(target, args, newTarget)
        try {
          const urls = (args[0]?.iceServers ?? []).flatMap((s: any) => [s?.urls ?? s?.url ?? []].flat())
          servers.set(connection, urls.filter((u: unknown): u is string => typeof u === 'string'))
        } catch {
          // the page goes first
        }
        return connection
      },
    })
    if (w.webkitRTCPeerConnection === Peer) w.webkitRTCPeerConnection = Watched
    w.RTCPeerConnection = Watched
    wrap(Peer.prototype, 'setLocalDescription', connection => report('webrtc', servers.get(connection) ?? []))
  }

  wrap(w.Notification, 'requestPermission', () => report('notifications'))
  wrap(w.PushManager?.prototype, 'subscribe', () => report('push'))
  wrap(w.Geolocation?.prototype, 'getCurrentPosition', () => report('geolocation'))
  wrap(w.Geolocation?.prototype, 'watchPosition', () => report('geolocation'))
  wrap(w.MediaDevices?.prototype, 'getUserMedia', (_, [constraints]) => {
    if (constraints?.video) report('camera')
    if (constraints?.audio) report('microphone')
  })
  wrap(w.ServiceWorkerContainer?.prototype, 'register', () => report('service-worker'))
}
/** the phone --mobile opens the page as: the screen of a Pixel 7, in CSS pixels */
export const PHONE = { width: 412, height: 915, deviceScaleFactor: 2.625 }

/** What a user typed, as a URL to open: https:// unless they wrote http:// or https://; undefined if it is none. */
export function toUrl(arg: string): string | undefined {
  try {
    return new URL(/^https?:\/\//i.test(arg) ? arg : `https://${arg}`).href
  } catch {
    return undefined
  }
}

/** A host name given with --own, as the browser writes it: cdn-firma.net, *.cdn.de as cdn.de; undefined if it is none. */
export function ownHost(value: string): string | undefined {
  const bare = value.trim().replace(/^\*?\./, '')
  if (!/^[^\s/:?#@]+\.[^\s/:?#@.]+$/.test(bare)) return undefined
  try {
    return new URL(`https://${bare}`).hostname
  } catch {
    return undefined
  }
}

/** what a Visit's error says when the server sent nothing at all; the report translates it */
export const NO_RESPONSE = 'no response'
/** why a scan stops at a 401: the page wants a login, or turned the one given down; the report translates both */
export const AUTH_REQUIRED = 'login required'
export const AUTH_REJECTED = 'login rejected'
/** why a scan stops at a 403 or 429, as `refused 403`: the page turned spurlos away, often a bot check; the report translates it */
export const REFUSED = 'refused'

/** Where a URL ended up when opened on its own: status and final URL, or why it could not be opened. */
export type Visit = { url: string; status: number; finalUrl: string } | { url: string; error: string }

export type Scan = {
  url: string
  finalUrl: string
  /** false when the page still had requests running when we stopped waiting */
  settled: boolean
  requests: Request[]
  cookies: Cookie[]
  storage: StorageEntry[]
  /** response headers of the page itself, names in lower case */
  headers: Record<string, string>
  /**
   * the page's TLS certificate; missing for http pages (and for pages the tests serve themselves). names: the host
   * names it covers (*.example.com), subject: its holder (CN), both where Chromium hands the certificate out
   */
  certificate?: { validTo: number; issuer: string; names?: string[]; subject?: string }
  /** hosts the user named as the page's own with --own, subdomains included */
  own?: string[]
  /** the server asked for the page over http://, to see whether it sends visitors on to https; missing when the page is http */
  http?: Visit
  links: Link[]
  /** the links that look like Impressum or Datenschutz, each opened on its own */
  legal: Visit[]
  forms: Form[]
  /** scripts, stylesheets, frames, images and media the markup embeds, with their absolute address */
  resources: Resource[]
  /** what scripts read out that serves to recognize the browser without a cookie, once per API and script */
  fingerprinting: Fingerprint[]
  /** what scripts asked the browser for before any click: permissions and service workers, once per API and script */
  access: Access[]
  accessibility: Accessibility
  /** where <link rel="preconnect"> opens a connection ahead, absolute; the Link header the checks read themselves */
  preconnect: string[]
  /** a Content-Security-Policy set in a <meta http-equiv> tag, the only way to one on hosts without own headers */
  metaCsp?: string
  /** a referrer policy set in <meta name="referrer"> */
  metaReferrer?: string
  /** how wide the page lays itself out and how wide the window is, in CSS pixels; wider means scrolling sideways */
  width: { page: number; window: number }
  /** opened as a phone (--mobile) */
  mobile?: true
  /** opened with Global Privacy Control (--gpc) */
  gpc?: true
  /**
   * when, in ms after the navigation started: firstPaint, the first content showed (first-contentful-paint); load, the
   * load event ended; idle, the last request before the first move was done. Missing in a scan of an older spurlos.
   */
  timing?: { firstPaint?: number; load: number; idle: number }
  /** what <meta name="generator"> says, often the CMS and its version */
  generator?: string
  /** what <meta name="robots"> and <meta name="googlebot"> say, joined by a comma */
  metaRobots?: string
  /** the user agent the page was opened with */
  userAgent: string
  /** whether Chromium ran in its own sandbox; without it, an exploit in the page reaches the user running spurlos */
  sandbox: boolean
  /** what a visitor saw first, as a JPEG in base64; only when asked for, and never part of --json */
  screenshot?: string
}

export type ScanOptions = {
  /** how long to wait for the network to go quiet after load, in ms */
  settleMs?: number
  /** hook for tests: route requests before a page is opened */
  setup?: (context: BrowserContext) => Promise<void>
  /** hook for tests: the fetch used to ask the server about http:// */
  fetch?: typeof fetch
  /** replaces the user agent of every request spurlos makes */
  userAgent?: string
  /** HTTP basic auth, sent only to the origin of the URL checked, and not with the http:// probe of an https page */
  auth?: { username: string; password: string }
  /** keep a picture of what a visitor sees first, for the HTML and PDF report */
  screenshot?: boolean
  /** hosts that belong to the page, though on another site (its CDN), subdomains included */
  own?: string[]
  /** open the page as a phone: its screen, touch, and the user agent of Chrome on Android */
  mobile?: boolean
  /** say no to selling and sharing, as a browser with Global Privacy Control does: Sec-GPC: 1, navigator.globalPrivacyControl */
  gpc?: boolean
}

/**
 * The host names and holder of the certificate Chromium got for the page, from the connection it already has: no
 * request of its own. Nothing where Chromium has none to give (the tests' pages) or the certificate cannot be read.
 */
async function certificateNames(cdp: CDPSession | undefined, url: string): Promise<{ names?: string[]; subject?: string }> {
  if (!cdp) return {}
  try {
    const { tableNames } = await cdp.send('Network.getCertificate', { origin: new URL(url).origin })
    if (!tableNames[0]) return {}
    const cert = new X509Certificate(Buffer.from(tableNames[0], 'base64'))
    const names = (cert.subjectAltName ?? '').split(', ').filter(n => n.startsWith('DNS:')).map(n => n.slice(4).toLowerCase())
    const subject = /^CN=(.+)$/m.exec(cert.subject)?.[1]?.toLowerCase()
    return { names, ...(subject ? { subject } : {}) }
  } catch {
    return {}
  }
}

/**
 * Basic auth for the browser, bound to the origin of the URL checked: a third-party server that asks for a login
 * gets nothing, and a page on another origin neither. Playwright then sends it to that origin only when asked (401).
 */
const credentials = (url: string, options: ScanOptions) =>
  options.auth ? { httpCredentials: { ...options.auth, origin: new URL(url).origin } } : {}

/**
 * Asks the server directly, not the browser: Chromium upgrades http:// to https:// on its own,
 * which would make a server without redirect look as if it had one.
 */
async function probeHttp(url: string, f: typeof fetch, userAgent: string): Promise<Visit> {
  try {
    const r = await f(url, { redirect: 'follow', headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(15_000) })
    await r.body?.cancel()
    return { url, status: r.status, finalUrl: r.url || url }
  } catch (e) {
    const cause = e instanceof Error && e.cause instanceof Error ? `: ${e.cause.message}` : ''
    return { url, error: e instanceof Error ? e.message + cause : String(e) }
  }
}

/**
 * spurlos opens pages it does not trust, so Chromium gets its sandbox wherever the system allows one (Playwright
 * leaves it off by default). Linux without user namespaces, Docker's default seccomp profile among them, has none;
 * there Chromium runs without, and the Scan says so. SPURLOS_NO_SANDBOX=1 skips the attempt where the container
 * itself is the boundary.
 */
export async function launch(): Promise<{ browser: Browser; sandbox: boolean }> {
  if (process.env.SPURLOS_NO_SANDBOX !== '1') {
    try {
      return { browser: await chromium.launch({ chromiumSandbox: true }), sandbox: true }
    } catch (e) {
      if (!(e instanceof Error && /sandbox/i.test(e.message))) throw e
    }
  }
  return { browser: await chromium.launch(), sandbox: false }
}

/** Opens the URL in a fresh browser, as a first-time visitor who clicks nothing, and records what happens. */
export async function scan(url: string, options: ScanOptions = {}): Promise<Scan> {
  const { browser, sandbox } = await launch()
  try {
    const chrome = browser.version()
    const mobile = options.mobile === true
    const userAgent = options.userAgent ?? browserAgent(chrome, process.platform, mobile)
    const phone = mobile ? { viewport: { width: PHONE.width, height: PHONE.height }, deviceScaleFactor: PHONE.deviceScaleFactor, isMobile: true, hasTouch: true } : {}
    // GPC goes with every request of the page, as Firefox, Brave and DuckDuckGo send it, and scripts can read it
    const gpc = options.gpc === true
    const context = await browser.newContext({ locale: 'de-DE', userAgent, acceptDownloads: false, ...phone, ...(gpc ? { extraHTTPHeaders: { 'sec-gpc': '1' } } : {}), ...credentials(url, options) })
    if (gpc) await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true, enumerable: true }))
    await options.setup?.(context)

    const requests: Request[] = []
    const recorded = new Map<PlaywrightRequest, Request>()
    const sizes: Promise<void>[] = []
    context.on('request', r => {
      const u = new URL(r.url())
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      const carries = carried(r.url(), r.postData() ?? undefined, url)
      const entry: Request = { url: r.url(), host: u.hostname, type: r.resourceType(), ...(carries.length ? { carries } : {}) }
      requests.push(entry)
      recorded.set(r, entry)
    })
    // when the last request before the first move ended, for timing.idle
    let moving = false
    let lastDone = 0
    const done = () => {
      if (!moving) lastDone = Date.now()
    }
    context.on('requestfailed', done)
    context.on('requestfinished', r => {
      done()
      const entry = recorded.get(r)
      if (entry) sizes.push(r.sizes().then(s => void (entry.bytes = s.responseHeadersSize + s.responseBodySize), () => {}))
    })
    const fingerprinting: Fingerprint[] = []
    const access: Access[] = []
    // frames report on their own: the same call in two frames arrives twice
    await context.exposeBinding(BINDING, (_, api: unknown, script: unknown, servers: unknown) => {
      if (typeof api !== 'string' || typeof script !== 'string') return
      // STUN and TURN servers learn the visitor's IP as any other server, though not over http
      if (api === 'webrtc' && Array.isArray(servers)) {
        for (const server of servers) {
          const host = typeof server === 'string' ? iceHost(server) : undefined
          if (host) requests.push({ url: server, host, type: 'webrtc' })
        }
      }
      const list = FINGERPRINT_APIS.includes(api) ? fingerprinting : ACCESS_APIS.includes(api) ? access : undefined
      if (list && !list.some(f => f.api === api && f.script === script)) list.push({ api, script } as Fingerprint & Access)
    })
    await context.addInitScript(watchApis, BINDING)

    const page = await context.newPage()
    // a WebSocket hands the visitor's IP to its server as any request does, but Playwright reports it apart
    page.on('websocket', ws => {
      const u = new URL(ws.url())
      requests.push({ url: ws.url(), host: u.hostname, type: 'websocket' })
    })
    if (!options.userAgent) await plainBrands(context, page, userAgent, chrome, mobile)
    // Chromium hands out the page's certificate later only with the network domain on from the start
    const cdp = await context.newCDPSession(page).then(
      async s => (await s.send('Network.enable'), s),
      () => undefined,
    )
    const response = await page.goto(url, { waitUntil: 'load' })
    if (!response) throw new Error(NO_RESPONSE)
    // the login page is not the site: say so instead of checking it
    // rejected only where the login was sent: a redirect to another origin gets none
    if (response.status() === 401) throw new Error(options.auth && new URL(page.url()).origin === new URL(url).origin ? AUTH_REJECTED : AUTH_REQUIRED)
    // a bot check's page is not the site either: what it loads and lacks says nothing about what visitors get
    if (response.status() === 403 || response.status() === 429) throw new Error(`${REFUSED} ${response.status()}`)
    const settled = await page
      .waitForLoadState('networkidle', { timeout: options.settleMs ?? 10_000 })
      .then(() => true, () => false)

    // what a visitor sees first, cookie banner included; a page that cannot be pictured still gets its report
    const screenshot = options.screenshot ? await page.screenshot({ type: 'jpeg', quality: 70 }).then(b => b.toString('base64'), () => undefined) : undefined

    // A visitor moves the mouse and scrolls before any click. Optimizers such as WP Rocket hold scripts back until
    // then, trackers among them: spurlos does the same, clicks nothing, and marks what comes only now.
    const cookieKey = (c: { name: string; domain: string }) => `${c.name} ${c.domain}`
    const early = new Set((await context.cookies()).map(cookieKey))
    const timing = await page
      .evaluate(() => {
        const paint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        return { origin: performance.timeOrigin, paint, load: nav?.loadEventEnd ?? 0 }
      })
      .then(
        t => ({ ...(t.paint !== undefined ? { firstPaint: Math.round(t.paint) } : {}), load: Math.round(t.load), idle: Math.round(Math.max(t.load, t.paint ?? 0, lastDone - t.origin)) }),
        () => undefined,
      )
    moving = true
    const before = requests.length
    const quiet = await firstMove(page, requests, options.settleMs ?? 10_000)
    for (const r of requests.slice(before)) r.afterMove = true

    const jar = await context.cookies()
    // what other sites' cookies hold turns up in requests to a third: cookie syncing. Only the values are compared, none kept
    for (const r of requests) {
      const ids = cookieIds(r.url, jar, [url, page.url()])
      if (ids.length) r.carries = [...(r.carries ?? []), ...ids]
    }
    const cookies = jar.map((c): Cookie => ({
      name: c.name,
      domain: c.domain.replace(/^\./, ''),
      expires: c.expires,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      ...(early.has(cookieKey(c)) ? {} : { afterMove: true as const }),
    }))
    const { storage, links, forms, resources, metaCsp, metaReferrer, generator, robots, accessibility, preconnect, width } = await page.evaluate(() => {
      const storage: StorageEntry[] = []
      for (const area of ['localStorage', 'sessionStorage'] as const) {
        const s = window[area]
        for (let i = 0; i < s.length; i++) storage.push({ area, key: s.key(i) ?? '' })
      }
      // web components keep their markup in shadow roots, footers with Impressum and Datenschutz among them
      const roots: (Document | ShadowRoot)[] = [document]
      for (let i = 0; i < roots.length; i++) for (const el of roots[i]!.querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot)
      const all = (selector: string) => roots.flatMap(r => [...r.querySelectorAll(selector)])
      // the text a visitor reads: a script inside the link (proton.me has one) is none of it
      const textOf = (a: Element) => {
        if (!a.querySelector('script, style, noscript, template')) return a.textContent ?? ''
        const copy = a.cloneNode(true) as Element
        for (const el of copy.querySelectorAll('script, style, noscript, template')) el.remove()
        return copy.textContent ?? ''
      }
      const links = all('a[href]').map(a => ({
        text: textOf(a).trim().replace(/\s+/g, ' '),
        href: (a as HTMLAnchorElement).href,
      }))
      const forms = (all('form') as HTMLFormElement[]).map(f => ({ action: f.action, method: (f.getAttribute('method') ?? 'get').toLowerCase() }))
      // the address as the browser resolved it, also where it blocked the file (a script over http on an https page)
      const resources: Resource[] = []
      const embed = (tag: string, el: Element, url: string) => {
        // integrity="" protects nothing
        if (/^https?:/.test(url)) resources.push({ tag, url, integrity: (el.getAttribute('integrity') ?? '').trim() !== '' })
      }
      // a script with another type does not run: cookie banners hold scripts back as type="text/plain" until consent
      const runs = (el: Element) => {
        const type = (el.getAttribute('type') ?? '').trim().toLowerCase()
        return !el.hasAttribute('nomodule') && (type === '' || type === 'module' || /^(text|application)\/(x-)?(java|ecma)script$/.test(type))
      }
      for (const el of all('script[src]')) if (runs(el)) embed('script', el, (el as HTMLScriptElement).src)
      const preconnect: string[] = []
      for (const el of all('link[href]')) {
        const rel = el.getAttribute('rel') ?? ''
        if (/(^|\s)stylesheet(\s|$)/i.test(rel)) embed('stylesheet', el, (el as HTMLLinkElement).href)
        if (/(^|\s)preconnect(\s|$)/i.test(rel) && /^https?:/.test((el as HTMLLinkElement).href)) preconnect.push((el as HTMLLinkElement).href)
      }
      for (const tag of ['iframe', 'img', 'video', 'audio', 'source'] as const) {
        for (const el of all(`${tag}[src]`)) embed(tag, el, (el as HTMLImageElement).src)
      }
      const meta = [...document.querySelectorAll('meta[http-equiv]')].find(m => m.getAttribute('http-equiv')?.toLowerCase() === 'content-security-policy')
      const referrer = document.querySelector('meta[name="referrer" i]')?.getAttribute('content') ?? null
      const generator = document.querySelector('meta[name="generator" i]')?.getAttribute('content') ?? null
      const robots = [...document.querySelectorAll('meta[name="robots" i], meta[name="googlebot" i]')].map(m => m.getAttribute('content')?.trim() ?? '').filter(c => c).join(', ')
      // what a screen reader meets: visible, and not hidden from it
      const perceived = (el: Element) => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true" i]')
      const named = (el: Element) => ['aria-label', 'aria-labelledby', 'title'].some(a => (el.getAttribute(a) ?? '').trim() !== '')
      const images = (all('img') as HTMLImageElement[])
        .filter(i => !i.hasAttribute('alt') && !/^(presentation|none)$/i.test(i.getAttribute('role') ?? '') && !named(i) && perceived(i))
        .map(i => i.currentSrc || i.src)
      const fields = (all('input, select, textarea') as HTMLInputElement[])
        .filter(f => !(f.tagName === 'INPUT' && /^(hidden|submit|button|reset|image)$/i.test(f.type)) && !f.labels?.length && !named(f) && perceived(f))
        .map(f => (f.name ? `${f.tagName.toLowerCase()} ${f.name}` : f.tagName.toLowerCase()))
      const lang = document.documentElement.getAttribute('lang')
      const viewport = document.querySelector('meta[name="viewport" i]')?.getAttribute('content')
      const accessibility: Accessibility = { images, fields, ...(lang !== null ? { lang } : {}), ...(viewport != null ? { viewport } : {}) }
      return { storage, links, forms, resources, metaCsp: meta?.getAttribute('content') ?? null, metaReferrer: referrer, generator, robots, accessibility, preconnect, width: { page: document.documentElement.scrollWidth, window: window.innerWidth } }
    })

    const headers = await response.allHeaders()
    const tls = await response.securityDetails()
    const finalUrl = page.url()
    const names = tls?.validTo && finalUrl.startsWith('https:') ? await certificateNames(cdp, finalUrl) : {}
    const visitor = await documentsOnly(browser, url, options)
    await Promise.all(sizes)

    const result: Scan = {
      url,
      finalUrl,
      settled: settled && quiet,
      requests,
      cookies,
      storage,
      headers,
      links,
      legal: [],
      forms,
      resources,
      fingerprinting,
      access,
      accessibility,
      preconnect,
      width,
      userAgent,
      sandbox,
    }
    if (tls?.validTo) result.certificate = { validTo: tls.validTo, issuer: tls.issuer ?? '', ...names }
    if (options.own?.length) result.own = options.own
    if (mobile) result.mobile = true
    if (gpc) result.gpc = true
    if (timing) result.timing = timing
    if (metaCsp) result.metaCsp = metaCsp
    if (metaReferrer) result.metaReferrer = metaReferrer
    if (generator) result.generator = generator
    if (robots) result.metaRobots = robots
    if (screenshot) result.screenshot = screenshot
    // the http probe and the legal pages do not depend on each other: ask them all at once.
    // http:// as the page was asked: some servers answer a bot there with the page and a browser with a redirect.
    // One page can be both Impressum and Datenschutz; open it once.
    const [http, ...legal] = await Promise.all([
      finalUrl.startsWith('https:') ? probeHttp(finalUrl.replace(/^https:/, 'http:'), options.fetch ?? fetch, userAgent) : undefined,
      ...[...new Set(legalLinks(links, finalUrl).map(l => l.href))].map(visitor),
    ])
    if (http) result.http = http
    result.legal = legal.filter(v => v !== undefined)
    return result
  } finally {
    await browser.close()
  }
}

/**
 * Moves the mouse over the page and scrolls a little, without a click, as a visitor does before deciding anything;
 * then waits until no request has come for a second, at most half the settle time. Back at the top afterwards, so the
 * page is read as it was first shown. False when requests kept coming.
 */
async function firstMove(page: Page, requests: Request[], settleMs: number): Promise<boolean> {
  try {
    await page.mouse.move(120, 120)
    await page.mouse.move(360, 280, { steps: 5 })
    await page.mouse.wheel(0, 400)
  } catch {
    // a page that will not be moved over still gets its report
  }
  const end = Date.now() + settleMs / 2
  let count = requests.length
  let since = Date.now()
  while (Date.now() < end) {
    await page.waitForTimeout(250)
    if (requests.length !== count) {
      count = requests.length
      since = Date.now()
    } else if (Date.now() - since >= 1000) break
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
  return Date.now() < end
}

/** A second, separate browser for opening single URLs: only the documents load, nothing of it counts towards the scan. */
async function documentsOnly(browser: Browser, url: string, options: ScanOptions) {
  const context = await browser.newContext({ userAgent: options.userAgent ?? BOT_AGENT, acceptDownloads: false, ...credentials(url, options) })
  await context.route('**/*', route => (route.request().resourceType() === 'document' ? route.continue() : route.abort()))
  // registered after the filter, so the tests' routes take precedence over it
  await options.setup?.(context)
  return async (url: string): Promise<Visit> => {
    const page = await context.newPage()
    // a PDF opens as a download, and goto fails though the server answered: its answer still counts
    let answer: PlaywrightResponse | undefined
    page.on('response', r => {
      if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) answer = r
    })
    try {
      const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      return r ? { url, status: r.status(), finalUrl: page.url() } : { url, error: NO_RESPONSE }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (answer && /Download is starting/.test(message)) return { url, status: answer.status(), finalUrl: answer.url() }
      return { url, error: message.split('\n')[0] ?? message }
    } finally {
      await page.close()
    }
  }
}
