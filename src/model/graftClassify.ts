/**
 * Per-layer classification for the graft export engine.
 *
 * Each top-level layer in a `DocumentModel` falls into exactly one of
 * three categories at export time:
 *
 *   - `graft`   — Source-imported, no edits. Engine grafts the source
 *                 page byte-for-byte via `mupdf.PDFDocument.graftPage`.
 *   - `mixed`   — Source-imported, but the user has edited at least one
 *                 element (changed attributes) and/or drawn new content
 *                 over it. Engine grafts the source THEN appends a
 *                 mask + re-render overlay content stream for each
 *                 modified element, plus a fresh content stream for any
 *                 user-added leaves.
 *   - `overlay` — Purely user-authored. No source bytes available
 *                 (either no source-pdf-id, or the SourcePdfStore lost
 *                 the entry). Engine renders entirely via overlay
 *                 content streams against a fresh blank page.
 *
 * Pure: no DOM mutation, no I/O.
 */

import { findModifiedSourceElements, findRemovedElementBboxes } from './sourceSnapshot'
import { isFromSource, getLayerSourceId, lookupSourceEntry } from './sourceTagging'
import type { SourcePdfStore, SourcePdfEntry } from './sourcePdf'
import type { BBox } from './geometry'

export type ClassifiedLayer =
  | { kind: 'graft'; sourceEntry: SourcePdfEntry }
  | {
      kind: 'mixed'
      sourceEntry: SourcePdfEntry
      modifiedElements: Element[]
      newElements: Element[]
      /** Mm-space bboxes of source elements that have been REMOVED from
       *  the DOM since import. Engine paints a white mask over each so
       *  the grafted source bytes don't keep showing the deleted content.
       *  Always present — empty array when nothing was deleted. */
      removedBboxes: BBox[]
    }
  | { kind: 'overlay' }

/** Graphical leaf tags that count as "user-added new content" when they
 *  appear inside a source layer without `data-src-*` tags. Mirrors the
 *  taggable set in `sourceTagging.ts` minus container-style tags. */
const NEW_LEAF_TAGS = new Set([
  'text',
  'path',
  'image',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polygon',
  'polyline',
])

export function classifyLayer(layer: Element, store: SourcePdfStore): ClassifiedLayer {
  const layerSourceId = getLayerSourceId(layer)
  if (!layerSourceId) {
    return { kind: 'overlay' }
  }

  const sourceEntry = lookupSourceEntry(store, layerSourceId)
  if (!sourceEntry) {
    // Tag survives but bytes are gone (fresh device, lost store, etc.).
    // Fall back to overlay so the export is still correct, just slower.
    return { kind: 'overlay' }
  }

  const modifiedElements = findModifiedSourceElements(layer)
  const newElements = collectNewLeaves(layer)
  const removedBboxes = findRemovedElementBboxes(layer)

  if (modifiedElements.length === 0 && newElements.length === 0 && removedBboxes.length === 0) {
    return { kind: 'graft', sourceEntry }
  }

  return { kind: 'mixed', sourceEntry, modifiedElements, newElements, removedBboxes }
}

/** Walk `layer` and return every graphical leaf descendant that has no
 *  `data-src-*` tags. Containers are recursed through but not collected. */
function collectNewLeaves(layer: Element): Element[] {
  const out: Element[] = []
  walk(layer)
  return out

  function walk(node: Element): void {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase()
      if (NEW_LEAF_TAGS.has(tag) && !isFromSource(child)) {
        out.push(child)
        // Don't recurse into a new leaf — its descendants (e.g. tspans
        // inside a new <text>) belong to the same overlay unit.
        continue
      }
      walk(child)
    }
  }
}
