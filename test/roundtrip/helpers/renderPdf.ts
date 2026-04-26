/**
 * Rasterize one page of a PDF to a PNG buffer using mupdf-js.
 *
 * Used as the coarse backstop layer of the round-trip test harness: when the
 * semantic SVG diff (normalizeSvg) is too lenient — e.g. an export change
 * preserves the SVG structure but visibly shifts glyph positions — pixel
 * comparison via pixelmatch catches it. Also used by `test/dogfood/composite.mjs`
 * to render the exported composite PDF for side-by-side eyeballing.
 *
 * Was pdfjs-dist + node-canvas. Switched to mupdf-js (vectorfeld-249)
 * because pdfjs's `paintInlineImageXObject` calls `ctx.drawImage` with
 * non-Canvas args under node-canvas, crashing on PDFs with embedded
 * inline images (the composite case). mupdf's `Page.toPixmap` +
 * `Pixmap.asPNG` handles every PDF without canvas-shim quirks, and
 * mupdf is already a production dep so no extra surface added.
 */

import * as mupdf from 'mupdf'

export interface RenderOptions {
  /** 1-indexed page number. Default 1. */
  page?: number
  /** Render scale (1 = native PDF resolution). Default 1.5 for crispness. */
  scale?: number
}

export async function renderPdfPageToPng(
  pdfBytes: Uint8Array,
  opts: RenderOptions = {}
): Promise<Uint8Array> {
  const { page = 1, scale = 1.5 } = opts
  // Copy the input — defensive against callers reusing the buffer
  // after this returns. mupdf takes ownership of the bytes.
  const doc = new mupdf.PDFDocument(new Uint8Array(pdfBytes))
  try {
    // mupdf is 0-indexed; preserve the 1-indexed API.
    const p = doc.loadPage(page - 1)
    const pixmap = p.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false, // alpha
    )
    return new Uint8Array(pixmap.asPNG())
  } finally {
    doc.destroy()
  }
}
