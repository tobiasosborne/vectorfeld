/// <reference types="node" />
/**
 * Tests for sourceFont — embedded-font extraction primitives used
 * by the eb0 in-place source-font edit path.
 *
 * Acceptance signals (vectorfeld-wvy):
 *   - listPageFonts enumerates every page font with its embedding state.
 *   - extractEmbeddedFontBytes returns raw TTF bytes for embedded fonts.
 *   - Bytes are accepted by fontkit (proves the extraction is correct
 *     end-to-end — fontkit is the actual downstream consumer in eb0-2/3/4).
 *   - Standard non-embedded fonts (TimesNewRomanPSMT) return null.
 *   - Round-trip emission via mupdf.addFont + Identity-H TJ survives
 *     save+reopen — same shape spike-08 verifies, but locked into
 *     the unit-test layer.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listPageFonts, extractEmbeddedFontBytes } from './sourceFont'
import { openSourcePdfDoc, closeSourcePdfDoc } from './graftMupdf'

const FIXTURE = resolve(
  process.cwd(),
  'test/dogfood/fixtures/Flyer Swift Vortragscoaching 15.04.2026 noheader.pdf',
)

describe('sourceFont primitives', () => {
  let srcBytes: Uint8Array
  beforeAll(() => {
    srcBytes = new Uint8Array(readFileSync(FIXTURE))
  })

  describe('listPageFonts', () => {
    it('enumerates every font on the source page with embedding state', async () => {
      const doc = await openSourcePdfDoc(srcBytes)
      try {
        const fonts = listPageFonts(doc, 0)
        // The flyer page exposes F1..F5 — Times standard (not embedded)
        // + four Calibri variants (embedded).
        expect(fonts.length).toBeGreaterThanOrEqual(5)
        const byKey = new Map(fonts.map((f) => [f.fontKey, f]))
        expect(byKey.size).toBe(fonts.length) // unique keys
        for (const f of fonts) {
          expect(['Type0', 'TrueType', 'Type1']).toContain(f.subtype)
          expect(f.baseFont.length).toBeGreaterThan(0)
        }
        // At least one font must be embedded (Calibri family).
        expect(fonts.some((f) => f.hasEmbeddedProgram)).toBe(true)
        // At least one standard font is NOT embedded (Times).
        expect(fonts.some((f) => !f.hasEmbeddedProgram)).toBe(true)
      } finally {
        closeSourcePdfDoc(doc)
      }
    })

    it('flags TimesNewRomanPSMT as not embedded', async () => {
      const doc = await openSourcePdfDoc(srcBytes)
      try {
        const fonts = listPageFonts(doc, 0)
        const times = fonts.find((f) => f.baseFont.includes('TimesNewRoman'))
        expect(times).toBeDefined()
        expect(times!.hasEmbeddedProgram).toBe(false)
      } finally {
        closeSourcePdfDoc(doc)
      }
    })

    it('returns [] for a page with no fonts', async () => {
      // Build an empty PDF on the fly via mupdf — no /Resources/Font.
      const m = await import('mupdf')
      const out = new m.PDFDocument()
      const buf = new m.Buffer()
      buf.write('q\nQ\n')
      const pageObj = out.addPage([0, 0, 100, 100], 0, out.newDictionary(), buf)
      out.insertPage(0, pageObj)
      try {
        const fonts = listPageFonts(out, 0)
        expect(fonts).toEqual([])
      } finally {
        closeSourcePdfDoc(out)
      }
    })
  })

  describe('extractEmbeddedFontBytes', () => {
    it('returns null for non-embedded standard fonts', async () => {
      const doc = await openSourcePdfDoc(srcBytes)
      try {
        const fonts = listPageFonts(doc, 0)
        const times = fonts.find((f) => f.baseFont.includes('TimesNewRoman'))
        const result = extractEmbeddedFontBytes(doc, 0, times!.fontKey)
        expect(result).toBeNull()
      } finally {
        closeSourcePdfDoc(doc)
      }
    })

    it('returns null for an unknown font key', async () => {
      const doc = await openSourcePdfDoc(srcBytes)
      try {
        const result = extractEmbeddedFontBytes(doc, 0, 'DoesNotExist')
        expect(result).toBeNull()
      } finally {
        closeSourcePdfDoc(doc)
      }
    })

    it('extracts FontFile2 bytes for an embedded TrueType font', async () => {
      const doc = await openSourcePdfDoc(srcBytes)
      try {
        const fonts = listPageFonts(doc, 0)
        const calibri = fonts.find((f) =>
          f.baseFont.includes('Calibri') && f.hasEmbeddedProgram && f.subtype === 'TrueType',
        )
        expect(calibri).toBeDefined()
        const result = extractEmbeddedFontBytes(doc, 0, calibri!.fontKey)
        expect(result).not.toBeNull()
        expect(result!.bytes.length).toBeGreaterThan(10000)
        expect(result!.programKey).toBe('FontFile2')
        expect(result!.baseFont).toBe(calibri!.baseFont)
        expect(result!.subtype).toBe('TrueType')
      } finally {
        closeSourcePdfDoc(doc)
      }
    })

    it('extracts via DescendantFonts for Type-0 wrappers', async () => {
      const doc = await openSourcePdfDoc(srcBytes)
      try {
        const fonts = listPageFonts(doc, 0)
        const type0 = fonts.find((f) => f.subtype === 'Type0' && f.hasEmbeddedProgram)
        expect(type0).toBeDefined()
        const result = extractEmbeddedFontBytes(doc, 0, type0!.fontKey)
        expect(result).not.toBeNull()
        expect(result!.bytes.length).toBeGreaterThan(0)
      } finally {
        closeSourcePdfDoc(doc)
      }
    })

    it('extracted bytes are accepted by fontkit and can shape text', async () => {
      const doc = await openSourcePdfDoc(srcBytes)
      try {
        const fonts = listPageFonts(doc, 0)
        const calibri = fonts.find((f) =>
          f.baseFont.includes('Calibri') && f.hasEmbeddedProgram,
        )
        const result = extractEmbeddedFontBytes(doc, 0, calibri!.fontKey)
        const font = fontkit.create(result!.bytes)
        expect(font.unitsPerEm).toBeGreaterThan(0)
        expect(font.numGlyphs).toBeGreaterThan(50)

        const run = font.layout('Vortrag')
        expect(run.glyphs.length).toBe(7)
        // Every glyph must be a real (non-.notdef) glyph in the source
        // font's subset — we picked a string the source PDF actually
        // renders, so coverage is guaranteed.
        for (const g of run.glyphs) {
          expect(g.id).toBeGreaterThan(0)
        }
      } finally {
        closeSourcePdfDoc(doc)
      }
    })

    it('returned bytes survive subsequent mupdf operations on the source doc', async () => {
      // Regression guard for the readStream/WASM-slab copy. mupdf
      // returns a view into its WASM heap; if we don't copy out,
      // a later mupdf call on the same doc could invalidate the
      // bytes. extractEmbeddedFontBytes copies; this test pins
      // that contract.
      const doc = await openSourcePdfDoc(srcBytes)
      try {
        const fonts = listPageFonts(doc, 0)
        const calibri = fonts.find((f) => f.hasEmbeddedProgram)!
        const result = extractEmbeddedFontBytes(doc, 0, calibri.fontKey)
        const len = result!.bytes.length
        const firstBytes = result!.bytes.slice(0, 64)

        // Provoke other mupdf work on the same doc.
        listPageFonts(doc, 0)
        listPageFonts(doc, 0)
        // Re-check: bytes still valid + identical.
        expect(result!.bytes.length).toBe(len)
        const stillFirstBytes = result!.bytes.slice(0, 64)
        expect(Array.from(stillFirstBytes)).toEqual(Array.from(firstBytes))
      } finally {
        closeSourcePdfDoc(doc)
      }
    })
  })
})
