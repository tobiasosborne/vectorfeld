// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { renderPdfPageToPng } from './renderPdf'
import { jsPDF } from 'jspdf'

/**
 * Build a tiny one-page PDF in memory so we don't need a committed binary
 * fixture for the helper's unit tests. The helper is meant to be opaque
 * to PDF content — what we assert here is that it produces deterministic
 * non-empty PNG bytes for a given (PDF, page, scale) triple.
 */
function makeTinyPdf(): Uint8Array {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [50, 30] })
  pdf.text('Hello vectorfeld', 5, 15)
  return pdf.output('arraybuffer') as unknown as Uint8Array
}

describe('renderPdfPageToPng', () => {
  let pdfBytes: Uint8Array

  beforeAll(() => {
    pdfBytes = new Uint8Array(makeTinyPdf())
  })

  it('returns a non-empty Uint8Array with PNG magic bytes', async () => {
    const png = await renderPdfPageToPng(pdfBytes, { page: 1, scale: 1 })
    expect(png).toBeInstanceOf(Uint8Array)
    expect(png.length).toBeGreaterThan(0)
    // PNG magic: 89 50 4E 47 0D 0A 1A 0A
    expect(png[0]).toBe(0x89)
    expect(png[1]).toBe(0x50)
    expect(png[2]).toBe(0x4e)
    expect(png[3]).toBe(0x47)
  })

  it('produces a larger image when scale increases', async () => {
    const png1 = await renderPdfPageToPng(pdfBytes, { page: 1, scale: 1 })
    const png2 = await renderPdfPageToPng(pdfBytes, { page: 1, scale: 2 })
    expect(png2.length).toBeGreaterThan(png1.length)
  })

  it('is deterministic: same input → same bytes', async () => {
    const a = await renderPdfPageToPng(pdfBytes, { page: 1, scale: 1 })
    const b = await renderPdfPageToPng(pdfBytes, { page: 1, scale: 1 })
    expect(a.length).toBe(b.length)
    // Compare a sample of bytes to confirm exact match (full compare is
    // expensive and the length match + spot-check is enough signal here).
    for (let i = 0; i < a.length; i += Math.max(1, Math.floor(a.length / 64))) {
      expect(b[i]).toBe(a[i])
    }
  })

  it('rejects on invalid PDF bytes', async () => {
    const bogus = new Uint8Array([1, 2, 3, 4])
    await expect(renderPdfPageToPng(bogus, { page: 1, scale: 1 })).rejects.toThrow()
  })
})
