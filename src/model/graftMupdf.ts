/**
 * MuPDF lifecycle primitives for the graft export engine.
 *
 * Wraps `mupdf.PDFDocument` open / create / close so the rest of the engine
 * doesn't have to handle the dynamic-import promise dance and can use a
 * clear, narrowly-typed API surface.
 *
 * Runtime: dynamic `import('mupdf')` is resolved once, cached, reused. Works
 * on the browser main thread, in Web Workers, and in Node (vitest). The
 * production import path keeps MuPDF in a Web Worker (`pdfRender.worker.ts`)
 * for SVG render; the graft engine intentionally re-opens MuPDF on the main
 * thread when exporting because (a) export latency is acceptable as a
 * one-shot, (b) postMessage round-trips for every primitive operation
 * (graftPage, addStream, addSimpleFont, …) would balloon the worker
 * protocol surface area to no purpose.
 */

import type * as mupdfTypes from 'mupdf'
import type { PdfRect } from './graftBbox'
import { loadFontkit, type FontkitFont } from './graftShape'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mupdfPromise: Promise<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadMuPDF(): Promise<any> {
  if (!mupdfPromise) mupdfPromise = import('mupdf')
  return mupdfPromise
}

/** Open a source PDF for grafting. Caller owns the returned handle and is
 *  responsible for `closeSourcePdfDoc(doc)` once they're done with it. */
export async function openSourcePdfDoc(bytes: Uint8Array): Promise<mupdfTypes.PDFDocument> {
  const m = await loadMuPDF()
  return new m.PDFDocument(bytes) as mupdfTypes.PDFDocument
}

/** Create a fresh empty PDFDocument. Used as the OUTPUT doc that the engine
 *  grafts source pages into and saves at the end. */
export async function createEmptyPdfDoc(): Promise<mupdfTypes.PDFDocument> {
  const m = await loadMuPDF()
  return new m.PDFDocument() as mupdfTypes.PDFDocument
}

/** Release the underlying native handle. After this call, the doc must not
 *  be touched. Safe to call on a doc that has already been destroyed. */
export function closeSourcePdfDoc(doc: { destroy(): void }): void {
  doc.destroy()
}

/**
 * Append a page from `srcDoc` onto the end of `outDoc`, byte-for-byte.
 * Wraps `mupdf.PDFDocument.graftPage(-1, srcDoc, srcPageIdx)` — the `-1`
 * is the mupdf convention for "append at end". Spike-01 verified this
 * preserves all source font subsets, kerning tables, embedded images,
 * and colour spaces (0.0000% pixel diff vs. source).
 *
 * Does not mutate `srcDoc`. Caller closes both docs when done.
 */
export function graftSourcePageInto(
  outDoc: mupdfTypes.PDFDocument,
  srcDoc: mupdfTypes.PDFDocument,
  srcPageIdx: number,
): void {
  outDoc.graftPage(-1, srcDoc, srcPageIdx)
}

/**
 * Append `opStr` (raw PDF content-stream operators) as a new stream onto
 * page `pageIdx`'s `/Contents`. If `/Contents` is already an array, push
 * the new stream's indirect ref onto it. Otherwise wrap the existing
 * single ref in a new array and put the array back as `/Contents`.
 *
 * The newly appended stream draws ON TOP of the existing content (PDF
 * spec §7.8.2 paints content streams in array order), which is what the
 * graft engine wants for overlays.
 *
 * Mirrors spike-02 lines 98–118 (verified to preserve source bytes
 * intact under reload).
 */
export async function appendContentStream(
  outDoc: mupdfTypes.PDFDocument,
  pageIdx: number,
  opStr: string,
): Promise<void> {
  const m = await loadMuPDF()
  const buf = new m.Buffer()
  buf.write(opStr)
  const csRef = outDoc.addStream(buf, outDoc.newDictionary())

  const page = outDoc.findPage(pageIdx)
  const contents = page.get('Contents').resolve()
  if (contents.isArray()) {
    contents.push(csRef)
    return
  }
  // Single stream (or single indirect ref) — wrap into an array, preserving
  // the original entry first so its draw order stays beneath the overlay.
  const arr = outDoc.newArray()
  arr.push(page.get('Contents'))
  arr.push(csRef)
  page.put('Contents', arr)
}

