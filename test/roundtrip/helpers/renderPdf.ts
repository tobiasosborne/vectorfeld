/**
 * Rasterize one page of a PDF to a PNG buffer using pdfjs-dist + node-canvas.
 *
 * Used as the coarse backstop layer of the round-trip test harness: when the
 * semantic SVG diff (normalizeSvg) is too lenient — e.g. an export change
 * preserves the SVG structure but visibly shifts glyph positions — pixel
 * comparison via pixelmatch catches it.
 *
 * Runs only in the node test environment ("@vitest-environment node"). The
 * worker is explicitly bound to the local pdfjs-dist file URL so we don't
 * need a network fetch.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas, type Canvas } from 'canvas'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const workerUrl = resolve(here, '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
;(pdfjsLib as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl

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

  // Copy the input — pdfjs-dist can transfer ownership of the underlying
  // ArrayBuffer to its worker, which detaches the caller's view and breaks
  // any subsequent call that reuses the same Uint8Array.
  const dataCopy = new Uint8Array(pdfBytes)
  const loadingTask = pdfjsLib.getDocument({
    data: dataCopy,
    // Disable font fetching from disk; PDFs we test should embed their fonts.
    disableFontFace: true,
    useSystemFonts: false,
  })
  const doc = await loadingTask.promise
  try {
    const p = await doc.getPage(page)
    const viewport = p.getViewport({ scale })
    const canvas = createCanvas(viewport.width, viewport.height) as unknown as Canvas
    const ctx = canvas.getContext('2d')
    await p.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise
    // node-canvas toBuffer returns Buffer, which extends Uint8Array.
    return new Uint8Array((canvas as unknown as { toBuffer(mime: string): Buffer }).toBuffer('image/png'))
  } finally {
    await doc.destroy()
  }
}
