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
//
// Defense in depth (vectorfeld-enf): the byte-match alone won't catch
// regressions where the deleted text is still present in the PDF's
// text stream but the canonicalized JSON happens to align. Story
// also asserts the deleted string is absent from pdfjs.getTextContent
// — the same reader the canonicalizer uses, but a direct check lets
// the failure name the cause ("deleted text still searchable") rather
// than presenting as a generic byte diff.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

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

  // Remove the headline text element directly. Returns its content
  // so the post-export check can assert that exact string is gone
  // from the PDF (defense-in-depth beyond byte-match).
  const before = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
    return texts.length
  })
  const deletedText = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('g[data-layer-name] text'))
    let best = null
    let bestSize = 0
    for (const t of texts) {
      const size = parseFloat(t.getAttribute('font-size') || '0')
      if ((t.textContent || '').length >= 6 && size > bestSize) {
        best = t; bestSize = size
      }
    }
    if (!best) return null
    const content = best.textContent || ''
    best.remove()
    return content
  })
  if (!deletedText) throw new Error('06: no headline text element found to remove')
  const after = await page.evaluate(() => {
    return document.querySelectorAll('g[data-layer-name] text').length
  })
  if (after !== before - 1) {
    throw new Error(`06: expected text count ${before - 1} after delete, got ${after}`)
  }

  const svg = await h.captureExportSvg()
  const pdf = await h.captureExportPdf()

  // Assert the deleted text is absent from pdfjs text-extract.
  // Catches regressions where the redaction silently breaks and the
  // deleted text remains searchable / extractable / accessible.
  //
  // Probe: full deletedText with whitespace stripped — robust against
  // pdfjs joining text items with extra spaces, AND specific enough
  // not to false-match another text element that happens to share
  // a short prefix (e.g. the headline starts with "Kurz" but the
  // body has the unrelated word "kurzfristige").
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }).promise
  try {
    const p = await doc.getPage(1)
    const tc = await p.getTextContent()
    const joined = tc.items.map((it) => it.str || '').join('').replace(/\s+/g, '').toLowerCase()
    const needle = deletedText.replace(/\s+/g, '').toLowerCase()
    if (needle.length >= 8 && joined.includes(needle)) {
      throw new Error(
        `06: deleted text "${deletedText.slice(0, 30)}…" still present in pdfjs.getTextContent — vectorfeld-enf regression`,
      )
    }
  } finally {
    await doc.destroy()
  }

  return { svg, pdf }
}
