// Story 10: Import a PDF, recolor the headline text element, export.
//
// MuPDF wraps each imported text run in a `<g>` container; the
// SelectTool's hit-test only returns layer-direct children, so a click
// on the headline selects the wrapper, not the text inside (and the
// PropertiesPanel's fill picker only mounts when the SELECTED element
// has a solid-fill attribute). Until group-drill-in lands, this gate
// mutates the DOM directly via page.evaluate — the gate's purpose is
// byte-match invariance on export, which only depends on the FINAL DOM
// state. Once a window-exposed selection hook lands the story can
// switch to click + h.setFill().
//
// Likely affected by the graft engine swap (vectorfeld-u7r) — the
// master will need re-recording when that lands. Until then this gate
// locks the pdf-lib path's recolouring behaviour.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(here, '..', '..', 'dogfood', 'fixtures', 'Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf')

export const name = '10-pdf-text-recolor'

export async function run(page, h) {
  if (!existsSync(FIXTURE)) {
    throw new Error(`fixture missing: ${FIXTURE}`)
  }
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

  // Recolor the headline text element directly. Verifies the change
  // landed before capturing exports.
  const result = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
    let best = null
    let bestSize = 0
    for (const t of texts) {
      const size = parseFloat(t.getAttribute('font-size') || '0')
      if ((t.textContent || '').length >= 6 && size > bestSize) {
        best = t; bestSize = size
      }
    }
    if (!best) return { ok: false }
    best.setAttribute('fill', '#ff0000')
    return { ok: true, fontSize: bestSize, fillNow: best.getAttribute('fill') }
  })
  if (!result.ok) throw new Error('10: no headline text element found to recolor')
  if (result.fillNow !== '#ff0000') throw new Error(`10: fill set failed, got ${result.fillNow}`)

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()

  // Defense-in-depth (vectorfeld-eb0): the recolored text must
  // emit in the source font (Calibri-Bold), not Carlito. Open
  // via mupdf and walk per-char fonts; the recolored portion of
  // the headline ('urzfristige Hilfe bei englischen Vorträgen' —
  // MuPDF's text extractor splits the headline; story recolors the
  // longest run, which excludes the leading "K") must come from a
  // font whose name contains 'Calibri-Bold' (the source font),
  // NOT 'Carlito' (the overlay fallback). A regression to Carlito
  // means eb0-4 broke and the visible seam reopens.
  const mupdfMod = await import('mupdf')
  const mupdf = mupdfMod.default || mupdfMod
  const recolored = 'urzfristige Hilfe bei englischen Vorträgen'
  const reloaded = new mupdf.PDFDocument(new Uint8Array(pdf))
  const stext = reloaded.loadPage(0).toStructuredText('preserve-spans')
  const fontUsage = new Map()
  stext.walk({
    onChar(c, _o, font) {
      const name = font.getName()
      if (!fontUsage.has(name)) fontUsage.set(name, '')
      fontUsage.set(name, fontUsage.get(name) + c)
    },
  })
  let owningFont = null
  for (const [name, content] of fontUsage) {
    if (content.includes(recolored)) { owningFont = name; break }
  }
  if (!owningFont) {
    throw new Error('10: recolored heading not found in any per-font extraction (text may have moved)')
  }
  if (!/Calibri/i.test(owningFont)) {
    throw new Error(
      `10: recolored heading rendered via "${owningFont}" — expected Calibri-* (source font). ` +
      `vectorfeld-eb0 routing regression suspected.`,
    )
  }
  reloaded.destroy()

  return { svg, pdf }
}
