/**
 * Pure MuPDF rendering: PDF bytes → SVG string.
 *
 * Env-agnostic. The worker (`pdfRender.worker.ts`) wraps this for the
 * browser hot path so MuPDF WASM stays off the main thread; tests import it
 * directly to drive the round-trip harness in Node without a worker shim.
 *
 * Output SVG is RAW MuPDF emission — viewBox in points, anonymous wrapping
 * `<g>`. Run through `postProcessPdfSvg` from pdfImport.ts to convert to mm
 * and strip metadata.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mupdfPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMuPDF(): Promise<any> {
  if (!mupdfPromise) mupdfPromise = import('mupdf')
  return mupdfPromise
}

export async function renderPdfPageToSvg(
  pdfData: ArrayBuffer,
  pageIndex = 0
): Promise<string> {
  const r = await renderPdfPageToSvgWithMeta(pdfData, pageIndex)
  return r.svg
}

/**
 * Render + return page count alongside the SVG. The graft-export pipeline
 * (`vectorfeld-ccl`) needs the page count to validate page-index bounds
 * without a second mupdf round-trip; the `SourcePdfStore` records it so
 * downstream consumers don't pay to re-open the PDF.
 */
export async function renderPdfPageToSvgWithMeta(
  pdfData: ArrayBuffer,
  pageIndex = 0
): Promise<{ svg: string; pageCount: number }> {
  const m = await getMuPDF()
  const doc = m.Document.openDocument(pdfData, 'application/pdf')
  try {
    const pageCount: number = doc.countPages()
    const page = doc.loadPage(pageIndex)
    try {
      const bounds = page.getBounds()
      const buf = new m.Buffer()
      const writer = new m.DocumentWriter(buf, 'svg', 'text=text')
      const device = writer.beginPage(bounds)
      page.run(device, m.Matrix.identity)
      writer.endPage()
      writer.close()
      return { svg: buf.asString(), pageCount }
    } finally {
      page.destroy()
    }
  } finally {
    doc.destroy()
  }
}
