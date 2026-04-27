/**
 * Graft-based PDF export engine — entry point.
 *
 * Composes the wjj sub-bead primitives into a single-page-stacking export
 * pipeline:
 *
 *   1. Pick the FOUNDATION layer: the first graft/mixed layer in DOM
 *      order. If none exists, bootstrap a blank page sized to the
 *      document viewBox.
 *   2. Graft the foundation page into the new doc — this gives us a
 *      single output page (page 0).
 *   3. Walk the remaining layers in DOM order (which is z-order, bottom
 *      to top), appending overlay content streams onto page 0:
 *        - mixed FOUNDATION   → mask + re-render modified, render new
 *        - non-foundation graft → render whole layer (lossy: text loses
 *                                 source-font fidelity, becomes Carlito)
 *        - non-foundation mixed → same as overlay (treat as user-content)
 *        - overlay              → render whole layer
 *   4. Save with compression.
 *
 * Page sizing: when the foundation is a graft/mixed, the page MediaBox
 * comes from the source PDF (preserves source dimensions byte-for-byte).
 * When there's no graft foundation, MediaBox comes from the doc viewBox
 * scaled to PDF points.
 *
 * Determinism: relies on mupdf's saveToBuffer not stamping wall-clock
 * timestamps on identical inputs. Re-export of the same document yields
 * byte-identical PDFs (verified by graftExport.test.ts).
 *
 * MVP scope:
 *   - Single output page (multi-page source PDFs imported as multiple
 *     output pages is a future bead).
 *   - Source page 0 only on graft/mixed (multi-source-page is future).
 *   - Single Carlito font for ALL overlay text (full pickFont 5-slot
 *     is a future bead — `vectorfeld-yyj`).
 */

import {
  openSourcePdfDoc,
  closeSourcePdfDoc,
  createEmptyPdfDoc,
  graftSourcePageInto,
  appendContentStream,
  registerCidFont,
  applyRedactionsToPage,
} from './graftMupdf'
import type { FontkitFont } from './graftShape'
import { classifyLayer, type ClassifiedLayer } from './graftClassify'
import { elementBboxPdfPt, mmBboxToPdfPt, type PdfRect } from './graftBbox'
import {
  emitRect,
  emitLine,
  emitCircle,
  emitEllipse,
  emitPath,
  emitText,
  type Ctx,
  type FontRegistry,
} from './graftCs'
import { identityMatrix, multiplyMatrix, parseTransform, type Matrix } from './matrix'
import type { DocumentModel } from './document'
import type { SourcePdfStore } from './sourcePdf'
import type * as mupdfTypes from 'mupdf'

const MM_TO_PT = 72 / 25.4
const OVERLAY_FONT_KEY = 'VfCarlito'

const LEAF_TAGS = new Set(['rect', 'line', 'circle', 'ellipse', 'path', 'text'])
const TEXT_TAGS = new Set(['text'])

export interface ExportViaGraftOpts {
  /** Carlito-Regular bytes. Required for any layer whose contents — either
   *  user-authored text (overlay) or mask+re-rendered source text (mixed)
   *  or non-foundation grafted text (lossy fallback) — will be emitted
   *  via emitText. Engine throws a clear actionable error if a font is
   *  needed and none is supplied. */
  carlito?: Uint8Array
}

interface ClassifiedEntry {
  layer: Element
  cls: ClassifiedLayer
}

