/**
 * Tests for applyRedactionsToPage — the content-stream rewrite
 * primitive that replaces the white-fill mask band-aid for
 * source-element deletions (vectorfeld-enf, design vectorfeld-quq).
 *
 * Strategy: build a 2-text-element source PDF, graft it into an
 * output doc, redact one of the two, save+reopen, assert the
 * un-redacted text survives in toStructuredText.asText() AND the
 * redacted text is GONE. The asText() reader walks structured-text
 * (which in turn reads the rewritten content stream), so absence
 * here means the operators are actually excised, not just covered.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  openSourcePdfDoc,
  closeSourcePdfDoc,
  createEmptyPdfDoc,
  graftSourcePageInto,
  applyRedactionsToPage,
} from './graftMupdf'
import { exportSvgStringToPdfBytes } from './fileio'
import type { PdfRect } from './graftBbox'

const MM_TO_PT = 72 / 25.4

// Two text strings on the same page, each with a known mm-space y so
// the test can target one without overlapping the other. Note: these
// are pdf-lib-rendered (not source-graft-rendered) so the bbox we
// pass to applyRedactionsToPage is approximate. The redactor is
// permissive about over-cover, conservative about under-cover.
const TWO_TEXTS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60">
  <g data-layer-name="Layer 1">
    <text x="5" y="15" font-family="Helvetica" font-size="6">UNTOUCHED</text>
    <text x="5" y="40" font-family="Helvetica" font-size="6">REDACTME</text>
  </g>
</svg>`

describe('applyRedactionsToPage', () => {
  let bytes: Uint8Array

  beforeAll(async () => {
    bytes = await exportSvgStringToPdfBytes(TWO_TEXTS_SVG)
  })

  it('removes redacted text from the rewritten content stream while preserving sibling text', async () => {
    // PdfRect convention: bottom-left origin, matching the rest of
    // the graft engine (mmBboxToPdfPt, emitMaskRectOp). The primitive
    // flips into mupdf's top-down coords internally.
    //
    // SVG y=40 mm is REDACTME's baseline; glyphs extend UPWARD in PDF
    // user space so the rect covers descender + ascender around it.
    // UNTOUCHED at SVG y=15 sits well above and stays untouched.
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(bytes)
    graftSourcePageInto(out, src, 0)

    const pageHeightPt = 60 * MM_TO_PT
    const baselineBottomUpPt = pageHeightPt - 40 * MM_TO_PT
    const fontPt = 6 * MM_TO_PT
    const rects: PdfRect[] = [
      {
        x: 0,
        y: baselineBottomUpPt - fontPt * 0.3,
        w: 80 * MM_TO_PT,
        h: fontPt * 1.6,
      },
    ]
    await applyRedactionsToPage(out, 0, rects)

    // Save + reopen to confirm the rewrite persists through serialization.
    const outBytes = out.saveToBuffer('compress=yes').asUint8Array()
    closeSourcePdfDoc(src)
    closeSourcePdfDoc(out)

    const reopen = await openSourcePdfDoc(outBytes)
    const text = reopen.loadPage(0).toStructuredText('preserve-spans').asText()
    expect(text).toContain('UNTOUCHED')
    expect(text).not.toContain('REDACTME')
    closeSourcePdfDoc(reopen)
  })

  it('is a no-op when called with an empty rect list', async () => {
    const out = await createEmptyPdfDoc()
    const src = await openSourcePdfDoc(bytes)
    graftSourcePageInto(out, src, 0)

    // Capture page text before
    const before = out.loadPage(0).toStructuredText('preserve-spans').asText()
    expect(before).toContain('UNTOUCHED')
    expect(before).toContain('REDACTME')

    await applyRedactionsToPage(out, 0, [])

    const after = out.loadPage(0).toStructuredText('preserve-spans').asText()
    expect(after).toBe(before)

    closeSourcePdfDoc(src)
    closeSourcePdfDoc(out)
  })

})
