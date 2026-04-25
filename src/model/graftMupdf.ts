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