/**
 * Embed `fontBytes` as a simple-encoded Latin font into `outDoc` and
 * register it in page `pageIdx`'s `/Resources/Font` dict under `fontKey`,
 * ready to be referenced from a content stream as `/<fontKey> N Tf`.
 *
 * If the page has no `/Resources` dict (rare — e.g. the page was created
 * empty), it's created. Same for `/Resources/Font` (common — a grafted
 * shape-only page has no font dict). The mupdf font's internal name is
 * set to `fontKey` for ease of post-mortem inspection; PDF readers
 * identify the font via its embedded program, not this label.
 *
 * Mirrors spike-02b's font-embed flow.
 */
export async function registerOverlayFont(
  outDoc: mupdfTypes.PDFDocument,
  pageIdx: number,
  fontKey: string,
  fontBytes: Uint8Array,
): Promise<void> {
  const m = await loadMuPDF()
  const font = new m.Font(fontKey, fontBytes)
  const fontRef = outDoc.addSimpleFont(font, 'Latin')

  const page = outDoc.findPage(pageIdx)
  let resources = page.get('Resources').resolve()
  if (!resources.isDictionary()) {
    resources = outDoc.newDictionary()
    page.put('Resources', resources)
  }
  let fontsDict = resources.get('Font')
  if (!fontsDict.isDictionary()) {
    fontsDict = outDoc.newDictionary()
    resources.put('Font', fontsDict)
  }
  fontsDict.put(fontKey, fontRef)
}

/** Result of registerCidFont: the mupdf-side indirect ref to install in
 *  TJ-emitting content streams, plus a fontkit `Font` loaded from the same
 *  bytes for shaping. The caller passes `fontkitFont` to `shape()` and uses
 *  `ref` (already wired into page Resources/Font under `fontKey`) by name
 *  in the content stream. Both views agree on glyph IDs because they're
 *  the same TTF program. */
export interface CidFontRegistration {
  ref: mupdfTypes.PDFObject
  fontkitFont: FontkitFont
}

/**
 * Embed `fontBytes` as a Type-0 / CID-keyed font (Identity-H encoding,
 * /ToUnicode CMap auto-attached) and register it in page `pageIdx`'s
 * `/Resources/Font` dict under `fontKey`. Returns both the mupdf
 * indirect ref and a fontkit-loaded `Font` for shaping.
 *
 * The Type-0 wrapper is what makes Identity-H TJ glyph-index emission
 * legal — content streams reference glyphs as 2-byte big-endian GIDs
 * and `addFont` builds the matching /Type0 + /CIDFontType2 +
 * /Encoding /Identity-H + /DescendantFonts + /W + /ToUnicode shape.
 * Verified end-to-end in `scripts/spike/05-cid-fonts.mjs` —
 * `mupdf.asText()` AND `pdfjs.getTextContent()` both round-trip the
 * source string after a TJ-hex content stream is saved and reopened.
 *
 * Use this for any text the graft engine emits via shaped TJ ops.
 * `registerOverlayFont` (the simple-font flavour) stays for legacy
 * call sites that don't need shaping but is otherwise superseded.
 *
 * If the page has no `/Resources` or no `/Resources/Font` dict, both
 * are created (mirrors `registerOverlayFont` exactly).
 */
export async function registerCidFont(
  outDoc: mupdfTypes.PDFDocument,
  pageIdx: number,
  fontKey: string,
  fontBytes: Uint8Array,
): Promise<CidFontRegistration> {
  const m = await loadMuPDF()
  const font = new m.Font(fontKey, fontBytes)
  const ref = outDoc.addFont(font)

  const page = outDoc.findPage(pageIdx)
  let resources = page.get('Resources').resolve()
  if (!resources.isDictionary()) {
    resources = outDoc.newDictionary()
    page.put('Resources', resources)
  }
  let fontsDict = resources.get('Font')
  if (!fontsDict.isDictionary()) {
    fontsDict = outDoc.newDictionary()
    resources.put('Font', fontsDict)
  }
  fontsDict.put(fontKey, ref)

  const fontkitFont = loadFontkit(fontBytes)
  return { ref, fontkitFont }
}

