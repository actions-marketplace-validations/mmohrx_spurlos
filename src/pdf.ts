import { launch } from './scan.ts'

/**
 * The HTML report printed to PDF by the Chromium spurlos already has, so no new dependency. The report holds text
 * from the checked page, escaped and without scripts; still the print tab runs no JavaScript and every request is
 * refused, so the PDF loads nothing. Light colors whatever the system's scheme, as on paper.
 */
export async function pdf(html: string): Promise<Buffer> {
  const { browser } = await launch()
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'light', acceptDownloads: false })
    await context.route('**/*', route => route.abort())
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    return await page.pdf({ format: 'A4', printBackground: true, tagged: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } })
  } finally {
    await browser.close()
  }
}