export async function exportViaGraft(
  doc: DocumentModel,
  store: SourcePdfStore,
  opts: ExportViaGraftOpts = {},
): Promise<Uint8Array> {
  const out = await createEmptyPdfDoc()
  try {
    const layers = doc.getLayerElements()
    const classifications: ClassifiedEntry[] = layers.map((layer) => ({
      layer,
      cls: classifyLayer(layer, store),
    }))

    // 1. Pick foundation: first graft/mixed in DOM order. -1 = none.
    const foundIdx = classifications.findIndex(
      (c) => c.cls.kind === 'graft' || c.cls.kind === 'mixed',
    )

    // 2. Bootstrap the single output page.
    const pageHeightPt = await bootstrapPage(out, doc, foundIdx, classifications)
    const pageIdx = 0

    // 3. Apply content-stream redactions for foundation+mixed
    //    deletions and modifications BEFORE registering the overlay
    //    font or appending the overlay stream (vectorfeld-enf).
    //    Order matters in two ways:
    //      a) Redaction rewrites the foundation page's content stream
    //         to excise text-show ops inside each marked rect;
    //         appending the overlay afterward adds a NEW stream on
    //         top of the rewritten foundation, so the overlay's text
    //         isn't redacted by the same pass.
    //      b) `mupdf.applyRedactions` ALSO rewrites the page's
    //         /Resources/Font, pruning any font key whose glyphs
    //         are not currently referenced in the content stream.
    //         Registering the overlay font BEFORE applyRedactions
    //         results in the font being pruned (no overlay content
    //         stream exists yet to use it). So: redact first, then
    //         register the font, then emit the overlay that uses it.
    //    The previous emitMaskRectOp band-aid covered visually but
    //    left the operators in the stream — pdfjs / Ctrl+F /
    //    copy-paste / screen readers still found "deleted" text.
    //    Redaction removes it for real.
    const ctx: Ctx = { matrix: identityMatrix(), pageHeightPt }
    if (foundIdx !== -1 && classifications[foundIdx].cls.kind === 'mixed') {
      const found = classifications[foundIdx].cls as Extract<ClassifiedLayer, { kind: 'mixed' }>
      const redactRects: PdfRect[] = []
      for (const el of found.modifiedElements) {
        const bbox = elementBboxPdfPt(el, pageHeightPt)
        if (bbox) redactRects.push(bbox)
      }
      for (const bboxMm of found.removedBboxes) {
        redactRects.push(mmBboxToPdfPt(bboxMm, pageHeightPt))
      }
      await applyRedactionsToPage(out, pageIdx, redactRects)
    }

    // 4. Register the overlay font NOW (after redactions, before
    //    overlay emission) so applyRedactions doesn't prune it.
    const registry = await ensureFontIfNeeded(
      out,
      pageIdx,
      classificationsNeedFont(classifications, foundIdx),
      opts,
    )

    // 5. Build the overlay content stream (modifications re-rendered
    //    on top of the redacted area; new elements appended). Pure-
    //    graft layers contribute nothing — their bytes are already
    //    on the page.
    const ops: string[] = []
    for (let i = 0; i < classifications.length; i++) {
      emitLayerOverlay(classifications[i], i === foundIdx, ctx, ops, registry)
    }

    if (ops.length > 0) {
      await appendContentStream(out, pageIdx, ops.join(''))
    }

    // 6. Subset every embedded font program down to just the glyphs
    //    actually referenced by content streams. mupdf rewrites
    //    content-stream TJ hex to match the post-subset glyph-ID
    //    renumbering, so this is safe to run after our manual
    //    emission. Verified end-to-end in spike-07: a "Hello"
    //    overlay shrinks from 288 KB to 23 KB (≈92%) and both
    //    mupdf.asText() and pdfjs.getTextContent() still round-trip.
    //    The source PDF's own fonts are subset too, which is the
    //    desired behavior — the output only needs the subset that
    //    survived redaction + overlay composition.
    out.subsetFonts()

    return out.saveToBuffer('compress=yes').asUint8Array().slice()
  } finally {
    closeSourcePdfDoc(out)
  }
}

// ---------------------------------------------------------------------------
// Page bootstrap
// ---------------------------------------------------------------------------

async function bootstrapPage(
  out: mupdfTypes.PDFDocument,
  doc: DocumentModel,
  foundIdx: number,
  classifications: ClassifiedEntry[],
): Promise<number> {
  if (foundIdx === -1) {
    // No source foundation: page comes from doc viewBox.
    const vb = parseViewBox(doc.svg.getAttribute('viewBox'))
    const widthPt = vb.width * MM_TO_PT
    const heightPt = vb.height * MM_TO_PT
    await addBlankPage(out, widthPt, heightPt)
    return heightPt
  }
  // Source foundation: graft its page 0; MediaBox follows the source.
  const found = classifications[foundIdx].cls as Extract<
    ClassifiedLayer,
    { kind: 'graft' | 'mixed' }
  >
  const src = await openSourcePdfDoc(found.sourceEntry.bytes)
  try {
    graftSourcePageInto(out, src, 0)
  } finally {
    closeSourcePdfDoc(src)
  }
  return pageHeightPtOf(out, 0)
}

