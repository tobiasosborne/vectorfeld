/**
 * Extract text items + positions from a PDF using pdfjs-dist.
 *
 * Test-only helper for asserting position-affecting behaviour (transforms,
 * fonts, layout) of the export engine without depending on MuPDF re-import
 * round-trip noise. Used for g+transform tests where round-trip text
 * extraction is muddied by MuPDF's tspan grouping.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const workerUrl = resolve(here, '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
;(pdfjsLib as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl

export interface TextItem {
  str: string
  /** x in PDF points, bottom-left origin. */
  x: number
  /** y in PDF points, bottom-left origin. */
  y: number
}

export async function extractPdfTextItems(
  pdfBytes: Uint8Array,
  pageIndex = 1
): Promise<TextItem[]> {
  const dataCopy = new Uint8Array(pdfBytes)
  const doc = await pdfjsLib.getDocument({
    data: dataCopy,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise
  try {
    const page = await doc.getPage(pageIndex)
    const content = await page.getTextContent()
    return content.items
      .filter((it: unknown): it is { str: string; transform: number[] } => {
        return typeof (it as { str?: unknown }).str === 'string'
          && Array.isArray((it as { transform?: unknown }).transform)
      })
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
      }))
  } finally {
    await doc.destroy()
  }
}