/**
 * Mark `rectsPdfPt` for removal on page `pageIdx` and apply the
 * redactions immediately. Each rect becomes a Redact annotation
 * (PDF spec §12.5.6.21) covering the area to remove; `applyRedactions`
 * then rewrites the page's content stream — text-show operators (Tj,
 * TJ) whose glyphs fall inside any marked rect are EXCISED, not just
 * covered. Verified end-to-end in `scripts/spike/04-redactions.mjs`:
 * both mupdf.toStructuredText and pdfjs.getTextContent confirm
 * redacted text is gone from both extraction paths.
 *
 * Replaces the band-aid white-fill mask overlay path
 * (`emitMaskRectOp` in graftCs.ts) for source-element deletions.
 * The mask path was visually-only — pdfjs/Ctrl+F/copy-paste/screen
 * readers all still found the "deleted" text. See vectorfeld-enf.
 *
 * Parameters:
 *   - text_method = REDACT_TEXT_REMOVE (0): excise text-show ops.
 *   - black_boxes = false: don't paint a visible black rect in place
 *     of the redaction (we want the deleted area transparent).
 *   - image_method = REDACT_IMAGE_NONE (0): leave images alone —
 *     image deletion would gate via classifyLayer separately and is
 *     not in scope for vectorfeld-enf.
 *   - line_art_method = REDACT_LINE_ART_REMOVE_IF_COVERED (1): excise
 *     subpaths whose every point lies inside a redact rect. Strictly
 *     safe — won't remove paths that extend beyond the bbox. Source-
 *     element bboxes are AABBs of the element's exact coordinates so
 *     paths fully contained in the bbox correspond exactly to the
 *     deleted element. Shape deletions (rect, path, line, …) need
 *     this; LINE_ART_NONE would leave their drawing operators in
 *     place and a "deleted" rect would still render.
 *
 * Coordinate convention: `PdfRect` is documented as PDF-spec
 * bottom-left origin (consistent with the content-stream emission
 * primitives in graftCs.ts). MuPDF's `Annotation.setRect` uses the
 * mupdf-display top-left convention (matching the y-down coords
 * its own `toStructuredText` walks emit). This primitive flips y
 * across the page's MediaBox height so callers can stay in PdfRect
 * convention end-to-end.
 *
 * No-op if `rectsPdfPt` is empty (avoids a useless mupdf round-trip).
 *
 * Note: createAnnotation('Redact') / applyRedactions are PDFPage
 * methods, so we use `loadPage(pageIdx)` (which returns PDFPage on
 * PDFDocument), not `findPage(pageIdx)` (which returns PDFObject).
 */
export async function applyRedactionsToPage(
  outDoc: mupdfTypes.PDFDocument,
  pageIdx: number,
  rectsPdfPt: PdfRect[],
): Promise<void> {
  if (rectsPdfPt.length === 0) return
  const page = outDoc.loadPage(pageIdx)
  // Page bounds: [x0, y0, x1, y1] in mupdf coords. Height = y1 - y0.
  // Used to flip PdfRect's bottom-up y into mupdf's top-down y.
  const bounds = page.getBounds()
  const pageHeightPt = bounds[3] - bounds[1]
  for (const r of rectsPdfPt) {
    const topDownY0 = pageHeightPt - (r.y + r.h)
    const topDownY1 = pageHeightPt - r.y
    const annot = page.createAnnotation('Redact')
    annot.setRect([r.x, topDownY0, r.x + r.w, topDownY1])
  }
  // Constants documented inline rather than referenced via PDFPage.REDACT_*
  // statics: those statics are present on the runtime class but the
  // type-level static-readonly literals on PDFPage are class-side and
  // accessing them from a typed instance compiles awkwardly. The integers
  // are stable PDF-spec values (mupdf.d.ts:569-577).
  const REDACT_IMAGE_NONE = 0
  const REDACT_LINE_ART_REMOVE_IF_COVERED = 1
  const REDACT_TEXT_REMOVE = 0
  page.applyRedactions(false, REDACT_IMAGE_NONE, REDACT_LINE_ART_REMOVE_IF_COVERED, REDACT_TEXT_REMOVE)
}