// ---------------------------------------------------------------------------
// Per-layer overlay emission
// ---------------------------------------------------------------------------

function emitLayerOverlay(
  entry: ClassifiedEntry,
  isFoundation: boolean,
  ctx: Ctx,
  ops: string[],
  registry: FontRegistry,
): void {
  const { layer, cls } = entry

  // Pure-graft foundation: page bytes already in place, no overlay.
  if (isFoundation && cls.kind === 'graft') return

  // Mixed FOUNDATION: redactions over modifications + deletions have
  // already been applied to the foundation page's content stream
  // (step 4 in exportViaGraft) — text-show ops inside those bboxes
  // are excised. Here we only emit overlays: re-render modified
  // elements on top of their redacted areas, and emit new elements.
  // Deletions need no overlay — redaction alone removes them.
  if (isFoundation && cls.kind === 'mixed') {
    for (const el of cls.modifiedElements) {
      const op = emitElementWithAncestors(el, layer, ctx, registry)
      if (op) ops.push(op)
    }
    for (const el of cls.newElements) {
      const op = emitElementWithAncestors(el, layer, ctx, registry)
      if (op) ops.push(op)
    }
    return
  }

  // All other cases (overlay; non-foundation graft; non-foundation mixed):
  // walk the layer's DOM and render every leaf via the emitter dispatch.
  // For non-foundation graft this is a deliberate fidelity loss — source
  // bytes can't be grafted onto a page that already has different source
  // bytes; rendering as overlay preserves visible content but loses font
  // subsetting and per-glyph positioning. Acceptable for the composite
  // case until multi-graft-per-page support lands.
  walkLayer(layer, ctx, ops, registry)
}

// ---------------------------------------------------------------------------
// Tree walk + element dispatch
// ---------------------------------------------------------------------------

function walkLayer(layer: Element, ctx: Ctx, ops: string[], registry: FontRegistry): void {
  for (const child of Array.from(layer.children)) {
    walkOne(child, ctx, ops, registry)
  }
}

function walkOne(el: Element, ctx: Ctx, ops: string[], registry: FontRegistry): void {
  const transformAttr = el.getAttribute('transform')
  const localCtx: Ctx = transformAttr
    ? { ...ctx, matrix: multiplyMatrix(ctx.matrix, parseTransform(transformAttr)) }
    : ctx
  const tag = el.tagName.toLowerCase()
  if (LEAF_TAGS.has(tag)) {
    const op = dispatchLeaf(el, localCtx, registry)
    if (op) ops.push(op)
    return
  }
  for (const child of Array.from(el.children)) walkOne(child, localCtx, ops, registry)
}

function dispatchLeaf(el: Element, ctx: Ctx, registry: FontRegistry): string {
  const tag = el.tagName.toLowerCase()
  switch (tag) {
    case 'rect':    return emitRect(el, ctx)
    case 'line':    return emitLine(el, ctx)
    case 'circle':  return emitCircle(el, ctx)
    case 'ellipse': return emitEllipse(el, ctx)
    case 'path':    return emitPath(el, ctx)
    case 'text':    return emitText(el, ctx, registry)
    default:        return ''
  }
}

/**
 * Emit an element honoring the cumulative transform from `layer` down to
 * `el`. Used for mixed-foundation overlay (the elements are loose pointers
 * from classifyLayer, not visited via walkLayer, so we have to compose
 * ancestor transforms ourselves).
 */
function emitElementWithAncestors(el: Element, layer: Element, baseCtx: Ctx, registry: FontRegistry): string {
  let m: Matrix = identityMatrix()
  const stack: Element[] = []
  for (let cur: Element | null = el; cur && cur !== layer.parentElement; cur = cur.parentElement) {
    stack.push(cur)
  }
  // Walk root → leaf, multiplying transforms left-to-right.
  for (let i = stack.length - 1; i >= 0; i--) {
    const t = stack[i].getAttribute('transform')
    if (t) m = multiplyMatrix(m, parseTransform(t))
  }
  return dispatchLeaf(el, { ...baseCtx, matrix: multiplyMatrix(baseCtx.matrix, m) }, registry)
}

