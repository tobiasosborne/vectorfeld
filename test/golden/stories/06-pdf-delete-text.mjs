// Story 06: Import a PDF, delete the headline text element, export.
//
// MuPDF wraps each imported text run in a `<g>` container; the
// SelectTool's hit-test only returns layer-direct children, so a click
// on the headline selects the wrapper, not the text inside. Until
// group-drill-in lands, this gate mutates the DOM directly via
// page.evaluate — the gate's purpose is byte-match invariance on
// export, which only depends on the FINAL DOM state. Once a
// window-exposed selection hook lands the story can switch to
// click+keyboard-Delete.
//
// Picks the largest-font multi-char text element (the only 24.96pt run
// in this fixture) for deterministic targeting.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(here, '..', '..', 'dogfood', 'fixtures', 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')

export const name = '06-pdf-delete-text'

export async function run(page, h) {
  if (!existsSync(FIXTURE)) {
    throw new Error(`fixture missing: ${FIXTURE}`)
  }
  // File > Open PDF
  const fcPromise = page.waitForEvent('filechooser')
  await h.openFileMenu()
  await page.getByText('Open PDF...', { exact: true }).click()
  const fc = await fcPromise
  await fc.setFiles(FIXTURE)
  await page.waitForFunction(
    () => {
      const layers = document.querySelectorAll('g[data-layer-name]')
      return layers.length >= 1 && (layers[0]?.children.length || 0) > 20
    },
    { timeout: 30000 },
  )
  await h.clickTool('select')

  // Remove the headline text element directly. Returns the count of
  // remaining text elements so the verification step can confirm one
  // was actually removed (catches silent no-op).
  const before = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
    return texts.length
  })
  const removed = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
    let best = null
    let bestSize = 0
    for (const t of texts) {
      const size = parseFloat(t.getAttribute('font-size') || '0')
      if ((t.textContent || '').length >= 6 && size > bestSize) {
        best = t; bestSize = size
      }
    }
    if (!best) return false
    best.remove()
    return true
  })
  if (!removed) throw new Error('06: no headline text element found to remove')
  const after = await page.evaluate(() => {
    return document.querySelectorAll('g[data-layer-name] text').length
  })
  if (after !== before - 1) {
    throw new Error(`06: expected text count ${before - 1} after delete, got ${after}`)
  }

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()
  return { svg, pdf }
}
