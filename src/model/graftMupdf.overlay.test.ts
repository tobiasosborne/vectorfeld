/// <reference types="node" />
/**
 * Tests for appendContentStream + registerOverlayFont — the two mupdf-side
 * primitives the graft engine uses to lay overlay content + new fonts on top
 * of grafted source pages without disturbing the source bytes.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  openSourcePdfDoc,
  closeSourcePdfDoc,
  createEmptyPdfDoc,
  graftSourcePageInto,
  appendContentStream,
  registerOverlayFont,
} from './graftMupdf'
import { exportSvgStringToPdfBytes } from './fileio'

// pdf-lib emits PDFs whose pages already have /Contents as an array, so
// the "single-ref" path of appendContentStream isn't exercised by our
// fixtures. Force-unwrap to expose the single-ref precondition that real
// PDFs (verified in spike-02 against the flyer fixture) commonly have.
function forceSingleContents(out: import('mupdf').PDFDocument, pageIdx: number): void {
  const page = out.findPage(pageIdx)
  const contents = page.get('Contents').resolve()
  if (contents.isArray()) {
    page.put('Contents', contents.get(0))
  }
}

// Shape-only SVG: produces a PDF whose grafted page has /Contents but
// importantly NO /Resources/Font dict (no text → pdf-lib doesn't embed any
// font). Lets us exercise the "create /Font dict if absent" path.
const SHAPES_ONLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30">
  <g data-layer-name="Layer 1">
    <rect x="5" y="5" width="10" height="10" fill="#ff0000" />
  </g>
</svg>`

// Text SVG: produces a PDF whose grafted page DOES have /Resources/Font.
const TEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30">
  <g data-layer-name="Layer 1">
    <text x="5" y="10" font-family="Helvetica" font-size="6">HELLO</text>
  </g>
</svg>`

const CARLITO_PATH = resolve(process.cwd(), 'src/fonts/Carlito-Regular.ttf')

describe('appendContentStream', () => {
  let shapesBytes: Uint8Array

  beforeAll(async () => {
    shapesBytes = await exportSvgStringToPdfBytes(SHAPES_ONLY_SVG)
  })

  it('wraps a single /Contents ref into an array on first append', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)
    forceSingleContents(out, 0)

    const page = out.findPage(0)
    expect(page.get('Contents').resolve().isArray()).toBe(false)

    await appendContentStream(out, 0, 'q\n1 0 0 rg\n0 0 10 10 re\nf\nQ\n')

    const contentsAfter = page.get('Contents').resolve()
    expect(contentsAfter.isArray()).toBe(true)
    expect(contentsAfter.length).toBe(2) // original (now wrapped) + appended
    closeSourcePdfDoc(out)
  })

  it('pushes onto an existing /Contents array (length grows by 1 per call)', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    const before = out.findPage(0).get('Contents').resolve()
    const baseLen = before.isArray() ? before.length : 1

    await appendContentStream(out, 0, 'q\nQ\n')
    await appendContentStream(out, 0, 'q\nQ\n')
    await appendContentStream(out, 0, 'q\nQ\n')

    const contents = out.findPage(0).get('Contents').resolve()
    expect(contents.isArray()).toBe(true)
    expect(contents.length).toBe(baseLen + 3)
    closeSourcePdfDoc(out)
  })

  it('survives a save/reload roundtrip (op-string bytes present in saved PDF)', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    // Recognisable marker — won't appear in the shape-only page's content.
    const marker = 'q\n0.123 0.456 0.789 rg\nQ\n'
    await appendContentStream(out, 0, marker)

    const savedBytes = out.saveToBuffer('compress=no').asUint8Array()
    closeSourcePdfDoc(out)

    // Uncompressed PDFs keep content streams as ASCII bytes — the marker
    // shows up verbatim in the saved file.
    const text = new TextDecoder('latin1').decode(savedBytes)
    expect(text).toContain('0.123 0.456 0.789 rg')

    const reloaded = await openSourcePdfDoc(savedBytes)
    const contents = reloaded.findPage(0).get('Contents').resolve()
    expect(contents.isArray()).toBe(true)
    expect(contents.length).toBeGreaterThanOrEqual(2)
    closeSourcePdfDoc(reloaded)
  })

  it('appends in document order (older content draws first; overlay draws last)', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    const before = out.findPage(0).get('Contents').resolve()
    const baseLen = before.isArray() ? before.length : 1

    const a = 'q\n0.111 0.111 0.111 rg\nQ\n'
    const b = 'q\n0.222 0.222 0.222 rg\nQ\n'
    await appendContentStream(out, 0, a)
    await appendContentStream(out, 0, b)

    const text = new TextDecoder('latin1').decode(out.saveToBuffer('compress=no').asUint8Array())
    closeSourcePdfDoc(out)

    const idxA = text.indexOf('0.111 0.111 0.111 rg')
    const idxB = text.indexOf('0.222 0.222 0.222 rg')
    expect(idxA).toBeGreaterThan(0)
    expect(idxB).toBeGreaterThan(idxA)
    expect(baseLen).toBeGreaterThan(0) // sanity for sanity-check var
  })
})

describe('registerOverlayFont', () => {
  let shapesBytes: Uint8Array
  let textBytes: Uint8Array
  let carlito: Uint8Array

  beforeAll(async () => {
    shapesBytes = await exportSvgStringToPdfBytes(SHAPES_ONLY_SVG)
    textBytes = await exportSvgStringToPdfBytes(TEXT_SVG)
    carlito = new Uint8Array(readFileSync(CARLITO_PATH))
  })

  it('creates /Resources/Font dict on a grafted page that had none, and registers the key', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    await registerOverlayFont(out, 0, 'VfCarlito', carlito)

    const resources = out.findPage(0).get('Resources').resolve()
    expect(resources.isDictionary()).toBe(true)
    const fontsDict = resources.get('Font')
    expect(fontsDict.isDictionary()).toBe(true)
    const fontRef = fontsDict.get('VfCarlito')
    expect(fontRef.isIndirect()).toBe(true)
    expect(fontRef.asIndirect()).toBeGreaterThan(0)

    closeSourcePdfDoc(out)
  })

  it('adds a new font alongside existing entries on a page with /Resources/Font already populated', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(textBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    const fontsBefore = out.findPage(0).get('Resources').resolve().get('Font')
    expect(fontsBefore.isDictionary()).toBe(true)

    // Count entries before.
    let beforeCount = 0
    fontsBefore.forEach(() => { beforeCount += 1 })
    expect(beforeCount).toBeGreaterThan(0)

    await registerOverlayFont(out, 0, 'VfCarlito', carlito)

    const fontsAfter = out.findPage(0).get('Resources').resolve().get('Font')
    let afterCount = 0
    fontsAfter.forEach(() => { afterCount += 1 })
    expect(afterCount).toBe(beforeCount + 1)
    expect(fontsAfter.get('VfCarlito').isIndirect()).toBe(true)

    closeSourcePdfDoc(out)
  })

  it('the registered font is referenceable from a content stream that uses /VfCarlito (no exception on save)', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    await registerOverlayFont(out, 0, 'VfCarlito', carlito)
    await appendContentStream(out, 0, 'q\nBT\n/VfCarlito 12 Tf\n50 50 Td\n0 0 0 rg\n(hi) Tj\nET\nQ\n')

    expect(() => out.saveToBuffer('compress=no')).not.toThrow()
    closeSourcePdfDoc(out)
  })

  it('survives save/reload (font key still registered on page Resources)', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(shapesBytes)
    graftSourcePageInto(out, src, 0)
    closeSourcePdfDoc(src)

    await registerOverlayFont(out, 0, 'VfCarlito', carlito)
    const saved = out.saveToBuffer('compress=no').asUint8Array()
    closeSourcePdfDoc(out)

    const reloaded = await openSourcePdfDoc(saved)
    const fontsDict = reloaded.findPage(0).get('Resources').resolve().get('Font')
    expect(fontsDict.isDictionary()).toBe(true)
    expect(fontsDict.get('VfCarlito').isIndirect()).toBe(true)
    closeSourcePdfDoc(reloaded)
  })
})
