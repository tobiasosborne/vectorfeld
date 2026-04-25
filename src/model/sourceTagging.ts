/**
 * Source-PDF back-references on imported SVG elements.
 *
 * Every leaf graphical element (text, path, image, primitives) that came
 * from a PDF import gets `data-src-page` + `data-src-layer-id` so the
 * graft-export engine can tell at flush time which subtrees correspond
 * to untouched source regions (graft byte-for-byte) versus user-authored
 * or mutated content (overlay-render).
 *
 * The IMPORTED LAYER carries `data-source-pdf-id` — a stable key that
 * survives the user renaming the layer in the Layers panel. Children's
 * `data-src-layer-id` always matches this stable key, never the user-
 * facing `data-layer-name`.
 *
 * Lookup convention for `SourcePdfStore`:
 *   layerId === PRIMARY_LAYER_ID  →  store.getPrimary()
 *   any other string              →  store.getBackground(layerId)
 *
 * Phase 3 (in-place text edits) will add `data-src-op-offset` on text
 * via a content-stream tokenizer + ToUnicode CMap decoder — out of scope
 * for this bead, see `docs/spikes/spike-03-findings.md`.
 */

import type { SourcePdfStore, SourcePdfEntry } from './sourcePdf'

/** Stable identifier for primary-import content (`File > Open PDF…`). */
export const PRIMARY_LAYER_ID = '__primary__'

/** Attribute names. Public so the graft engine can read without re-importing. */
export const SRC_PAGE_ATTR = 'data-src-page'
export const SRC_LAYER_ATTR = 'data-src-layer-id'
export const LAYER_SOURCE_PDF_ID_ATTR = 'data-source-pdf-id'

/** Leaf graphical tags worth tagging. Containers (`g`, `defs`, `title`,
 *  `desc`, `metadata`) are recursed through, not tagged. */
const TAGGABLE_TAGS = new Set([
  'text',
  'tspan',
  'path',
  'image',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polygon',
  'polyline',
])

export type SourceMeta = {
  page: number
  layerId: string
}

/**
 * Tag every taggable leaf in `layer` with the given source coordinates.
 * Also stamps `data-source-pdf-id` on the layer itself so layer renames
 * by the user don't break the back-reference.
 *
 * Mutates in place.
 */
export function tagImportedLayer(layer: Element, meta: SourceMeta): void {
  layer.setAttribute(LAYER_SOURCE_PDF_ID_ATTR, meta.layerId)
  walkAndTag(layer, meta)
}

function walkAndTag(node: Element, meta: SourceMeta): void {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase()
    if (TAGGABLE_TAGS.has(tag)) {
      child.setAttribute(SRC_PAGE_ATTR, String(meta.page))
      child.setAttribute(SRC_LAYER_ATTR, meta.layerId)
    }
    // Always recurse — text contains tspan, g contains paths, etc.
    if (child.children.length > 0) walkAndTag(child, meta)
  }
}

/** Read source metadata off an element. Returns `null` if not source-tagged. */
export function getSourceMeta(el: Element): SourceMeta | null {
  const page = el.getAttribute(SRC_PAGE_ATTR)
  const layerId = el.getAttribute(SRC_LAYER_ATTR)
  if (page === null || layerId === null) return null
  const n = parseInt(page, 10)
  if (Number.isNaN(n)) return null
  return { page: n, layerId }
}

/** True iff the element has source-PDF back-references. */
export function isFromSource(el: Element): boolean {
  return el.hasAttribute(SRC_PAGE_ATTR) && el.hasAttribute(SRC_LAYER_ATTR)
}

/** Read a layer's stable source-PDF id (set by `tagImportedLayer`). */
export function getLayerSourceId(layer: Element): string | null {
  return layer.getAttribute(LAYER_SOURCE_PDF_ID_ATTR)
}

/**
 * Resolve a `data-src-layer-id` value against the SourcePdfStore.
 *   PRIMARY_LAYER_ID  → getPrimary()
 *   any other string  → getBackground(layerId)
 */
export function lookupSourceEntry(store: SourcePdfStore, layerId: string): SourcePdfEntry | null {
  if (layerId === PRIMARY_LAYER_ID) return store.getPrimary()
  return store.getBackground(layerId)
}
