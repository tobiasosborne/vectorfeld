/**
 * SVG → PDF → SVG round-trip integration tests.
 *
 * These tests drive the fix for vectorfeld-9s9: the export pipeline must
 * preserve text content and approximate position so the round-trip is
 * lossless. Failing tests here are red → fix the export engine → green.
 *
 * Synthetic SVG fixtures (rather than real PDFs) keep the test focused on
 * the export side. The MuPDF import side is covered by pdfPipeline tests
 * and by vectorfeld-cd2's own harness in the next session.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { exportSvgStringToPdfBytes } from '../../src/model/fileio'
import { pdfToSvg } from './helpers/pdfPipeline'
import { extractPdfTextItems } from './helpers/pdfText'

const SIMPLE_TEXT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
  <g data-layer-name="Layer 1">
    <text x="10" y="20" font-family="Helvetica" font-size="6">Hello, vectorfeld</text>
  </g>
</svg>`

const TWO_LINES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
  <g data-layer-name="Layer 1">
    <text x="10" y="15" font-family="Helvetica" font-size="6">First line</text>
    <text x="10" y="30" font-family="Helvetica" font-size="6">Second line</text>
  </g>
</svg>`

describe('SVG → PDF → SVG round-trip', () => {
  let pdfBytes: Uint8Array
  let reimported: string

  describe('with one-line Helvetica text', () => {
    beforeAll(async () => {
      pdfBytes = await exportSvgStringToPdfBytes(SIMPLE_TEXT_SVG)
      reimported = await pdfToSvg(pdfBytes)
    })

    it('produces a valid PDF (PDF magic bytes)', () => {
      expect(pdfBytes.length).toBeGreaterThan(0)
      expect(String.fromCharCode(...pdfBytes.slice(0, 4))).toBe('%PDF')
    })

    it('text content survives the round-trip', () => {
      expect(reimported).toContain('Hello, vectorfeld')
    })

    it('a <text> element is preserved (not outlined to <path>)', () => {
      expect(reimported).toMatch(/<text[\s>]/i)
    })
  })

  describe('with two text lines', () => {
    beforeAll(async () => {
      pdfBytes = await exportSvgStringToPdfBytes(TWO_LINES_SVG)
      reimported = await pdfToSvg(pdfBytes)
    })

    it('both lines survive the round-trip', () => {
      expect(reimported).toContain('First line')
      expect(reimported).toContain('Second line')
    })

    it('preserves vertical ordering of the two lines', () => {
      const firstIdx = reimported.indexOf('First line')
      const secondIdx = reimported.indexOf('Second line')
      expect(firstIdx).toBeGreaterThan(0)
      expect(secondIdx).toBeGreaterThan(firstIdx)
    })
  })

  describe('with a stroked path', () => {
    const PATH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <g data-layer-name="Layer 1">
        <path d="M 10,10 L 50,40 L 50,10 Z" stroke="#000000" fill="none" stroke-width="0.5"/>
      </g>
    </svg>`

    beforeAll(async () => {
      pdfBytes = await exportSvgStringToPdfBytes(PATH_SVG)
      reimported = await pdfToSvg(pdfBytes)
    })

    it('a path element survives the round-trip', () => {
      expect(reimported).toMatch(/<path[\s>]/i)
    })
  })

  describe('with a rect', () => {
    const RECT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <g data-layer-name="Layer 1">
        <rect x="10" y="10" width="40" height="20" fill="#aabbcc"/>
      </g>
    </svg>`

    beforeAll(async () => {
      pdfBytes = await exportSvgStringToPdfBytes(RECT_SVG)
      reimported = await pdfToSvg(pdfBytes)
    })

    it('the rect renders (as <path> from MuPDF) and survives', () => {
      expect(reimported).toMatch(/<path[\s>]/i)
    })
  })

  describe('with a line', () => {
    const LINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <g data-layer-name="Layer 1">
        <line x1="10" y1="10" x2="50" y2="40" stroke="#000000" stroke-width="0.5"/>
      </g>
    </svg>`

    beforeAll(async () => {
      pdfBytes = await exportSvgStringToPdfBytes(LINE_SVG)
      reimported = await pdfToSvg(pdfBytes)
    })

    it('renders something path-like and survives', () => {
      expect(reimported).toMatch(/<path[\s>]/i)
    })
  })

  describe('with an ellipse', () => {
    const ELLIPSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <g data-layer-name="Layer 1">
        <ellipse cx="50" cy="25" rx="20" ry="10" fill="#abcdef"/>
      </g>
    </svg>`

    beforeAll(async () => {
      pdfBytes = await exportSvgStringToPdfBytes(ELLIPSE_SVG)
      reimported = await pdfToSvg(pdfBytes)
    })

    it('renders something path-like and survives', () => {
      expect(reimported).toMatch(/<path[\s>]/i)
    })
  })

  describe('with a circle', () => {
    const CIRCLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <g data-layer-name="Layer 1">
        <circle cx="50" cy="25" r="10" fill="#fedcba"/>
      </g>
    </svg>`

    beforeAll(async () => {
      pdfBytes = await exportSvgStringToPdfBytes(CIRCLE_SVG)
      reimported = await pdfToSvg(pdfBytes)
    })

    it('renders something path-like and survives', () => {
      expect(reimported).toMatch(/<path[\s>]/i)
    })
  })

  describe('with a translated <g>', () => {
    const G_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <g data-layer-name="Layer 1">
        <g transform="translate(20, 5)">
          <text x="10" y="15" font-family="Helvetica" font-size="6">Inside group</text>
        </g>
      </g>
    </svg>`

    beforeAll(async () => {
      pdfBytes = await exportSvgStringToPdfBytes(G_SVG)
      reimported = await pdfToSvg(pdfBytes)
    })

    it('text inside a translated group survives the round-trip', () => {
      expect(reimported).toContain('Inside group')
    })

    it('transform attribute on a LEAF element (not just on <g>) is applied', async () => {
      // MuPDF's flatten step puts transform="scale(pt→mm)" directly on each
      // text/path/image rather than wrapping them in a group. The walker must
      // apply transforms on leaves too, otherwise every imported PDF renders
      // at ~3× scale at wrong positions.
      const noT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
        <g data-layer-name="L1">
          <text x="20" y="20" font-family="Helvetica" font-size="6">Marker</text>
        </g>
      </svg>`
      const leafT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
        <g data-layer-name="L1">
          <text x="40" y="40" font-family="Helvetica" font-size="12" transform="scale(0.5)">Marker</text>
        </g>
      </svg>`
      // scale(0.5) should map (40,40) → (20,20) and font-size 12 → 6.
      // So leafT should render the marker at the same effective position
      // and size as noT.
      const aBytes = await exportSvgStringToPdfBytes(noT)
      const bBytes = await exportSvgStringToPdfBytes(leafT)
      const aItems = await extractPdfTextItems(aBytes)
      const bItems = await extractPdfTextItems(bBytes)
      const aMarker = aItems.find((it) => it.str.includes('Marker'))
      const bMarker = bItems.find((it) => it.str.includes('Marker'))
      expect(aMarker).toBeDefined()
      expect(bMarker).toBeDefined()
      if (!aMarker || !bMarker) return
      expect(bMarker.x).toBeCloseTo(aMarker.x, 0)
      expect(bMarker.y).toBeCloseTo(aMarker.y, 0)
    })

    it('translate(dx, dy) actually shifts text x position by dx', async () => {
      // Same text, with vs without an enclosing translate(30, 0). Inspect
      // PDF text positions via pdfjs-dist; the translated case should sit
      // 30mm further right (= 30 * 72/25.4 ≈ 85 pt further in PDF coords).
      const noT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
        <g data-layer-name="Layer 1">
          <text x="10" y="20" font-family="Helvetica" font-size="6">Marker</text>
        </g>
      </svg>`
      const withT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
        <g data-layer-name="Layer 1">
          <g transform="translate(30, 0)">
            <text x="10" y="20" font-family="Helvetica" font-size="6">Marker</text>
          </g>
        </g>
      </svg>`
      const aBytes = await exportSvgStringToPdfBytes(noT)
      const bBytes = await exportSvgStringToPdfBytes(withT)
      const aItems = await extractPdfTextItems(aBytes)
      const bItems = await extractPdfTextItems(bBytes)
      const aMarker = aItems.find((it) => it.str.includes('Marker'))
      const bMarker = bItems.find((it) => it.str.includes('Marker'))
      expect(aMarker).toBeDefined()
      expect(bMarker).toBeDefined()
      if (!aMarker || !bMarker) return
      const dxPt = bMarker.x - aMarker.x
      const expectedPt = 30 * (72 / 25.4) // 30mm in pt
      expect(dxPt).toBeCloseTo(expectedPt, 0)
    })
  })

  describe('with text positioned via <tspan> children (MuPDF emission style)', () => {
    // MuPDF's text=text mode emits text as <text transform=...><tspan x=... y=...>...</tspan></text>
    // with the position on the tspan, NOT on the text element. Without tspan-aware
    // drawing the entire imported PDF collapses every text to (0, 0) which renders
    // at the wrong place after the parent's transform composition.

    it('uses the tspan x/y when the text element has no direct x/y', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
        <g data-layer-name="L1">
          <text font-family="Helvetica" font-size="6"><tspan x="20" y="10">Marker</tspan></text>
        </g>
      </svg>`
      const bytes = await exportSvgStringToPdfBytes(svg)
      const items = await extractPdfTextItems(bytes)
      const marker = items.find((it) => it.str.includes('Marker'))
      expect(marker).toBeDefined()
      if (!marker) return
      // tspan at (20mm, 10mm) → x=20mm→56.7pt, y=pageHeight-10mm→pageHeight-28.3pt
      expect(marker.x).toBeCloseTo(20 * (72 / 25.4), 0)
    })

    it('reproduces MuPDF emission post-flatten: scale + translate + tspan negative y', async () => {
      // Full MuPDF pipeline: viewBox in mm, content transform is
      // scale(pt→mm) ∘ translate(Y by pageHeight_pt). The pt→mm scale comes
      // from flattenAndScalePdfLayer; the matrix is what MuPDF emits to
      // reposition glyphs from PDF (Y-up) to SVG (Y-down) coords.
      const PT_TO_MM = 25.4 / 72
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(595.32 * PT_TO_MM).toFixed(2)} ${(841.92 * PT_TO_MM).toFixed(2)}">
        <g data-layer-name="L1">
          <text transform="scale(${PT_TO_MM}) matrix(1 0 -0 1 0 841.92)" font-size="12" font-family="Helvetica">
            <tspan x="100" y="-800">Heading</tspan>
          </text>
        </g>
      </svg>`
      const bytes = await exportSvgStringToPdfBytes(svg)
      const items = await extractPdfTextItems(bytes)
      const h = items.find((it) => it.str.includes('Heading'))
      expect(h).toBeDefined()
      if (!h) return
      // tspan(100, -800) → matrix → (100, 41.92) → scale(0.353) → (35.3, 14.8) mm
      // → PDF pt: (100, pageHeight_pt - 41.92) = (100, ~800)
      expect(h.x).toBeCloseTo(100, 0)
      expect(h.y).toBeCloseTo(800, 0)
    })

    it('renders multiple tspans inside one text element', async () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50">
        <g data-layer-name="L1">
          <text font-family="Helvetica" font-size="6">
            <tspan x="10" y="20">Alpha</tspan>
            <tspan x="60" y="30">Beta</tspan>
          </text>
        </g>
      </svg>`
      const bytes = await exportSvgStringToPdfBytes(svg)
      const items = await extractPdfTextItems(bytes)
      const a = items.find((it) => it.str.includes('Alpha'))
      const b = items.find((it) => it.str.includes('Beta'))
      expect(a).toBeDefined()
      expect(b).toBeDefined()
      if (!a || !b) return
      // Both tspans should appear at distinct positions.
      expect(b.x).toBeGreaterThan(a.x)
    })
  })

  describe('with non-WinAnsi characters in text (vectorfeld-ape)', () => {
    // The noheader flyer uses U+25CA (◊) as a bullet glyph. Helvetica's WinAnsi
    // encoding cannot represent it, so naïve drawText throws and the entire
    // export fails. The fix substitutes/drops unencodable chars per element so
    // the rest of the document still ships.
    const DIAMOND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <g data-layer-name="Layer 1">
        <text x="10" y="20" font-family="Helvetica" font-size="6">◊ Bullet point</text>
      </g>
    </svg>`

    it('does not throw when text contains non-WinAnsi characters', async () => {
      await expect(exportSvgStringToPdfBytes(DIAMOND_SVG)).resolves.toBeInstanceOf(Uint8Array)
    })

    it('preserves the encodable parts of the text in the PDF', async () => {
      const bytes = await exportSvgStringToPdfBytes(DIAMOND_SVG)
      const items = await extractPdfTextItems(bytes)
      const all = items.map((it) => it.str).join(' ')
      expect(all).toContain('Bullet point')
    })
  })

  describe('with an embedded raster image', () => {
    // Tiny 2x2 red PNG (data URL).
    const TINY_PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGElEQVR4nGP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
    const IMG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
      <g data-layer-name="Layer 1">
        <image x="10" y="10" width="30" height="20" href="${TINY_PNG}"/>
      </g>
    </svg>`

    beforeAll(async () => {
      pdfBytes = await exportSvgStringToPdfBytes(IMG_SVG)
      reimported = await pdfToSvg(pdfBytes)
    })

    it('the image survives the round-trip', () => {
      expect(reimported).toMatch(/<image[\s>]/i)
    })
  })
})
