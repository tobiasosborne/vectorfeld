/**
 * Test-only convenience: PDF bytes → post-processed SVG string.
 *
 * Composes the pure renderPdfPageToSvg (MuPDF) with postProcessPdfSvg
 * (viewBox pt→mm + metadata strip). Skips the Web Worker hop because tests
 * run in Node where there is no Worker scope to attach to.
 *
 * The result is a valid SVG string ready to feed into parseSvgString or a
 * DOMParser for further inspection / round-trip assertions.
 */

import { renderPdfPageToSvg } from '../../../src/model/pdfRender'
import { postProcessPdfSvg } from '../../../src/model/pdfImport'

export async function pdfToSvg(pdfBytes: Uint8Array, pageIndex = 0): Promise<string> {
  // Copy to a fresh ArrayBuffer — MuPDF takes ownership and detaches the
  // caller's view, breaking any test that wants to reuse the same fixture.
  const ab = new ArrayBuffer(pdfBytes.byteLength)
  new Uint8Array(ab).set(pdfBytes)
  const raw = await renderPdfPageToSvg(ab, pageIndex)
  return postProcessPdfSvg(raw)
}
