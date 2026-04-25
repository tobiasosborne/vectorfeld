/**
 * Graft-based PDF export engine — entry point.
 *
 * Composes the primitives shipped by the wjj sub-beads into the full export
 * pipeline:
 *
 *   per layer →
 *     classifyLayer (graft / mixed / overlay)
 *         graft   → graftSourcePageInto
 *         mixed   → graftSourcePageInto + per-modified mask + re-render
 *                   + per-new-leaf overlay
 *         overlay → addPage(viewBox) + walk + emit content stream
 *
 * MVP scope (this bead, hnj):
 *   - One output page per layer (multi-layer-stacking onto a shared page is
 *     a future bead). For the canonical "one source PDF + zero or one
 *     overlay layer" case this is exactly right.
 *   - Source page 0 only on graft/mixed layers (multi-source-page support
 *     is a future bead).
 *   - Single Carlito font for all overlay text (full pickFont 5-slot is a
 *     future bead).
 *
 * Determinism: relies on mupdf's saveToBuffer not stamping wall-clock
 * timestamps on identical inputs. Re-export of the same document yields
 * byte-identical PDFs (verified by graftExport.test.ts).
 */

import {
  openSourcePdfDoc,
  closeSourcePdfDoc,
  createEmptyPdfDoc,
  graftSourcePageInto,
  appendContentStream,
  registerOverlayFont,
} from './graftMupdf'
import { classifyLayer, type ClassifiedLayer } from './graftClassify'
import { elementBboxPdfPt } from './graftBbox'
import {
  emitRect,
  emitLine,
  emitCircle,
  emitEllipse,
  emitPath,
  emitText,
  emitMaskRectOp,
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
  /** Carlito-Regular bytes. Required for any layer that draws new text
   *  (overlay or mixed). Engine throws a clear error if a layer needs a
   *  font and none was supplied. */
  carlito?: Uint8Array
}

export async function exportViaGraft(
  doc: DocumentModel,
  store: SourcePdfStore,
  opts: ExportViaGraftOpts = {},
): Promise<Uint8Array> {
  const out = await createEmptyPdfDoc()
  try {
    const layers = doc.getLayerElements()
    for (const layer of layers) {
      const cls = classifyLayer(layer, store)
      if (cls.kind === 'graft') {
        await processGraftLayer(out, cls)
      } else if (cls.kind === 'mixed') {
        await processMixedLayer(out, layer, cls, opts)
      } else {
        await processOverlayLayer(out, layer, doc, opts)
      }
    }
    const buf = out.saveToBuffer('compress=yes')
    return buf.asUint8Array().slice()
  } finally {
    closeSourcePdfDoc(out)
  }
}

// ---------------------------------------------------------------------------
// Per-layer processors
// ---------------------------------------------------------------------------

async function processGraftLayer(
  out: mupdfTypes.PDFDocument,
  cls: Extract<ClassifiedLayer, { kind: 'graft' }>,
): Promise<void> {
  const src = await openSourcePdfDoc(cls.sourceEntry.bytes)
  try {
    graftSourcePageInto(out, src, 0)
  } finally {
    closeSourcePdfDoc(src)
  }
}

async function processMixedLayer(
  out: mupdfTypes.PDFDocument,
  layer: Element,
  cls: Extract<ClassifiedLayer, { kind: 'mixed' }>,
  opts: ExportViaGraftOpts,
): Promise<void> {
  const src = await openSourcePdfDoc(cls.sourceEntry.bytes)
  try {
    graftSourcePageInto(out, src, 0)
  } finally {
    closeSourcePdfDoc(src)
  }
  const pageIdx = out.countPages() - 1
  const pageHeightPt = pageHeightPtOf(out, pageIdx)
  const registry = await ensureFontIfNeeded(
    out,
    pageIdx,
    layerNeedsFont(cls.modifiedElements, cls.newElements),
    opts,
  )
  const ctx: Ctx = { matrix: identityMatrix(), pageHeightPt }

  const ops: string[] = []
  for (const el of cls.modifiedElements) {
    const bbox = elementBboxPdfPt(el, pageHeightPt)
    if (bbox) ops.push(emitMaskRectOp(bbox))
    const op = emitElementWithAncestors(el, layer, ctx, registry)
    if (op) ops.push(op)
  }
  for (const el of cls.newElements) {
    const op = emitElementWithAncestors(el, layer, ctx, registry)
    if (op) ops.push(op)
  }

  const stream = ops.join('')
  if (stream) await appendContentStream(out, pageIdx, stream)
}

async function processOverlayLayer(
  out: mupdfTypes.PDFDocument,
  layer: Element,
  doc: DocumentModel,
  opts: ExportViaGraftOpts,
): Promise<void> {
  const vb = parseViewBox(doc.svg.getAttribute('viewBox'))
  const widthPt = vb.width * MM_TO_PT
  const heightPt = vb.height * MM_TO_PT
  await addBlankPage(out, widthPt, heightPt)
  const pageIdx = out.countPages() - 1

  const registry = await ensureFontIfNeeded(out, pageIdx, layerHasText(layer), opts)
  const ctx: Ctx = { matrix: identityMatrix(), pageHeightPt: heightPt }

  const ops: string[] = []
  walkLayer(layer, ctx, ops, registry)
  const stream = ops.join('')
  if (stream) await appendContentStream(out, pageIdx, stream)
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
 * `el`. Used for mixed-layer overlay (the elements are loose pointers from
 * classifyLayer, not visited via walkLayer, so we have to compose ancestor
 * transforms ourselves).
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
// Page bootstrap + font registration
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
  await registerOverlayFont(out, pageIdx, OVERLAY_FONT_KEY, opts.carlito)
  return SINGLE_FONT_REGISTRY
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

function layerHasText(layer: Element): boolean {
  return hasDescendantWithTag(layer, TEXT_TAGS)
}

function layerNeedsFont(modifiedElements: Element[], newElements: Element[]): boolean {
  return [...modifiedElements, ...newElements].some(
    (el) => el.tagName.toLowerCase() === 'text' || hasDescendantWithTag(el, TEXT_TAGS),
  )
}

function hasDescendantWithTag(el: Element, tags: Set<string>): boolean {
  if (tags.has(el.tagName.toLowerCase())) return true
  for (const c of Array.from(el.children)) if (hasDescendantWithTag(c, tags)) return true
  return false
}

const SINGLE_FONT_REGISTRY: FontRegistry = {
  resolveFontKey: () => OVERLAY_FONT_KEY,
}

const THROWING_REGISTRY: FontRegistry = {
  resolveFontKey: () => {
    throw new Error('graftExport: text encountered on a layer that was not classified as needing a font')
  },
}
