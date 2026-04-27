/// <reference types="node" />
/**
 * Tests for graftShape — the fontkit-based shaping helper that bridges
 * a unicode string to a GID + position stream suitable for Identity-H
 * TJ emission.
 *
 * Acceptance signals (from vectorfeld-of4):
 *   (a) single-char no-shaping case: advance equals font metric.
 *   (b) ligature substitution: 'office' produces at least one glyph
 *       whose codePoints array has length ≥ 2 (Carlito ships fi/ffi
 *       in its liga set).
 *   (c) GPOS kerning: 'Ta' produces a second glyph whose
 *       position.xAdvance differs from glyph.advanceWidth.
 *   (d) liga=false disables ligatures: 'office' becomes 6 single-CP
 *       glyphs instead of one with codePoints.length ≥ 2.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadFontkit, shape } from './graftShape'

const CARLITO_PATH = resolve(process.cwd(), 'src/fonts/Carlito-Regular.ttf')

describe('graftShape', () => {
  let carlito: ReturnType<typeof loadFontkit>

  beforeAll(() => {
    carlito = loadFontkit(new Uint8Array(readFileSync(CARLITO_PATH)))
  })

  it('loads a fontkit Font with non-zero unitsPerEm and at least one glyph', () => {
    expect(carlito.unitsPerEm).toBeGreaterThan(0)
    expect(carlito.numGlyphs).toBeGreaterThan(100)
  })

  it('(a) single-char no-shaping: advance equals the glyph metric', () => {
    const run = shape('H', carlito)
    expect(run.glyphs.length).toBe(1)
    expect(run.positions.length).toBe(1)
    expect(run.glyphs[0].id).toBeGreaterThan(0)
    expect(run.glyphs[0].codePoints).toEqual(['H'.codePointAt(0)])
    // No GPOS context for a single glyph → position advance equals metric advance.
    expect(run.positions[0].xAdvance).toBe(run.glyphs[0].advanceWidth)
    expect(run.unitsPerEm).toBeGreaterThan(0)
  })

  it('(b) ligature: shape("office") produces a glyph spanning ≥ 2 code points', () => {
    const run = shape('office', carlito)
    // With liga on, "ffi" / "fi" / "ffl" collapse — exact glyph count depends
    // on Carlito's liga set. The signal is that AT LEAST ONE output glyph
    // represents multiple input code points.
    const ligaGlyph = run.glyphs.find((g) => g.codePoints.length >= 2)
    expect(ligaGlyph).toBeDefined()
    // Sanity: total input codepoints should be preserved in the codePoints sets.
    const allCps = run.glyphs.flatMap((g) => g.codePoints)
    expect(allCps.length).toBe('office'.length)
  })

  it('(c) GPOS kerning: shape("Ta") shows GPOS adjustment on the second glyph', () => {
    const run = shape('Ta', carlito)
    // 'Ta' is a classic kern pair. Second glyph's position.xAdvance reflects
    // the kerning baked into the prior pen advance — but fontkit places the
    // adjustment on the previous glyph's xAdvance. Concretely: positions[0]
    // .xAdvance should differ from glyphs[0].advanceWidth.
    expect(run.glyphs.length).toBe(2)
    const t = run.glyphs[0]
    const tPos = run.positions[0]
    expect(tPos.xAdvance).not.toBe(t.advanceWidth)
  })

  it('(d) features={liga:false} disables ligatures', () => {
    const off = shape('office', carlito, { liga: false, clig: false, dlig: false })
    // No glyph should span > 1 code point when ligatures are off.
    for (const g of off.glyphs) {
      expect(g.codePoints.length).toBe(1)
    }
    expect(off.glyphs.length).toBe('office'.length)
  })

  it('returns script + language metadata', () => {
    const run = shape('Hello', carlito)
    expect(typeof run.script).toBe('string')
    expect(run.script.length).toBeGreaterThan(0)
    // Language defaults to null when not requested.
    expect(run.language === null || typeof run.language === 'string').toBe(true)
  })
})
