// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { jsPDF } from 'jspdf'
import { extractPdfText, extractPdfTextItems } from './pdfText'

/**
 * Build a tiny known-content PDF so the helper tests don't depend on
 * a committed fixture. extractPdfText / extractPdfTextItems are
 * test-only, but they're a load-bearing assertion target for
 * vectorfeld-enf — if these silently regress, the gate's defense
 * against "deleted text still searchable" goes down with them.
 */
const NEEDLE = 'VECTORFELD'

function makeTinyPdf(): Uint8Array {
  // A4 portrait so the default-font needle fits with margin to spare.
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.setFontSize(12)
  pdf.text(NEEDLE, 20, 50)
  return new Uint8Array(pdf.output('arraybuffer') as unknown as ArrayBuffer)
}

describe('extractPdfText', () => {
  let pdfBytes: Uint8Array

  beforeAll(() => {
    pdfBytes = makeTinyPdf()
  })

  it('returns the joined text content of the requested page', async () => {
    const text = await extractPdfText(pdfBytes, 1)
    expect(text).toContain(NEEDLE)
  })

  it('matches the joined extractPdfTextItems output', async () => {
    const items = await extractPdfTextItems(pdfBytes, 1)
    const joined = items.map((it) => it.str).join('')
    const direct = await extractPdfText(pdfBytes, 1)
    expect(direct).toBe(joined)
  })

  it('returns "" for a page with no text (catches false-positive absence)', async () => {
    // A blank-page PDF: jsPDF page with no calls.
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const blankBytes = new Uint8Array(pdf.output('arraybuffer') as unknown as ArrayBuffer)
    const text = await extractPdfText(blankBytes, 1)
    expect(text).toBe('')
  })
})
