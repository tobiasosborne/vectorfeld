/**
 * Fontkit shaping helper for the graft engine.
 *
 * Wraps `@pdf-lib/fontkit` so the rest of the engine doesn't see the
 * fontkit API surface and so PDF emission stays decoupled from
 * shaping. The two consumers are:
 *   - `registerCidFont` in graftMupdf.ts — needs a fontkit `Font`
 *     loaded from the same TTF bytes that mupdf embeds, so the
 *     shaper and the embedded font program agree on glyph IDs.
 *   - `emitText` in graftCs.ts (yyj-4 rewrite) — calls `shape(...)`
 *     to turn a string into a sequence of GIDs + GPOS-adjusted
 *     advances, then emits Identity-H TJ ops referencing those GIDs.
 *
 * Why this thin layer rather than calling fontkit directly:
 *   - GlyphRun objects from fontkit hold references to internal
 *     glyph state (paths, color layers, etc.) that we don't need
 *     and that complicate testing. ShapedRun is the minimal shape
 *     PDF emission consumes.
 *   - Keeps the fontkit dep behind a single import surface so it
 *     can be swapped (harfbuzz-wasm? icu4c?) without rippling
 *     through the engine.
 *
 * Coordinate convention: all numeric values are in font units
 * (1/unitsPerEm of an em). The PDF emitter scales by
 * `(fontSizePt / unitsPerEm) * 1000` to get text-space units when
 * building TJ inline adjustments (PDF spec §9.4.3 — TJ adjustments
 * are in thousandths of an em).
 */

import fontkit from '@pdf-lib/fontkit'
import type { Font as FontkitFont, TypeFeatures } from '@pdf-lib/fontkit'

export type { FontkitFont }

export interface ShapedGlyph {
  /** Glyph ID in the embedded font (matches mupdf addFont's Identity-H). */
  id: number
  /** Codepoints this glyph represents. Length > 1 means a ligature. */
  codePoints: number[]
  /** Default advance from the font's hmtx table, in font units.
   *  Differs from `position.xAdvance` when GPOS kerning is applied. */
  advanceWidth: number
}

export interface ShapedPosition {
  /** Pen advance after this glyph, in font units. Reflects GPOS adjustments. */
  xAdvance: number
  /** Vertical advance, in font units (0 for horizontal scripts). */
  yAdvance: number
  /** Render-time glyph offset from pen, x. Almost always 0 for Latin. */
  xOffset: number
  /** Render-time glyph offset from pen, y. Used for diacritics. */
  yOffset: number
}

export interface ShapedRun {
  glyphs: ShapedGlyph[]
  positions: ShapedPosition[]
  /** Font's design grid size. PDF emitters scale by 1000 / unitsPerEm. */
  unitsPerEm: number
  /** Script chosen by the shaper (e.g. 'latn'). */
  script: string
  /** Language, if requested or detected — null if shaper used script default. */
  language: string | null
}

/** Load a TTF/OTF byte array into a fontkit Font for shaping. The same
 *  bytes are embedded into the PDF via mupdf.addFont elsewhere, so glyph
 *  IDs from this Font are valid for Identity-H TJ emission. */
export function loadFontkit(bytes: Uint8Array): FontkitFont {
  return fontkit.create(bytes)
}

/** Shape `text` through fontkit's layout engine. Returns the GID stream
 *  + GPOS positions in font units. `features` is a fontkit feature map
 *  ({ liga: false, kern: true, … }) or an array of feature tag strings. */
export function shape(
  text: string,
  font: FontkitFont,
  features?: TypeFeatures | (keyof TypeFeatures)[],
): ShapedRun {
  const run = font.layout(text, features)
  return {
    glyphs: run.glyphs.map((g) => ({
      id: g.id,
      codePoints: g.codePoints.slice(),
      advanceWidth: g.advanceWidth,
    })),
    positions: run.positions.map((p) => ({
      xAdvance: p.xAdvance,
      yAdvance: p.yAdvance,
      xOffset: p.xOffset,
      yOffset: p.yOffset,
    })),
    unitsPerEm: font.unitsPerEm,
    script: run.script,
    language: run.language,
  }
}
