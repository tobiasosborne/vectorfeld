import { describe, it, expect, beforeAll } from 'vitest'
import { openSourcePdfDoc, closeSourcePdfDoc, createEmptyPdfDoc } from './graftMupdf'
import { exportSvgStringToPdfBytes } from './fileio'

const TINY_PDF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30">
  <g data-layer-name="Layer 1">
    <rect x="5" y="5" width="10" height="10" fill="#ff0000" />
  </g>
</svg>`

describe('graftMupdf — opening source PDFs', () => {
  let bytes: Uint8Array

  beforeAll(async () => {
    bytes = await exportSvgStringToPdfBytes(TINY_PDF_SVG)
  })

  it('openSourcePdfDoc returns a PDFDocument with countPages > 0', async () => {
    const doc = await openSourcePdfDoc(bytes)
    expect(doc.countPages()).toBeGreaterThan(0)
    closeSourcePdfDoc(doc)
  })

  it('createEmptyPdfDoc returns a fresh PDFDocument with no pages', async () => {
    const doc = await createEmptyPdfDoc()
    expect(doc.countPages()).toBe(0)
    closeSourcePdfDoc(doc)
  })

  it('closeSourcePdfDoc on an open doc does not throw', async () => {
    const doc = await openSourcePdfDoc(bytes)
    expect(() => closeSourcePdfDoc(doc)).not.toThrow()
  })
})
