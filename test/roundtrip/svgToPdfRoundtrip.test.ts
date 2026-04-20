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
})
