// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { jsPDF } from 'jspdf'
import { pdfToSvg } from './pdfPipeline'

// Build a 200pt × 100pt PDF — using point units removes any ambiguity
// about jsPDF's mm interpretation. After pt→mm conversion in
// postProcessPdfSvg, the viewBox should be ~70.6mm × ~35.3mm.
const PDF_W_PT = 200
const PDF_H_PT = 100
const PT_TO_MM = 25.4 / 72

function makeTinyPdf(): Uint8Array {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [PDF_W_PT, PDF_H_PT] })
  pdf.text('Hello vectorfeld', 10, 30)
  return new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer)
}

describe('pdfToSvg', () => {
  let pdfBytes: Uint8Array

  beforeAll(() => {
    pdfBytes = makeTinyPdf()
  })

  it('returns an SVG string with a viewBox', async () => {
    const svg = await pdfToSvg(pdfBytes)
    expect(svg).toMatch(/<svg[\s\S]*viewBox=/)
  })

  it('viewBox is converted from PDF points to millimeters', async () => {
    const svg = await pdfToSvg(pdfBytes)
    const m = svg.match(/viewBox="([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)"/)
    expect(m).not.toBeNull()
    if (!m) return
    const width = parseFloat(m[3])
    const height = parseFloat(m[4])
    const expectedW = PDF_W_PT * PT_TO_MM // ~70.6
    const expectedH = PDF_H_PT * PT_TO_MM // ~35.3
    expect(width).toBeCloseTo(expectedW, 0)
    expect(height).toBeCloseTo(expectedH, 0)
  })

  it('strips title/desc/metadata noise', async () => {
    const svg = await pdfToSvg(pdfBytes)
    expect(svg).not.toMatch(/<title[^>]*>/i)
    expect(svg).not.toMatch(/<metadata[^>]*>/i)
  })
})
