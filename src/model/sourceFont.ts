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

/** Parsed shape of a PostScript font name like
 *  `BCDEEE+Calibri-BoldItalic`: subset prefix stripped, family +
 *  weight + style separated. PostScript naming follows the
 *  "Family-Suffix" convention (PostScript Language Reference §5.2);
 *  the suffix encodes weight + style: `Bold`, `Italic`, `Oblique`,
 *  `BoldItalic`, `BoldOblique`, `Light`, `Black`, … */
export interface ParsedPostScriptName {
  family: string
  /** "normal", "bold", or another weight token if present. */
  weight: string
  /** "normal" or "italic". */
  style: string
}

/** Strip a 6-letter subset prefix (e.g. "BCDEEE+") and parse the
 *  PostScript name into (family, weight, style). Embeds the most
 *  common Latin face naming conventions (Bold / Italic / Oblique /
 *  BoldItalic / Regular / Roman). Unknown suffixes fall through to
 *  family-only with weight=normal style=normal — matching still
 *  works against the SVG triple via family-only fallback. */
export function parsePostScriptName(baseFont: string): ParsedPostScriptName {
  // Subset prefix: 6 uppercase letters + "+". Strip if present.
  const stripped = baseFont.replace(/^[A-Z]{6}\+/, '')
  // Most fonts use Family-Suffix; some use no hyphen (TimesNewRomanPSMT,
  // ArialMT). When no hyphen, treat the whole thing as family.
  const dashIdx = stripped.indexOf('-')
  if (dashIdx === -1) {
    return { family: stripped, weight: 'normal', style: 'normal' }
  }
  const family = stripped.slice(0, dashIdx)
  const suffix = stripped.slice(dashIdx + 1)
  return { family, ...parseFontSuffix(suffix) }
}

function parseFontSuffix(suffix: string): { weight: string; style: string } {
  const s = suffix.toLowerCase()
  // Order matters — check combined forms (BoldItalic) before
  // their components.
  if (s === 'bolditalic' || s === 'boldoblique' || s === 'heavyitalic') {
    return { weight: 'bold', style: 'italic' }
  }
  if (s === 'bold') return { weight: 'bold', style: 'normal' }
  if (s === 'italic' || s === 'oblique') return { weight: 'normal', style: 'italic' }
  if (s === 'regular' || s === 'roman' || s === 'book') {
    return { weight: 'normal', style: 'normal' }
  }
  // Other weights (Light, Medium, Black, Thin, …) — preserve
  // the lowercase token as the weight so matchSvgFontToSource
  // can do a literal compare. The graft engine doesn't currently
  // emit these as SVG attrs but might in the future.
  if (s.includes('italic') || s.includes('oblique')) {
    const weightToken = s.replace(/italic|oblique/g, '').trim() || 'normal'
    return { weight: weightToken, style: 'italic' }
  }
  return { weight: s, style: 'normal' }
}

/** Read the inheritable font triple off an SVG element. Walks up
 *  ancestors so a `<tspan>` inherits from its parent `<text>` and so
 *  on. Mirrors the cascade emitText uses. */
export function readSvgFontTriple(el: Element): {
  family: string | null
  weight: string | null
  style: string | null
} {
  let family: string | null = null
  let weight: string | null = null
  let style: string | null = null
  for (let cur: Element | null = el; cur !== null; cur = cur.parentElement) {
    if (family === null) family = cur.getAttribute('font-family')
    if (weight === null) weight = cur.getAttribute('font-weight')
    if (style === null) style = cur.getAttribute('font-style')
    if (family !== null && weight !== null && style !== null) break
  }
  return { family, weight, style }
}

/** Find the source-PDF font key whose embedded font best matches
 *  `textEl`'s SVG (font-family, font-weight, font-style) triple.
 *  Matches by parsed PostScript name. Returns `null` when:
 *    - the element has no `font-family`,
 *    - no source font's parsed family matches,
 *    - the best match has no embedded program (e.g. TimesNewRoman).
 *
 *  Matching priority mirrors `makeFontRegistry`:
 *    1. exact (family, weight, style)
 *    2. (family, style) — weight differs (closest available cut)
 *    3. family — anything in that family
 *
 *  Family comparison is case-insensitive. SVG and PostScript both
 *  use the family name conventionally without case sensitivity. */
export function matchSvgFontToSource(
  textEl: Element,
  srcDoc: mupdfTypes.PDFDocument,
  srcPageIdx: number,
): EmbeddedFontInfo | null {
  const { family, weight, style } = readSvgFontTriple(textEl)
  if (!family) return null

  const svgFamily = family.toLowerCase()
  const svgWeight = normalizeWeight(weight)
  const svgStyle = normalizeStyle(style)

  const candidates = listPageFonts(srcDoc, srcPageIdx).filter(
    (f) => f.hasEmbeddedProgram,
  )
  if (candidates.length === 0) return null

  // Annotate each candidate with parsed naming for matching.
  const parsed = candidates.map((c) => ({
    info: c,
    parsed: parsePostScriptName(c.baseFont),
  }))

  // 1. exact triple
  const exact = parsed.find((p) =>
    p.parsed.family.toLowerCase() === svgFamily &&
    p.parsed.weight === svgWeight &&
    p.parsed.style === svgStyle,
  )
  if (exact) return exact.info

  // 2. family + style
  const byStyle = parsed.find((p) =>
    p.parsed.family.toLowerCase() === svgFamily &&
    p.parsed.style === svgStyle,
  )
  if (byStyle) return byStyle.info

  // 3. family only
  const byFamily = parsed.find((p) =>
    p.parsed.family.toLowerCase() === svgFamily,
  )
  if (byFamily) return byFamily.info

  return null
}

function normalizeWeight(weight: string | null | undefined): string {
  if (!weight) return 'normal'
  const w = String(weight).trim().toLowerCase()
  if (w === 'bold' || w === '700') return 'bold'
  if (w === 'normal' || w === '400' || w === '') return 'normal'
  return w
}

function normalizeStyle(style: string | null | undefined): string {
  if (!style) return 'normal'
  const s = String(style).trim().toLowerCase()
  return s === 'italic' || s === 'oblique' ? 'italic' : 'normal'
}
