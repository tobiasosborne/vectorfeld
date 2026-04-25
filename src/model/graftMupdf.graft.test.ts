/**
 * Tests for graftSourcePageInto — the byte-level page clone primitive
 * the graft engine wraps around `mupdf.PDFDocument.graftPage`.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  openSourcePdfDoc,
  closeSourcePdfDoc,
  createEmptyPdfDoc,
  graftSourcePageInto,
} from './graftMupdf'
import { exportSvgStringToPdfBytes } from './fileio'

const SVG_A = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
  <g data-layer-name="Layer 1">
    <text x="5" y="10" font-family="Helvetica" font-size="6">PAGE-A</text>
  </g>
</svg>`

const SVG_B = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 30">
  <g data-layer-name="Layer 1">
    <text x="5" y="10" font-family="Helvetica" font-size="6">PAGE-B</text>
  </g>
</svg>`

describe('graftSourcePageInto', () => {
  let bytesA: Uint8Array
  let bytesB: Uint8Array

  beforeAll(async () => {
    bytesA = await exportSvgStringToPdfBytes(SVG_A)
    bytesB = await exportSvgStringToPdfBytes(SVG_B)
  })

  it('appends a single grafted page onto an empty target', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(bytesA)
    expect(out.countPages()).toBe(0)
    expect(src.countPages()).toBe(1)
    graftSourcePageInto(out, src, 0)
    expect(out.countPages()).toBe(1)
    closeSourcePdfDoc(src)
    closeSourcePdfDoc(out)
  })

  it('grafts pages from two different source docs onto the same target in order', async () => {
    const out = await createEmptyPdfDoc()
    const a = await openSourcePdfDoc(bytesA)
    const b = await openSourcePdfDoc(bytesB)
    graftSourcePageInto(out, a, 0)
    graftSourcePageInto(out, b, 0)
    expect(out.countPages()).toBe(2)
    closeSourcePdfDoc(a)
    closeSourcePdfDoc(b)
    closeSourcePdfDoc(out)
  })

  it('does not mutate the source document (page count unchanged)', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(bytesA)
    const before = src.countPages()
    graftSourcePageInto(out, src, 0)
    expect(src.countPages()).toBe(before)
    closeSourcePdfDoc(src)
    closeSourcePdfDoc(out)
  })
})
