/**
 * Source-PDF font extraction primitives for in-place text edits
 * (vectorfeld-eb0).
 *
 * When the user modifies a source-PDF text element (recolor, edit
 * string, …), the graft engine wants to re-emit the modified glyph
 * stream in the SOURCE's original embedded font rather than overlaying
 * Carlito — same metrics, same kerning, same ligatures, no visible
 * seam. To do that we need the source font's actual program bytes;
 * this module exposes them.
 *
 * Spike-08 (`scripts/spike/08-source-font-extract.mjs`) verified the
 * approach end-to-end: mupdf's `PDFObject.readStream()` decodes the
 * /FontFile2 (or /FontFile3, /FontFile) stream filters automatically,
 * fontkit accepts the resulting bytes (even when the font is a
 * subset like `BCDEEE+Calibri-Bold`), and `mupdf.addFont(extractedFont)`
 * builds a complete Type-0 / Identity-H + /ToUnicode wrapper that
 * survives a save+reopen cycle through both mupdf and pdfjs.
 *
 * Pure: no DOM mutation, no I/O. Operates on a `mupdf.PDFDocument`
 * handle the caller already holds open.
 */

import type * as mupdfTypes from 'mupdf'

/** Subtype of an embedded source font. We only care about the three
 *  shapes that carry an extractable program stream. */
export type EmbeddedFontSubtype = 'Type0' | 'TrueType' | 'Type1'

export interface EmbeddedFontInfo {
  /** The page-resource key — `/F1`, `/F2`, …, but without the slash. */
  fontKey: string
  /** The font's `/BaseFont` name, e.g. `BCDEEE+Calibri-Bold`. Subset
   *  fonts carry a six-character prefix + plus sign before the
   *  PostScript name. */
  baseFont: string
  subtype: EmbeddedFontSubtype
  /** True when the page resource has a FontDescriptor with one of
   *  /FontFile, /FontFile2, /FontFile3 — i.e. the program bytes are
   *  embedded in the PDF. False for standard 14 fonts (TimesNewRoman,
   *  Helvetica, etc.) which rely on the viewer's own copy. */
  hasEmbeddedProgram: boolean
}

export interface ExtractedFontProgram {
  bytes: Uint8Array
  baseFont: string
  subtype: EmbeddedFontSubtype
  /** Which dictionary key carried the program — useful for
   *  diagnostic logging and choosing the right fontkit constructor
   *  when we eventually want to hand it back to fontkit (FontFile3
   *  carries OpenType-CFF or Type-1C, which fontkit handles
   *  transparently in `fontkit.create`). */
  programKey: 'FontFile' | 'FontFile2' | 'FontFile3'
}

/** Walk page `pageIdx`'s `/Resources/Font` dict and return one
 *  `EmbeddedFontInfo` per font reference. Doesn't extract program
 *  bytes — that's `extractEmbeddedFontBytes`. Use this for matching
 *  + enumeration when you don't yet know which font you want. */
export function listPageFonts(
  srcDoc: mupdfTypes.PDFDocument,
  pageIdx: number,
): EmbeddedFontInfo[] {
  const page = srcDoc.findPage(pageIdx)
  const resources = page.get('Resources').resolve()
  if (!resources.isDictionary()) return []
  const fonts = resources.get('Font')
  if (!fonts.isDictionary()) return []

  const out: EmbeddedFontInfo[] = []
  fonts.forEach((value, key) => {
    const fontDict = value.resolve()
    if (!fontDict.isDictionary()) return
    const subtypeName = fontDict.get('Subtype').isName()
      ? fontDict.get('Subtype').asName()
      : null
    if (subtypeName !== 'Type0' && subtypeName !== 'TrueType' && subtypeName !== 'Type1') {
      // Type3 (charproc) fonts and anything exotic — skip. Type3
      // doesn't have a single program stream we can hand to fontkit.
      return
    }

    // For Type-0, the /FontDescriptor lives on the descendant CID font,
    // not the wrapper. Grab the descriptor host accordingly.
    const descriptorHost = subtypeName === 'Type0'
      ? resolveType0DescendantFont(fontDict)
      : fontDict
    const baseFont = descriptorHost.get('BaseFont').isName()
      ? descriptorHost.get('BaseFont').asName()
      : 'unknown'

    const fontDescriptor = descriptorHost.get('FontDescriptor').resolve()
    const hasEmbeddedProgram = fontDescriptor.isDictionary() && (
      fontDescriptor.get('FontFile').isStream() ||
      fontDescriptor.get('FontFile2').isStream() ||
      fontDescriptor.get('FontFile3').isStream()
    )

    out.push({
      fontKey: String(key),
      baseFont,
      subtype: subtypeName as EmbeddedFontSubtype,
      hasEmbeddedProgram,
    })
  })
  return out
}