// ---------------------------------------------------------------------------
// Page primitives + font registration
// ---------------------------------------------------------------------------

function pageHeightPtOf(out: mupdfTypes.PDFDocument, pageIdx: number): number {
  const page = out.findPage(pageIdx)
  const mb = page.getInheritable('MediaBox')
  return mb.get(3).asNumber() - mb.get(1).asNumber()
}

async function addBlankPage(out: mupdfTypes.PDFDocument, widthPt: number, heightPt: number): Promise<void> {
  // mupdf's addPage CREATES the page dict but does NOT link it into the
  // /Pages tree — you have to call insertPage afterwards or findPage
  // throws "malformed page tree". `at = countPages()` appends.
  const m = await import('mupdf')
  const initBuf = new m.Buffer()
  initBuf.write('% empty\n')
  const pageObj = out.addPage([0, 0, widthPt, heightPt], 0, out.newDictionary(), initBuf)
  out.insertPage(out.countPages(), pageObj)
}

async function ensureFontIfNeeded(
  out: mupdfTypes.PDFDocument,
  pageIdx: number,
  needed: boolean,
  opts: ExportViaGraftOpts,
): Promise<FontRegistry> {
  if (!needed) return THROWING_REGISTRY
  if (!opts.carlito) {
    throw new Error(
      'exportViaGraft: layer contains text but no font bytes were supplied. ' +
      'Pass opts.carlito with Carlito-Regular bytes to enable overlay text rendering.',
    )
  }
  // Type-0 / Identity-H so emitText can produce shaped TJ ops with
  // GSUB ligatures, GPOS kerning, etc. (vectorfeld-yyj). The same
  // bytes are loaded into fontkit by registerCidFont and exposed
  // through the registry for shaping.
  const { fontkitFont } = await registerCidFont(out, pageIdx, OVERLAY_FONT_KEY, opts.carlito)
  return makeSingleFontRegistry(fontkitFont)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseViewBox(s: string | null): { x: number; y: number; width: number; height: number } {
  if (!s) return { x: 0, y: 0, width: 210, height: 297 }
  const parts = s.trim().split(/[\s,]+/).map(parseFloat)
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return { x: 0, y: 0, width: 210, height: 297 }
  }
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
}

function classificationsNeedFont(
  classifications: ClassifiedEntry[],
  foundIdx: number,
): boolean {
  return classifications.some((c, i) => {
    if (i === foundIdx && c.cls.kind === 'graft') return false
    if (c.cls.kind === 'mixed') {
      // Foundation mixed checks modified+new (only those land via overlay);
      // non-foundation mixed renders the whole layer so any text matters.
      if (i === foundIdx) return mixedNeedsFont(c.cls.modifiedElements, c.cls.newElements)
      return layerHasText(c.layer)
    }
    // graft (non-foundation) and overlay: render whole layer.
    return layerHasText(c.layer)
  })
}

function layerHasText(layer: Element): boolean {
  return hasDescendantWithTag(layer, TEXT_TAGS)
}

function mixedNeedsFont(modifiedElements: Element[], newElements: Element[]): boolean {
  return [...modifiedElements, ...newElements].some(
    (el) => el.tagName.toLowerCase() === 'text' || hasDescendantWithTag(el, TEXT_TAGS),
  )
}

function hasDescendantWithTag(el: Element, tags: Set<string>): boolean {
  if (tags.has(el.tagName.toLowerCase())) return true
  for (const c of Array.from(el.children)) if (hasDescendantWithTag(c, tags)) return true
  return false
}

function makeSingleFontRegistry(fontkitFont: FontkitFont): FontRegistry {
  return {
    resolveFontKey: () => OVERLAY_FONT_KEY,
    getFontkitFont: () => fontkitFont,
  }
}

const THROWING_REGISTRY: FontRegistry = {
  resolveFontKey: () => {
    throw new Error('graftExport: text encountered on a layer that was not classified as needing a font')
  },
  getFontkitFont: () => {
    throw new Error('graftExport: getFontkitFont called on a layer that was not classified as needing a font')
  },
}
