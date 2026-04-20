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