/**
 * Return the embedded font program bytes for `fontKey` on page
 * `pageIdx`, or `null` if the font isn't embedded (standard 14 font,
 * Type3 charproc, missing FontDescriptor, …).
 *
 * Type-0 fonts are walked through `DescendantFonts[0]` to reach the
 * CIDFontType2 / CIDFontType0 descriptor that carries the program.
 *
 * The returned bytes are POST-decoded — mupdf's `readStream` applies
 * the stream's `/Filter` (FlateDecode for almost every modern PDF
 * font), so what you get is raw TTF/OTF/CFF bytes ready for
 * `fontkit.create()` or `new mupdf.Font(name, bytes)`.
 */
export function extractEmbeddedFontBytes(
  srcDoc: mupdfTypes.PDFDocument,
  pageIdx: number,
  fontKey: string,
): ExtractedFontProgram | null {
  const page = srcDoc.findPage(pageIdx)
  const resources = page.get('Resources').resolve()
  if (!resources.isDictionary()) return null
  const fonts = resources.get('Font')
  if (!fonts.isDictionary()) return null

  // Missing keys return the static PDFObject.Null whose `_doc` is
  // null — calling .resolve() on Null throws. Guard explicitly.
  const rawFontEntry = fonts.get(fontKey)
  if (rawFontEntry.isNull()) return null
  const fontDict = rawFontEntry.resolve()
  if (!fontDict.isDictionary()) return null

  const subtypeName = fontDict.get('Subtype').isName() ? fontDict.get('Subtype').asName() : null
  if (subtypeName !== 'Type0' && subtypeName !== 'TrueType' && subtypeName !== 'Type1') {
    return null
  }

  const descriptorHost = subtypeName === 'Type0'
    ? resolveType0DescendantFont(fontDict)
    : fontDict
  const baseFont = descriptorHost.get('BaseFont').isName()
    ? descriptorHost.get('BaseFont').asName()
    : 'unknown'

  const fontDescriptor = descriptorHost.get('FontDescriptor').resolve()
  if (!fontDescriptor.isDictionary()) return null

  // Try FontFile2 first (TrueType — most common for modern PDFs),
  // then FontFile3 (Type1C / OpenType-CFF), then FontFile (legacy
  // Type 1). Order matches mupdf's own internal preference.
  const candidates: Array<'FontFile2' | 'FontFile3' | 'FontFile'> = [
    'FontFile2',
    'FontFile3',
    'FontFile',
  ]
  for (const programKey of candidates) {
    const stream = fontDescriptor.get(programKey)
    if (stream.isStream()) {
      const bytes = stream.readStream().asUint8Array()
      // readStream returns a view into mupdf's WASM memory; copy
      // out so the caller can hold the buffer past the next mupdf
      // operation that might invalidate the slab.
      const copy = new Uint8Array(bytes.length)
      copy.set(bytes)
      return {
        bytes: copy,
        baseFont,
        subtype: subtypeName as EmbeddedFontSubtype,
        programKey,
      }
    }
  }

  return null
}

/** For a Type-0 wrapper, descend into `/DescendantFonts[0]`. The
 *  descendant is where /FontDescriptor + /BaseFont (the un-prefixed
 *  PostScript name) live. Returns the wrapper itself if descent fails
 *  so the caller can keep going with whatever it has. */
function resolveType0DescendantFont(
  type0Dict: mupdfTypes.PDFObject,
): mupdfTypes.PDFObject {
  const dfs = type0Dict.get('DescendantFonts')
  if (dfs.isArray() && dfs.length > 0) {
    return dfs.get(0).resolve()
  }
  return type0Dict
}
