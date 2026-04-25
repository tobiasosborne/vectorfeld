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
